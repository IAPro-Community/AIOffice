import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createServer } from 'node:net';

const root = resolve(process.env.AIOFFICE_DESKTOP_SMOKE_ROOT || 'dist/installers');
const target = process.argv[2] || process.platform;

function findApp(base, predicate) {
  if (!existsSync(base)) return undefined;
  for (const entry of readdirSync(base, { withFileTypes: true })) {
    const path = join(base, entry.name);
    if (predicate(path, entry)) return path;
    if (entry.isDirectory()) {
      const found = findApp(path, predicate);
      if (found) return found;
    }
  }
}

function executable() {
  if (target === 'win32' || target === 'windows') {
    const app = join(root, 'win-unpacked', 'AIOffice.exe');
    return existsSync(app) ? app : undefined;
  }
  if (target === 'linux') {
    const app = join(root, 'linux-unpacked', 'aioffice');
    return existsSync(app) ? app : undefined;
  }
  if (target === 'darwin' || target === 'macos') {
    const bundle = findApp(root, (path, entry) => entry.isDirectory() && path.endsWith('.app'));
    if (!bundle) return undefined;
    const name = bundle.slice(bundle.lastIndexOf('/') + 1, -4);
    const app = join(bundle, 'Contents', 'MacOS', name);
    return existsSync(app) ? app : undefined;
  }
}

async function freePort() {
  const server = createServer();
  await new Promise((resolve, reject) => server.once('error', reject).listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return port;
}

const app = executable();
if (!app) throw new Error(`Unpacked AIOffice executable not found for ${target} under ${root}.`);
const tempRoot = mkdtempSync(join(tmpdir(), 'aioffice-desktop-smoke-'));
const home = join(tempRoot, 'home');
const appData = join(tempRoot, 'appdata');
const userData = join(appData, 'AIOffice');
const localAppData = join(tempRoot, 'localappdata');
const xdgConfig = join(tempRoot, 'config');
mkdirSync(home, { recursive: true });
mkdirSync(appData, { recursive: true });
mkdirSync(userData, { recursive: true });
mkdirSync(localAppData, { recursive: true });
mkdirSync(xdgConfig, { recursive: true });
mkdirSync(join(home, '.gemini'), { recursive: true });
const env = {
  ...process.env,
  HOME: home,
  USERPROFILE: home,
  APPDATA: appData,
  LOCALAPPDATA: localAppData,
  XDG_CONFIG_HOME: xdgConfig,
  AIOFFICE_DESKTOP_SMOKE: '1',
  AIOFFICE_DESKTOP_SMOKE_USERDATA: userData,
  HABBLAUD_PORT: String(await freePort()),
  HABBLAUD_UPDATE_CHECK: '0',
  ELECTRON_NO_UPDATER: '1',
};
const child = spawn(app, ['--enable-logging=stderr'], { cwd: home, env, shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
let output = '';
const append = (chunk, stream) => {
  const text = chunk.toString('utf8');
  output += text;
  if (output.length > 256 * 1024) output = output.slice(-256 * 1024);
  if (process.env.AIOFFICE_DESKTOP_SMOKE_VERBOSE === '1') stream.write(text);
};
child.stdout?.on('data', (chunk) => append(chunk, process.stdout));
child.stderr?.on('data', (chunk) => append(chunk, process.stderr));
const timeoutMs = 240_000;
const timer = setTimeout(() => child.kill(), timeoutMs);
const code = await new Promise((resolve, reject) => {
  child.once('error', (error) => { clearTimeout(timer); reject(error); });
  child.once('close', (exitCode) => { clearTimeout(timer); resolve(exitCode); });
});
const logFile = target === 'win32' || target === 'windows'
  ? join(appData, 'AIOffice', 'aioffice.log')
  : target === 'darwin' || target === 'macos'
    ? join(home, 'Library', 'Application Support', 'AIOffice', 'aioffice.log')
    : join(xdgConfig, 'AIOffice', 'aioffice.log');
const log = existsSync(logFile) ? readFileSync(logFile, 'utf8') : '';
if (code !== 0 || !log.includes('Local AIOffice services are ready') || !log.includes('Desktop window is ready to show.')
  || !log.includes('Hook de mensagens do Antigravity instalado/atualizado')) {
  throw new Error(`Packaged desktop smoke failed (exit ${code ?? 'unknown'}).\n${output}\n--- aioffice.log ---\n${log.slice(-24_000)}`);
}
console.log(`Packaged ${target} app started its local services and loaded the UI successfully.`);
