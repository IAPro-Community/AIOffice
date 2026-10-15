// Instala e atualiza a ponte do AIOffice na pasta global de extensões do oh-my-pi.
//   npm run omp:install     instala ou atualiza (faz backup ao substituir)
//   npm run omp:status      confere a extensão instalada
//   npm run omp:uninstall   remove apenas uma cópia intacta desta extensão
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const EXTENSION_MARKER = 'AIOffice Bridge Extension for oh-my-pi (omp).';
const EXTENSION_NAME = 'aioffice-bridge.ts';
const DEFAULT_PORT = 4747;

export interface OmpBridgeInstallResult {
  state: 'installed' | 'updated' | 'current' | 'conflict';
  target: string;
  backup?: string;
}

type Action = 'install' | 'status' | 'uninstall';

export function extensionPath(home: string): string {
  return join(home, '.omp', 'agent', 'extensions', EXTENSION_NAME);
}

export function parseArgs(argv: string[]): { action: Action; dryRun: boolean } {
  let action: Action | undefined;
  let dryRun = false;
  for (const arg of argv) {
    if (arg === '--dry-run') dryRun = true;
    else if (arg === '-h' || arg === '--help') return { action: 'status', dryRun: true };
    else if (arg === 'install' || arg === 'status' || arg === 'uninstall') {
      if (action) throw new Error('use apenas um comando: install, status ou uninstall');
      action = arg;
    } else throw new Error(`opção desconhecida: ${arg}`);
  }
  return { action: action ?? 'status', dryRun };
}

function stamp(now = new Date()): string {
  return now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

function backupPath(file: string): string {
  const base = `${file}.aioffice-backup-${stamp()}`;
  let candidate = base;
  for (let i = 2; existsSync(candidate); i++) candidate = `${base}-${i}`;
  return candidate;
}

function extensionSource(root: string, port: number): string {
  if (!Number.isInteger(port) || port < 1 || port > 65_535) throw new Error('A porta da extensão OMP precisa ficar entre 1 e 65535.');
  const source = readFileSync(join(root, 'mod', 'omp', EXTENSION_NAME), 'utf8');
  const url = /const HABBLAUD_URL = 'http:\/\/127\.0\.0\.1:\d+';/;
  if (!url.test(source)) throw new Error('A URL local da extensão OMP não está no formato esperado.');
  return source.replace(url, `const HABBLAUD_URL = 'http://127.0.0.1:${port}';`);
}

/** Instala/atualiza a extensão sem substituir arquivos que não pertençam ao AIOffice. */
export function ensureOmpBridgeInstalled(root: string, home: string, port = DEFAULT_PORT): OmpBridgeInstallResult {
  const target = extensionPath(home);
  const source = extensionSource(root, port);
  const installed = existsSync(target) ? readFileSync(target, 'utf8') : undefined;
  if (installed === source) return { state: 'current', target };
  if (installed !== undefined && !installed.includes(EXTENSION_MARKER)) return { state: 'conflict', target };

  mkdirSync(dirname(target), { recursive: true });
  const temp = `${target}.tmp-${process.pid}`;
  writeFileSync(temp, source, { mode: 0o600 });
  let backup: string | undefined;
  try {
    if (installed !== undefined) {
      backup = backupPath(target);
      renameSync(target, backup);
    }
    renameSync(temp, target);
  } catch (error) {
    if (backup && !existsSync(target)) renameSync(backup, target);
    throw error;
  } finally {
    if (existsSync(temp)) rmSync(temp);
  }
  return { state: installed === undefined ? 'installed' : 'updated', target, ...(backup ? { backup } : {}) };
}

function printHelp(): void {
  console.log('Uso: npm run omp:<install|status|uninstall> [-- --dry-run]\n\n  install     instala ou atualiza a ponte na extensão global do OMP (backup antes)\n  status      confere se a ponte está instalada\n  uninstall   remove a ponte se o arquivo não foi alterado\n  --dry-run   mostra a ação sem gravar nada\n\nDepois de instalar ou atualizar, abra uma nova sessão OMP para carregar a extensão.');
}

function main(argv: string[]): void {
  if (argv.some((arg) => arg === '-h' || arg === '--help')) {
    printHelp();
    return;
  }
  const { action, dryRun } = parseArgs(argv);
  const home = process.env.HOME || process.env.USERPROFILE || homedir();
  const target = extensionPath(home);
  const port = Number.parseInt(process.env.HABBLAUD_PORT ?? '', 10) || DEFAULT_PORT;
  const source = extensionSource(ROOT, port);
  const installed = existsSync(target) ? readFileSync(target, 'utf8') : undefined;

  if (action === 'status') {
    if (installed === undefined) console.log(`○ não instalada: ${target}`);
    else if (installed === source) console.log(`✓ instalada e atualizada: ${target}`);
    else if (installed.includes(EXTENSION_MARKER)) console.log(`! instalada, mas desatualizada ou editada: ${target}`);
    else console.log(`! já existe um arquivo sem identificação do AIOffice: ${target}`);
    return;
  }

  if (action === 'uninstall') {
    if (installed === undefined) {
      console.log(`○ já removida: ${target}`);
      return;
    }
    if (installed !== source) {
      throw new Error('o arquivo foi editado ou pertence a outra extensão; nada foi removido');
    }
    if (dryRun) console.log(`(dry-run) removeria ${target}`);
    else {
      rmSync(target);
      console.log(`✓ removida: ${target}`);
    }
    return;
  }

  if (installed === source) {
    console.log(`✓ já está atualizada: ${target}`);
    return;
  }
  if (installed !== undefined && !installed.includes(EXTENSION_MARKER)) {
    throw new Error(`já existe um arquivo sem identificação do AIOffice em ${target}; nada foi alterado`);
  }
  if (dryRun) {
    console.log(`(dry-run) instalaria a ponte em ${target}`);
    return;
  }

  const folder = dirname(target);
  mkdirSync(folder, { recursive: true });
  const temp = `${target}.tmp-${process.pid}`;
  writeFileSync(temp, source, { mode: 0o600 });
  let backup: string | undefined;
  try {
    if (installed !== undefined) {
      backup = backupPath(target);
      renameSync(target, backup);
    }
    renameSync(temp, target);
  } catch (error) {
    if (backup && !existsSync(target)) renameSync(backup, target);
    throw error;
  } finally {
    if (existsSync(temp)) rmSync(temp);
  }
  console.log(`✓ instalada: ${target}${backup ? ` · backup em ${backup}` : ''}`);
  console.log('Feche e abra a sessão OMP para carregar a extensão.');
}

const invokedScript = process.argv[1]?.replaceAll('\\', '/').split('/').at(-1);
if (invokedScript === 'omp-install.ts' && process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    console.error(`[omp] Erro: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
