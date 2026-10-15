// Sessões oficiais do Antigravity ficam em ~/.gemini/<produto>/brain/<conversationId>/...
// Esta fonte lê o transcript em modo somente leitura; mensagens entram por hooks oficiais, nunca por edição do arquivo.
import { closeSync, existsSync, openSync, readSync, readdirSync, realpathSync, statSync, watch, type FSWatcher } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';
import type { Activity, AgentStatus, SourceInfo, TerminalEntry } from '../../../shared/types.js';
import { describePrompt, describeTool, maskSecrets, truncate } from '../../../shared/activity.js';
import type { DetectedAccount } from '../../accounts/detect.js';
import type { AccountsService } from '../../accounts/service.js';
import type { Office } from '../../model/office.js';
import type { AgentSource } from '../source.js';
import type { TerminalParser } from '../terminal.js';
import { createAntigravityTerminalParser } from './terminal.js';
import type { AntigravityStore } from './paths.js';
import { antigravityStores, canonicalTranscript, transcriptPath } from './paths.js';

const SESSION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LIVE_AGE_MS = 24 * 60 * 60_000;
const LIVE_FEED_MS = 120_000;
const ROLE = 'Agente (Antigravity)';

type Rec = Record<string, unknown>;
export type AntigravityEventName = 'SessionStart' | 'PreInvocation' | 'PreToolUse' | 'PostToolUse' | 'PostInvocation' | 'Stop';

export interface AntigravityHookEvent {
  name: AntigravityEventName;
  payload: Rec;
}

interface SessionContext {
  cwd?: string;
  cwdFromHook?: boolean;
  title?: string;
  model?: string;
  store?: AntigravityStore;
  startedAt?: number;
}

function rec(value: unknown): Rec | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Rec : undefined;
}

function str(value: unknown, max = 4_096): string | undefined {
  return typeof value === 'string' && value.trim() && value.length <= max ? value.trim() : undefined;
}

/** Algumas versões do Antigravity serializam strings de argumentos com aspas extras. */
function toolString(value: unknown): string | undefined {
  const raw = str(value);
  if (!raw) return undefined;
  if (raw.startsWith('"') && raw.endsWith('"')) {
    try {
      const decoded: unknown = JSON.parse(raw);
      if (typeof decoded === 'string' && decoded.trim()) return decoded.trim();
    } catch {
      // Mantém o texto original quando as aspas são parte do valor.
    }
  }
  if (raw.startsWith("'") && raw.endsWith("'") && raw.length >= 2) return raw.slice(1, -1).trim() || undefined;
  return raw;
}

function toolArg(input: Rec, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = toolString(input[key]);
    if (value) return value;
  }
  return undefined;
}

function asMs(value: unknown): number | undefined {
  const n = typeof value === 'number' ? value : typeof value === 'string' ? Date.parse(value) : NaN;
  return Number.isFinite(n) ? n : undefined;
}

function safePath(value: unknown): string | undefined {
  const path = toolString(value);
  return path && isAbsolute(path) ? resolve(path) : undefined;
}

function safeDirectory(value: unknown): string | undefined {
  const path = safePath(value);
  if (!path) return undefined;
  try {
    return statSync(path).isDirectory() ? realpathSync(path) : undefined;
  } catch {
    return undefined;
  }
}
function samePath(left: string, right: string): boolean {
  const a = resolve(left);
  const b = resolve(right);
  return process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b;
}

function parseArgs(value: unknown): Rec {
  if (rec(value)) return value as Rec;
  if (typeof value === 'string') {
    try {
      return rec(JSON.parse(value)) ?? {};
    } catch {
      return {};
    }
  }
  return {};
}

function mapTool(name: string, input: Rec): { label: string; description: ReturnType<typeof describeTool> } {
  const key = name.toLowerCase();
  let description: ReturnType<typeof describeTool>;
  if (/run_command|terminal|shell/.test(key)) {
    description = describeTool('Bash', { command: toolArg(input, 'CommandLine', 'command'), description: toolArg(input, 'Description', 'description') });
  } else if (/view_file|read_file/.test(key)) {
    description = describeTool('Read', { file_path: toolArg(input, 'AbsolutePath', 'path') });
  } else if (/list_dir/.test(key)) {
    description = describeTool('LS', { path: toolArg(input, 'DirectoryPath', 'path') });
  } else if (/write_to_file|create_file/.test(key)) {
    description = describeTool('Write', { file_path: toolArg(input, 'TargetFile', 'path'), content: toolArg(input, 'CodeContent', 'content') });
  } else if (/replace_file_content|edit_file/.test(key)) {
    description = describeTool('Edit', { file_path: toolArg(input, 'TargetFile', 'path'), old_string: toolArg(input, 'TargetContent'), new_string: toolArg(input, 'ReplacementContent') });
  } else if (/search_web|web_search/.test(key)) {
    description = describeTool('WebSearch', { query: toolArg(input, 'Query', 'query') });
  } else if (/browser/.test(key)) {
    description = describeTool('WebFetch', { url: toolArg(input, 'Url', 'url'), prompt: toolArg(input, 'Description', 'description') });
  } else {
    description = describeTool(name, input);
  }
  const summary = toolArg(input, 'toolSummary') ?? toolArg(input, 'toolAction');
  if (summary) description = { ...description, text: truncate(maskSecrets(summary), 72) };
  return { label: name, description };
}

function activityOf(entry: TerminalEntry): Activity | undefined {
  if (entry.kind === 'user') {
    const desc = describePrompt(entry.text);
    return { id: entry.id, at: entry.at, ...desc };
  }
  if (entry.kind === 'assistant') {
    // O Antigravity grava saídas de ferramentas como mensagens MODEL; elas continuam no terminal,
    // mas não devem virar uma sequência de atividades genéricas "Escrevendo resposta".
    return undefined;
  }
  if (entry.kind === 'tool') {
    const args = parseArgs(entry.input);
    const { label, description } = mapTool(entry.tool, args);
    return { id: entry.id, at: entry.at, ...description, tool: label };
  }
  if (entry.kind === 'system') {
    return {
      id: entry.id,
      at: entry.at,
      kind: entry.level === 'error' ? 'error' : 'other',
      icon: entry.level === 'error' ? '⚠️' : 'ℹ️',
      text: entry.text,
      ...(entry.detail ? { detail: truncate(maskSecrets(entry.detail), 300) } : {}),
      ...(entry.level === 'error' ? { error: true } : {}),
    };
  }
  return undefined;
}

export interface AntigravitySourceOptions {
  home: string;
  office: Office;
  accounts: AccountsService;
}

export class AntigravitySource implements AgentSource {
  readonly provider = 'antigravity' as const;
  readonly stores: AntigravityStore[];
  readonly accountId: string;
  private readonly watchers: FSWatcher[] = [];
  private pollTimer: NodeJS.Timeout | null = null;
  private readonly activeFiles = new Map<string, string>();
  private readonly fileMtimes = new Map<string, { mtimeMs: number; size: number; identity: string }>();
  private readonly sessions = new Map<string, SessionContext>();
  private readonly hookSeen = new Map<string, number>();
  private readonly streams = new Map<string, { identity: string; offset: number; pending: Buffer; head: Buffer; parser: TerminalParser; firstAt: number; lastAt: number; title?: string; model?: string; cwd?: string; status: AgentStatus; toolCalls: number }>();

  constructor(private readonly opts: AntigravitySourceOptions) {
    this.stores = antigravityStores(opts.home);
    const detected: DetectedAccount = {
      id: 'Antigravity',
      configDir: join(opts.home, '.gemini'),
      short: 'A',
      name: 'Antigravity',
      color: '#6f88e8',
    };
    this.accountId = opts.accounts.setProviderAccounts('antigravity', [{ dir: detected.configDir, detected }])[0]?.id ?? detected.id;
  }

  start(): void {
    this.opts.office.beginBoot();
    try {
      this.scan();
    } finally {
      this.opts.office.endBoot();
    }
    for (const store of this.stores) {
      if (!existsSync(store.brain)) continue;
      try {
        this.watchers.push(watch(store.brain, { recursive: true }, () => this.scan()));
      } catch {
        // Polling cobre sistemas sem watch recursivo.
      }
    }
    this.pollTimer = setInterval(() => this.scan(), 2_500);
    this.pollTimer.unref?.();
  }

  stop(): void {
    for (const watcher of this.watchers) watcher.close();
    this.watchers.length = 0;
    if (this.pollTimer) clearInterval(this.pollTimer);
    this.pollTimer = null;
  }

  sources(): SourceInfo[] {
    const sessions = this.opts.office.list().filter((a) => a.provider === 'antigravity' && a.status !== 'offline' && a.status !== 'done');
    return this.stores.map((store) => ({
      label: store.label,
      provider: 'antigravity',
      path: store.brain,
      sessions: sessions.filter((a) => this.activeFiles.get(a.id)?.startsWith(store.brain)).length,
      ok: existsSync(store.brain),
    }));
  }

  transcriptPathOf(agentId: string): string | undefined {
    const path = this.activeFiles.get(agentId);
    const id = agentId.replace(/^antigravity:/, '');
    return path ? this.stores.map((store) => canonicalTranscript(store.brain, id, path)).find(Boolean) : undefined;
  }

  /** Transcripts nunca comprovam que o hook oficial está carregado. */
  canMessage(sessionId: string, now = Date.now()): boolean {
    const seen = this.hookSeen.get(sessionId);
    return seen !== undefined && now - seen < 5 * 60_000;
  }

  terminalParser(): TerminalParser {
    return createAntigravityTerminalParser();
  }

  workspaceOf(sessionId: string): string | undefined {
    return this.sessions.get(sessionId)?.cwd;
  }

  /** Aplica um evento oficial dos hooks sem decidir permissões em nome do Antigravity. */
  applyHookEvent(event: AntigravityHookEvent): boolean {
    const payload = event.payload;
    const sessionId = str(payload.conversationId, 100);
    if (!sessionId || !SESSION_ID.test(sessionId)) return false;
    const context = this.contextFrom(payload, sessionId);
    // Só um hook ligado ao transcript canônico é aceito como canal de mensagens.
    const supplied = safePath(payload.transcriptPath);
    const hookFile = supplied && this.stores.map((store) => canonicalTranscript(store.brain, sessionId, supplied)).find(Boolean);
    if (!hookFile) return false;
    this.hookSeen.set(sessionId, Date.now());
    this.sessions.set(sessionId, { ...this.sessions.get(sessionId), ...context, startedAt: this.sessions.get(sessionId)?.startedAt ?? Date.now() });
    const session = this.sessions.get(sessionId)!;
    const filePath = hookFile;
    const agentId = `antigravity:${sessionId}`;
    if (filePath) this.activeFiles.set(agentId, filePath);
    if (!this.opts.office.has(agentId)) {
      this.opts.office.addMain({
        id: agentId,
        account: this.accountId,
        sessionId,
        cwd: session.cwd ?? this.opts.home,
        role: ROLE,
        startedAt: session.startedAt ?? Date.now(),
        status: 'working',
        provider: 'antigravity',
      });
    }
    const agent = this.opts.office.get(agentId);
    if (!agent) return false;
    if (session.cwd) this.opts.office.setMainCwd(agentId, session.cwd);
    if (session.title) agent.title = session.title;
    if (session.model) agent.model = session.model;
    this.opts.office.applyTranscript(agentId, {
      title: agent.title,
      tasks: agent.tasks,
      stats: agent.stats,
      ...(agent.model ? { model: agent.model } : {}),
      lastAt: Date.now(),
    });

    switch (event.name) {
      case 'SessionStart':
      case 'PreInvocation':
      case 'PreToolUse':
        this.opts.office.setStatus(agentId, 'working');
        if (event.name === 'PreToolUse') this.recordTool(agentId, payload, false);
        break;
      case 'PostToolUse':
        this.recordTool(agentId, payload, true);
        this.opts.office.setStatus(agentId, 'working');
        break;
      case 'PostInvocation':
        this.opts.office.setStatus(agentId, 'working');
        break;
      case 'Stop':
        this.opts.office.setStatus(agentId, payload.fullyIdle === false ? 'working' : 'idle');
        if (str(payload.terminationReason) === 'error') {
          const error = str(payload.error, 4_000) ?? 'A execução terminou com erro';
          this.opts.office.addActivity(agentId, {
            id: `${agentId}#hook:stop:${str(payload.executionNum, 40) ?? Date.now()}`,
            at: Date.now(), kind: 'error', icon: '⚠️', text: 'Antigravity encontrou um erro', detail: truncate(maskSecrets(error), 300), error: true,
          }, true);
        }
        break;
    }
    return true;
  }

  scan(): void {
    const now = Date.now();
    for (const store of this.stores) {
      let sessionIds: string[];
      try {
        sessionIds = readdirSync(store.brain).filter((name) => SESSION_ID.test(name));
      } catch {
        continue;
      }
      for (const sessionId of sessionIds) {
        const path = transcriptPath(store.brain, sessionId);
        try {
          const stat = statSync(path);
          if (now - stat.mtimeMs > LIVE_AGE_MS) {
            const staleId = `antigravity:${sessionId}`;
            if (this.activeFiles.has(staleId)) {
              this.activeFiles.delete(staleId);
              this.opts.office.setStatus(staleId, 'offline');
            }
            continue;
          }
          if (!stat.isFile() || !this.isSafeFile(store.brain, path)) continue;
          const previous = this.fileMtimes.get(path);
          const identity = `${stat.dev}:${stat.ino}:${stat.birthtimeMs}`;
          if (previous?.mtimeMs === stat.mtimeMs && previous.size === stat.size && previous.identity === identity) continue;
          this.processTranscript(store, sessionId, path, stat.mtimeMs, stat.birthtimeMs);
          this.fileMtimes.set(path, { mtimeMs: stat.mtimeMs, size: stat.size, identity });
        } catch {
          // O Antigravity ainda pode estar criando ou fechando o arquivo.
        }
      }
    }
  }

  private contextFrom(payload: Rec, sessionId: string): SessionContext {
    const current = this.sessions.get(sessionId) ?? {};
    const paths = Array.isArray(payload.workspacePaths) ? payload.workspacePaths : [];
    const hookCwd = paths.map(safeDirectory).find(Boolean);
    const cwd = hookCwd ?? current.cwd;
    const model = str(payload.modelName, 200) ?? current.model;
    const rawTranscript = safePath(payload.transcriptPath);
    const store = this.stores.find((candidate) => rawTranscript && this.pathMatches(candidate.brain, sessionId, rawTranscript)) ?? current.store;
    return {
      ...(cwd ? { cwd } : {}),
      cwdFromHook: hookCwd ? true : current.cwdFromHook,
      ...(model ? { model } : {}),
      ...(store ? { store } : {}),
    };
  }

  private pathMatches(brain: string, sessionId: string, path: string): boolean {
    return canonicalTranscript(brain, sessionId, path) !== undefined;
  }

  private isSafeFile(brain: string, path: string): boolean {
    const sessionId = path.split(/[\\/]/).at(-4);
    return !!sessionId && canonicalTranscript(brain, sessionId, path) !== undefined;
  }

  private processTranscript(store: AntigravityStore, sessionId: string, path: string, mtimeMs: number, birthtimeMs: number): void {
    const identityStat = statSync(path);
    const identity = `${identityStat.dev}:${identityStat.ino}:${identityStat.birthtimeMs}`;
    const head = Buffer.alloc(Math.min(256, identityStat.size));
    const headFd = openSync(path, 'r');
    try { readSync(headFd, head, 0, head.length, 0); } finally { closeSync(headFd); }
    let stream = this.streams.get(path);
    if (!stream || stream.identity !== identity || identityStat.size <= stream.offset || !head.subarray(0, stream.head.length).equals(stream.head)) {
      // Retém a deduplicação ao truncar/rotacionar, mas reconstitui somente os metadados.
      stream = { identity, offset: 0, pending: Buffer.alloc(0), head, parser: stream?.parser ?? createAntigravityTerminalParser(), firstAt: Infinity, lastAt: 0, status: 'idle', toolCalls: 0 };
      this.streams.set(path, stream);
    }
    stream.head = head;
    const agentId = `antigravity:${sessionId}`;
    const canonical = canonicalTranscript(store.brain, sessionId, path);
    if (!canonical) return;
    this.activeFiles.set(agentId, canonical);
    const fd = openSync(canonical, 'r');
    const entries: TerminalEntry[] = [];
    try {
      // Limita memória por leitura; linhas incompletas aguardam a próxima gravação.
      while (stream.offset < identityStat.size) {
        const buffer = Buffer.alloc(Math.min(64 * 1024, identityStat.size - stream.offset));
        const bytes = readSync(fd, buffer, 0, buffer.length, stream.offset);
        if (!bytes) break;
        stream.offset += bytes;
        const data = Buffer.concat([stream.pending, buffer.subarray(0, bytes)]);
        let from = 0;
        for (let i = 0; i < data.length; i++) {
          if (data[i] !== 10) continue;
          const line = data.subarray(from, i).toString('utf8').replace(/\r$/, '');
          from = i + 1;
          let record: Rec | undefined;
          try { record = rec(JSON.parse(line)); } catch { continue; }
          if (!record) continue;
          const at = asMs(record.created_at);
          if (at !== undefined) { stream.firstAt = Math.min(stream.firstAt, at); stream.lastAt = Math.max(stream.lastAt, at); }
          if (!stream.title && record.type === 'USER_INPUT' && typeof record.content === 'string') stream.title = truncate(maskSecrets(record.content), 90);
          if (record.type === 'PLANNER_RESPONSE' && Array.isArray(record.tool_calls)) {
            stream.toolCalls += record.tool_calls.length;
            if (!this.sessions.get(sessionId)?.cwdFromHook) {
              for (const rawCall of record.tool_calls) {
                const call = rec(rawCall);
                if (!/run_command|terminal|shell/i.test(str(call?.name, 120) ?? '')) continue;
                const args = parseArgs(call?.args);
                const cwd = safeDirectory(toolArg(args, 'Cwd', 'cwd', 'WorkingDirectory', 'workingDirectory'));
                if (cwd && !samePath(cwd, this.opts.home)) stream.cwd = cwd;
              }
            }
          }
          if (record.status === 'RUNNING') stream.status = 'working';
          else if (record.status === 'DONE' || record.status === 'ERROR') stream.status = 'idle';
          if (typeof record.modelName === 'string') stream.model = record.modelName;
          entries.push(...stream.parser.push(line));
        }
        // Um registro malformado enorme não pode crescer indefinidamente em memória.
        stream.pending = data.length - from <= 1024 * 1024 ? Buffer.from(data.subarray(from)) : Buffer.alloc(0);
      }
    } finally { closeSync(fd); }
    let { firstAt, lastAt, title, model } = stream;
    const { status, toolCalls } = stream;
    const transcriptCwd = stream.cwd;
    if (!Number.isFinite(firstAt)) firstAt = birthtimeMs || mtimeMs;
    const context = this.sessions.get(sessionId) ?? {};
    if (!context.cwdFromHook && transcriptCwd) context.cwd = transcriptCwd;
    if (!context.store) context.store = store;
    this.sessions.set(sessionId, context);
    if (!this.opts.office.has(agentId)) {
      this.opts.office.addMain({
        id: agentId,
        account: this.accountId,
        sessionId,
        cwd: context?.cwd ?? this.opts.home,
        role: ROLE,
        startedAt: firstAt,
        status,
        provider: 'antigravity',
      });
    }
    const agent = this.opts.office.get(agentId);
    if (!agent) return;
    if (context.cwd) this.opts.office.setMainCwd(agentId, context.cwd);
    if (title) {
      context.title = title;
      agent.title = title;
    }
    model ??= context.model;
    if (model) agent.model = model;
    this.sessions.set(sessionId, context);
    this.opts.office.applyTranscript(agentId, {
      title,
      tasks: agent.tasks,
      stats: { ...agent.stats, toolCalls },
      model,
      firstAt,
      lastAt: lastAt || mtimeMs,
    });
    this.opts.office.setStatus(agentId, status);
    const now = Date.now();
    for (const entry of entries) {
      const activity = activityOf(entry);
      if (!activity) continue;
      this.opts.office.addActivity(agentId, activity, activity.at >= lastAt - 1, { feed: activity.at >= now - LIVE_FEED_MS });
    }
  }

  private recordTool(agentId: string, payload: Rec, done: boolean): void {
    const toolCall = rec(payload.toolCall);
    const tool = str(toolCall?.name, 120);
    if (!tool) return;
    const args = rec(toolCall?.args) ?? {};
    const { label, description } = mapTool(tool, args);
    const error = str(payload.error, 4_000);
    const step = Number.isInteger(payload.stepIdx) ? Number(payload.stepIdx) : Date.now();
    const activity: Activity = {
      id: `antigravity:${str(payload.conversationId, 100)}#hook:${step}:${done ? 'post' : 'pre'}`,
      at: Date.now(),
      ...(done && error
        ? { kind: 'error' as const, icon: '⚠️', text: `Falha em ${label}`, detail: truncate(maskSecrets(error), 300), error: true }
        : done
          ? { kind: description.kind, icon: description.icon, text: `${truncate(description.text, 36)} ✓`, detail: description.detail }
          : description),
      tool: label,
    };
    this.opts.office.addActivity(agentId, activity, true);
  }
}
