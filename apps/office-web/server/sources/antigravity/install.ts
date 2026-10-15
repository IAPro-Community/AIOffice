// Instala somente a ponte AIOffice, sem depender do checkout ou alterar hooks de terceiros.
import { copyFileSync, existsSync, mkdirSync, readFileSync, realpathSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, sep, isAbsolute } from 'node:path';

const MARKER = 'AIOffice Antigravity hooks';
const EVENTS = ['SessionStart', 'PreInvocation', 'PreToolUse', 'PostToolUse', 'PostInvocation', 'Stop'];
type Rec = Record<string, unknown>;
export interface AntigravityInstallOptions {
  home: string;
  sourceHook: string;
  runtime: string;
  port: number;
  electron?: boolean;
  action?: 'install' | 'uninstall' | 'status';
  dryRun?: boolean;
}
export interface AntigravityInstallResult { installed: boolean; changed: boolean; configFile: string; hookFile: string }
function record(value: unknown): value is Rec { return !!value && typeof value === 'object' && !Array.isArray(value); }
function owns(value: unknown): boolean {
  if (!record(value) || value.description !== MARKER) return false;
  const commands = EVENTS.flatMap((event) => {
    const items = value[event];
    return Array.isArray(items) ? items.flatMap((item) => record(item) && Array.isArray(item.hooks) ? item.hooks : [item]) : [];
  });
  return commands.length === EVENTS.length && commands.every((item) => record(item) && typeof item.command === 'string' && /(?:antigravity[\\/]hook\.mjs|aioffice[\\/]antigravity[\\/]runner\.(?:cmd|sh))/i.test(item.command.replaceAll('\\\\', '\\')));
}
function quote(value: string): string {
  if (/[\r\n\0]/.test(value)) throw new Error('caminho de execução inválido');
  if (process.platform === 'win32') {
    if (/["%!]/.test(value)) throw new Error('caminho incompatível com o runner Windows');
    return `"${value}"`;
  }
  return `'${value.replaceAll("'", "'\\''")}'`;
}
function writeAtomic(file: string, value: string, mode = 0o600): void {
  const temp = `${file}.aioffice-${process.pid}.tmp`;
  writeFileSync(temp, value, { mode });
  renameSync(temp, file);
}
function within(root: string, target: string): boolean {
  const child = relative(realpathSync(root), realpathSync(target));
  return child === '' || (child !== '..' && !child.startsWith(`..${sep}`) && !isAbsolute(child));
}
/** Em Electron o runtime é o executável instalado; o runner ativa seu modo Node. */
export function installAntigravityHooks(opts: AntigravityInstallOptions): AntigravityInstallResult {
  if (!Number.isInteger(opts.port) || opts.port < 1 || opts.port > 65_535) throw new Error('porta Antigravity inválida');
  const configDir = join(opts.home, '.gemini', 'config');
  const configFile = join(configDir, 'hooks.json');
  const stableDir = join(configDir, 'aioffice', 'antigravity');
  const hookFile = join(stableDir, 'hook.mjs');
  const runnerFile = join(stableDir, process.platform === 'win32' ? 'runner.cmd' : 'runner.sh');
  const markerFile = join(stableDir, 'owner.txt');
  let config: Rec = {};
  if (existsSync(configFile)) {
    if (!within(opts.home, configFile)) throw new Error('hooks.json está fora do perfil canônico');
    const parsed: unknown = JSON.parse(readFileSync(configFile, 'utf8'));
    if (!record(parsed)) throw new Error('hooks.json precisa conter um objeto JSON');
    config = parsed;
  }
  const current = config.AIOffice;
  const installed = owns(current);
  const result = { installed, changed: false, configFile, hookFile };
  if (opts.action === 'status') return result;
  if (current !== undefined && !installed) throw new Error('entrada AIOffice desconhecida; nada foi alterado');
  if (opts.action === 'uninstall') {
    if (!installed) return result;
    if (!opts.dryRun) {
      const next = { ...config }; delete next.AIOffice;
      copyFileSync(configFile, `${configFile}.aioffice-backup-${Date.now()}`);
      writeAtomic(configFile, `${JSON.stringify(next, null, 2)}\n`);
    }
    return { ...result, installed: false, changed: true };
  }
  const source = readFileSync(opts.sourceHook, 'utf8');
  if (!source.includes('payloadOf') || !statSync(opts.runtime).isFile()) throw new Error('runtime ou hook Antigravity indisponível');
  const command = (event: string) => `${process.platform === 'win32' ? '' : '/bin/sh '}${quote(runnerFile)} --event ${quote(event)} --port ${opts.port}`;
  const definition: Rec = { description: MARKER };
  for (const event of EVENTS) {
    const handler = { type: 'command', command: command(event), timeout: 5 };
    definition[event] = /ToolUse$/.test(event) ? [{ matcher: '*', hooks: [handler] }] : [handler];
  }
  const runner = process.platform === 'win32'
    ? `@echo off\r\n${opts.electron ? 'set "ELECTRON_RUN_AS_NODE=1"\r\n' : ''}${quote(opts.runtime)} ${quote(hookFile)} %*\r\n`
    : `#!/bin/sh\n${opts.electron ? 'export ELECTRON_RUN_AS_NODE=1\n' : ''}exec ${quote(opts.runtime)} ${quote(hookFile)} "$@"\n`;
  for (const dir of [join(opts.home, '.gemini'), configDir, join(configDir, 'aioffice'), stableDir]) {
    if (existsSync(dir) && !within(opts.home, dir)) throw new Error('diretório Antigravity está fora do perfil canônico');
  }
  if (existsSync(stableDir)) {
    if (!existsSync(markerFile) || readFileSync(markerFile, 'utf8') !== `${MARKER}\n`) throw new Error('diretório de hooks AIOffice desconhecido');
    for (const file of [hookFile, runnerFile, markerFile]) if (existsSync(file) && !within(stableDir, file)) throw new Error('arquivo do hook fora do diretório canônico');
  }
  const same = JSON.stringify(current) === JSON.stringify(definition) && existsSync(hookFile) && readFileSync(hookFile, 'utf8') === source && existsSync(runnerFile) && readFileSync(runnerFile, 'utf8') === runner;
  if (same) return result;
  if (!opts.dryRun) {
    mkdirSync(stableDir, { recursive: true, mode: 0o700 });
    writeAtomic(hookFile, source);
    writeAtomic(runnerFile, runner, 0o700);
    writeAtomic(markerFile, `${MARKER}\n`);
    if (existsSync(configFile)) copyFileSync(configFile, `${configFile}.aioffice-backup-${Date.now()}`);
    writeAtomic(configFile, `${JSON.stringify({ ...config, AIOffice: definition }, null, 2)}\n`);
  }
  return { ...result, installed: true, changed: true };
}
