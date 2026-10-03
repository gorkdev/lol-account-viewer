// League Client (LCU) connection: finds the running client's port + token and performs GET requests.
import { readFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import https from 'node:https';

const execFileAsync = promisify(execFile);

// LCU uses a self-signed certificate on 127.0.0.1.
const agent = new https.Agent({ rejectUnauthorized: false, keepAlive: true });

const LOCKFILE_PATHS = [
  process.env.LOL_DIR && `${process.env.LOL_DIR}/lockfile`,
  'C:/Riot Games/League of Legends/lockfile',
  'D:/Riot Games/League of Legends/lockfile',
  '/Applications/League of Legends.app/Contents/LoL/lockfile',
].filter(Boolean);

export class LcuOfflineError extends Error {
  constructor() {
    super('League client is not running');
    this.code = 'LCU_OFFLINE';
  }
}

export class LcuHttpError extends Error {
  constructor(status, path) {
    super(`LCU ${status} on ${path}`);
    this.status = status;
  }
}

let cached = null;

async function fromEnv() {
  const { LCU_PORT, LCU_PASSWORD } = process.env;
  return LCU_PORT && LCU_PASSWORD ? { port: Number(LCU_PORT), password: LCU_PASSWORD } : null;
}

// Most reliable: read the running LeagueClientUx.exe command line (works for any install path).
async function fromProcess() {
  if (process.platform !== 'win32') return null;
  try {
    const { stdout } = await execFileAsync(
      'powershell.exe',
      [
        '-NoProfile',
        '-Command',
        "Get-CimInstance Win32_Process -Filter \"Name='LeagueClientUx.exe'\" | Select-Object -ExpandProperty CommandLine",
      ],
      { windowsHide: true, timeout: 10000 },
    );
    const port = stdout.match(/--app-port=(\d+)/)?.[1];
    const password = stdout.match(/--remoting-auth-token=([\w-]+)/)?.[1];
    return port && password ? { port: Number(port), password } : null;
  } catch {
    return null;
  }
}

// Fallback: lockfile format is "name:pid:port:password:protocol".
async function fromLockfile() {
  for (const file of LOCKFILE_PATHS) {
    try {
      const [, , port, password] = (await readFile(file, 'utf8')).trim().split(':');
      if (port && password) return { port: Number(port), password };
    } catch {
      // try next path
    }
  }
  return null;
}

async function discover() {
  return (await fromEnv()) ?? (await fromProcess()) ?? (await fromLockfile());
}

function request(creds, path) {
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        host: '127.0.0.1',
        port: creds.port,
        path,
        method: 'GET',
        agent,
        timeout: 15000,
        headers: {
          Authorization: 'Basic ' + Buffer.from(`riot:${creds.password}`).toString('base64'),
          Accept: 'application/json',
        },
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
      },
    );
    req.on('timeout', () => req.destroy(new Error('LCU request timed out')));
    req.on('error', reject);
    req.end();
  });
}

// Raw GET; re-discovers credentials once if the client restarted (new port/token).
export async function lcuRaw(path) {
  for (let attempt = 0; attempt < 2; attempt++) {
    cached ??= await discover();
    if (!cached) throw new LcuOfflineError();
    try {
      const res = await request(cached, path);
      if (res.status === 401 || res.status === 403) {
        cached = null;
        continue;
      }
      return res;
    } catch (err) {
      if (['ECONNREFUSED', 'ECONNRESET'].includes(err.code)) {
        cached = null;
        continue;
      }
      throw err;
    }
  }
  throw new LcuOfflineError();
}

export async function lcuJson(path) {
  const res = await lcuRaw(path);
  if (res.status < 200 || res.status >= 300) throw new LcuHttpError(res.status, path);
  const text = res.body.toString('utf8');
  return text ? JSON.parse(text) : null;
}
