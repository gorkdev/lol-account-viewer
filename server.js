// Local web server: serves the UI, the aggregated account JSON and a whitelisted LCU image proxy.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getAccount } from './account.js';
import { lcuRaw, LcuOfflineError } from './lcu.js';

const HOST = '127.0.0.1'; // never expose the LCU proxy to the network
const PORT = Number(process.env.PORT) || 5174;
const PUBLIC_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'public');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
};

function sendJson(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(data));
}

async function handleAccount(res) {
  try {
    sendJson(res, 200, { status: 'ok', data: await getAccount() });
  } catch (err) {
    if (err instanceof LcuOfflineError) return sendJson(res, 503, { status: 'offline' });
    if (err.code === 'NOT_LOGGED_IN') return sendJson(res, 503, { status: 'not_logged_in' });
    console.error(err);
    sendJson(res, 500, { status: 'error', message: err.message });
  }
}

// Only game asset images may be proxied; no other LCU endpoint is reachable through here.
async function handleAsset(res, assetPath) {
  if (!assetPath || !assetPath.startsWith('/lol-game-data/assets/') || assetPath.includes('..')) {
    res.writeHead(400).end();
    return;
  }
  try {
    const r = await lcuRaw(assetPath);
    if (r.status !== 200) {
      res.writeHead(r.status === 404 ? 404 : 502).end();
      return;
    }
    res.writeHead(200, {
      'Content-Type': r.headers['content-type'] || 'application/octet-stream',
      'Cache-Control': 'public, max-age=86400',
    });
    res.end(r.body);
  } catch {
    res.writeHead(503).end();
  }
}

async function handleStatic(res, urlPath) {
  const rel = urlPath === '/' ? 'index.html' : decodeURIComponent(urlPath).replace(/^\/+/, '');
  const file = path.normalize(path.join(PUBLIC_DIR, rel));
  if (!file.startsWith(PUBLIC_DIR + path.sep)) {
    res.writeHead(403).end();
    return;
  }
  try {
    const body = await readFile(file);
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404).end('Not found');
  }
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${HOST}`);
  if (req.method !== 'GET') return res.writeHead(405).end();
  if (url.pathname === '/api/account') return handleAccount(res);
  if (url.pathname === '/asset') return handleAsset(res, url.searchParams.get('path'));
  return handleStatic(res, url.pathname);
});

server.listen(PORT, HOST, () => {
  console.log(`LoL hesap görüntüleyici: http://${HOST}:${PORT}`);
  console.log('League istemcisini açıp giriş yap, sayfa otomatik bağlanır.');
});
