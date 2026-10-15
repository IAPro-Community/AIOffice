import { spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { chmod, lstat, mkdir, readFile, realpath, rename, rm, stat, writeFile, open } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';

const PROVIDERS = Object.freeze({
  codex: { name: 'Codex', package: '@openai/codex' },
  claude: { name: 'Claude Code', package: '@anthropic-ai/claude-code' },
  omp: { name: 'OMP' },
});
const BUILD_ORIGIN = 'https://build.stencil.so';
// The upstream build service currently signs downloads from this bucket. Fail closed if it changes.
const DOWNLOAD_HOSTS = new Set(['build.stencil.so', 'd4c085d38fe197a3f20bbeb20222b8b3.r2.cloudflarestorage.com']);
const MAX_BINARY_BYTES = 800 * 1024 * 1024;
const VERSION = /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/;

export class ProviderToolsError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'ProviderToolsError';
    this.code = code;
  }
}

function provider(id) {
  if (typeof id !== 'string' || !Object.hasOwn(PROVIDERS, id)) {
    throw new ProviderToolsError('INVALID_PROVIDER', 'Provedor não permitido.');
  }
  return PROVIDERS[id];
}

function checkSignal(signal) {
  if (signal.aborted) throw signal.reason;
}

function inside(root, target) {
  const rel = relative(root, target);
  return rel !== '' && rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel);
}

async function exists(path) {
  try { await lstat(path); return true; } catch (error) { if (error.code === 'ENOENT') return false; throw error; }
}

async function directory(path) {
  await mkdir(path, { recursive: true, mode: 0o700 });
  if (!(await lstat(path)).isDirectory() || (await lstat(path)).isSymbolicLink()) {
    throw new ProviderToolsError('UNSAFE_DIRECTORY', 'O diretório privado das ferramentas não é seguro.');
  }
}

function platformInfo(platform, arch, musl) {
  if (!['win32', 'darwin', 'linux'].includes(platform) || !['x64', 'arm64'].includes(arch)) return undefined;
  const cpu = arch === 'x64' ? 'x86_64' : 'aarch64';
  const triple = platform === 'win32' ? `${cpu}-pc-windows-msvc` : platform === 'darwin' ? `${cpu}-apple-darwin` : `${cpu}-unknown-linux-musl`;
  return {
    triple,
    omp: `${platform === 'win32' ? 'windows' : platform === 'darwin' ? 'macos' : musl ? 'linux-musl' : 'linux'}-${arch === 'x64' ? 'x86_64' : 'arm64'}`,
    claude: `${platform}-${arch}${platform === 'linux' && musl ? '-musl' : ''}`,
  };
}

function installEnvironment(source) {
  // Never pass npm credentials/configuration, provider secrets, or unrelated application variables to installers.
  const result = {};
  for (const [key, value] of Object.entries(source)) {
    if (/^(path|systemroot|windir|comspec|pathext|temp|tmp|tmpdir|home|userprofile|appdata|localappdata|lang|lc_all|lc_ctype)$/i.test(key) && typeof value === 'string') result[key] = value;
  }
  return result;
}

/** No shell, no lifecycle children, bounded output, and a hidden window on Windows. */
export function runProviderCommand(command, args, { cwd, env, signal, maxOutput = 256 * 1024 }) {
  return new Promise((resolveResult, reject) => {
    checkSignal(signal);
    const child = spawn(command, args, { cwd, env, windowsHide: true, shell: false, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let bytes = 0;
    let failure;
    const abort = () => { failure = signal.reason; child.kill('SIGKILL'); };
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) abort();
    const collect = (chunk, isStdout) => {
      bytes += chunk.length;
      if (bytes > maxOutput) {
        failure = new ProviderToolsError('OUTPUT_LIMIT', 'O instalador excedeu o limite de saída.');
        child.kill('SIGKILL');
      } else if (isStdout) stdout += chunk.toString('utf8');
    };
    child.stdout.on('data', (chunk) => collect(chunk, true));
    child.stderr.on('data', (chunk) => collect(chunk, false));
    child.once('error', () => {
      signal.removeEventListener('abort', abort);
      reject(failure || new ProviderToolsError('COMMAND_START', 'Não foi possível iniciar o instalador ou verificar o executável.'));
    });
    child.once('close', (code) => {
      signal.removeEventListener('abort', abort);
      if (failure) reject(failure);
      else if (code !== 0) reject(new ProviderToolsError('COMMAND_FAILED', 'O instalador ou a verificação do executável falhou. Confira a conexão, o espaço em disco e tente novamente.'));
      else resolveResult({ stdout });
    });
  });
}

function downloadUrl(value) {
  let url;
  try { url = new URL(value); } catch { throw new ProviderToolsError('UNSAFE_URL', 'A fonte oficial retornou um endereço inválido.'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.port || url.hash || !DOWNLOAD_HOSTS.has(url.hostname)) {
    throw new ProviderToolsError('UNSAFE_URL', 'A fonte oficial retornou um endereço de download não permitido.');
  }
  if (/%2f|%5c|%2e/i.test(url.pathname) || url.pathname.includes('\\') || !/^\/(?:d\/omp\/|ompcast\/builds\/omp\/)/.test(url.pathname)) {
    throw new ProviderToolsError('UNSAFE_URL', 'O caminho do download oficial não é permitido.');
  }
  return url;
}

async function responseAt(fetchImpl, initialUrl, signal, validate) {
  let url = validate(initialUrl);
  for (let redirects = 0; redirects <= 3; redirects++) {
    checkSignal(signal);
    const response = await fetchImpl(url.href, { signal, redirect: 'manual', credentials: 'omit', headers: { 'User-Agent': 'AIOffice-provider-tools' } });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      await response.body?.cancel();
      const location = response.headers.get('location');
      if (!location || redirects === 3) throw new ProviderToolsError('REDIRECT_LIMIT', 'O download oficial retornou redirecionamentos inválidos.');
      url = validate(new URL(location, url).href);
      continue;
    }
    if (!response.ok) {
      await response.body?.cancel();
      throw new ProviderToolsError('DOWNLOAD_FAILED', 'A fonte oficial está indisponível. Tente novamente mais tarde.');
    }
    return response;
  }
}

async function boundedJson(response, signal) {
  const reader = response.body?.getReader();
  if (!reader) throw new ProviderToolsError('INVALID_METADATA', 'A fonte oficial retornou metadados vazios.');
  const chunks = [];
  let bytes = 0;
  try {
    while (true) {
      checkSignal(signal);
      const { value, done } = await reader.read();
      if (done) break;
      bytes += value.length;
      if (bytes > 1024 * 1024) throw new ProviderToolsError('INVALID_METADATA', 'Os metadados oficiais excedem o limite permitido.');
      chunks.push(Buffer.from(value));
    }
    try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
    catch { throw new ProviderToolsError('INVALID_METADATA', 'A fonte oficial retornou metadados inválidos.'); }
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
}

async function downloadBinary(fetchImpl, url, destination, expected, signal, progress) {
  const response = await responseAt(fetchImpl, url, signal, downloadUrl);
  const declared = response.headers.get('content-length');
  if (declared !== null && (!/^\d+$/.test(declared) || Number(declared) !== expected.size)) {
    await response.body?.cancel();
    throw new ProviderToolsError('SIZE_MISMATCH', 'O tamanho do download não corresponde aos metadados oficiais.');
  }
  const reader = response.body?.getReader();
  if (!reader) throw new ProviderToolsError('DOWNLOAD_FAILED', 'O download oficial está vazio.');
  let file;
  const hash = createHash('sha256');
  let bytes = 0;
  let lastPercent = -1;
  try {
    file = await open(destination, 'wx', 0o700);
    while (true) {
      checkSignal(signal);
      const { value, done } = await reader.read();
      if (done) break;
      bytes += value.length;
      if (bytes > expected.size || bytes > MAX_BINARY_BYTES) throw new ProviderToolsError('SIZE_MISMATCH', 'O download excedeu o tamanho oficial.');
      hash.update(value);
      await file.writeFile(value);
      const percent = Math.floor(bytes * 100 / expected.size);
      if (percent !== lastPercent) { progress(percent); lastPercent = percent; }
    }
    if (bytes !== expected.size || hash.digest('hex') !== expected.sha256.toLowerCase()) {
      throw new ProviderToolsError('CHECKSUM_MISMATCH', 'A verificação SHA-256 do download falhou. Nenhuma versão foi substituída.');
    }
    await file.sync();
  } finally {
    await file?.close();
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

/** Configuration is supplied only by Electron main, never by renderer input. */
export function createProviderTools({ rootDir, npmCli, executable = process.execPath, platform = process.platform, arch = process.arch,
  musl = platform === 'linux' && !process.report?.getReport().header.glibcVersionRuntime,
  env = process.env, onProgress = () => {}, fetchImpl = globalThis.fetch, runCommand = runProviderCommand,
  timeoutMs = 15 * 60_000 } = {}) {
  if (typeof rootDir !== 'string' || !isAbsolute(rootDir)) throw new TypeError('rootDir must be an absolute private directory.');
  if (npmCli !== undefined && (typeof npmCli !== 'string' || !isAbsolute(npmCli))) throw new TypeError('npmCli must be an absolute path.');
  const root = resolve(rootDir);
  const info = platformInfo(platform, arch, musl);
  const states = new Map();
  let active;

  const emit = (id, value) => {
    states.set(id, { ...states.get(id), ...value });
    try { onProgress({ id, ...states.get(id) }); } catch { /* UI notification failures cannot change installation results. */ }
  };

  async function manifest(id) {
    const current = join(root, id, 'current');
    try {
      if ((await lstat(join(root, id))).isSymbolicLink() || (await lstat(current)).isSymbolicLink()) return undefined;
      const data = JSON.parse(await readFile(join(current, 'aioffice-provider.json'), 'utf8'));
      if (data.id !== id || data.platform !== platform || data.arch !== arch || !VERSION.test(data.version) || typeof data.binary !== 'string' || isAbsolute(data.binary)) return undefined;
      const binary = resolve(current, data.binary);
      if (!inside(current, binary) || !inside(await realpath(current), await realpath(binary)) || !(await stat(binary)).isFile()) return undefined;
      return { version: data.version, executable: binary };
    } catch { return undefined; }
  }

  async function list() {
    return Promise.all(Object.entries(PROVIDERS).map(async ([id, entry]) => {
      const installed = await manifest(id);
      const live = states.get(id);
      return {
        id, name: entry.name, supported: Boolean(info), canInstall: Boolean(info && (id === 'omp' || npmCli)),
        installed: Boolean(installed), version: installed?.version,
        state: live?.state ?? (installed ? 'installed' : 'missing'), progress: live?.progress ?? 0,
        error: live?.error, errorCode: live?.errorCode,
      };
    }));
  }

  async function executables() {
    const entries = await Promise.all(Object.keys(PROVIDERS).map(async (id) => [id, (await manifest(id))?.executable]));
    return Object.fromEntries(entries.filter(([, value]) => value));
  }

  async function environment(base = env) {
    const bins = await executables();
    const result = { ...base };
    if (bins.codex && !result.HABBLAUD_CODEX_BIN) result.HABBLAUD_CODEX_BIN = bins.codex;
    if (bins.claude && !result.HABBLAUD_CLAUDE_BIN) result.HABBLAUD_CLAUDE_BIN = bins.claude;
    if (bins.omp) {
      const pathKeys = Object.keys(result).filter((key) => platform === 'win32' ? key.toLowerCase() === 'path' : key === 'PATH');
      const path = pathKeys.map((key) => result[key]).filter(Boolean).join(platform === 'win32' ? ';' : ':');
      for (const key of pathKeys) delete result[key];
      result.PATH = [join(root, 'omp', 'current', 'bin'), path].filter(Boolean).join(platform === 'win32' ? ';' : ':');
    }
    return result;
  }

  async function nativeBinary(id, stage) {
    const suffix = platform === 'win32' ? '.exe' : '';
    const candidates = id === 'codex' ? [
      join(stage, 'node_modules', '@openai', `codex-${platform}-${arch}`, 'vendor', info.triple, 'bin', `codex${suffix}`),
      join(stage, 'node_modules', '@openai', 'codex', 'vendor', info.triple, 'bin', `codex${suffix}`),
    ] : [join(stage, 'node_modules', '@anthropic-ai', `claude-code-${info.claude}`, `claude${suffix}`)];
    for (const candidate of candidates) {
      if (await exists(candidate) && inside(await realpath(stage), await realpath(candidate)) && (await stat(candidate)).isFile()) return candidate;
    }
    throw new ProviderToolsError('MISSING_BINARY', 'O pacote oficial não contém um executável nativo compatível. A instalação anterior foi preservada.');
  }

  async function install(id, { signal } = {}) {
    const entry = provider(id);
    if (active) throw new ProviderToolsError('BUSY', 'Já existe uma instalação de CLI em andamento.');
    if (!info || (id !== 'omp' && !npmCli)) throw new ProviderToolsError('UNSUPPORTED', 'A instalação deste CLI não está disponível nesta plataforma.');
    const controller = new AbortController();
    active = controller;
    const cancelled = () => controller.abort(new ProviderToolsError('CANCELLED', 'Instalação cancelada.'));
    signal?.addEventListener('abort', cancelled, { once: true });
    if (signal?.aborted) cancelled();
    const timeout = setTimeout(() => controller.abort(new ProviderToolsError('TIMEOUT', 'A instalação excedeu o tempo limite. Tente novamente.')), timeoutMs);
    const operationSignal = controller.signal;
    const parent = join(root, id);
    const stage = join(parent, `.stage-${randomUUID()}`);
    const current = join(parent, 'current');
    const backup = join(parent, `.previous-${randomUUID()}`);
    let backedUp = false;
    let promoted = false;
    let stageCreated = false;
    let version;
    try {
      checkSignal(operationSignal);
      emit(id, { state: 'installing', phase: 'preparing', progress: 0, error: undefined, errorCode: undefined });
      await directory(root);
      await directory(parent);
      await directory(stage);
      stageCreated = true;
      const childEnv = installEnvironment(env);
      let binary;
      if (id === 'omp') {
        const api = `${BUILD_ORIGIN}/api/products/omp/latest/${info.omp}?channel=stable`;
        const metadata = await boundedJson(await responseAt(fetchImpl, api, operationSignal, (value) => {
          if (value !== api) throw new ProviderToolsError('UNSAFE_URL', 'Os metadados oficiais foram redirecionados para uma fonte não permitida.');
          return new URL(value);
        }), operationSignal);
        version = metadata?.build?.version;
        const file = metadata?.file;
        if (typeof version !== 'string' || !VERSION.test(version) || !file || typeof file.sha256 !== 'string' || !/^[a-f0-9]{64}$/i.test(file.sha256)
          || !Number.isSafeInteger(file.size) || file.size <= 0 || file.size > MAX_BINARY_BYTES || typeof metadata.download !== 'string') {
          throw new ProviderToolsError('INVALID_METADATA', 'A fonte oficial retornou versão, tamanho ou SHA-256 inválidos.');
        }
        const expectedName = `omp-${platform === 'win32' ? 'windows' : platform === 'darwin' ? 'darwin' : musl ? 'linux-musl' : 'linux'}-${arch}${platform === 'win32' ? '.exe' : ''}`;
        if (file.name !== expectedName || decodeURIComponent(downloadUrl(metadata.download).pathname).split('/').pop() !== expectedName) {
          throw new ProviderToolsError('INVALID_METADATA', 'O binário oficial não corresponde à plataforma solicitada.');
        }
        await directory(join(stage, 'bin'));
        binary = join(stage, 'bin', platform === 'win32' ? 'omp.exe' : 'omp');
        emit(id, { phase: 'downloading', version, size: file.size });
        await downloadBinary(fetchImpl, metadata.download, binary, file, operationSignal, (progress) => emit(id, { progress }));
      } else {
        await writeFile(join(stage, 'package.json'), JSON.stringify({ private: true, name: `aioffice-private-${id}`, version: '1.0.0' }), { mode: 0o600 });
        const userConfig = join(stage, 'user.npmrc');
        const globalConfig = join(stage, 'global.npmrc');
        await writeFile(userConfig, '', { mode: 0o600 });
        await writeFile(globalConfig, '', { mode: 0o600 });
        emit(id, { phase: 'downloading' });
        // Both official packages ship native binaries in optionalDependencies. Claude's postinstall only copies
        // that binary; resolving it directly avoids shell scripts and any dependency on a system `node` command.
        await runCommand(executable, [npmCli, 'install', `${entry.package}@latest`, '--prefix', stage,
          '--ignore-scripts', '--include=optional', '--no-audit', '--no-fund', '--no-update-notifier', '--loglevel=error',
          '--registry=https://registry.npmjs.org/', '--strict-ssl=true', '--userconfig', userConfig, '--globalconfig', globalConfig,
          '--cache', join(stage, 'npm-cache'), '--logs-dir', join(stage, 'npm-logs')],
        { cwd: stage, env: { ...childEnv, ELECTRON_RUN_AS_NODE: '1' }, signal: operationSignal });
        checkSignal(operationSignal);
        binary = await nativeBinary(id, stage);
      }
      checkSignal(operationSignal);
      emit(id, { phase: 'verifying' });
      if (platform !== 'win32') await chmod(binary, 0o700);
      const output = await runCommand(binary, ['--version'], { cwd: stage, env: childEnv, signal: operationSignal, maxOutput: 8192 });
      const actualVersion = String(output.stdout ?? '').match(/\b(\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?)\b/)?.[1];
      if (!actualVersion || (version && actualVersion !== version)) throw new ProviderToolsError('VERSION_MISMATCH', 'O executável não confirmou a versão oficial instalada.');
      version = actualVersion;
      for (const artifact of ['npm-cache', 'npm-logs', 'user.npmrc', 'global.npmrc']) {
        await rm(join(stage, artifact), { recursive: true, force: true });
      }
      await writeFile(join(stage, 'aioffice-provider.json'), JSON.stringify({ id, version, platform, arch, binary: relative(stage, binary) }), { mode: 0o600 });
      checkSignal(operationSignal);
      emit(id, { phase: 'activating' });
      if (await exists(current)) {
        if ((await lstat(current)).isSymbolicLink()) throw new ProviderToolsError('UNSAFE_DIRECTORY', 'A instalação anterior usa um caminho inseguro.');
        await rename(current, backup);
        backedUp = true;
      }
      try { await rename(stage, current); promoted = true; }
      catch (error) { if (backedUp) { await rename(backup, current); backedUp = false; } throw error; }
      emit(id, { state: 'installed', phase: 'complete', version, progress: 100 });
      return { id, version, installed: true, restartRequired: true };
    } catch (error) {
      const failure = operationSignal.aborted ? operationSignal.reason : error instanceof ProviderToolsError ? error
        : new ProviderToolsError('INSTALL_FAILED', 'Não foi possível instalar o CLI. Confira a conexão, as permissões e o espaço em disco.');
      emit(id, { state: failure.code === 'CANCELLED' ? 'cancelled' : 'error', phase: 'complete', error: failure.message, errorCode: failure.code });
      throw failure;
    } finally {
      clearTimeout(timeout);
      signal?.removeEventListener('abort', cancelled);
      // Only generated children of this provider directory are ever removed; existing installations stay intact.
      if (stageCreated && inside(parent, stage)) await rm(stage, { recursive: true, force: true }).catch(() => {});
      if (promoted && backedUp && inside(parent, backup)) await rm(backup, { recursive: true, force: true }).catch(() => {});
      active = undefined;
    }
  }

  return { list, install, executables, environment, cancel() { active?.abort(new ProviderToolsError('CANCELLED', 'Instalação cancelada.')); } };
}
