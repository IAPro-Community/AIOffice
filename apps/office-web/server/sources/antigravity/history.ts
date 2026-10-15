// Histórico das conversas gravadas pelo Antigravity. O transcript é aberto somente para leitura.
import { existsSync, readdirSync, statSync } from 'node:fs';
import { open } from 'node:fs/promises';
import { basename } from 'node:path';
import { maskSecrets, truncate } from '../../../shared/activity.js';
import type { RecentSession } from '../../../shared/types.js';
import type { HistoryProvider, HistoryResolveResult } from '../source.js';
import { HISTORY_LIMIT } from '../history.js';
import type { TerminalParser } from '../terminal.js';
import { createAntigravityTerminalParser } from './terminal.js';
import type { AntigravityStore } from './paths.js';
import { canonicalTranscript, transcriptPath } from './paths.js';

const SESSION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_AGE_MS = 7 * 24 * 60 * 60_000;
const HEAD_BYTES = 48 * 1024;
const TAIL_BYTES = 48 * 1024;

interface Candidate {
  store: AntigravityStore;
  sessionId: string;
  path: string;
  mtimeMs: number;
  size: number;
}

interface Meta {
  title?: string;
  firstAt?: number;
  lastAt?: number;
}

function timestamp(value: unknown): number | undefined {
  const n = typeof value === 'number' ? value : typeof value === 'string' ? Date.parse(value) : NaN;
  return Number.isFinite(n) ? n : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function parse(lines: string[]): Meta {
  const meta: Meta = {};
  for (const line of lines) {
    try {
      const row: unknown = JSON.parse(line);
      if (!isRecord(row)) continue;
      const at = timestamp(row.created_at);
      if (at !== undefined) {
        meta.firstAt = meta.firstAt === undefined ? at : Math.min(meta.firstAt, at);
        meta.lastAt = Math.max(meta.lastAt ?? at, at);
      }
      if (!meta.title && row.type === 'USER_INPUT' && typeof row.content === 'string' && row.content.trim()) {
        meta.title = truncate(maskSecrets(row.content), 90);
      }
    } catch {
      // A última linha pode estar sendo gravada no momento da leitura.
    }
  }
  return meta;
}

async function readMeta(path: string, size: number): Promise<Meta> {
  const file = await open(path, 'r');
  try {
    const read = async (start: number, length: number): Promise<string> => {
      const buffer = Buffer.alloc(Math.max(0, length));
      const { bytesRead } = await file.read(buffer, 0, buffer.length, start);
      return buffer.toString('utf8', 0, bytesRead);
    };
    if (size <= HEAD_BYTES + TAIL_BYTES) return parse((await read(0, size)).split(/\r?\n/).filter(Boolean));
    const head = (await read(0, HEAD_BYTES)).split(/\r?\n/).slice(0, -1).filter(Boolean);
    const tail = (await read(Math.max(0, size - TAIL_BYTES), TAIL_BYTES)).split(/\r?\n/).slice(1).filter(Boolean);
    return parse([...head, ...tail]);
  } finally {
    await file.close();
  }
}

export interface AntigravityHistoryOptions {
  account: string;
  stores: readonly AntigravityStore[];
  openAgentOf: (account: string, sessionId: string) => string | undefined;
  workspaceOf?: (sessionId: string) => string | undefined;
}

export class AntigravityHistory implements HistoryProvider {
  readonly provider = 'antigravity' as const;
  private readonly cache = new Map<string, { mtimeMs: number; size: number; meta: Meta }>();

  constructor(private readonly opts: AntigravityHistoryOptions) {}

  hasAccount(account: string): boolean {
    return account === this.opts.account;
  }

  async list(): Promise<RecentSession[]> {
    const now = Date.now();
    const candidates = this.candidates(now).sort((a, b) => b.mtimeMs - a.mtimeMs).slice(0, HISTORY_LIMIT);
    const metas = await Promise.all(candidates.map((candidate) => this.metaOf(candidate)));
    const out: RecentSession[] = [];
    candidates.forEach((candidate, i) => {
      const meta = metas[i];
      const agentId = this.opts.openAgentOf(this.opts.account, candidate.sessionId);
      if (!agentId && meta.firstAt === undefined && meta.lastAt === undefined) return;
      const project = this.opts.workspaceOf?.(candidate.sessionId);
      out.push({
        account: this.opts.account,
        provider: 'antigravity',
        sessionId: candidate.sessionId,
        ...(project ? { project, projectDir: basename(project) } : { projectDir: candidate.store.label }),
        ...(meta.title ? { title: meta.title } : {}),
        ...(meta.firstAt !== undefined ? { firstAt: meta.firstAt } : {}),
        lastAt: meta.lastAt ?? candidate.mtimeMs,
        size: candidate.size,
        open: !!agentId,
        ...(agentId ? { agentId } : {}),
      });
    });
    const keep = new Set(candidates.map((candidate) => candidate.path));
    for (const path of this.cache.keys()) if (!keep.has(path)) this.cache.delete(path);
    return out.sort((a, b) => b.lastAt - a.lastAt);
  }

  resolve(account: string, sessionId: string): HistoryResolveResult {
    if (!SESSION_ID.test(sessionId)) return { status: 400, error: 'id de sessão inválido' };
    if (!this.hasAccount(account)) return { status: 404, error: 'conta desconhecida' };
    for (const store of this.opts.stores) {
      const path = transcriptPath(store.brain, sessionId);
      if (!this.isSafeFile(store.brain, path)) continue;
      return { path: canonicalTranscript(store.brain, sessionId, path)!, createParser: createAntigravityTerminalParser };
    }
    return { status: 404, error: 'sessão não encontrada' };
  }

  private candidates(now: number): Candidate[] {
    const out: Candidate[] = [];
    for (const store of this.opts.stores) {
      if (!existsSync(store.brain)) continue;
      let dirs: string[];
      try {
        dirs = readdirSync(store.brain);
      } catch {
        continue;
      }
      for (const sessionId of dirs) {
        if (!SESSION_ID.test(sessionId)) continue;
        const path = transcriptPath(store.brain, sessionId);
        try {
          const info = statSync(path);
          if (!info.isFile() || now - info.mtimeMs > MAX_AGE_MS || !this.isSafeFile(store.brain, path)) continue;
          out.push({ store, sessionId, path: canonicalTranscript(store.brain, sessionId, path)!, mtimeMs: info.mtimeMs, size: info.size });
        } catch {
          // A conversa pode ser removida entre a listagem e o stat.
        }
      }
    }
    return out;
  }

  private isSafeFile(brain: string, path: string): boolean {
    try {
      const sessionId = path.split(/[\\/]/).at(-4);
      return !!sessionId && canonicalTranscript(brain, sessionId, path) !== undefined;
    } catch {
      return false;
    }
  }

  private async metaOf(candidate: Candidate): Promise<Meta> {
    const cached = this.cache.get(candidate.path);
    if (cached && cached.mtimeMs === candidate.mtimeMs && cached.size === candidate.size) return cached.meta;
    let meta: Meta = {};
    try {
      meta = await readMeta(candidate.path, candidate.size);
    } catch {
      // Transcript parcialmente escrito: tenta de novo na próxima listagem.
    }
    this.cache.set(candidate.path, { mtimeMs: candidate.mtimeMs, size: candidate.size, meta });
    return meta;
  }
}
