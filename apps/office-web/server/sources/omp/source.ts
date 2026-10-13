import { existsSync, readdirSync, readFileSync, statSync, watch, type FSWatcher } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { AgentStatus, SourceInfo } from '../../../shared/types.js';
import type { DetectedAccount } from '../../accounts/detect.js';
import type { AccountsService } from '../../accounts/service.js';
import type { Office } from '../../model/office.js';
import type { AgentSource } from '../source.js';
import { createOmpTerminalParser } from './terminal';
import type { TerminalParser } from '../terminal';
import { tr } from '../../../shared/i18n.js';

export class OmpSource implements AgentSource {
  readonly provider = 'omp' as const;
  readonly sessionsDir: string;
  private watcher: FSWatcher | null = null;
  private pollTimer: NodeJS.Timeout | null = null;
  private activeFiles = new Map<string, string>();
  private knownMtimes = new Map<string, number>();
  readonly accountId: string;

  constructor(private readonly office: Office, accounts: AccountsService) {
    this.sessionsDir = join(homedir(), '.omp', 'agent', 'sessions');
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

          const lastMtime = this.knownMtimes.get(filePath);
          if (lastMtime === stat.mtimeMs) continue;
          this.knownMtimes.set(filePath, stat.mtimeMs);

          this.processSessionFile(filePath, stat.mtimeMs);
        }
      }
    } catch {
      // Ignorar erros transitórios de leitura enquanto arquivos estão sendo gravados
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
      let lastActivity: { id: string; kind: 'think' | 'tool' | 'respond'; text: string } | null = null;
      let isWorking = false;

      for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
        const line = lines[lineIndex];
        try {
          const item = JSON.parse(line);
          if (item.type === 'title' && typeof item.title === 'string') title = item.title;
          if (item.type === 'session') {
            if (typeof item.id === 'string') sessionId = item.id;
            if (typeof item.cwd === 'string') cwd = item.cwd;
            const timestamp = Date.parse(item.timestamp);
            if (Number.isFinite(timestamp)) startedAt = timestamp;
          }
          if (item.type === 'message' && item.message) {
            const role = item.message.role;
            const contents = item.message.content || [];
            const eventId = typeof item.id === 'string' ? item.id : `${mtimeMs}:${lineIndex}`;
            if (role === 'assistant') {
              isWorking = true;
              for (let blockIndex = 0; blockIndex < contents.length; blockIndex++) {
                const c = contents[blockIndex];
                if (c.type === 'thinking' && typeof c.thinking === 'string') {
                  lastActivity = { id: `${eventId}:thinking:${blockIndex}`, kind: 'think', text: c.thinking.slice(0, 120) };
                } else if (c.type === 'toolCall') {
                  const name = typeof c.name === 'string' ? c.name : tr('ferramenta');
                  lastActivity = { id: typeof c.id === 'string' ? c.id : `${eventId}:tool:${blockIndex}`, kind: 'tool', text: name.slice(0, 120) };
                } else if (c.type === 'text' && typeof c.text === 'string') {
                  lastActivity = { id: `${eventId}:text:${blockIndex}`, kind: 'respond', text: c.text.slice(0, 120) };
                  isWorking = false;
                }
              }
            } else if (role === 'user') {
              isWorking = true;
            } else if (role === 'toolResult') {
              isWorking = true;
              const toolName = typeof item.message.toolName === 'string' ? item.message.toolName : tr('ferramenta');
              lastActivity = { id: `${eventId}:result`, kind: 'tool', text: tr('{0} terminou', [toolName.slice(0, 100)]) };
            }
          }
        } catch {
          // Linha ainda incompleta
        }
      }

      if (!sessionId || !cwd) return;

      const agentId = `omp:${sessionId}`;
      this.activeFiles.set(agentId, filePath);

      const status: AgentStatus = isWorking ? 'working' : 'idle';

      if (!this.office.has(agentId)) {
        this.office.addMain({
          id: agentId,
          account: this.accountId,
          sessionId,
          cwd,
          role: 'Engenheiro (oh-my-pi)',
          startedAt,
          status,
          provider: 'omp',
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
            id: `${agentId}#act:${lastActivity.id}`,
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

  terminalParser(agentId: string): TerminalParser | undefined {
    return this.activeFiles.has(agentId) ? createOmpTerminalParser() : undefined;
  }
}
