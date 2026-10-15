import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, symlinkSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AccountsService } from '../../accounts/service.js';
import { NameStore } from '../../model/names.js';
import { Office } from '../../model/office.js';
import { AntigravitySource } from './source.js';
import { canonicalTranscript, transcriptPath } from './paths.js';
import { createAntigravityTerminalParser } from './terminal.js';
import { installAntigravityHooks } from './install.js';
import { parseAntigravityHookEvent } from './http.js';

const SESSION = '12345678-1234-1234-1234-123456789abc';
const roots: string[] = [];
afterEach(() => { vi.restoreAllMocks(); for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
function setup() {
  const home = mkdtempSync(join(tmpdir(), 'aioffice-antigravity-')); roots.push(home);
  const brain = join(home, '.gemini', 'antigravity', 'brain');
  const path = transcriptPath(brain, SESSION); mkdirSync(dirname(path), { recursive: true });
  const accounts = new AccountsService({ dirs: [], home, env: {}, onChange() {} });
  const office = new Office({ names: new NameStore(null), version: 'test', startedAt: Date.now(), accounts: (s) => accounts.list(s), sources: () => [], accountName: () => 'Antigravity' });
  const source = new AntigravitySource({ home, office, accounts });
  const add = vi.spyOn(office, 'addActivity');
  const line = (content: string) => JSON.stringify({ type: 'USER_INPUT', step_index: content.length, created_at: Date.now(), content, status: 'DONE' }) + '\n';
  return { home, brain, path, office, source, add, line };
}
describe('Antigravity: canal oficial e leitura incremental', () => {
  it('não repete o histórico ao acrescentar linhas e aguarda JSONL parcial', () => {
    const t = setup(); writeFileSync(t.path, t.line('primeiro')); t.source.scan();
    const before = t.add.mock.calls.length;
    const next = t.line('segundo'); appendFileSync(t.path, next.slice(0, -2)); t.source.scan();
    expect(t.add).toHaveBeenCalledTimes(before);
    appendFileSync(t.path, next.slice(-2)); t.source.scan();
    expect(t.add).toHaveBeenCalledTimes(before + 1);
    t.source.scan(); expect(t.add).toHaveBeenCalledTimes(before + 1);
  });
  it('deduplica o prefixo após truncamento e rotação', () => {
    const t = setup(); const first = t.line('primeiro'); writeFileSync(t.path, first); t.source.scan();
    renameSync(t.path, `${t.path}.old`); writeFileSync(t.path, first + t.line('depois de rotacionar')); t.source.scan();
    expect(t.add.mock.calls.filter(([, activity]) => activity.id.startsWith('ag-'))).toHaveLength(2);
    writeFileSync(t.path, t.line('curto')); t.source.scan();
    expect(t.add.mock.calls.filter(([, activity]) => activity.id.startsWith('ag-'))).toHaveLength(3);
  });
  it('detecta crescimento com mtime fixo e nunca anuncia hook pelo transcript', () => {
    const t = setup(); writeFileSync(t.path, t.line('prompt')); t.source.scan();
    expect(t.source.canMessage(SESSION)).toBe(false);
    const at = new Date(); utimesSync(t.path, at, at); t.source.scan(); const before = t.add.mock.calls.length;
    appendFileSync(t.path, t.line('outro prompt')); utimesSync(t.path, at, at); t.source.scan();
    expect(t.add.mock.calls.length).toBe(before + 1);
    expect(t.source.applyHookEvent({ name: 'PreInvocation', payload: { conversationId: SESSION, transcriptPath: t.path } })).toBe(true);
    expect(t.source.canMessage(SESSION)).toBe(true);
    expect(t.source.canMessage(SESSION, Date.now() + 6 * 60_000)).toBe(false);
  });
  it('recusa symlink/junction que escapa da raiz, inclusive registro e terminal', () => {
    const t = setup(); const outside = join(t.home, 'outside'); mkdirSync(join(outside, 'logs'), { recursive: true });
    writeFileSync(join(outside, 'logs', 'transcript.jsonl'), t.line('privado'));
    rmSync(join(t.brain, SESSION, '.system_generated'), { recursive: true });
    symlinkSync(outside, join(t.brain, SESSION, '.system_generated'), 'junction');
    expect(canonicalTranscript(t.brain, SESSION)).toBeUndefined();
    t.source.scan(); expect(t.office.list()).toHaveLength(0);
    expect(t.source.applyHookEvent({ name: 'SessionStart', payload: { conversationId: SESSION, transcriptPath: t.path } })).toBe(false);
    expect(t.source.transcriptPathOf(`antigravity:${SESSION}`)).toBeUndefined();
  });
  it('omite thinking e campos privados de argumentos do parser e HTTP', () => {
    const parser = createAntigravityTerminalParser();
    expect(parser.push(JSON.stringify({ type: 'THINKING', content: 'PRIVATE_REASONING' }))).toEqual([]);
    const entries = parser.push(JSON.stringify({ type: 'PLANNER_RESPONSE', tool_calls: [{ name: 'run_command', args: { command: 'pwd', thinking: 'PRIVATE_REASONING', secretData: 'PRIVATE_DATA' } }] }));
    expect(JSON.stringify(entries)).not.toMatch(/PRIVATE_REASONING|PRIVATE_DATA/);
    const event = parseAntigravityHookEvent({ name: 'PreToolUse', payload: { conversationId: SESSION, toolCall: { name: 'run_command', args: { command: 'pwd', thinking: 'PRIVATE_REASONING' } }, thinking: 'PRIVATE_REASONING' } });
    expect(JSON.stringify(event)).not.toContain('PRIVATE_REASONING');
  });
});

describe('instalação estável dos hooks Antigravity', () => {
  function options(home: string) { return { home, sourceHook: resolve('mod/antigravity/hook.mjs'), runtime: process.execPath, electron: true, port: 4747 }; }
  it('preserva outras entradas, instala fora do checkout e atualiza hook próprio', () => {
    const t = setup(); const file = join(t.home, '.gemini', 'config', 'hooks.json'); mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, JSON.stringify({ other: { custom: true } }));
    const opts = options(t.home); const result = installAntigravityHooks(opts);
    const config = JSON.parse(readFileSync(file, 'utf8'));
    expect(config.other).toEqual({ custom: true });
    expect(result.hookFile).toContain(join('.gemini', 'config', 'aioffice', 'antigravity'));
    expect(JSON.stringify(config.AIOffice)).not.toContain(opts.sourceHook.replaceAll('\\', '\\\\'));
    expect(readFileSync(join(dirname(result.hookFile), process.platform === 'win32' ? 'runner.cmd' : 'runner.sh'), 'utf8')).toContain('ELECTRON_RUN_AS_NODE=1');
    expect(installAntigravityHooks(opts).changed).toBe(false);
    writeFileSync(result.hookFile, '// antigo'); expect(installAntigravityHooks(opts).changed).toBe(true);
    installAntigravityHooks({ ...opts, action: 'uninstall' }); expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual({ other: { custom: true } });
  });
  it('migra configuração identificada do checkout antigo e preserva entrada desconhecida', () => {
    const t = setup(); const file = join(t.home, '.gemini', 'config', 'hooks.json'); mkdirSync(dirname(file), { recursive: true });
    const definition: Record<string, unknown> = { description: 'AIOffice Antigravity hooks' };
    for (const name of ['SessionStart', 'PreInvocation', 'PreToolUse', 'PostToolUse', 'PostInvocation', 'Stop']) {
      const handler = { type: 'command', command: 'node "/old-checkout/mod/antigravity/hook.mjs"' };
      definition[name] = name.endsWith('ToolUse') ? [{ matcher: '*', hooks: [handler] }] : [handler];
    }
    writeFileSync(file, JSON.stringify({ AIOffice: definition }));
    expect(installAntigravityHooks(options(t.home)).changed).toBe(true);
    writeFileSync(file, JSON.stringify({ AIOffice: { custom: true } }));
    expect(() => installAntigravityHooks(options(t.home))).toThrow('desconhecida');
    expect(JSON.parse(readFileSync(file, 'utf8')).AIOffice).toEqual({ custom: true });
  });
  it('dry run não cria configuração nem hooks', () => {
    const t = setup(); const result = installAntigravityHooks({ ...options(t.home), dryRun: true });
    expect(result.changed).toBe(true); expect(existsSync(result.configFile)).toBe(false); expect(existsSync(result.hookFile)).toBe(false);
  });
  it('executa o runner estável sem checkout; só retira mensagens após registro aceito', async () => {
    const t = setup(); let accepted = false; const seen: Array<{ url?: string; body: unknown }> = [];
    const server = createServer(async (req, res) => {
      let raw = ''; for await (const chunk of req) raw += chunk;
      seen.push({ url: req.url, body: JSON.parse(raw) });
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify(req.url === '/api/antigravity/events' ? { ok: accepted } : req.url === '/api/mod/inbox' ? { messages: [{ id: 'msg-1', text: 'Mensagem visível' }] } : { ok: true }));
    });
    await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
    const address = server.address(); if (!address || typeof address === 'string') throw new Error('porta ausente');
    const opts = { ...options(t.home), port: address.port };
    const result = installAntigravityHooks(opts);
    const run = (event: string) => new Promise<string>((done, fail) => {
      const runner = join(dirname(result.hookFile), process.platform === 'win32' ? 'runner.cmd' : 'runner.sh');
      const args = ['--event', event, '--port', String(address.port)];
      const child = process.platform === 'win32'
        ? spawn(process.env.ComSpec ?? 'cmd.exe', ['/d', '/s', '/c', `""${runner}" ${args.join(' ')}"`], { windowsHide: true, windowsVerbatimArguments: true })
        : spawn('/bin/sh', [runner, ...args]);
      let out = ''; let err = ''; child.stdout.on('data', (data) => { out += data; }); child.stderr.on('data', (data) => { err += data; });
      child.once('error', fail); child.once('close', (code) => code === 0 ? done(out) : fail(new Error(err || `hook exit ${code}`)));
      child.stdin.end(JSON.stringify({ conversationId: SESSION, transcriptPath: t.path, thinking: 'PRIVATE_REASONING', toolCall: { name: 'run_command', args: { command: 'pwd', thinking: 'PRIVATE_REASONING' } } }));
    });
    try {
      expect(JSON.parse(await run('PreInvocation'))).toEqual({});
      expect(seen.map((entry) => entry.url)).toEqual(['/api/antigravity/events']);
      accepted = true; seen.length = 0;
      expect(JSON.parse(await run('PreInvocation'))).toEqual({ injectSteps: [{ userMessage: 'Mensagem visível' }] });
      expect(seen.map((entry) => entry.url)).toEqual(['/api/antigravity/events', '/api/mod/inbox', '/api/mod/inbox/ack']);
      expect(JSON.stringify(seen)).not.toContain('PRIVATE_REASONING');
      expect(JSON.parse(await run('PreToolUse'))).toEqual({});
      expect(JSON.parse(await run('Stop'))).toEqual({});
    } finally { await new Promise<void>((done) => server.close(() => done())); }
  });
});
