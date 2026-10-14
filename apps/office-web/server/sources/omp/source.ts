import { existsSync, readdirSync, readFileSync, statSync, watch, type FSWatcher } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { Activity, AgentStats, AgentStatus, SourceInfo, TaskItem } from '../../../shared/types.js';
import type { DetectedAccount } from '../../accounts/detect.js';
import type { AccountsService } from '../../accounts/service.js';
import type { Office } from '../../model/office.js';
import type { AgentSource } from '../source.js';
import { createOmpTerminalParser } from './terminal.js';
import type { TerminalParser } from '../terminal.js';
import {
  basename,
  describePrompt,
  describeTool,
  looksPortuguese,
  maskSecrets,
  SPECIAL,
  truncate,
  type ActivityDescription,
} from '../../../shared/activity.js';
import { tr } from '../../../shared/i18n.js';

type Rec = Record<string, unknown>;

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() ? v.trim() : undefined;
}

function toMs(v: unknown): number | undefined {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v !== 'string') return undefined;
  const t = Date.parse(v);
  return Number.isNaN(t) ? undefined : t;
}

function extractUserText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  const parts: string[] = [];
  for (const block of content) {
    if (block && typeof block === 'object' && 'text' in block && typeof block.text === 'string') {
      parts.push(block.text);
    }
  }
  return parts.join('\n');
}

function parseArgs(raw: unknown): Rec {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) return raw as Rec;
  if (typeof raw === 'string') {
    try {
      const parsed: unknown = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed as Rec;
    } catch {}
  }
  return {};
}

function make(kind: Activity['kind'], icon: string, text: string, detail?: string): ActivityDescription {
  return {
    kind,
    icon,
    text: truncate(maskSecrets(text), 46),
    ...(detail ? { detail: truncate(maskSecrets(detail), 300) } : {}),
  };
}

export function describeOmpTool(
  toolName: string,
  rawArgs: unknown,
  intent?: string,
): ActivityDescription {
  const args = parseArgs(rawArgs);
  const rawIntent = str(args.i) ?? str(args.intent) ?? str(intent);

  switch (toolName.toLowerCase()) {
    case 'bash':
    case 'exec':
    case 'shell': {
      const command = str(args.command) ?? '';
      const res = describeTool('Bash', { command, description: rawIntent });
      if (rawIntent && res.detail && !res.detail.includes(rawIntent)) {
        res.detail = `${rawIntent} — ${res.detail}`;
      }
      return res;
    }
    case 'read': {
      const path = str(args.path) ?? str(args.file_path) ?? '';
      if (path.startsWith('pr://')) {
        const detail = rawIntent ? `${rawIntent} — ${path}` : path;
        return make('git', '🔀', tr('Conferindo pull requests'), detail);
      }
      if (path.startsWith('issue://')) {
        const detail = rawIntent ? `${rawIntent} — ${path}` : path;
        return make('read', '📋', tr('Lendo issues'), detail);
      }
      if (path.startsWith('skill://')) {
        const rel = path.slice(8).replace(/^\/+/, '');
        const skillName = rel.split('/')[0] || 'skill';
        return make('skill', '🧩', tr('Lendo a skill {0}', [skillName]), path);
      }
      if (path.startsWith('agent://')) {
        const sub = basename(path.slice(8));
        return make('delegate', '👥', sub ? tr('Conferindo subagente {0}', [sub]) : tr('Conferindo subagentes'), path);
      }
      if (path.startsWith('proc://')) {
        return make('run', '📟', tr('Conferindo processo'), path);
      }
      if (path.startsWith('history://')) {
        return make('read', '📜', tr('Lendo histórico da sessão'), path);
      }
      if (path.startsWith('local://')) {
        return make('read', '📄', tr('Lendo arquivo local {0}', [basename(path.slice(8))]), path);
      }
      if (rawIntent && looksPortuguese(rawIntent)) {
        return make('read', '📖', truncate(rawIntent, 46), path);
      }
      return describeTool('Read', { file_path: path });
    }
    case 'write': {
      const path = str(args.path) ?? str(args.file_path) ?? '';
      if (rawIntent && looksPortuguese(rawIntent)) {
        return make('write', '📝', truncate(rawIntent, 46), path);
      }
      return describeTool('Write', { file_path: path });
    }
    case 'edit': {
      let file = str(args.path) ?? str(args.file_path);
      if (!file && typeof args.input === 'string') {
        const m = /^\[([^#\]\r\n]+)/.exec(args.input.trim());
        if (m) file = m[1].trim();
      }
      if (rawIntent && looksPortuguese(rawIntent)) {
        return make('edit', '✏️', truncate(rawIntent, 46), file);
      }
      return describeTool('Edit', { file_path: file });
    }
    case 'glob': {
      const pattern = str(args.pattern) ?? str(args.path) ?? '';
      if (rawIntent && looksPortuguese(rawIntent)) {
        return make('search', '🔎', truncate(rawIntent, 46), pattern);
      }
      return describeTool('Glob', { pattern });
    }
    case 'grep': {
      const pattern = str(args.pattern) ?? '';
      if (rawIntent && looksPortuguese(rawIntent)) {
        return make('search', '🔎', truncate(rawIntent, 46), pattern);
      }
      return describeTool('Grep', { pattern });
    }
    case 'task': {
      if (rawIntent && looksPortuguese(rawIntent)) {
        return make('delegate', '👥', truncate(rawIntent, 46));
      }
      if (Array.isArray(args.tasks) && args.tasks.length > 0) {
        const first = args.tasks[0];
        if (first && typeof first === 'object') {
          const f = first as Rec;
          const taskName = str(f.name) ?? str(f.task);
          const agentType = str(f.agent);
          return describeTool('Task', { description: taskName, subagent_type: agentType });
        }
      }
      return describeTool('Task', { description: rawIntent });
    }
    case 'todo': {
      const op = str(args.op);
      const task = str(args.task);
      if (op === 'done' && task) {
        return make('plan', '✅', tr('Concluiu tarefa: {0}', [truncate(task, 30)]), task);
      }
      if (op === 'start' && task) {
        return make('plan', '🗒️', tr('Começou tarefa: {0}', [truncate(task, 30)]), task);
      }
      if (op === 'init') {
        return make('plan', '🗒️', tr('Iniciando lista de tarefas'));
      }
      if (op === 'append') {
        return make('plan', '🗒️', tr('Adicionando tarefas'));
      }
      if (rawIntent && looksPortuguese(rawIntent)) {
        return make('plan', '🗒️', truncate(rawIntent, 46));
      }
      return describeTool('TodoWrite', { todos: [] });
    }
    case 'web_search': {
      const query = str(args.query) ?? '';
      return describeTool('WebSearch', { query });
    }
    case 'ask': {
      return describeTool('AskUserQuestion', { questions: args.questions });
    }
    case 'eval': {
      const lang = args.language === 'py' ? 'Python' : 'JavaScript';
      const code = str(args.code) ?? '';
      if (rawIntent && looksPortuguese(rawIntent)) {
        return make('run', '▶️', truncate(rawIntent, 46), code);
      }
      return make('run', '▶️', tr('Executando código {0}', [lang]), code);
    }
    case 'wait': {
      return make('wait', '⏳', tr('Aguardando conclusão'));
    }
    default: {
      if (toolName.startsWith('mcp__')) {
        return describeTool(toolName, args);
      }
      if (rawIntent && looksPortuguese(rawIntent)) {
        return make('other', '🛠️', truncate(rawIntent, 46));
      }
      return describeTool(toolName, args);
    }
  }
}

function updateOmpTasks(tasks: TaskItem[], args: Rec): void {
  const op = typeof args.op === 'string' ? args.op : '';
  if (op === 'init') {
    tasks.length = 0;
    let idx = 1;
    if (Array.isArray(args.list)) {
      for (const phase of args.list) {
        if (phase && typeof phase === 'object' && 'items' in phase && Array.isArray(phase.items)) {
          for (const item of phase.items) {
            if (typeof item === 'string' && item.trim()) {
              tasks.push({ id: String(idx++), title: truncate(item.trim(), 120), status: 'pending' });
            }
          }
        }
      }
    } else if (Array.isArray(args.items)) {
      for (const item of args.items) {
        if (typeof item === 'string' && item.trim()) {
          tasks.push({ id: String(idx++), title: truncate(item.trim(), 120), status: 'pending' });
        }
      }
    }
  } else if (op === 'done' || op === 'start' || op === 'block') {
    const taskName = typeof args.task === 'string' ? args.task.trim() : '';
    if (taskName) {
      const target = tasks.find((t) => t.title === taskName || t.id === taskName);
      if (target) {
        target.status = op === 'done' ? 'completed' : op === 'start' ? 'in_progress' : 'pending';
      }
    }
  } else if (op === 'append' && Array.isArray(args.items)) {
    let idx = tasks.length + 1;
    for (const item of args.items) {
      if (typeof item === 'string' && item.trim()) {
        tasks.push({ id: String(idx++), title: truncate(item.trim(), 120), status: 'pending' });
      }
    }
  }
}

interface OmpSessionTracker {
  filePath: string;
  agentId?: string;
  sessionId?: string;
  cwd?: string;
  title?: string;
  model?: string;
  startedAt?: number;
  stats: AgentStats;
  tasks: TaskItem[];
  seenToolCalls: Set<string>;
  seenActivityIds: Set<string>;
  lastProcessedLine: number;
  lastMtime: number;
  live: boolean;
}

export class OmpSource implements AgentSource {
  readonly provider = 'omp' as const;
  readonly sessionsDir: string;
  private watcher: FSWatcher | null = null;
  private pollTimer: NodeJS.Timeout | null = null;
  private activeFiles = new Map<string, string>();
  private trackers = new Map<string, OmpSessionTracker>();
  readonly accountId: string;

  constructor(
    private readonly office: Office,
    accounts: AccountsService,
    sessionsDir?: string,
  ) {
    this.sessionsDir = sessionsDir ?? join(homedir(), '.omp', 'agent', 'sessions');
    const detected: DetectedAccount = {
      id: 'OMP',
      configDir: this.sessionsDir,
      short: 'O',
      name: 'oh-my-pi',
      color: '#52d6b4',
    };
    this.accountId = accounts.setProviderAccounts('omp', [{ dir: this.sessionsDir, detected }])[0]?.id ?? 'OMP';
  }

  start(): void {
    if (!existsSync(this.sessionsDir)) return;
    this.scan();
    try {
      this.watcher = watch(this.sessionsDir, { recursive: true }, () => {
        this.scan();
      });
    } catch {
      // Fallback para polling se watch recursivo falhar no sistema de arquivos
    }
    this.pollTimer = setInterval(() => this.scan(), 2500);
    this.pollTimer.unref?.();
  }

  stop(): void {
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
    }
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  sources(): SourceInfo[] {
    const ok = existsSync(this.sessionsDir);
    const sessions = this.office.list().filter((a) => a.provider === 'omp' && a.status !== 'offline' && a.status !== 'done').length;
    return [{ label: 'oh-my-pi', provider: 'omp', path: this.sessionsDir, sessions, ok, ...(!ok ? { error: tr('pasta de sessões do oh-my-pi não encontrada') } : {}) }];
  }

  transcriptPathOf(agentId: string): string | undefined {
    return this.activeFiles.get(agentId);
  }

  public scan(): void {
    if (!existsSync(this.sessionsDir)) return;
    try {
      const dirs = readdirSync(this.sessionsDir);
      const now = Date.now();
      const cutoff = now - 24 * 3600 * 1000; // Sessões das últimas 24h

      for (const dirName of dirs) {
        const dirPath = join(this.sessionsDir, dirName);
        if (!statSync(dirPath).isDirectory()) continue;

        const files = readdirSync(dirPath).filter((f) => f.endsWith('.jsonl'));
        for (const fileName of files) {
          const filePath = join(dirPath, fileName);
          const stat = statSync(filePath);
          if (stat.mtimeMs < cutoff) continue;

          const tracker = this.trackers.get(filePath);
          if (tracker && tracker.lastMtime === stat.mtimeMs) continue;

          this.processSessionFile(filePath, stat.mtimeMs, tracker);
        }
      }
    } catch {
      // Ignorar erros transitórios de leitura enquanto arquivos estão sendo gravados
    }
  }

  private processSessionFile(filePath: string, mtimeMs: number, existingTracker?: OmpSessionTracker): void {
    try {
      const raw = readFileSync(filePath, 'utf-8');
      const lines = raw.trim().split(/\r?\n/).filter(Boolean);
      if (lines.length < 2) return;

      let tracker = existingTracker;
      if (!tracker) {
        tracker = {
          filePath,
          stats: { toolCalls: 0, tokensIn: 0, tokensOut: 0, subagents: 0 },
          tasks: [],
          seenToolCalls: new Set<string>(),
          seenActivityIds: new Set<string>(),
          lastProcessedLine: 0,
          lastMtime: 0,
          live: false,
        };
        this.trackers.set(filePath, tracker);
      }

      if (!tracker.sessionId || !tracker.cwd) {
        for (const line of lines) {
          try {
            const item: unknown = JSON.parse(line);
            if (!item || typeof item !== 'object') continue;
            const rec = item as Rec;
            if (rec.type === 'session') {
              if (typeof rec.id === 'string') tracker.sessionId = rec.id;
              if (typeof rec.cwd === 'string') tracker.cwd = rec.cwd;
              const ts = toMs(rec.timestamp);
              if (ts !== undefined) tracker.startedAt = ts;
            }
            if ((rec.type === 'title' || rec.type === 'title_change') && typeof rec.title === 'string' && rec.title.trim()) {
              tracker.title = rec.title.trim();
            }
          } catch {}
          if (tracker.sessionId && tracker.cwd) break;
        }
      }

      if (!tracker.sessionId || !tracker.cwd) return;

      const agentId = `omp:${tracker.sessionId}`;
      tracker.agentId = agentId;
      this.activeFiles.set(agentId, filePath);

      if (lines.length < tracker.lastProcessedLine) {
        tracker.lastProcessedLine = 0;
        tracker.seenToolCalls.clear();
        tracker.seenActivityIds.clear();
        tracker.stats = { toolCalls: 0, tokensIn: 0, tokensOut: 0, subagents: 0 };
        tracker.tasks = [];
      }

      if (!this.office.has(agentId)) {
        this.office.addMain({
          id: agentId,
          account: this.accountId,
          sessionId: tracker.sessionId,
          cwd: tracker.cwd,
          role: 'Engenheiro (oh-my-pi)',
          startedAt: tracker.startedAt ?? mtimeMs,
          status: 'idle',
          provider: 'omp',
        });
        if (tracker.title) {
          const agent = this.office.get(agentId);
          if (agent) agent.title = tracker.title;
        }
      }

      let currentStatus: AgentStatus = this.office.get(agentId)?.status ?? 'idle';
      const newActivities: Activity[] = [];

      for (let lineIndex = tracker.lastProcessedLine; lineIndex < lines.length; lineIndex++) {
        const line = lines[lineIndex];
        let item: unknown;
        try {
          item = JSON.parse(line);
        } catch {
          continue;
        }
        if (!item || typeof item !== 'object') continue;
        const rec = item as Rec;

        if ((rec.type === 'title' || rec.type === 'title_change') && typeof rec.title === 'string' && rec.title.trim()) {
          tracker.title = rec.title.trim();
        }

        if (rec.type === 'model_change' && typeof rec.model === 'string') {
          tracker.model = rec.model;
        }

        const msgObj = rec.message && typeof rec.message === 'object' ? (rec.message as Rec) : undefined;
        const lineTs = toMs(rec.timestamp) ?? toMs(msgObj?.timestamp) ?? mtimeMs;
        const eventId = typeof rec.id === 'string' ? rec.id : `${mtimeMs}:${lineIndex}`;

        if (rec.type === 'message' && msgObj) {
          const role = str(msgObj.role);
          const at = toMs(msgObj.timestamp) ?? lineTs;

          if (role === 'user') {
            currentStatus = 'working';
            const promptText = extractUserText(msgObj.content).trim();
            if (promptText) {
              const actId = `${agentId}#usr:${eventId}`;
              if (!tracker.seenActivityIds.has(actId)) {
                tracker.seenActivityIds.add(actId);
                newActivities.push({
                  id: actId,
                  at,
                  ...describePrompt(promptText),
                });
              }
            }
          } else if (role === 'assistant') {
            currentStatus = 'working';
            if (typeof msgObj.model === 'string' && msgObj.model) {
              tracker.model = msgObj.model;
            }
            if (msgObj.usage && typeof msgObj.usage === 'object') {
              const u = msgObj.usage as Rec;
              if (typeof u.input === 'number') tracker.stats.tokensIn += u.input;
              if (typeof u.cacheRead === 'number') tracker.stats.tokensIn += u.cacheRead;
              if (typeof u.output === 'number') tracker.stats.tokensOut += u.output;
              if (u.cost && typeof u.cost === 'object' && 'total' in u.cost && typeof u.cost.total === 'number') {
                tracker.stats.costUSD = (tracker.stats.costUSD ?? 0) + u.cost.total;
              }
            }

            const contents = Array.isArray(msgObj.content) ? msgObj.content : [];
            let hasToolCall = false;
            let hasText = false;

            for (let blockIndex = 0; blockIndex < contents.length; blockIndex++) {
              const c = contents[blockIndex];
              if (!c || typeof c !== 'object') continue;
              const b = c as Rec;

              if (b.type === 'thinking' && typeof b.thinking === 'string' && b.thinking.trim()) {
                const actId = `${agentId}#think:${eventId}:${blockIndex}`;
                if (!tracker.seenActivityIds.has(actId)) {
                  tracker.seenActivityIds.add(actId);
                  newActivities.push({
                    id: actId,
                    at,
                    ...SPECIAL.think(),
                    detail: truncate(maskSecrets(b.thinking), 300),
                  });
                }
              } else if (b.type === 'toolCall') {
                hasToolCall = true;
                tracker.stats.toolCalls++;
                const toolName = typeof b.name === 'string' ? b.name : 'tool';
                if (toolName === 'task') tracker.stats.subagents++;
                const callId = typeof b.id === 'string' ? b.id : `${eventId}:${blockIndex}`;
                if (!tracker.seenToolCalls.has(callId)) {
                  tracker.seenToolCalls.add(callId);
                  const actId = `${agentId}#tool:${callId}`;
                  if (!tracker.seenActivityIds.has(actId)) {
                    tracker.seenActivityIds.add(actId);
                    const desc = describeOmpTool(toolName, b.arguments, typeof b.intent === 'string' ? b.intent : undefined);
                    newActivities.push({
                      id: actId,
                      at,
                      ...desc,
                      tool: toolName,
                    });
                  }
                }
                if (toolName === 'todo') {
                  updateOmpTasks(tracker.tasks, parseArgs(b.arguments));
                }
              } else if (b.type === 'text' && typeof b.text === 'string' && b.text.trim()) {
                hasText = true;
                const actId = `${agentId}#resp:${eventId}:${blockIndex}`;
                if (!tracker.seenActivityIds.has(actId)) {
                  tracker.seenActivityIds.add(actId);
                  newActivities.push({
                    id: actId,
                    at,
                    ...SPECIAL.respond(b.text),
                  });
                }
              }
            }

            const stop = str(msgObj.stopReason);
            if (stop === 'endTurn' || stop === 'stop' || (!hasToolCall && hasText)) {
              currentStatus = 'idle';
            }
          } else if (role === 'toolResult') {
            currentStatus = 'working';
            if (msgObj.isError === true) {
              const actId = `${agentId}#err:${eventId}`;
              if (!tracker.seenActivityIds.has(actId)) {
                tracker.seenActivityIds.add(actId);
                const firstErr = extractUserText(msgObj.content) || (typeof msgObj.errorMessage === 'string' ? msgObj.errorMessage : '');
                const first = firstErr.split(/\r?\n/).find((l) => l.trim()) ?? '';
                const errSnippet = truncate(first.replace(/<\/?[a-z_-]+>/gi, ''), 140);
                const toolName = typeof msgObj.toolName === 'string' ? msgObj.toolName : undefined;
                newActivities.push({
                  id: actId,
                  at,
                  ...SPECIAL.error(toolName, errSnippet),
                  tool: toolName,
                  error: true,
                });
              }
            }
            // Sucesso de toolResult intencionalmente não emite atividade ({ferramenta} terminou)
          }
        } else if (rec.type === 'custom') {
          if (rec.customType === 'tool_execution_start' && rec.data && typeof rec.data === 'object') {
            currentStatus = 'working';
            const data = rec.data as Rec;
            const callId = typeof data.toolCallId === 'string' ? data.toolCallId : undefined;
            const toolName = typeof data.toolName === 'string' ? data.toolName : 'tool';
            if (callId && !tracker.seenToolCalls.has(callId)) {
              tracker.seenToolCalls.add(callId);
              tracker.stats.toolCalls++;
              if (toolName === 'task') tracker.stats.subagents++;
              const at = toMs(data.startedAt) ?? lineTs;
              const actId = `${agentId}#tool:${callId}`;
              if (!tracker.seenActivityIds.has(actId)) {
                tracker.seenActivityIds.add(actId);
                const desc = describeOmpTool(toolName, data.args, typeof data.intent === 'string' ? data.intent : undefined);
                newActivities.push({
                  id: actId,
                  at,
                  ...desc,
                  tool: toolName,
                });
              }
              if (toolName === 'todo') {
                updateOmpTasks(tracker.tasks, parseArgs(data.args));
              }
            }
          } else if (rec.customType === 'session_exit') {
            currentStatus = 'idle';
          }
        }
      }

      // No carregamento inicial, limita as atividades antigas para não saturar a linha do tempo
      const activitiesToAdd = !tracker.live && newActivities.length > 50
        ? newActivities.slice(-50)
        : newActivities;

      for (let i = 0; i < activitiesToAdd.length; i++) {
        const act = activitiesToAdd[i];
        const isLast = i === activitiesToAdd.length - 1;
        this.office.addActivity(agentId, act, isLast, { feed: tracker.live });
      }

      this.office.setStatus(agentId, currentStatus);

      this.office.applyTranscript(agentId, {
        title: tracker.title,
        stats: { ...tracker.stats },
        model: tracker.model,
        tasks: tracker.tasks.map((t) => ({ ...t })),
        lastAt: mtimeMs,
      });

      tracker.lastProcessedLine = lines.length;
      tracker.lastMtime = mtimeMs;
      tracker.live = true;
    } catch {
      // Arquivo temporariamente ocupado
    }
  }

  terminalParser(agentId: string): TerminalParser | undefined {
    return this.activeFiles.has(agentId) ? createOmpTerminalParser() : undefined;
  }
}
