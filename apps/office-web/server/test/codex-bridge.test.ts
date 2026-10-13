// Auxiliar das mensagens ao Codex no Docker (scripts/codex-bridge.ts) contra as rotas de verdade (guard, app e
// /api/codex/bridge/*): a trava das mensagens (recurso ligado + Host local), a rodada completa página → auxiliar →
// codex queue (binário falso) → confirmação, e a conferência de cada mensagem antes de rodar o comando.
import http from 'node:http';
import { mkdirSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { checkMessage, httpPost, parseArgs, round } from '../../scripts/codex-bridge';
import { AccountsService } from '../accounts/service';
import { createApiHandler } from '../http/app';
import { createRequestGuard } from '../http/guard';
import { Hub } from '../http/sse';
import { setQuiet } from '../log';
import { createCodexQueueRunner } from '../messages/codex';
import { createMessageRoutes } from '../messages/http';
import { MessageRegistry } from '../messages/registry';
import { NameStore } from '../model/names';
import { Office } from '../model/office';
import { FAKE_CODEX_RUNS, fakeCodexCalls, writeFakeCodex } from './fake-codex';
import { tempDir } from './fixtures';
import { request } from './permission-server';

setQuiet(true);

const THREAD = '0199b0c0-1234-7abc-8def-0123456789ab';
const MAIN = `.codex:${THREAD}`;

let tmp: ReturnType<typeof tempDir>;
let codexHome: string;
let close: (() => Promise<void>) | undefined;
beforeEach(() => {
  tmp = tempDir();
  codexHome = join(tmp.dir, '.codex');
  mkdirSync(join(codexHome, 'sessions', '2026'), { recursive: true });
});
afterEach(async () => {
  await close?.();
  close = undefined;
  tmp.cleanup();
});

/** Office + Hub + rotas de verdade, com um agente do Codex e o registro das mensagens SEM o modo Node (como no Docker). */
async function serve(enabled = true): Promise<{ base: string; port: number; office: Office; registry?: MessageRegistry }> {
  const late: { registry?: MessageRegistry } = {};
  const office = new Office({
    names: new NameStore(null),
    version: 't',
    startedAt: Date.now(),
    accounts: () => [],
    sources: () => [],
    accountName: () => undefined,
    terminal: true,
    messages: enabled ? () => late.registry?.reachable() ?? new Set() : undefined,
  });
  const hub = new Hub(office, { throttleMs: 10 });
  const registry = enabled ? new MessageRegistry({ office, codex: { homeOf: () => codexHome }, tickMs: 20 }) : undefined;
  late.registry = registry;
  registry?.start();
  const accounts = new AccountsService({ dirs: [], home: tmp.dir, env: {}, onChange: () => {} });
  const api = createApiHandler({ office, hub, accounts, sources: () => [], version: 't', inDocker: true, terminal: true, messages: registry ? createMessageRoutes(registry) : undefined });
  const guard = createRequestGuard({ allowedHosts: new Set(['habblaud.lan']) });
  const server = http.createServer((req, res) => {
    if (guard(req, res)) return;
    if (!api(req, res, new URL(req.url ?? '/', 'http://x'))) res.writeHead(404).end();
  });
  await new Promise<void>((ok) => server.listen(0, '127.0.0.1', ok));
  const port = (server.address() as AddressInfo).port;
  office.addMain({ id: MAIN, provider: 'codex', account: '.codex', sessionId: THREAD, cwd: '/p/loja', role: 'Agente principal', startedAt: Date.now(), status: 'idle' });
  close = () =>
    new Promise((ok) => {
      registry?.stop();
      hub.stop();
      server.closeAllConnections();
      server.close(() => ok());
    });
  return { base: `http://127.0.0.1:${port}`, port, office, registry };
}

describe('rotas do auxiliar do Codex', () => {
  it('seguem a trava das mensagens: desligadas = 403; Host que não é local = 403; GET = 405; sem JSON = 415', async () => {
    let s = await serve(false);
    expect((await request(s.base, '/api/codex/bridge/poll', { method: 'POST', body: {} })).status).toBe(403);
    await close!();
    s = await serve();
    expect((await request(s.base, '/api/codex/bridge/poll', { method: 'POST', headers: { Host: 'habblaud.lan' }, body: {} })).status).toBe(403);
    expect((await request(s.base, '/api/codex/bridge/ack')).status).toBe(405);
    expect((await request(s.base, '/api/codex/bridge/poll', { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: '{}' })).status).toBe(415);
    expect((await request(s.base, '/api/codex/bridge/ack', { method: 'POST', body: { results: 'x' } })).status).toBe(400);
    expect(await request(s.base, '/api/codex/bridge/poll', { method: 'POST', body: {} })).toMatchObject({ status: 200, json: { messages: [] } });
  });

  it.runIf(FAKE_CODEX_RUNS)('fluxo: o auxiliar conecta (canMessage) → página manda → rodada roda o codex queue → confirma → delivered', async () => {
    const s = await serve();
    const bin = writeFakeCodex(tmp.dir);
    const log = join(tmp.dir, 'chamadas.log');
    const run = createCodexQueueRunner(bin, { env: { PATH: process.env.PATH, FAKE_CODEX_LOG: log } });
    const post = httpPost(s.port);
    // Antes do auxiliar: o Codex não recebe.
    expect((await request(s.base, '/api/messages', { method: 'POST', body: { agentId: MAIN, text: 'oi' } })).status).toBe(409);
    expect(await round(post, run)).toEqual({ state: 'ok', results: [] });
    expect(s.office.commit().snapshot.agents.find((a) => a.id === MAIN)!.canMessage).toBe(true);
    const r = await request(s.base, '/api/messages', { method: 'POST', body: { agentId: MAIN, text: '--message=x e o resto' } });
    expect(r.status).toBe(201);
    const id = (r.json as { id: string }).id;
    const lines: string[] = [];
    expect(await round(post, run, (l) => lines.push(l))).toEqual({ state: 'ok', results: [{ id, ok: true }] });
    expect(fakeCodexCalls(log)).toEqual([{ args: ['queue', `--thread=${THREAD}`, '--message=--message=x e o resto'], codexHome }]);
    expect((await request(s.base, `/api/messages/${id}`)).json).toMatchObject({ status: 'delivered' });
    // O texto nunca vai para a tela do auxiliar.
    expect(lines.join('\n')).not.toContain('o resto');
  });

  it('Habblaud fora do ar ou recusando: a rodada só informa (nada roda)', async () => {
    const run = async () => ({ ok: true as const });
    expect(await round(httpPost(1), run)).toEqual({ state: 'down' });
    const s = await serve(false);
    expect(await round(httpPost(s.port), run)).toMatchObject({ state: 'refused', status: 403 });
  });

  it('confirma cada resultado antes de rodar a próxima mensagem do lote', async () => {
    const s = await serve();
    const thread = '0199b0c0-0000-7abc-8def-0123456789ab';
    const other = `.codex:${thread}`;
    s.office.addMain({ id: other, provider: 'codex', account: '.codex', sessionId: thread, cwd: '/p/api', role: 'Agente principal', startedAt: Date.now(), status: 'idle' });
    const post = httpPost(s.port);
    await round(post, async () => ({ ok: true }));
    const a = await request(s.base, '/api/messages', { method: 'POST', body: { agentId: MAIN, text: 'um' } });
    const b = await request(s.base, '/api/messages', { method: 'POST', body: { agentId: other, text: 'dois' } });
    const idA = (a.json as { id: string }).id;
    const idB = (b.json as { id: string }).id;
    const before: string[] = [];
    const result = await round(post, async (job) => {
      if (job.thread === thread) {
        const message = await request(s.base, `/api/messages/${idA}`);
        before.push((message.json as { status: string }).status);
        return { ok: false, error: 'Error: recusado' };
      }
      return { ok: true };
    });
    expect(before).toEqual(['delivered']);
    expect(result).toEqual({ state: 'ok', results: [{ id: idA, ok: true }, { id: idB, ok: false, error: 'Error: recusado' }] });
    expect((await request(s.base, `/api/messages/${idB}`)).json).toMatchObject({ status: 'failed', error: 'Error: recusado' });
  });

  it('checkMessage: thread, texto e uma pasta do Codex que existe (nunca uma do Claude Code)', () => {
    const ok = { id: 'm1', account: '.codex', codexHome, thread: THREAD, text: 'oi' };
    expect(checkMessage(ok)).toEqual(ok);
    expect(checkMessage({ ...ok, thread: 'nome' })).toEqual({ id: 'm1', error: 'id de thread do Codex inválido' });
    expect(checkMessage({ ...ok, text: ' ' })).toEqual({ id: 'm1', error: 'mensagem vazia' });
    expect(checkMessage({ ...ok, codexHome: join(tmp.dir, 'nao-existe') })).toMatchObject({ id: 'm1', error: expect.stringMatching(/não existe/) });
    expect(checkMessage({ ...ok, codexHome: 'relativo' })).toMatchObject({ error: expect.stringMatching(/não existe/) });
    const claude = join(tmp.dir, '.claude');
    mkdirSync(join(claude, 'projects'), { recursive: true });
    expect(checkMessage({ ...ok, codexHome: claude })).toMatchObject({ error: expect.stringMatching(/não existe/) });
    expect(checkMessage({ text: 'x' })).toEqual({ error: 'mensagem sem id' });
  });

  it('parseArgs', () => {
    expect(parseArgs([], {})).toEqual({ port: 4747, once: false });
    expect(parseArgs(['--port', '4851', '--once'], {})).toEqual({ port: 4851, once: true });
    expect(parseArgs([], { HABBLAUD_PORT: '4848' })).toEqual({ port: 4848, once: false });
    expect(parseArgs(['-h'], {})).toBe('help');
    expect(() => parseArgs(['--port', 'x'], {})).toThrow(/--port/);
    expect(() => parseArgs(['--xyz'], {})).toThrow(/desconhecida/);
  });
});
