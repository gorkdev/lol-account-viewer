// Collects everything about the logged-in account from LCU endpoints into one payload.
import { lcuJson, LcuOfflineError } from './lcu.js';

const QUEUES = {
  400: 'Normal (Seçmeli)',
  420: 'Dereceli Tek/Çift',
  430: 'Normal (Kapalı)',
  440: 'Dereceli Esnek',
  450: 'ARAM',
  490: 'Hızlı Oyun',
  700: 'Clash',
  900: 'URF',
  1700: 'Arena',
  1900: 'URF',
};

// Pick the first numeric value from wallet responses like {"RP": 1350}.
function firstNumber(obj) {
  if (typeof obj === 'number') return obj;
  if (obj && typeof obj === 'object') {
    for (const v of Object.values(obj)) if (typeof v === 'number') return v;
  }
  return null;
}

const clean = (v, empty) => (v && v !== empty ? v : null);

// Static game data (skin catalog, champion list) only changes with patches; cache it for an hour.
const staticCache = new Map();
const STATIC_TTL_MS = 60 * 60 * 1000;
async function getStatic(key, path, safe) {
  const hit = staticCache.get(path);
  if (hit && Date.now() - hit.at < STATIC_TTL_MS) return hit.data;
  const data = await safe(key, path);
  if (data) staticCache.set(path, { data, at: Date.now() });
  return data;
}

// Loot entries whose localizedName comes back empty from the client.
const LOOT_NAMES = {
  CURRENCY_champion: 'Mavi Öz',
  CURRENCY_cosmetic: 'Turuncu Öz',
  CURRENCY_mythic: 'İhtişamlı Öz',
  CURRENCY_RP: 'RP',
  MATERIAL_key: 'Hextech Anahtarı',
  MATERIAL_key_fragment: 'Anahtar Parçası',
  MATERIAL_clashtickets: 'Clash Bileti',
  CHEST_generic: 'Hextech Sandığı',
  CHEST_champion_mastery: 'Ustalık Sandığı',
};
const LOOT_CATEGORY_BY_TYPE = { SKIN_RENTAL: 'SKIN', SKIN: 'SKIN', CHAMPION_RENTAL: 'CHAMPION', CHAMPION: 'CHAMPION' };

export async function getAccount() {
  const errors = {};

  // Runs an optional endpoint; failures are recorded instead of breaking the page.
  const safe = async (key, path, fallback = null) => {
    try {
      return await lcuJson(path);
    } catch (err) {
      if (err instanceof LcuOfflineError) throw err;
      errors[key] = err.message;
      return fallback;
    }
  };

  let summoner;
  try {
    summoner = await lcuJson('/lol-summoner/v1/current-summoner');
  } catch (err) {
    if (err instanceof LcuOfflineError) throw err;
    // Client is open but the user has not logged in yet.
    const e = new Error('Not logged in');
    e.code = 'NOT_LOGGED_IN';
    throw e;
  }

  const sid = summoner.summonerId;

  const [
    region, ranked, champions, mastery, loot, wardSkins, icons, emotes, honor, history, rp, be, storeWallet,
    skinInventory, skinCatalog, championSummary,
  ] =
    await Promise.all([
      safe('region', '/riotclient/region-locale'),
      safe('ranked', '/lol-ranked/v1/current-ranked-stats'),
      safe('champions', `/lol-champions/v1/inventories/${sid}/champions`, []),
      safe('mastery', '/lol-champion-mastery/v1/local-player/champion-mastery', []),
      safe('loot', '/lol-loot/v1/player-loot', []),
      safe('wardSkins', `/lol-collections/v1/inventories/${sid}/ward-skins`, []),
      safe('icons', '/lol-inventory/v2/inventory/SUMMONER_ICON', []),
      safe('emotes', '/lol-inventory/v2/inventory/EMOTE', []),
      safe('honor', '/lol-honor-v2/v1/profile'),
      safe('history', '/lol-match-history/v1/products/lol/current-summoner/matches?begIndex=0&endIndex=19'),
      safe('rp', '/lol-inventory/v1/wallet/RP'),
      safe('be', '/lol-inventory/v1/wallet/lol_blue_essence'),
      safe('storeWallet', '/lol-store/v1/wallet'),
      safe('skinInventory', '/lol-inventory/v2/inventory/CHAMPION_SKIN', []),
      getStatic('skinCatalog', '/lol-game-data/assets/v1/skins.json', safe),
      getStatic('championSummary', '/lol-game-data/assets/v1/champion-summary.json', safe),
    ]);

  // The champions endpoint also contains mode-specific duplicate champions (e.g. Ahri as 103 and
  // as 60103, "Jade_" assets). Real champion ids are below 10000; the duplicates are skipped.
  const allChampions = (champions ?? []).filter((c) => c.id > 0 && c.id < 10000);
  const nameSource = championSummary?.length ? championSummary : allChampions;
  const championName = new Map(nameSource.map((c) => [c.id, c.name]));
  const championIcon = new Map(nameSource.map((c) => [c.id, c.squarePortraitPath]));

  const ownedChampions = allChampions
    .filter((c) => c.ownership?.owned)
    .map((c) => ({ id: c.id, name: c.name, title: c.title, roles: c.roles ?? [], icon: c.squarePortraitPath }))
    .sort((a, b) => a.name.localeCompare(b.name, 'tr'));

  // Skins/chromas mirror the client's Collection count: every owned CHAMPION_SKIN inventory
  // item that is a non-base entry in the skin catalog (skins.json). Inventory items missing
  // from the catalog are hidden duplicates and are not counted by the client either.
  const ownedSkins = [];
  const ownedChromas = [];
  let totalSkins = 0;
  const championOf = (itemId) => championName.get(Math.floor(itemId / 1000)) ?? '?';

  if (skinCatalog && skinInventory?.length) {
    const chromaIndex = new Map();
    for (const s of Object.values(skinCatalog)) {
      if (!s.isBase) totalSkins++;
      for (const ch of s.chromas ?? []) chromaIndex.set(ch.id, { chroma: ch, skin: s });
    }
    const ownedIds = new Set(skinInventory.filter((i) => i.owned !== false).map((i) => i.itemId));
    for (const id of ownedIds) {
      const s = skinCatalog[id];
      if (s && !s.isBase) {
        ownedSkins.push({
          id,
          name: s.name,
          champion: championOf(id),
          image: s.tilePath || s.loadScreenPath || s.splashPath,
          splash: s.splashPath || null,
        });
      } else if (chromaIndex.has(id)) {
        const { chroma, skin } = chromaIndex.get(id);
        ownedChromas.push({ id, name: chroma.name || skin.name, skin: skin.name, champion: championOf(id), image: chroma.chromaPath });
      }
    }
  } else {
    // Fallback when inventory or catalog is unavailable: use the champions endpoint.
    for (const c of allChampions) {
      for (const s of c.skins ?? []) {
        if (s.isBase) continue;
        totalSkins++;
        if (s.ownership?.owned) {
          ownedSkins.push({ id: s.id, name: s.name, champion: c.name, image: s.tilePath || s.loadScreenPath, splash: s.splashPath || null });
        }
        for (const ch of s.chromas ?? []) {
          if (ch.ownership?.owned) {
            ownedChromas.push({ id: ch.id, name: ch.name || s.name, skin: s.name, champion: c.name, image: ch.chromaPath });
          }
        }
      }
    }
  }
  const byChampion = (a, b) => a.champion.localeCompare(b.champion, 'tr') || a.name.localeCompare(b.name, 'tr');
  ownedSkins.sort(byChampion);
  ownedChromas.sort(byChampion);

  const masteryList = (mastery ?? [])
    .map((m) => ({
      championId: m.championId,
      champion: championName.get(m.championId) ?? `#${m.championId}`,
      icon: championIcon.get(m.championId) ?? null,
      level: m.championLevel,
      points: m.championPoints,
      lastPlayed: m.lastPlayTime ?? null,
    }))
    .sort((a, b) => b.points - a.points);

  const lootItems = (loot ?? []).filter((l) => l.count > 0 && l.lootId);
  const lootCount = (id) => lootItems.find((l) => l.lootId === id)?.count ?? 0;

  const wallet = {
    rp: firstNumber(rp) ?? storeWallet?.rp ?? null,
    blueEssence: firstNumber(be) ?? storeWallet?.ip ?? lootCount('CURRENCY_champion'),
    orangeEssence: lootCount('CURRENCY_cosmetic'),
    mythicEssence: lootCount('CURRENCY_mythic'),
  };
  // Wallet endpoints are alternatives; only report a failure if no source produced a value.
  delete errors.rp;
  delete errors.be;
  delete errors.storeWallet;
  if (wallet.rp == null) errors.wallet = 'RP could not be read';

  const QUEUE_ORDER = ['RANKED_SOLO_5x5', 'RANKED_FLEX_SR', 'CHERRY'];
  const rankedQueues = (ranked?.queues ?? [])
    .filter((q) => QUEUE_ORDER.includes(q.queueType))
    .sort((a, b) => QUEUE_ORDER.indexOf(a.queueType) - QUEUE_ORDER.indexOf(b.queueType))
    .map((q) => ({
      queue: q.queueType,
      tier: clean(q.tier, 'NONE'),
      division: clean(q.division, 'NA'),
      lp: q.leaguePoints ?? 0,
      wins: q.wins ?? 0,
      losses: q.losses ?? 0,
      previousTier: clean(q.previousSeasonEndTier, 'NONE'),
      previousDivision: clean(q.previousSeasonEndDivision, 'NA'),
    }));

  const matches = (history?.games?.games ?? []).map((g) => {
    const p = g.participants?.[0] ?? {};
    const st = p.stats ?? {};
    return {
      id: g.gameId,
      date: g.gameCreation,
      durationSec: g.gameDuration,
      queue: QUEUES[g.queueId] ?? g.gameMode ?? `Kuyruk ${g.queueId}`,
      champion: championName.get(p.championId) ?? `#${p.championId}`,
      icon: championIcon.get(p.championId) ?? null,
      win: Boolean(st.win),
      kills: st.kills ?? 0,
      deaths: st.deaths ?? 0,
      assists: st.assists ?? 0,
      cs: (st.totalMinionsKilled ?? 0) + (st.neutralMinionsKilled ?? 0),
    };
  });

  const ownedWards = (wardSkins ?? []).filter((w) => w.ownership?.owned && w.id > 0);

  return {
    fetchedAt: new Date().toISOString(),
    // Right after login the champion inventory is not loaded yet; the UI retries while this is true.
    partial: allChampions.length === 0,
    profile: {
      name: summoner.gameName ? `${summoner.gameName}#${summoner.tagLine}` : summoner.displayName,
      level: summoner.summonerLevel,
      levelProgress: summoner.percentCompleteForNextLevel ?? null,
      icon: `/lol-game-data/assets/v1/profile-icons/${summoner.profileIconId}.jpg`,
      puuid: summoner.puuid,
      region: region?.region ?? null,
      honorLevel: honor?.honorLevel ?? null,
    },
    wallet,
    ranked: rankedQueues,
    counts: {
      championsOwned: ownedChampions.length,
      championsTotal: allChampions.length,
      skinsOwned: ownedSkins.length,
      skinsTotal: totalSkins,
      chromasOwned: ownedChromas.length,
      wardSkinsOwned: ownedWards.length,
      iconsOwned: (icons ?? []).length,
      emotesOwned: (emotes ?? []).length,
    },
    champions: ownedChampions,
    skins: ownedSkins,
    chromas: ownedChromas,
    mastery: masteryList,
    wardSkins: ownedWards.map((w) => ({ id: w.id, name: w.name, image: w.wardImagePath })),
    icons: (icons ?? []).map((i) => ({ id: i.itemId, image: `/lol-game-data/assets/v1/profile-icons/${i.itemId}.jpg` })),
    loot: lootItems
      .map((l) => ({
        id: l.lootId,
        name: l.localizedName || l.itemDesc || LOOT_NAMES[l.lootId] || l.lootId,
        // CURRENCY_mythic is tagged CHEST by the client; type is the more reliable signal for currencies.
        category: l.type === 'CURRENCY' ? 'CURRENCY' : l.displayCategories || LOOT_CATEGORY_BY_TYPE[l.type] || l.type || 'OTHER',
        count: l.count,
        // /fe/... icons live in the client UI bundle and are not served by the LCU API.
        image: l.tilePath?.startsWith('/lol-game-data/assets/') ? l.tilePath : null,
      }))
      .sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name, 'tr')),
    matches,
    errors,
  };
}
