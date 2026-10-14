// Copied outside the live checkout before launch. Uses only Node built-ins.
// Never run this by hand: the server supplies a private job and an exclusive lock.
import { execFile, spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { access, lstat, mkdir, readFile, readdir, readlink, realpath, rename, rm, symlink, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { promisify } from 'node:util';

const exec = promisify(execFile);
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
const OFFICIAL = 'https://github.com/IAPro-Community/AIOffice.git';
const job = JSON.parse(await readFile(process.argv[2], 'utf8'));
const stage = join(job.work, 'stage');
const backup = join(job.work, 'backup');
const nonce = randomBytes(32).toString('hex');
const gitEnv = { ...Object.fromEntries(Object.entries(job.env).filter(([key]) => !key.toUpperCase().startsWith('GIT_'))), GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: process.platform === 'win32' ? 'NUL' : '/dev/null', GIT_TERMINAL_PROMPT: '0' };
let switched = false;
let stopped = false;
let newServer;
const artifacts = [];
const journalFile = join(job.work, 'recovery.json');

function within(parent, child) {
  const r = relative(parent, child);
  return !r || (!r.startsWith('..') && !isAbsolute(r));
}

async function exists(path) {
  try { await lstat(path); return true; } catch (error) { if (error.code === 'ENOENT') return false; throw error; }
}

function alive(pid) {
  try { process.kill(pid, 0); return true; } catch (error) { return error.code !== 'ESRCH'; }
}

async function git(root, args) {
  const { stdout } = await exec('git', ['-C', root, ...args], { env: gitEnv, windowsHide: true, timeout: 120_000, maxBuffer: 32 * 1024 * 1024 });
  return stdout.trim();
}

async function status(state, message, phase, extra = {}) {
  const record = { state, message, phase, operation: job.operation, target: job.version, previous: job.previous, workerPid: process.pid, ...extra };
  const tmp = `${job.statusFile}.${job.operation}.tmp`;
  await writeFile(tmp, JSON.stringify(record), { mode: 0o600 });
  await rename(tmp, job.statusFile);
}

async function journal() {
  await writeFile(journalFile, JSON.stringify({ root: job.root, previousCommit: job.previousCommit, switched, artifacts, backup }, null, 2), { mode: 0o600 });
}

async function ownLock() {
  const lock = JSON.parse(await readFile(job.lockFile, 'utf8'));
  if (lock.operation !== job.operation || lock.pid !== job.parentPid || lock.version !== job.version) throw new Error('A trava não pertence a esta atualização.');
}

async function releaseLock() {
  await ownLock();
  await rm(`${job.lockFile}.shutdown`, { force: true });
  await rm(`${job.lockFile}.cancel`, { force: true });
  await rm(job.lockFile);
}

async function npm(args, cwd) {
  await exec(job.node, [job.npmCli, ...args], { cwd, env: { ...gitEnv, NODE_ENV: 'development' }, windowsHide: true, timeout: 900_000, maxBuffer: 16 * 1024 * 1024 });
}

// Build outputs/dependencies may be ignored. They are moved to recovery storage before Git changes.
async function collectArtifacts(root, dir = root) {
  if (!await exists(dir)) return [];
  const result = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.name === '.git') continue;
    const path = join(dir, entry.name);
    const rel = relative(root, path);
    if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name.endsWith('.tsbuildinfo')) {
      if ((await lstat(path)).isSymbolicLink()) throw new Error(`Artefato com link externo não pode ser trocado: ${rel}`);
      result.push(rel);
    } else if (entry.isDirectory()) result.push(...await collectArtifacts(root, path));
  }
  return result;
}

// npm may create absolute workspace junctions on Windows. Relocate every internal link explicitly.
async function relocateLinks(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    const info = await lstat(path);
    if (info.isSymbolicLink()) {
      const raw = await readlink(path);
      const target = await realpath(resolve(dirname(path), raw));
      if (!within(stage, target)) throw new Error(`Dependência aponta para fora da preparação: ${relative(stage, path)}`);
      const mapped = join(job.root, relative(stage, target));
      const dirTarget = (await lstat(target)).isDirectory();
      await rm(path, { force: true });
      const link = process.platform === 'win32' && dirTarget ? mapped : relative(dirname(join(job.root, relative(stage, path))), mapped);
      await symlink(link, path, process.platform === 'win32' && dirTarget ? 'junction' : dirTarget ? 'dir' : 'file');
    } else if (info.isDirectory()) await relocateLinks(path);
  }
}

async function assertClean() {
  if (await git(job.root, ['rev-parse', 'HEAD']) !== job.previousCommit || await git(job.root, ['status', '--porcelain', '--untracked-files=all'])) throw new Error('O checkout foi alterado durante a preparação; a atualização foi cancelada.');
  const remote = await git(job.root, ['remote', 'get-url', 'origin']);
  if (!/^(?:https:\/\/github\.com\/IAPro-Community\/AIOffice(?:\.git)?|git@github\.com:IAPro-Community\/AIOffice(?:\.git)?)$/i.test(remote)) throw new Error('O origin mudou durante a preparação.');
}

async function startServer(version, token) {
  const logFile = join(job.work, version === job.version ? 'server.log' : 'rollback-server.log');
  const log = createWriteStream(logFile, { flags: 'a', mode: 0o600 });
  await new Promise((done, reject) => { log.once('open', done); log.once('error', reject); });
  const server = spawn(job.node, [join(job.root, 'apps', 'office-web', 'dist', 'server', 'index.js')], {
    cwd: job.cwd,
    env: { ...job.env, AIOFFICE_UPDATE_NONCE: token },
    detached: true, stdio: ['ignore', log.fd, log.fd], windowsHide: true,
  });
  await new Promise((done, reject) => { server.once('spawn', done); server.once('error', reject); });
  server.unref();
  log.end();
  return server;
}

async function health(server, version, token, timeout = 60_000) {
  const host = job.host.includes(':') && !job.host.startsWith('[') ? `[${job.host}]` : job.host;
  const url = `http://${host}:${job.port}/api/updates/health`;
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (!alive(server.pid)) throw new Error('O servidor reiniciado encerrou antes de confirmar a versão.');
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(2_000), redirect: 'error' });
      const body = await response.json();
      if (response.ok && body.version === version && body.nonce === token && body.pid === server.pid) return;
    } catch { /* An exact nonce + PID is required, even if an old listener answers. */ }
    await sleep(500);
  }
  throw new Error('O servidor não confirmou a versão e a identidade desta atualização.');
}

async function cooperativeStop(server, token) {
  if (!server || !alive(server.pid)) return true;
  const host = job.host.includes(':') && !job.host.startsWith('[') ? `[${job.host}]` : job.host;
  try {
    const res = await fetch(`http://${host}:${job.port}/api/updates/shutdown`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Origin: `http://${host}:${job.port}` },
      body: JSON.stringify({ nonce: token, pid: server.pid }), signal: AbortSignal.timeout(3_000), redirect: 'error',
    });
    if (!res.ok) return false;
  } catch { if (alive(server.pid)) return false; }
  const deadline = Date.now() + 20_000;
  while (alive(server.pid) && Date.now() < deadline) await sleep(250);
  return !alive(server.pid);
}

try {
  await ownLock();
  if (await realpath(job.root) !== job.root || await realpath(job.work) !== job.work || within(job.root, job.work) || within(job.root, await realpath(job.dataDir)) || within(await realpath(job.dataDir), job.root)) throw new Error('As pastas da atualização não são independentes do checkout.');
  if (job.env.AIOFFICE_MANAGED_INSTALL !== '1' || !/^(0|[1-9]\d{0,5})\.(0|[1-9]\d{0,5})\.(0|[1-9]\d{0,5})$/.test(job.version)) throw new Error('Instalação ou versão não autorizada.');
  await assertClean();
  await status('downloading', 'Consultando a release estável oficial do AIOffice.', 'release');
  const response = await fetch('https://api.github.com/repos/IAPro-Community/AIOffice/releases/latest', {
    headers: { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'aioffice-managed-updater' },
    signal: AbortSignal.timeout(15_000), redirect: 'error',
  });
  if (!response.ok) throw new Error(`O GitHub respondeu ${response.status}; nenhuma atualização foi aplicada.`);
  const release = await response.json();
  const tag = release.tag_name;
  if (release.draft !== false || release.prerelease !== false || ![job.version, `v${job.version}`].includes(tag) || release.html_url !== `https://github.com/IAPro-Community/AIOffice/releases/tag/${tag}`) throw new Error('A release oficial mudou ou não corresponde à versão estável solicitada.');
  await exec('git', ['clone', '--depth', '1', '--single-branch', '--branch', tag, '--', OFFICIAL, stage], { cwd: job.work, env: gitEnv, windowsHide: true, timeout: 180_000, maxBuffer: 8 * 1024 * 1024 });
  const targetCommit = await git(stage, ['rev-parse', 'HEAD']);
  const tagCommit = await git(stage, ['rev-parse', `refs/tags/${tag}^{commit}`]);
  if (targetCommit !== tagCommit) throw new Error('O commit preparado não corresponde à tag oficial.');
  const pkg = JSON.parse(await readFile(join(stage, 'package.json'), 'utf8'));
  if (pkg.name !== 'aioffice' || pkg.version !== job.version || pkg.repository?.url !== OFFICIAL.replace(/\.git$/, '') && pkg.repository?.url !== OFFICIAL) throw new Error('O pacote da release não corresponde ao AIOffice solicitado.');
  await access(join(stage, 'package-lock.json'));
  await access(join(stage, 'apps', 'office-web', 'package-lock.json'));
  await status('downloading', 'Instalando dependências e compilando em uma pasta separada; o escritório continua disponível.', 'building');
  await npm(['ci', '--include=dev', '--no-audit', '--no-fund'], stage);
  await npm(['ci', '--include=dev', '--no-audit', '--no-fund'], join(stage, 'apps', 'office-web'));
  await npm(['run', 'build'], stage);
  await access(join(stage, 'apps', 'office-web', 'dist', 'server', 'index.js'));
  await access(join(stage, 'apps', 'office-web', 'dist', 'client', 'index.html'));
  const allArtifacts = [...new Set([...await collectArtifacts(job.root), ...await collectArtifacts(stage)])];
  const targetFiles = (await git(stage, ['ls-files', '-z'])).split('\0').filter(Boolean);
  const previousFiles = (await git(job.root, ['ls-files', '-z'])).split('\0').filter(Boolean);
  for (const rel of allArtifacts) {
    if ([...targetFiles, ...previousFiles].some((file) => file === rel.replaceAll('\\', '/') || file.startsWith(`${rel.replaceAll('\\', '/')}/`))) throw new Error(`A release versiona arquivos de runtime que não podem ser trocados: ${rel}`);
  }
  const ignored = (await git(job.root, ['ls-files', '--others', '--ignored', '--exclude-standard', '-z'])).split('\0').filter(Boolean);
  for (const file of ignored) {
    if (allArtifacts.some((dir) => within(join(job.root, dir), join(job.root, file)))) continue;
    if (targetFiles.some((target) => within(join(job.root, file), join(job.root, target)) || within(join(job.root, target), join(job.root, file)))) throw new Error(`A release colide com um arquivo local ignorado: ${file}`);
  }
  // Import the verified commit without modifying the live working tree.
  await git(job.root, ['fetch', '--no-tags', stage, targetCommit]);
  for (const rel of allArtifacts) {
    const path = join(stage, rel);
    if (await exists(path) && (await lstat(path)).isDirectory()) await relocateLinks(path);
    artifacts.push({ path: rel, previous: await exists(join(job.root, rel)), prepared: await exists(path), saved: false, installed: false });
  }
  await journal();
  await assertClean();
  await status('restarting', 'Release compilada. Aguardando encerramento seguro do escritório.', 'awaiting-shutdown');
  const shutdownDeadline = Date.now() + 120_000;
  while (!await exists(`${job.lockFile}.shutdown`)) {
    if (await exists(`${job.lockFile}.cancel`)) throw new Error(await readFile(`${job.lockFile}.cancel`, 'utf8'));
    if (!alive(job.parentPid) || Date.now() > shutdownDeadline) throw new Error('O servidor não autorizou o encerramento seguro; o checkout foi preservado.');
    await sleep(500);
  }
  if ((await readFile(`${job.lockFile}.shutdown`, 'utf8')) !== job.operation) throw new Error('A autorização de encerramento é inválida.');
  const exitDeadline = Date.now() + 30_000;
  while (alive(job.parentPid)) {
    if (Date.now() > exitDeadline) throw new Error('O servidor original continua ativo; o checkout foi preservado.');
    await sleep(250);
  }
  stopped = true;
  await assertClean();
  await ownLock();
  await status('applying', 'Preservando os arquivos de runtime e aplicando a release oficial.', 'applying');
  await mkdir(backup, { recursive: true });
  for (const artifact of artifacts) {
    if (!artifact.previous) continue;
    const dest = join(backup, artifact.path);
    await mkdir(dirname(dest), { recursive: true });
    await rename(join(job.root, artifact.path), dest);
    artifact.saved = true;
    await journal();
  }
  // No git clean: unrelated ignored files remain in place.
  switched = true;
  await journal();
  await git(job.root, ['reset', '--hard', targetCommit]);
  for (const artifact of artifacts) {
    if (!artifact.prepared) continue;
    const dest = join(job.root, artifact.path);
    await mkdir(dirname(dest), { recursive: true });
    await rename(join(stage, artifact.path), dest);
    artifact.installed = true;
    await journal();
  }
  await status('restarting', 'Iniciando o AIOffice e aguardando confirmação da versão instalada.', 'health');
  newServer = await startServer(job.version, nonce);
  await health(newServer, job.version, nonce);
  await status('ready', `AIOffice ${job.version} instalado e confirmado pelo servidor reiniciado.`, 'complete', { runningPid: newServer.pid });
  await releaseLock();
  // Backup is retained for manual recovery; delete only the private environment job.
  await rm(process.argv[2], { force: true });
} catch (error) {
  const reason = error instanceof Error ? error.message.slice(0, 800) : 'Falha desconhecida na atualização.';
  try {
    if (switched || artifacts.some((artifact) => artifact.saved)) {
      if (!await cooperativeStop(newServer, nonce)) {
        await status('error', `${reason} O servidor novo não encerrou cooperativamente; a recuperação foi preservada em ${job.work}. Não altere arquivos enquanto ele estiver ativo.`, 'manual-recovery');
        process.exitCode = 1;
      } else {
        await status('applying', 'A atualização falhou. Restaurando o checkout e todos os arquivos de runtime anteriores.', 'rollback');
        if (switched) await git(job.root, ['reset', '--hard', job.previousCommit]);
        for (const artifact of [...artifacts].reverse()) {
          const live = join(job.root, artifact.path);
          if (artifact.installed && await exists(live)) {
            const failed = join(job.work, 'failed-runtime', artifact.path);
            await mkdir(dirname(failed), { recursive: true });
            await rename(live, failed);
          }
          if (artifact.saved) {
            await mkdir(dirname(live), { recursive: true });
            await rename(join(backup, artifact.path), live);
          }
        }
        const rollbackNonce = randomBytes(32).toString('hex');
        const oldServer = await startServer(job.previous, rollbackNonce);
        // Old releases may lack updater health: never claim verified recovery in that case.
        await health(oldServer, job.previous, rollbackNonce);
        await status('error', `${reason} A versão anterior ${job.previous} foi restaurada e confirmada.`, 'rolled-back', { runningPid: oldServer.pid });
        await releaseLock();
      }
    } else if (stopped) {
      const rollbackNonce = randomBytes(32).toString('hex');
      const oldServer = await startServer(job.previous, rollbackNonce);
      await health(oldServer, job.previous, rollbackNonce);
      await status('error', `${reason} O servidor anterior foi reiniciado e confirmado.`, 'rolled-back', { runningPid: oldServer.pid });
      await releaseLock();
    } else {
      await status('error', `${reason} A instalação em uso foi preservada.`, 'failed');
      await releaseLock();
    }
  } catch (recoveryError) {
    await status('error', `${reason} Recuperação incompleta: ${recoveryError.message}. Trava e arquivos de recuperação preservados em ${job.work}.`, 'manual-recovery').catch(() => undefined);
    process.exitCode = 1;
  }
  // Remove secrets only after the worker no longer needs the saved environment.
  await rm(process.argv[2], { force: true }).catch(() => undefined);
}
