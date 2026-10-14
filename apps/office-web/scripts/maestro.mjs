import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, open, readFile, rm } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const execFileAsync = promisify(execFile);
const PACKAGE = '@iapro/orquestrador-maestro-cli';
const EXPECTED_REPOSITORY = 'https://github.com/IAPro-Community/Orquestrador-Maestro.git';
const HOME = process.env.HOME || process.env.USERPROFILE || homedir();
const MAESTRO_HOME = process.env.AIOFFICE_MAESTRO_HOME || HOME;
const LOCK_FILE = join(MAESTRO_HOME, '.aioffice', 'maestro-bootstrap.lock');
const SEMVER = /^(0|[1-9]\d{0,5})\.(0|[1-9]\d{0,5})\.(0|[1-9]\d{0,5})(?:-([0-9A-Za-z.-]{1,40}))?$/;

function npmCliPath() {
  const candidates = [
    process.env.AIOFFICE_NPM_CLI,
    process.env.npm_execpath,
    join(dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js'),
    resolve(dirname(process.execPath), '..', 'lib', 'node_modules', 'npm', 'bin', 'npm-cli.js'),
    '/usr/share/nodejs/npm/bin/npm-cli.js',
  ].filter((value) => typeof value === 'string' && value.length > 0);

  const path = candidates.find((candidate) => existsSync(candidate) && /(?:^|[\\/])npm-cli\.js$/i.test(candidate));
  if (!path) throw new Error('Não encontrei a CLI do NPM deste Node.js. Reinstale o Node.js com NPM e tente novamente.');
  return resolve(path);
}

function childEnv(extra = {}) {
  const env = { ...process.env, ...extra };
  if (process.versions.electron) env.ELECTRON_RUN_AS_NODE = '1';
  return env;
}

async function runNpm(args, timeout = 30_000) {
  try {
    return await execFileAsync(process.execPath, [npmCliPath(), ...args], {
      cwd: process.cwd(),
      env: childEnv({ NPM_CONFIG_UPDATE_NOTIFIER: 'false', CI: '1' }),
      timeout,
      maxBuffer: 4 * 1024 * 1024,
      windowsHide: true,
    });
  } catch (error) {
    throw new Error(commandError(error));
  }
}

function commandError(error) {
  const parts = [error?.stderr, error?.stdout, error?.message].filter((value) => typeof value === 'string' && value.trim());
  const detail = parts.at(0) ?? 'o comando terminou com erro';
  return [HOME, MAESTRO_HOME, process.env.NPM_CONFIG_PREFIX, process.env.NPM_CONFIG_CACHE]
    .filter((path) => typeof path === 'string' && path.length > 0)
    .reduce((text, path) => text.replaceAll(path, '~'), detail)
    .trim()
    .slice(-1200);
}

async function globalRoot() {
  const { stdout } = await runNpm(['root', '--global']);
  const root = stdout.trim();
  // NPM may report a valid prefix path before its first global install creates it.
  if (!root || !isAbsolute(root)) throw new Error('O NPM não informou uma pasta global válida.');
  return resolve(root);
}

async function readInstalledPackage() {
  const root = await globalRoot();
  const packageDir = join(root, '@iapro', 'orquestrador-maestro-cli');
  const packageFile = join(packageDir, 'package.json');
  if (!existsSync(packageFile)) return undefined;

  let pkg;
  try {
    pkg = JSON.parse(readFileSync(packageFile, 'utf8'));
  } catch {
    throw new Error('O pacote global do Orquestrador-Maestro está ilegível. Reinstale-o pelo AIOffice.');
  }
  const rawRepository = typeof pkg.repository === 'string' ? pkg.repository : pkg.repository?.url;
  const repository = typeof rawRepository === 'string' ? rawRepository.replace(/^git\+/, '').replace(/\/$/, '') : undefined;
  if (pkg.name !== PACKAGE || typeof pkg.version !== 'string' || !SEMVER.test(pkg.version) || repository !== EXPECTED_REPOSITORY) {
    throw new Error('O pacote global encontrado não corresponde à CLI oficial do Orquestrador-Maestro.');
  }
  const bin = join(packageDir, 'bin', 'orquestrador-maestro.js');
  if (!existsSync(bin)) throw new Error('A CLI oficial está incompleta. Reinstale o Orquestrador-Maestro pelo AIOffice.');
  return { version: pkg.version, bin };
}

async function runCli(args, timeout = 120_000) {
  const installed = await readInstalledPackage();
  if (!installed) throw new Error('A CLI do Orquestrador-Maestro não está instalada.');
  try {
    return await execFileAsync(process.execPath, [installed.bin, ...args, '--core-only', '--home-path', MAESTRO_HOME], {
      cwd: process.cwd(),
      env: childEnv({ CI: '1' }),
      timeout,
      maxBuffer: 4 * 1024 * 1024,
      windowsHide: true,
    });
  } catch (error) {
    throw new Error(commandError(error));
  }
}

async function latestVersion() {
  const { stdout } = await runNpm(['view', `${PACKAGE}@latest`, 'version', '--json']);
  let value;
  try {
    value = JSON.parse(stdout.trim());
  } catch {
    value = stdout.trim().replace(/^['"]|['"]$/g, '');
  }
  if (typeof value !== 'string' || !SEMVER.test(value)) throw new Error('O NPM retornou uma versão inválida do Orquestrador-Maestro.');
  return value;
}

function compareVersions(left, right) {
  const a = SEMVER.exec(left);
  const b = SEMVER.exec(right);
  if (!a || !b) return 0;
  for (let i = 1; i <= 3; i++) {
    const difference = Number(a[i]) - Number(b[i]);
    if (difference) return difference;
  }
  if (!a[4] || !b[4]) return (a[4] ? -1 : 0) - (b[4] ? -1 : 0);
  return a[4] < b[4] ? -1 : a[4] > b[4] ? 1 : 0;
}

async function status() {
  const checkedAt = Date.now();
  const installed = await readInstalledPackage();
  const latest = await latestVersion();
  const coreInstalled = existsSync(join(MAESTRO_HOME, '.orquestrador', 'rules.md')) &&
    existsSync(join(MAESTRO_HOME, '.orquestrador', 'maestro.md')) &&
    existsSync(join(MAESTRO_HOME, '.orquestrador', 'PERSISTENCE.md'));
  return {
    state: installed && coreInstalled ? 'ok' : 'missing',
    installed: !!installed && coreInstalled,
    installedVersion: installed?.version,
    latestVersion: latest,
    checkedAt,
    available: !!installed && compareVersions(latest, installed.version) > 0,
  };
}

async function withLock(operation) {
  await mkdir(dirname(LOCK_FILE), { recursive: true });
  let lock;
  const deadline = Date.now() + 10 * 60_000;
  while (!lock) {
    try {
      lock = await open(LOCK_FILE, 'wx', 0o600);
    } catch (error) {
      if (error?.code !== 'EEXIST') throw error;
      let holder;
      try {
        holder = JSON.parse(await readFile(LOCK_FILE, 'utf8'));
      } catch {
        // Um criador pode ter aberto o arquivo e ainda não ter gravado seu PID.
        if (Date.now() >= deadline) throw new Error('Não foi possível ler o bloqueio da instalação do Orquestrador-Maestro após 10 minutos. Remova o bloqueio obsoleto e tente novamente.');
        await new Promise((resolveDelay) => setTimeout(resolveDelay, 100));
        continue;
      }
      let alive = false;
      if (Number.isInteger(holder.pid) && holder.pid > 0) {
        try {
          process.kill(holder.pid, 0);
          alive = true;
        } catch (probeError) {
          alive = probeError?.code !== 'ESRCH';
        }
      }
      if (!alive) await rm(LOCK_FILE, { force: true });
      else if (Date.now() >= deadline) throw new Error('Outra instalação ou atualização do Orquestrador-Maestro já está em andamento há mais de 10 minutos.');
      else await new Promise((resolveDelay) => setTimeout(resolveDelay, 500));
    }
  }
  try {
    await lock.writeFile(JSON.stringify({ pid: process.pid, startedAt: Date.now() }));
    return await operation();
  } finally {
    await lock.close();
    await rm(LOCK_FILE, { force: true });
  }
}

async function ensureInstalled() {
  const coreInstalled = () => existsSync(join(MAESTRO_HOME, '.orquestrador', 'rules.md')) &&
    existsSync(join(MAESTRO_HOME, '.orquestrador', 'maestro.md')) &&
    existsSync(join(MAESTRO_HOME, '.orquestrador', 'PERSISTENCE.md'));
  return withLock(async () => {
    let installed = await readInstalledPackage();
    if (installed && coreInstalled()) {
      try {
        await runCli(['verify']);
        return { state: 'ok', installed: true, installedVersion: installed.version, available: false, verified: true };
      } catch {
        // Corrige a camada compartilhada se ela estiver incompleta; sem tocar nos perfis de ferramentas.
      }
    }
    if (!installed) {
      await runNpm(['install', '--global', '--prefer-online', '--no-audit', '--no-fund', `${PACKAGE}@latest`], 300_000);
      installed = await readInstalledPackage();
      if (!installed) throw new Error('O NPM terminou sem disponibilizar a CLI oficial do Orquestrador-Maestro.');
    }

    if (!coreInstalled()) await runCli(['install', '--non-interactive'], 300_000);
    else {
      try {
        await runCli(['verify']);
      } catch {
        await runCli(['update', '--non-interactive'], 300_000);
      }
    }
    await runCli(['verify'], 120_000);
    const verified = await readInstalledPackage();
    if (!verified) throw new Error('A CLI do Orquestrador-Maestro desapareceu após a instalação.');
    return { state: 'ok', installed: true, installedVersion: verified.version, available: false, verified: true };
  });
}

async function update(target) {
  if (typeof target !== 'string' || !SEMVER.test(target)) throw new Error('A versão solicitada é inválida.');
  return withLock(async () => {
    const latest = await latestVersion();
    if (latest !== target) throw new Error('A versão mais recente mudou. Verifique novamente antes de atualizar.');
    const installed = await readInstalledPackage();
    if (!installed) throw new Error('O Orquestrador-Maestro não está instalado; execute a configuração inicial do AIOffice.');
    if (compareVersions(latest, installed.version) <= 0) throw new Error('O Orquestrador-Maestro já está atualizado.');

    await runNpm(['install', '--global', '--prefer-online', '--no-audit', '--no-fund', `${PACKAGE}@latest`], 300_000);
    await runCli(['update', '--non-interactive'], 300_000);
    await runCli(['verify'], 120_000);
    const updated = await readInstalledPackage();
    if (!updated || updated.version !== latest) throw new Error('A CLI atualizada não corresponde à versão mais recente confirmada pelo NPM.');
    return {
      state: 'ok',
      installed: true,
      installedVersion: updated.version,
      latestVersion: latest,
      checkedAt: Date.now(),
      available: false,
    };
  });
}

async function main() {
  const [command, target] = process.argv.slice(2);
  if (command === 'ensure') return ensureInstalled();
  if (command === 'status') return status();
  if (command === 'update') return update(target);
  throw new Error('Uso: node scripts/maestro.mjs <ensure|status|update [versão]>');
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main()
    .then((result) => process.stdout.write(`${JSON.stringify(result)}\n`))
    .catch((error) => {
      process.stderr.write(`${error instanceof Error ? error.message : 'Falha ao preparar o Orquestrador-Maestro.'}\n`);
      process.exitCode = 1;
    });
}
