// Rotas da API (/api/*). Respostas JSON; rotas desconhecidas -> 404 JSON.
import type { IncomingMessage, ServerResponse } from 'node:http';
import { NAME_MAX, parseAppearanceParts, parseCharacterName, parseSeed } from '../../shared/appearance';
import type { AgentInfo, AgentStatus, ModSummary, OfficeSnapshot, SourceInfo, UpdateStatus } from '../../shared/types';
import type { AccountsService } from '../accounts/service';
import { handleCodexEvent } from '../codex/http';
import type { DayStatsService } from '../history/daystats';
import type { Office } from '../model/office';
import type { CodexLive } from '../sources/codex/live';
import type { SessionLookup } from '../sources/source';
import { isJsonContentType, isLoopbackHost } from './guard';
import { handleSessionsRoute } from './sessions';
import type { Hub } from './sse';
import { handleStatsRoute } from './stats';
import type { TerminalStreams } from './terminal';
import { tr } from '../../shared/i18n';

export interface ApiDeps {
  office: Office;
  hub: Hub;
  accounts: AccountsService;
  sources: () => SourceInfo[];
  version: string;
  inDocker: boolean;
  /** Terminal ligado (ServerConfig.terminal: só com bind local). */
  terminal?: boolean;
  /** Streams do terminal; sem eles o recurso fica desligado mesmo com `terminal`. */
  terminals?: TerminalStreams;
  /**
   * Histórico de sessões do terminal (GET /api/sessions/*, http/sessions.ts): o HistorySet de todas as ferramentas
   * (ou um provedor sozinho); mesma trava do terminal.
   */
  sessions?: SessionLookup;
  /** Rotas do timelapse (/api/timeline/*, ver http/timeline.ts); devolve false para o resto. */
  timeline?: (req: IncomingMessage, res: ServerResponse, url: URL) => boolean;
  /**
   * Rotas de /api/permissions (responder pelo escritório, server/permissions/http.ts). Só existem com bind
   * local (ServerConfig.terminal); a trava do Host local é conferida aqui antes de chamá-las.
   */
  permissions?: (req: IncomingMessage, res: ServerResponse, path: string) => void;
  /**
   * Rotas das mensagens pelo escritório (/api/messages, a caixa de entrada do plugin em /api/mod/inbox e a do auxiliar
   * do Codex em /api/codex/bridge/*, server/messages/http.ts). Só existem com ServerConfig.messages (a trava do
   * terminal e HABBLAUD_MENSAGENS); a trava do Host local é conferida aqui antes de chamá-las.
   */
  messages?: (req: IncomingMessage, res: ServerResponse, path: string) => void;
  /**
   * Terminal interativo e ações nos agentes (/api/pty/*, POST /api/agents/:id/stop|takeover; http/pty.ts).
   * Ausente = desligado (sem HABBLAUD_PTY=1, Docker, sem node-pty ou sem bind local).
   */
  pty?: (req: IncomingMessage, res: ServerResponse, path: string) => void;
  /**
   * Fonte do Codex ao vivo: recebe os eventos dos hooks do Codex (POST /api/codex/events, server/codex/http.ts). Sem
   * ela a rota responde {ok: false}. Só com Host local e, fora do Docker, conexão pelo loopback (os eventos só observam:
   * não dependem da trava do terminal).
   */
  codexLive?: CodexLive;
  /** Renomeia a sala (POST /api/rooms/rename {id, name}; vazio volta ao padrão). Devolve o nome em uso, ou undefined se a sala não existe. */
  renameRoom?: (id: string, name: string) => string | undefined;
  /** Estatísticas do "Meu dia" (GET /api/stats, http/stats.ts). */
  stats?: DayStatsService;
  /** Verificação de versão nova no GitHub (GET /api/updates, POST /api/updates/check; updates/checker.ts). */
  updates?: {
    status(): UpdateStatus;
    check(opts: { manual?: boolean }): Promise<UpdateStatus>;
  };
}

/** GET /api/agents/:id/terminal (ids nunca contêm '/'). */
const TERMINAL_ROUTE = /^\/api\/agents\/([^/]+)\/terminal$/;
/** POST /api/agents/:id/stop|takeover (terminal interativo). */
const AGENT_ACTION_ROUTE = /^\/api\/agents\/[^/]+\/(stop|takeover)$/;

/** PUT|DELETE /api/agents/:id/character: personagem do projeto (ver Office.setCharacter). */
const CHARACTER_ROUTE = /^\/api\/agents\/([^/]+)\/character$/;
const NOT_EDITABLE = tr('agente não encontrado: só o agente principal de uma sessão aberta tem personagem editável');

/** Conexão vinda do próprio computador (127.x, ::1 ou ::ffff:127.x). */
function isLoopbackAddress(addr: string | undefined): boolean {
  if (!addr) return false;
  const a = addr.replace(/^::ffff:/i, '');
  return a === '::1' || /^127\./.test(a);
}

/** Rotas das mensagens pelo escritório (server/messages/http.ts); /api/mod/summary fica de fora (sem trava). */
function isMessagesPath(path: string): boolean {
  return (
    path === '/api/messages' ||
    path.startsWith('/api/messages/') ||
    path === '/api/mod/inbox' ||
    path === '/api/mod/inbox/ack' ||
    path === '/api/codex/bridge/poll' ||
    path === '/api/codex/bridge/ack'
  );
}

const MAX_BODY = 256 * 1024;

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const data = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(data),
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    // A API só é lida pela própria página: nada de leitura "no-cors" por outras origens.
    'Cross-Origin-Resource-Policy': 'same-origin',
  });
  res.end(data);
}

/** Lê o corpo JSON. Exige `Content-Type: application/json` (barreira contra CSRF; ver http/guard.ts). */
export function readJson(req: IncomingMessage): Promise<unknown> {
  if (!isJsonContentType(req.headers['content-type'])) {
    req.resume();
    return Promise.reject(new HttpError(415, tr('envie o corpo como JSON (Content-Type: application/json)')));
  }
  return new Promise((ok, fail) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (c: Buffer) => {
      size += c.length;
      // Grande demais: continua drenando (sem guardar) para conseguir responder 413.
      if (size > MAX_BODY) return void fail(new HttpError(413, tr('corpo grande demais')));
      chunks.push(c);
    });
    req.on('end', () => {
      if (size > MAX_BODY) return;
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw.trim()) return ok({});
      try {
        ok(JSON.parse(raw));
      } catch {
        fail(new HttpError(400, tr('JSON inválido')));
      }
    });
    req.on('error', fail);
  });
}

/** Resumo da verificação de versão nova para o /api/health. */
function updatesSummary(s: UpdateStatus | undefined): { state: UpdateStatus['state']; latest?: string; available: boolean } {
  return s ? { state: s.state, latest: s.latest, available: s.available } : { state: 'off', available: false };
}

/** Subagentes aninhados mais fundo que isto não existem na prática; o limite só evita laço num parentId torto. */
const MAX_PARENT_HOPS = 16;

/**
 * Resumo para o mod do Claude Code (GET /api/mod/summary, ver ModSummary). `isReal` diz quem é agente de
 * verdade: os do demo vivem só no snapshot (não no Office), então `office.has(id)` os separa sem depender
 * do prefixo "demo:". A própria sessão sai quando vem `session` (e, se vier, `account` também precisa
 * bater): o principal tem o sessionId atual da sessão (troca no /clear) e os subagentes guardam o da
 * sessão que os disparou; por garantia, um subagente também sai quando algum ancestral (parentId) é dela.
 */
export function modSummary(
  snap: OfficeSnapshot,
  isReal: (id: string) => boolean,
  version: string,
  own: { account?: string; session?: string } = {},
): ModSummary {
  const byId = new Map(snap.agents.map((a) => [a.id, a]));
  const rooms = new Map(snap.rooms.map((r) => [r.id, r.name]));
  const isOwn = (a: AgentInfo): boolean => {
    if (!own.session || (own.account && a.account !== own.account)) return false;
    let cur: AgentInfo | undefined = a;
    for (let hops = 0; cur && hops <= MAX_PARENT_HOPS; hops++) {
      if (cur.sessionId === own.session) return true;
      cur = cur.parentId ? byId.get(cur.parentId) : undefined;
    }
    return false;
  };
  const present = snap.agents.filter((a) => isReal(a.id) && a.status !== 'offline' && a.status !== 'done' && !isOwn(a));
  const waiting = present
    .filter((a) => a.status === 'waiting')
    .sort((a, b) => a.statusSince - b.statusSince || a.id.localeCompare(b.id))
    .map((a) => ({
      id: a.id,
      name: a.name,
      room: rooms.get(a.roomId) ?? a.roomId,
      account: a.account,
      waitingFor: a.waitingFor ?? tr('responder no terminal'),
      since: a.statusSince,
      answerable: !!a.permission,
    }));
  return { version, agents: present.length, working: present.filter((a) => a.status === 'working').length, waiting };
}

/** Devolve um handler que trata /api/* e responde false para o resto. */
export function createApiHandler(deps: ApiDeps): (req: IncomingMessage, res: ServerResponse, url: URL) => boolean {
  const { office, hub, accounts } = deps;
  const terminals = deps.terminal ? deps.terminals : undefined;

  const methodNotAllowed = (res: ServerResponse, allow: string) => {
    res.setHeader('Allow', allow);
    sendJson(res, 405, { error: tr('método não permitido') });
  };

  const handleDemo = async (req: IncomingMessage, res: ServerResponse) => {
    const body = (await readJson(req)) as { enabled?: unknown };
    if (typeof body?.enabled !== 'boolean') throw new HttpError(400, 'esperado {enabled: boolean}');
    office.setDemo(body.enabled);
    sendJson(res, 200, { ok: true, demo: office.isDemo() });
  };

  const handleCharacter = async (req: IncomingMessage, res: ServerResponse, id: string, method: string) => {
    if (method === 'DELETE') {
      req.resume();
      if (office.resetCharacter(id) === 'not-found') return sendJson(res, 404, { error: NOT_EDITABLE });
      return sendJson(res, 200, { ok: true });
    }
    const body = (await readJson(req)) as { name?: unknown; seed?: unknown; parts?: unknown } | null;
    const name = parseCharacterName(body?.name);
    const seed = parseSeed(body?.seed);
    const parts = parseAppearanceParts(body?.parts);
    if (!name || seed === null || !parts) {
      throw new HttpError(400, tr('esperado {name: texto de 1 a {0} caracteres, seed: inteiro de 0 a 4294967295, parts: peças da aparência}', [NAME_MAX]));
    }
    const r = office.setCharacter(id, { name, seed, parts });
    if (r.result === 'not-found') return sendJson(res, 404, { error: NOT_EDITABLE });
    if (r.result === 'conflict') return sendJson(res, 409, { error: r.message });
    sendJson(res, 200, { ok: true });
  };

  const fail = (res: ServerResponse, err: unknown) => {
    if (res.headersSent) return void res.destroy();
    if (err instanceof HttpError) sendJson(res, err.status, { error: err.message });
    else sendJson(res, 500, { error: tr('erro interno') });
  };

  return (req, res, url) => {
    const path = url.pathname;
    if (path !== '/api' && !path.startsWith('/api/')) return false;
    const method = req.method ?? 'GET';
    const isRead = method === 'GET' || method === 'HEAD';

    if (path === '/api/stream') {
      if (method !== 'GET') methodNotAllowed(res, 'GET');
      else hub.attach(req, res);
      return true;
    }
    if (path === '/api/snapshot') {
      if (!isRead) methodNotAllowed(res, 'GET');
      else sendJson(res, 200, hub.current());
      return true;
    }
    if (path === '/api/health') {
      if (!isRead) methodNotAllowed(res, 'GET');
      else {
        sendJson(res, 200, {
          ok: true,
          version: deps.version,
          demo: office.isDemo(),
          docker: deps.inDocker,
          terminal: !!terminals,
          permissions: !!deps.permissions,
          pty: !!deps.pty,
          messages: !!deps.messages,
          codexEvents: !!deps.codexLive,
          updates: updatesSummary(deps.updates?.status()),
          sources: deps.sources(),
          accounts: accounts.allEntries().map((a) =>
            a.provider === 'claude'
              ? { id: a.id, usageStatus: accounts.usageView(a.id).status }
              : { id: a.id, provider: a.provider, usageStatus: accounts.usageView(a.id).status },
          ),
        });
      }
      return true;
    }
    if (path === '/api/mod/summary') {
      // Lido a cada 5 s por sessão com o mod: só contagens e quem espera (nada que o snapshot já não mostre).
      if (!isRead) methodNotAllowed(res, 'GET');
      else {
        const own = { account: url.searchParams.get('account') || undefined, session: url.searchParams.get('session') || undefined };
        sendJson(res, 200, modSummary(hub.current(), (id) => office.has(id), deps.version, own));
      }
      return true;
    }
    const terminalMatch = TERMINAL_ROUTE.exec(path);
    if (terminalMatch) {
      if (method !== 'GET') methodNotAllowed(res, 'GET');
      else if (!terminals) {
        sendJson(res, 403, { error: tr('terminal desligado: ele só funciona com o Habblaud acessível apenas pelo próprio computador') });
      } else if (!isLoopbackHost(req.headers.host)) {
        sendJson(res, 403, { error: tr('o terminal só abre pelo próprio computador (http://localhost ou http://127.0.0.1)') });
      } else {
        let id: string;
        try {
          id = decodeURIComponent(terminalMatch[1]);
        } catch {
          sendJson(res, 400, { error: tr('id inválido') });
          return true;
        }
        try {
          terminals.attach(req, res, id);
        } catch (err) {
          console.error('[Terminal Attach Error]:', err);
          fail(res, err);
        }
      }
      return true;
    }
    if (path.startsWith('/api/sessions/')) {
      handleSessionsRoute(req, res, path, { history: deps.terminal ? deps.sessions : undefined, terminals });
      return true;
    }
    if (path === '/api/permissions' || path.startsWith('/api/permissions/')) {
      // Responder pelo escritório age sobre as sessões: a mesma trava do terminal (bind local + Host local).
      if (!deps.permissions) {
        sendJson(res, 403, { error: tr('responder pelo escritório desligado: só funciona com o Habblaud acessível apenas pelo próprio computador') });
      } else if (!isLoopbackHost(req.headers.host)) {
        sendJson(res, 403, { error: tr('pedidos de permissão só são respondidos pelo próprio computador (http://localhost ou http://127.0.0.1)') });
      } else {
        deps.permissions(req, res, path);
      }
      return true;
    }
    if (path === '/api/pty' || path.startsWith('/api/pty/') || AGENT_ACTION_ROUTE.test(path)) {
      if (!deps.pty) sendJson(res, 403, { error: tr('terminal interativo desligado (veja o log do servidor)') });
      else deps.pty(req, res, path);
      return true;
    }
    const characterMatch = CHARACTER_ROUTE.exec(path);
    if (characterMatch) {
      // Mudar o personagem age sobre o escritório: a mesma trava do terminal (bind local + Host local).
      if (method !== 'PUT' && method !== 'DELETE') methodNotAllowed(res, 'PUT, DELETE');
      else if (!deps.terminal) {
        sendJson(res, 403, { error: tr('editar o personagem desligado: só funciona com o Habblaud acessível apenas pelo próprio computador') });
      } else if (!isLoopbackHost(req.headers.host)) {
        sendJson(res, 403, { error: tr('o personagem só é editado pelo próprio computador (http://localhost ou http://127.0.0.1)') });
      } else {
        let id: string;
        try {
          id = decodeURIComponent(characterMatch[1]);
        } catch {
          sendJson(res, 400, { error: tr('id inválido') });
          return true;
        }
        handleCharacter(req, res, id, method).catch((err) => fail(res, err));
      }
      return true;
    }
    if (path === '/api/codex/events') {
      // Eventos dos hooks do Codex: só observam, mas só valem vindos do próprio computador. Fora do Docker o hook
      // sempre conecta pelo loopback (o Host sozinho um cliente da rede consegue imitar); no Docker ele chega pela porta
      // publicada, com o endereço do gateway.
      if (method !== 'POST') methodNotAllowed(res, 'POST');
      else if (!isLoopbackHost(req.headers.host) || (!deps.inDocker && !isLoopbackAddress(req.socket.remoteAddress))) {
        sendJson(res, 403, { error: tr('eventos do Codex só são aceitos pelo próprio computador (http://localhost ou http://127.0.0.1)') });
      } else handleCodexEvent(req, res, { live: deps.codexLive, entries: () => accounts.entriesOf('codex') }).catch((err) => fail(res, err));
      return true;
    }
    if (path.startsWith('/api/aioffice/')) {
      if (path === '/api/aioffice/agent/status' && method === 'POST') {
        readJson(req)
          .then((body: unknown) => {
            const b = body as Record<string, unknown>;
            const agentId = String(b?.['agentId'] || '');
            const name = String(b?.['name'] || 'Agente AIOffice');
            const role = String(b?.['role'] || 'Especialista');
            const project = String(b?.['project'] || process.cwd());
            const status = (b?.['status'] as AgentStatus) || 'working';
            const taskDesc = b?.['taskDescription'] ? String(b['taskDescription']) : undefined;
            if (!agentId) throw new HttpError(400, 'agentId obrigatorio');
            if (!office.has(agentId)) {
              office.addMain({
                id: agentId,
                account: 'A',
                sessionId: agentId,
                cwd: project,
                role,
                startedAt: Date.now(),
                status,
                provider: 'claude',
              });
            } else {
              office.setStatus(agentId, status, taskDesc);
            }
            if (taskDesc) {
              office.addActivity(
                agentId,
                {
                  id: `${agentId}#act:${Date.now()}`,
                  at: Date.now(),
                  kind: 'think',
                  icon: '💭',
                  text: `[${role}] ${taskDesc}`,
                },
                true,
              );
            }
            sendJson(res, 200, { ok: true });
          })
          .catch((err) => fail(res, err));
        return true;
      }
      if (path === '/api/aioffice/subagent/spawn' && method === 'POST') {
        readJson(req)
          .then((body: unknown) => {
            const b = body as Record<string, unknown>;
            const parentId = String(b?.['parentId'] || '');
            const subagentId = String(b?.['subagentId'] || '');
            const task = String(b?.['task'] || 'Subtarefa');
            if (!parentId || !subagentId) throw new HttpError(400, 'parentId e subagentId obrigatorios');
            office.addSub({
              id: subagentId,
              parentId,
              sessionId: `ses-${Date.now()}`,
              startedAt: Date.now(),
              role: 'Subagente',
              title: task,
              background: false,
            });
            sendJson(res, 200, { ok: true });
          })
          .catch((err) => fail(res, err));
        return true;
      }
      if (path === '/api/aioffice/subagent/done' && method === 'POST') {
        readJson(req)
          .then((body: unknown) => {
            const b = body as Record<string, unknown>;
            const subagentId = String(b?.['subagentId'] || '');
            if (!subagentId) throw new HttpError(400, 'subagentId obrigatorio');
            office.completeSub(subagentId);
            sendJson(res, 200, { ok: true });
          })
          .catch((err) => fail(res, err));
        return true;
      }
      if (path === '/api/aioffice/approval/request' && method === 'POST') {
        readJson(req)
          .then((body: unknown) => {
            const b = body as Record<string, unknown>;
            const agentId = String(b?.['agentId'] || '');
            const rationale = String(b?.['rationale'] || 'Aprovacao pendente');
            if (agentId && office.has(agentId)) {
              office.setStatus(agentId, 'waiting', rationale);
            }
            sendJson(res, 200, { ok: true });
          })
          .catch((err) => fail(res, err));
        return true;
      }
    }
    if (isMessagesPath(path)) {
      // As mensagens entram na sessão como se você as tivesse digitado: a mesma trava (recurso ligado + Host local).
      if (!deps.messages) {
        sendJson(res, 403, {
          error: tr('mensagens pelo escritório desligadas: só funcionam com o Habblaud acessível apenas pelo próprio computador (e sem HABBLAUD_MENSAGENS=0)'),
        });
      } else if (!isLoopbackHost(req.headers.host)) {
        sendJson(res, 403, { error: tr('mensagens só são mandadas pelo próprio computador (http://localhost ou http://127.0.0.1)') });
      } else {
        deps.messages(req, res, path);
      }
      return true;
    }
    if (path.startsWith('/api/agents/')) {
      if (!isRead) {
        methodNotAllowed(res, 'GET');
        return true;
      }
      let id: string;
      try {
        id = decodeURIComponent(path.slice('/api/agents/'.length));
      } catch {
        sendJson(res, 400, { error: tr('id inválido') });
        return true;
      }
      const detail = office.detail(id);
      if (detail) sendJson(res, 200, detail);
      else sendJson(res, 404, { error: tr('agente não encontrado') });
      return true;
    }
    if (path === '/api/rooms/rename') {
      // Como o personagem: a mesma trava do terminal (bind local + Host local).
      if (method !== 'POST') methodNotAllowed(res, 'POST');
      else if (!deps.terminal) sendJson(res, 403, { error: tr('renomear salas desligado: só funciona com o Habblaud acessível apenas pelo próprio computador') });
      else if (!isLoopbackHost(req.headers.host)) sendJson(res, 403, { error: tr('renomear salas só pelo próprio computador (http://localhost)') });
      else
        readJson(req)
          .then((body) => {
            const b = body as { id?: unknown; name?: unknown };
            if (typeof b?.id !== 'string' || typeof b.name !== 'string') throw new HttpError(400, 'esperado {id, name}');
            const name = deps.renameRoom?.(b.id, b.name);
            if (name === undefined) throw new HttpError(404, tr('sala não encontrada'));
            sendJson(res, 200, { name });
          })
          .catch((err) => fail(res, err));
      return true;
    }
    if (path === '/api/stats' || path.startsWith('/api/stats/')) {
      handleStatsRoute(req, res, url, deps.stats, sendJson);
      return true;
    }
    if (path === '/api/demo') {
      if (method !== 'POST') methodNotAllowed(res, 'POST');
      else handleDemo(req, res).catch((err) => fail(res, err));
      return true;
    }
    if (path === '/api/updates') {
      if (!isRead) methodNotAllowed(res, 'GET');
      else sendJson(res, 200, { version: deps.version, ...(deps.updates?.status() ?? { state: 'off', available: false }) });
      return true;
    }
    if (path === '/api/updates/check') {
      // "Verificar agora": consulta o GitHub (no máximo uma vez a cada 30 s) e devolve o status novo.
      if (method !== 'POST') methodNotAllowed(res, 'POST');
      else {
        req.resume();
        const updates = deps.updates;
        if (!updates) sendJson(res, 200, { version: deps.version, state: 'off', available: false });
        else
          updates
            .check({ manual: true })
            .then((status) => sendJson(res, 200, { version: deps.version, ...status }))
            .catch((err) => fail(res, err));
      }
      return true;
    }
    if (deps.timeline?.(req, res, url)) return true;
    sendJson(res, 404, { error: tr('rota desconhecida') });
    return true;
  };
}
