// Auxiliar do Habblaud para as mensagens ao Codex quando o Habblaud roda no Docker. Roda no HOST (Mac), com tsx:
//
//   npm run codex:bridge     (opções: --port <n>, --once)
//
// As mensagens ao Codex entram na sessão por `codex queue --thread <threadId> --message <texto>`, que precisa rodar no
// Mac (é aqui que estão o Codex e as pastas das contas); no Docker o servidor não alcança o binário. Este processo, a
// cada 2 s, pergunta ao Habblaud se há mensagens para as sessões do Codex (POST /api/codex/bridge/poll), roda o
// comando para cada uma, na ordem, com o CODEX_HOME da conta, e confirma o resultado (POST /api/codex/bridge/ack).
// Enquanto ele roda, o escritório deixa mandar mensagens aos agentes do Codex (o Habblaud o considera presente por até
// 10 s depois da última rodada). Fora do Docker não precisa dele: o próprio servidor roda o comando.
//
// Binário: HABBLAUD_CODEX_BIN ou `codex` do PATH. Nunca roda o Codex com -c, --enable, --disable nem --no-daemon, e
// confere cada mensagem antes (id de thread, pasta do Codex que existe). O texto das mensagens nunca vai para a tela.
// Ctrl+C para parar.
import { statSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { isClaudeDir } from '../server/accounts/detect';
import { createCodexQueueRunner, findCodexBin, THREAD_ID, type CodexQueueResult, type CodexQueueRunner } from '../server/messages/codex';
import { tr } from '../shared/i18n';

export const DEFAULT_PORT = 4747;
/** Intervalo entre as rodadas. */
export const POLL_MS = 2_000;
const REQUEST_TIMEOUT_MS = 5_000;

const USAGE = tr('Uso: npm run codex:bridge [-- opções]\n\nEntrega as mensagens do escritório às sessões do Codex quando o Habblaud roda no Docker (deixe rodando no Mac).\n\nOpções:\n  --port <n>   porta do Habblaud (padrão: HABBLAUD_PORT ou {0})\n  --once       faz uma rodada só e sai\n  -h, --help   mostra esta ajuda\n\nBinário do Codex: HABBLAUD_CODEX_BIN ou `codex` do PATH.', [DEFAULT_PORT]);

export interface BridgeMessage {
  id: string;
  account: string;
  codexHome: string;
  thread: string;
  text: string;
}

export interface BridgeResult {
  id: string;
  ok: boolean;
  error?: string;
}

type Rec = Record<string, unknown>;

function rec(v: unknown): Rec | undefined {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Rec) : undefined;
}

class FatalError extends Error {}

export function parseArgs(argv: string[], env: NodeJS.ProcessEnv = process.env): { port: number; once: boolean } | 'help' {
  const envPort = Number.parseInt(env.HABBLAUD_PORT ?? '', 10);
  let port = Number.isInteger(envPort) && envPort > 0 && envPort < 65_536 ? envPort : DEFAULT_PORT;
  let once = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '-h' || a === '--help') return 'help';
    if (a === '--once') once = true;
    else if (a === '--port') {
      port = Number(argv[++i]);
      if (!Number.isInteger(port) || port <= 0 || port >= 65_536) throw new FatalError(tr('--port precisa de um número entre 1 e 65535.'));
    } else throw new FatalError(tr('opção desconhecida: {0}\n\n{1}', [a, USAGE]));
  }
  return { port, once };
}

function isDir(p: string): boolean {
  try {
    return statSync(p).isDirectory();
  } catch {
    return false;
  }
}

/**
 * Confere uma mensagem vinda do Habblaud antes de rodar o comando: id, texto, id de thread (UUID) e uma pasta do
 * Codex que existe neste computador (nunca uma do Claude Code). Devolve a mensagem ou o motivo da recusa.
 */
export function checkMessage(raw: unknown): BridgeMessage | { id?: string; error: string } {
  const r = rec(raw);
  const id = typeof r?.id === 'string' && r.id.trim() ? r.id : undefined;
  if (!r || !id) return { error: tr('mensagem sem id') };
  if (typeof r.text !== 'string' || !r.text.trim()) return { id, error: tr('mensagem vazia') };
  if (typeof r.thread !== 'string' || !THREAD_ID.test(r.thread)) return { id, error: tr('id de thread do Codex inválido') };
  const home = typeof r.codexHome === 'string' ? r.codexHome : '';
  if (!home || !isAbsolute(home) || !isDir(home) || isClaudeDir(home)) return { id, error: tr('a pasta do Codex {0} não existe neste computador', [home || tr('(vazia)')]) };
  return { id, account: typeof r.account === 'string' ? r.account : '', codexHome: resolve(home), thread: r.thread, text: r.text };
}

/** POST JSON ao Habblaud local; null = fora do ar, tempo esgotado ou resposta ilegível. */
export type Post = (path: string, body: unknown) => Promise<{ status: number; json: unknown } | null>;

export function httpPost(port: number): Post {
  return async (path, body) => {
    try {
      const res = await fetch(`http://127.0.0.1:${port}${path}`, {
        method: 'POST',
        // O guard do Habblaud exige JSON em todo POST da API (mesmo o corpo vazio da rodada).
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      const text = await res.text();
      let json: unknown;
      try {
        json = text ? JSON.parse(text) : undefined;
      } catch {
        json = undefined;
      }
      return { status: res.status, json };
    } catch {
      return null;
    }
  };
}

export type RoundResult =
  | { state: 'down' }
  | { state: 'refused'; status: number; error?: string }
  | { state: 'ok'; results: BridgeResult[] };

/** Uma rodada: busca as mensagens, roda `codex queue` para cada uma (na ordem) e confirma cada resultado. Nunca lança. */
export async function round(post: Post, run: CodexQueueRunner, log: (line: string) => void = () => {}): Promise<RoundResult> {
  const polled = await post('/api/codex/bridge/poll', {});
  if (!polled) return { state: 'down' };
  const list = rec(polled.json)?.messages;
  if (polled.status !== 200 || !Array.isArray(list)) {
    const error = rec(polled.json)?.error;
    return { state: 'refused', status: polled.status, ...(typeof error === 'string' ? { error } : {}) };
  }
  const results: BridgeResult[] = [];
  for (const raw of list) {
    const m = checkMessage(raw);
    if ('error' in m) {
      if (m.id) {
        const result = { id: m.id, ok: false, error: m.error };
        results.push(result);
        await post('/api/codex/bridge/ack', { results: [result] });
      }
      log(tr('✗ mensagem recusada: {0}', [m.error]));
      continue;
    }
    let r: CodexQueueResult;
    try {
      r = await run({ codexHome: m.codexHome, thread: m.thread, text: m.text });
    } catch (err) {
      r = { ok: false, error: String(err) };
    }
    const result = r.ok ? { id: m.id, ok: true } : { id: m.id, ok: false, error: r.error };
    results.push(result);
    await post('/api/codex/bridge/ack', { results: [result] });
    log(r.ok ? tr('✓ mensagem na fila do thread {0}… ({1})', [m.thread.slice(0, 8), m.account || 'Codex']) : `✗ thread ${m.thread.slice(0, 8)}…: ${r.error}`);
  }
  return { state: 'ok', results };
}

async function main(): Promise<void> {
  const parsed = parseArgs(process.argv.slice(2));
  if (parsed === 'help') {
    console.log(USAGE);
    return;
  }
  const bin = findCodexBin(process.env);
  if (!bin) throw new FatalError(tr('não achei o Codex: deixe o `codex` no PATH ou defina HABBLAUD_CODEX_BIN com o caminho do binário.'));
  const run = createCodexQueueRunner(bin);
  const post = httpPost(parsed.port);
  const log = (line: string) => console.log(`[codex-bridge] ${line}`);
  log(tr('Entregando as mensagens do Habblaud (http://127.0.0.1:{0}) às sessões do Codex com {1}. Ctrl+C para parar.', [parsed.port, bin]));
  let last = '';
  for (;;) {
    const r = await round(post, run, log);
    const state =
      r.state === 'down'
        ? tr('Habblaud fora do ar em http://127.0.0.1:{0}; tentando de novo a cada {1} s.', [parsed.port, POLL_MS / 1_000])
        : r.state === 'refused'
          ? tr('o Habblaud recusou ({0}{1}).', [r.status, r.error ? `: ${r.error}` : ''])
          : tr('conectado: os agentes do Codex já recebem mensagens pelo escritório.');
    if (state !== last) log(state);
    last = state;
    if (parsed.once) {
      process.exitCode = r.state === 'ok' && r.results.every((x) => x.ok) ? 0 : 1;
      return;
    }
    await new Promise((ok) => setTimeout(ok, POLL_MS));
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((err: unknown) => {
    console.error(err instanceof FatalError ? tr('[codex-bridge] Erro: {0}', [err.message]) : tr('[codex-bridge] Erro inesperado: {0}', [String(err)]));
    process.exitCode = 1;
  });
}
