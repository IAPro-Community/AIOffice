import { appendFileSync, existsSync, readdirSync, readFileSync, statSync, watch, type FSWatcher } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { AgentStatus, SourceInfo } from '../../../shared/types.js';
import type { Office } from '../../model/office.js';
import type { AgentSource } from '../source.js';

export class FreebufSource implements AgentSource {
  readonly provider = 'freebuf' as const;
  private readonly sessionsDir: string;
  private watcher: FSWatcher | null = null;
  private pollTimer: NodeJS.Timeout | null = null;
  private activeFiles = new Map<string, string>();
  private knownMtimes = new Map<string, number>();

  constructor(private readonly office: Office) {
    this.sessionsDir = join(homedir(), '.freebuf', 'agent', 'sessions');
  }

  start(): void {
    if (!existsSync(this.sessionsDir)) return;
    this.scan();
    try {
      this.watcher = watch(this.sessionsDir, { recursive: true }, () => {
        this.scan();
      });
    } catch {
      // Fallback para polling
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
    const sessions = this.office.list().filter((a) => a.provider === 'freebuf' && a.status !== 'offline' && a.status !== 'done').length;
    return [{ label: 'Freebuf', provider: 'freebuf', path: this.sessionsDir, sessions, ok }];
  }

  transcriptPathOf(agentId: string): string | undefined {
    return this.activeFiles.get(agentId);
  }

  public scan(): void {
    if (!existsSync(this.sessionsDir)) return;
    try {
      const dirs = readdirSync(this.sessionsDir);
      const now = Date.now();
      const cutoff = now - 24 * 3600 * 1000;

      for (const dirName of dirs) {
        const dirPath = join(this.sessionsDir, dirName);
        if (!statSync(dirPath).isDirectory()) continue;

        const files = readdirSync(dirPath).filter((f) => f.endsWith('.jsonl'));
        for (const fileName of files) {
          const filePath = join(dirPath, fileName);
          const stat = statSync(filePath);
          if (stat.mtimeMs < cutoff) continue;

          const lastMtime = this.knownMtimes.get(filePath);
          if (lastMtime === stat.mtimeMs) continue;
          this.knownMtimes.set(filePath, stat.mtimeMs);

          this.processSessionFile(filePath, stat.mtimeMs);
        }
      }
    } catch {
      // Ignorar erros transitórios
    }
  }

  private processSessionFile(filePath: string, mtimeMs: number): void {
    try {
      const raw = readFileSync(filePath, 'utf-8');
      const lines = raw.trim().split(/\r?\n/).filter(Boolean);
      if (lines.length < 2) return;

      let title = '';
      let cwd = '';
      let sessionId = '';
      let startedAt = mtimeMs;
      let lastActivity: { kind: 'think' | 'tool' | 'respond'; text: string } | null = null;
      let isWorking = false;

      for (const line of lines) {
        try {
          const item = JSON.parse(line);
          if (item.type === 'title') title = item.title;
          if (item.type === 'session') {
            sessionId = item.id;
            cwd = item.cwd;
            startedAt = new Date(item.timestamp).getTime();
          }
          if (item.type === 'message' && item.message) {
            const role = item.message.role;
            const contents = item.message.content || [];
            if (role === 'assistant') {
              isWorking = true;
              for (const c of contents) {
                if (c.type === 'thinking' && typeof c.thinking === 'string') {
                  lastActivity = { kind: 'think', text: c.thinking.slice(0, 120) };
                } else if (c.type === 'tool_use') {
                  lastActivity = { kind: 'tool', text: `${c.name}: ${JSON.stringify(c.input || {}).slice(0, 80)}` };
                } else if (c.type === 'text' && typeof c.text === 'string') {
                  lastActivity = { kind: 'respond', text: c.text.slice(0, 120) };
                  isWorking = false;
                }
              }
            } else if (role === 'user') {
              isWorking = true;
            }
          }
        } catch {
          // Linha ainda incompleta
        }
      }

      if (!sessionId || !cwd) return;

      const agentId = `freebuf:${sessionId}`;
      this.activeFiles.set(agentId, filePath);

      const status: AgentStatus = isWorking ? 'working' : 'idle';

      if (!this.office.has(agentId)) {
        this.office.addMain({
          id: agentId,
          account: 'Freebuf',
          sessionId,
          cwd,
          role: 'Engenheiro (Freebuf)',
          startedAt,
          status,
          provider: 'freebuf',
        });
        const agent = this.office.get(agentId);
        if (agent && title) {
          agent.title = title;
        }
      } else {
        this.office.setStatus(agentId, status);
      }

      if (lastActivity) {
        this.office.addActivity(
          agentId,
          {
            id: `${agentId}#act:${mtimeMs}`,
            at: mtimeMs,
            kind: lastActivity.kind === 'tool' ? 'run' : lastActivity.kind === 'respond' ? 'respond' : 'think',
            icon: lastActivity.kind === 'tool' ? '💻' : lastActivity.kind === 'respond' ? '📨' : '💭',
            text: lastActivity.text,
          },
          true,
        );
      }
    } catch {
      // Arquivo temporariamente ocupado
    }
  }

  public injectMessage(agentId: string, text: string): boolean {
    const filePath = this.activeFiles.get(agentId);
    if (!filePath || !existsSync(filePath)) return false;
    try {
      const msgEntry = {
        type: 'message',
        id: randomBytes(4).toString('hex'),
        timestamp: new Date().toISOString(),
        message: {
          role: 'user',
          content: [{ type: 'text', text }],
        },
      };
      appendFileSync(filePath, '\n' + JSON.stringify(msgEntry) + '\n', 'utf-8');
      this.knownMtimes.set(filePath, Date.now());
      this.office.addActivity(
        agentId,
        {
          id: `${agentId}#usr:${Date.now()}`,
          at: Date.now(),
          kind: 'think',
          icon: '📨',
          text: `[Mensagem]: ${text}`,
        },
        false,
      );
      this.office.setStatus(agentId, 'working');
      return true;
    } catch {
      return false;
    }
  }
}
