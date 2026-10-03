const $ = (id) => document.getElementById(id);
const nf = new Intl.NumberFormat('tr-TR');
const df = new Intl.DateTimeFormat('tr-TR', { dateStyle: 'medium', timeStyle: 'short' });

const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const asset = (p) => (p ? `/asset?path=${encodeURIComponent(p)}` : '');
const img = (p, cls = '') => `<img ${cls ? `class="${cls}"` : ''} src="${asset(p)}" alt="" loading="lazy" onerror="this.style.visibility='hidden'">`;
const num = (v) => (v == null ? '—' : nf.format(v));
const norm = (s) => String(s ?? '').toLocaleLowerCase('tr');

const TIERS = {
  IRON: 'Demir', BRONZE: 'Bronz', SILVER: 'Gümüş', GOLD: 'Altın', PLATINUM: 'Platin', EMERALD: 'Zümrüt',
  DIAMOND: 'Elmas', MASTER: 'Usta', GRANDMASTER: 'Büyükusta', CHALLENGER: 'Şampiyonluk',
};
const QUEUE_NAMES = { RANKED_SOLO_5x5: 'Dereceli Tek/Çift', RANKED_FLEX_SR: 'Dereceli Esnek', CHERRY: 'Arena' };
const LOOT_CATS = {
  CHEST: 'Sandık ve Anahtar', SKIN: 'Kostüm Parçası', CHAMPION: 'Şampiyon Parçası', WARDSKIN: 'Totem Parçası',
  CHROMA: 'Renk Parçası', EMOTE: 'İfade', SUMMONERICON: 'Simge', ETERNALS: 'Ebediler', CURRENCY: 'Para Birimi', MATERIAL: 'Malzeme', OTHER: 'Diğer',
};

const rankText = (tier, div) => (tier ? `${TIERS[tier] ?? tier}${div && !['MASTER', 'GRANDMASTER', 'CHALLENGER'].includes(tier) ? ' ' + div : ''}` : 'Derecesiz');
const ago = (ms) => (ms ? df.format(new Date(ms)) : '—');

let data = null;
let activeTab = 'overview';

const TABS = [
  { id: 'overview', label: 'Genel', search: false, render: renderOverview },
  {
    id: 'skins', label: 'Kostümler', count: (d) => d.skins.length,
    items: (d) => d.skins, key: (x) => `${x.name} ${x.champion}`,
    render: (list) => grid(list, (s) => card(s.image, s.name, s.champion, 'tall')),
  },
  {
    id: 'champions', label: 'Şampiyonlar', count: (d) => d.champions.length,
    items: (d) => d.champions, key: (x) => `${x.name} ${x.title}`,
    render: (list) => grid(list, (c) => card(c.icon, c.name, c.title)),
  },
  {
    id: 'chromas', label: 'Renkler', count: (d) => d.chromas.length,
    items: (d) => d.chromas, key: (x) => `${x.name} ${x.skin} ${x.champion}`,
    render: (list) => grid(list, (c) => card(c.image, c.name, c.champion), 'small'),
  },
  {
    id: 'mastery', label: 'Ustalık', count: (d) => d.mastery.length,
    items: (d) => d.mastery, key: (x) => x.champion,
    render: (list) => rows(list, (m, i) => `
      <div class="row">${img(m.icon)}
        <div class="grow"><b>${i + 1}. ${esc(m.champion)}</b><span class="muted">Seviye ${m.level} · Son oyun ${ago(m.lastPlayed)}</span></div>
        <div class="num"><b>${num(m.points)}</b><br><span class="muted">puan</span></div>
      </div>`),
  },
  {
    id: 'matches', label: 'Son Maçlar', count: (d) => d.matches.length,
    items: (d) => d.matches, key: (x) => `${x.champion} ${x.queue}`,
    render: (list) => rows(list, matchRow),
  },
  {
    id: 'loot', label: 'Ganimet', count: (d) => d.loot.length,
    items: (d) => d.loot, key: (x) => `${x.name} ${LOOT_CATS[x.category] ?? x.category}`,
    render: (list) => rows(list, (l) => `
      <div class="row">${img(l.image)}
        <div class="grow"><b>${esc(l.name)}</b><span class="muted">${esc(LOOT_CATS[l.category] ?? l.category)}</span></div>
        <div class="num"><b>×${num(l.count)}</b></div>
      </div>`),
  },
  {
    id: 'wards', label: 'Totemler', count: (d) => d.wardSkins.length,
    items: (d) => d.wardSkins, key: (x) => x.name,
    render: (list) => grid(list, (w) => card(w.image, w.name, ''), 'small'),
  },
  {
    id: 'icons', label: 'Simgeler', count: (d) => d.icons.length,
    items: (d) => d.icons, key: (x) => String(x.id),
    render: (list) => grid(list, (i) => card(i.image, `#${i.id}`, ''), 'small'),
  },
];

function card(image, title, sub, cls = '') {
  return `<div class="card ${cls}">${img(image)}<div class="cap"><b>${esc(title)}</b>${sub ? `<span>${esc(sub)}</span>` : ''}</div></div>`;
}
function grid(list, fn, cls = '') {
  return list.length ? `<div class="grid ${cls}">${list.map(fn).join('')}</div>` : '<p class="empty">Sonuç yok.</p>';
}
function rows(list, fn) {
  return list.length ? `<div class="rows">${list.map(fn).join('')}</div>` : '<p class="empty">Sonuç yok.</p>';
}
function matchRow(m) {
  const min = Math.floor(m.durationSec / 60);
  return `
    <div class="row ${m.win ? 'win' : 'loss'}">${img(m.icon)}
      <div class="grow"><b>${esc(m.champion)}</b><span class="muted">${esc(m.queue)} · ${ago(m.date)} · ${min} dk</span></div>
      <div class="num"><b>${m.kills} / ${m.deaths} / ${m.assists}</b><br><span class="muted">${m.cs} CS</span></div>
      <span class="${m.win ? 'tag-win' : 'tag-loss'}">${m.win ? 'Zafer' : 'Bozgun'}</span>
    </div>`;
}

function renderOverview(d) {
  const ranks = d.ranked.length
    ? d.ranked.map((q) => {
        const total = q.wins + q.losses;
        const wr = total ? Math.round((q.wins / total) * 100) : 0;
        const prev = q.previousTier ? `Geçen sezon: ${rankText(q.previousTier, q.previousDivision)}` : '';
        return `<div class="stat rank"><span>${esc(QUEUE_NAMES[q.queue] ?? q.queue)}</span>
          <b>${esc(rankText(q.tier, q.division))}${q.tier ? ` · ${q.lp} LP` : ''}</b>
          <span>${q.wins}G ${q.losses}M${total ? ` · %${wr}` : ''}${prev ? ` · ${esc(prev)}` : ''}</span></div>`;
      }).join('')
    : '<p class="muted">Derece bilgisi alınamadı.</p>';

  return `
    <h2>Dereceler</h2><div class="ranks">${ranks}</div>
    <h2>En çok oynanan şampiyonlar</h2>
    ${rows(d.mastery.slice(0, 5), (m) => `<div class="row">${img(m.icon)}<div class="grow"><b>${esc(m.champion)}</b><span class="muted">Seviye ${m.level}</span></div><div class="num"><b>${num(m.points)}</b></div></div>`)}
    <h2>Son maçlar</h2>
    ${rows(d.matches.slice(0, 5), matchRow)}`;
}

function renderHeader(d) {
  const p = d.profile;
  $('p-icon').src = asset(p.icon);
  $('p-name').textContent = p.name;
  $('p-meta').textContent = [`Seviye ${p.level}`, p.region, p.honorLevel != null ? `Onur ${p.honorLevel}` : null]
    .filter(Boolean).join(' · ');
  $('p-level-fill').style.width = `${p.levelProgress ?? 0}%`;

  const stat = (v, label) => `<div class="stat"><b>${v}</b><span>${label}</span></div>`;
  $('wallet').innerHTML = [
    stat(num(d.wallet.rp), 'Riot Puanı'),
    stat(num(d.wallet.blueEssence), 'Mavi Öz'),
    stat(num(d.wallet.orangeEssence), 'Turuncu Öz'),
    stat(num(d.wallet.mythicEssence), 'İhtişamlı Öz'),
  ].join('');
  const c = d.counts;
  $('counts').innerHTML = [
    stat(`${num(c.championsOwned)} <small class="muted">/ ${num(c.championsTotal)}</small>`, 'Şampiyon'),
    stat(`${num(c.skinsOwned)} <small class="muted">/ ${num(c.skinsTotal)}</small>`, 'Kostüm'),
    stat(num(c.chromasOwned), 'Renk'),
    stat(num(c.wardSkinsOwned), 'Totem'),
    stat(num(c.iconsOwned), 'Simge'),
    stat(num(c.emotesOwned), 'İfade'),
  ].join('');

  const failed = Object.keys(d.errors);
  $('foot').textContent = `Son güncelleme: ${df.format(new Date(d.fetchedAt))}` +
    (d.partial ? ' · Şampiyon envanteri henüz yüklenmedi, otomatik yenileniyor…' : '') +
    (failed.length ? ` · Alınamayan veriler: ${failed.join(', ')}` : '');
}

function renderTabs() {
  $('tabs').innerHTML = TABS.map((t) => `
    <button class="tab" role="tab" data-tab="${t.id}" aria-selected="${t.id === activeTab}">
      ${t.label}${t.count ? `<small>${num(t.count(data))}</small>` : ''}
    </button>`).join('');
}

function renderPanel() {
  const tab = TABS.find((t) => t.id === activeTab);
  const searchable = tab.search !== false;
  $('search').parentElement.hidden = !searchable;
  if (!searchable) {
    $('panel').innerHTML = tab.render(data);
    return;
  }
  const q = norm($('search').value.trim());
  const all = tab.items(data);
  const list = q ? all.filter((x) => norm(tab.key(x)).includes(q)) : all;
  $('result-count').textContent = `${num(list.length)} sonuç`;
  $('panel').innerHTML = tab.render(list);
}

function showState(text, spinning = true) {
  $('app').hidden = true;
  $('state').hidden = false;
  $('state-text').textContent = text;
  document.querySelector('.spinner').hidden = !spinning;
}

let retryTimer = null;
async function load() {
  clearTimeout(retryTimer);
  $('refresh').disabled = true;
  try {
    const res = await fetch('/api/account');
    const json = await res.json();
    if (json.status === 'ok') {
      data = json.data;
      renderHeader(data);
      renderTabs();
      renderPanel();
      $('state').hidden = true;
      $('app').hidden = false;
      // Champion inventory loads a few seconds after login; refresh until it is there.
      if (data.partial) retryTimer = setTimeout(load, 5000);
      return;
    }
    const msg = {
      offline: 'League istemcisi açık değil. İstemciyi aç, sayfa otomatik bağlanacak.',
      not_logged_in: 'İstemci açık ama giriş yapılmamış. Hesabına giriş yap.',
    }[json.status] ?? `Hata: ${json.message ?? 'bilinmiyor'}`;
    if (!data) showState(msg);
    retryTimer = setTimeout(load, 5000);
  } catch {
    if (!data) showState('Yerel sunucuya ulaşılamadı. "npm start" çalışıyor mu?', false);
    retryTimer = setTimeout(load, 5000);
  } finally {
    $('refresh').disabled = false;
  }
}

$('tabs').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-tab]');
  if (!btn) return;
  activeTab = btn.dataset.tab;
  $('search').value = '';
  renderTabs();
  renderPanel();
});
$('search').addEventListener('input', renderPanel);
$('refresh').addEventListener('click', load);

load();
