// Histórico local do oh-my-pi: sessões recentes e leitura validada dos transcripts em ~/.omp/agent/sessions.
import { closeSync, existsSync, fstatSync, openSync, readSync, readdirSync, realpathSync, statSync } from 'node:fs';
import { open, readdir, stat } from 'node:fs/promises';
import { basename, join, sep } from 'node:path';
import { truncate } from '../../../shared/activity';
import type { RecentSession } from '../../../shared/types';
import type { HistoryProvider, HistoryResolveResult } from '../source';
import { createOmpTerminalParser } from './terminal';
import { tr } from '../../../shared/i18n';

const HISTORY_DAYS = 7;
const MAX_AGE_MS = HISTORY_DAYS * 24 * 60 * 60_000;
const HISTORY_LIMIT = 150;
const HEAD_BYTES = 64 * 1024;
const TAIL_BYTES = 32 * 1024;
const SESSION_ID = /^[a-z\d_-]{1,128}$/i;

interface Candidate {
  path: string;
  file: string;
  folder: string;
  mtimeMs: number;
  size: number;
}

interface SessionMeta {
  sessionId?: string;
  project?: string;
  title?: string;
  firstAt?: number;
  lastAt?: number;
}

export interface OmpHistoryOptions {
  account: string;
  sessionsDir: string;
  openAgentOf: (account: string, sessionId: string) => string | undefined;
}

/** Histórico recente do OMP. IDs são lidos dos registros da sessão; caminhos nunca vêm da requisição. */
export class OmpHistory implements HistoryProvider {
  readonly provider = 'omp' as const;
  private readonly cache = new Map<string, { mtimeMs: number; size: number; meta: SessionMeta }>();

  constructor(private readonly opts: OmpHistoryOptions) {}

  hasAccount(account: string): boolean {
    return account === this.opts.account;
  }

  async list(): Promise<RecentSession[]> {
    const now = Date.now();
    const candidates = (await this.candidates(now)).sort((a, b) => b.mtimeMs - a.mtimeMs).slice(0, HISTORY_LIMIT);
    const metas = await Promise.all(candidates.map((candidate) => this.metaOf(candidate)));
    const out: RecentSession[] = [];
    candidates.forEach((candidate, i) => {
      const meta = metas[i];
      const sessionId = meta.sessionId;
      if (!sessionId) return;
      const agentId = this.opts.openAgentOf(this.opts.account, sessionId);
      if (!agentId && meta.firstAt === undefined && meta.lastAt === undefined) return;
      const session: RecentSession = {
        account: this.opts.account,
        provider: 'omp',
        sessionId,
        projectDir: meta.project ? basename(meta.project) : candidate.folder,
        lastAt: meta.lastAt ?? candidate.mtimeMs,
        size: candidate.size,
        open: !!agentId,
      };
      if (meta.project) session.project = meta.project;
      if (meta.title) session.title = meta.title;
      if (meta.firstAt !== undefined) session.firstAt = meta.firstAt;
      if (agentId) session.agentId = agentId;
      out.push(session);
    });
    const keep = new Set(candidates.map((candidate) => candidate.path));
    for (const path of this.cache.keys()) if (!keep.has(path)) this.cache.delete(path);
    return out.sort((a, b) => b.lastAt - a.lastAt);
  }

  resolve(account: string, sessionId: string): HistoryResolveResult {
    if (!SESSION_ID.test(sessionId)) return { status: 400, error: tr('id de sessão inválido') };
    if (!this.hasAccount(account)) return { status: 404, error: tr('conta desconhecida') };
    const root = this.root();
    if (!root) return { status: 404, error: tr('sessão não encontrada') };
    try {
      for (const entry of readdirSync(root, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        const folder = join(root, entry.name);
        for (const file of readdirSync(folder)) {
          if (!file.endsWith('.jsonl') || !file.includes(sessionId)) continue;
          const path = join(folder, file);
          if (!this.isSafeFile(root, path)) continue;
          const meta = readMetaSync(path);
          if (meta.sessionId === sessionId) return { path, createParser: createOmpTerminalParser };
        }
      }
    } catch {
      // A sessão pode terminar ou ser removida durante a busca.
    }
    return { status: 404, error: tr('sessão não encontrada') };
  }

  private root(): string | undefined {
    try {
      return realpathSync(this.opts.sessionsDir);
    } catch {
      return undefined;
    }
  }

  private isSafeFile(root: string, path: string): boolean {
    try {
      const real = realpathSync(path);
      return real.startsWith(root + sep) && statSync(real).isFile();
    } catch {
      return false;
    }
  }

  private async candidates(now: number): Promise<Candidate[]> {
    const out: Candidate[] = [];
    if (!existsSync(this.opts.sessionsDir)) return out;
    let folders: string[];
    try {
      folders = (await readdir(this.opts.sessionsDir, { withFileTypes: true })).filter((entry) => entry.isDirectory()).map((entry) => entry.name);
    } catch {
      return out;
    }
    for (const folder of folders) {
      let files: string[];
      try {
        files = await readdir(join(this.opts.sessionsDir, folder));
      } catch {
        continue;
      }
      for (const file of files) {
        if (!file.endsWith('.jsonl')) continue;
        const path = join(this.opts.sessionsDir, folder, file);
        try {
          const info = await stat(path);
          if (!info.isFile() || now - info.mtimeMs > MAX_AGE_MS) continue;
          out.push({ path, file, folder, mtimeMs: info.mtimeMs, size: info.size });
        } catch {
          // Sumiu durante a listagem.
        }
      }
    }
    return out;
  }

  private async metaOf(candidate: Candidate): Promise<SessionMeta> {
    const cached = this.cache.get(candidate.path);
    if (cached && cached.mtimeMs === candidate.mtimeMs && cached.size === candidate.size) return cached.meta;
    let meta: SessionMeta = {};
    try {
      meta = await readMeta(candidate.path, candidate.size);
    } catch {
      // Um arquivo parcialmente gravado será lido na próxima consulta.
    }
    this.cache.set(candidate.path, { mtimeMs: candidate.mtimeMs, size: candidate.size, meta });
    return meta;
  }
}

async function readMeta(path: string, size: number): Promise<SessionMeta> {
  const fh = await open(path, 'r');
  try {
    const read = async (start: number, length: number): Promise<string> => {
      const buffer = Buffer.alloc(Math.max(0, length));
      const { bytesRead } = await fh.read(buffer, 0, buffer.length, start);
      return buffer.toString('utf8', 0, bytesRead);
    };
    const head = size <= HEAD_BYTES + TAIL_BYTES ? split(await read(0, size)) : split(await read(0, HEAD_BYTES)).slice(0, -1);
    const tail = size <= HEAD_BYTES + TAIL_BYTES ? head : split(await read(size - TAIL_BYTES, TAIL_BYTES)).slice(1);
    return extractMeta(head, tail);
  } finally {
    await fh.close();
  }
}

function readMetaSync(path: string): SessionMeta {
  let fd: number | undefined;
  try {
    fd = openSync(path, 'r');
    const size = fstatSync(fd).size;
    const read = (start: number, length: number): string => {
      const buffer = Buffer.alloc(Math.max(0, length));
      const bytesRead = readSync(fd!, buffer, 0, buffer.length, start);
      return buffer.toString('utf8', 0, bytesRead);
    };
    const head = size <= HEAD_BYTES + TAIL_BYTES ? split(read(0, size)) : split(read(0, HEAD_BYTES)).slice(0, -1);
    const tail = size <= HEAD_BYTES + TAIL_BYTES ? head : split(read(size - TAIL_BYTES, TAIL_BYTES)).slice(1);
    return extractMeta(head, tail);
  } catch {
    return {};
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}

function split(text: string): string[] {
  return text.split('\n').map((line) => line.replace(/\r$/, '')).filter((line) => line.trim());
}

function timestamp(value: unknown): number | undefined {
  const time = typeof value === 'number' ? value : typeof value === 'string' ? Date.parse(value) : NaN;
  return Number.isFinite(time) ? time : undefined;
}

function extractMeta(head: string[], tail: string[]): SessionMeta {
  const meta: SessionMeta = {};
  let firstPrompt: string | undefined;
  const parser = createOmpTerminalParser();
  for (const line of [...head, ...(tail === head ? [] : tail)]) {
    try {
      const event = JSON.parse(line);
      if (event.type === 'session') {
        if (typeof event.id === 'string') meta.sessionId = event.id;
        if (typeof event.cwd === 'string' && event.cwd.trim()) meta.project = event.cwd;
        meta.firstAt ??= timestamp(event.timestamp);
      } else if (event.type === 'title' && typeof event.title === 'string') {
        meta.title = event.title;
      }
      if (event.type === 'message') {
        const message = event.message;
        const at = timestamp(message?.timestamp) ?? timestamp(event.timestamp);
        if (at !== undefined) {
          meta.firstAt ??= at;
          meta.lastAt = Math.max(meta.lastAt ?? at, at);
        }
        if (!firstPrompt) firstPrompt = parser.push(line).find((entry) => entry.kind === 'user')?.text;
      }
    } catch {
      // Linha truncada entre as janelas de leitura.
    }
  }
  if (!meta.title && firstPrompt) meta.title = truncate(firstPrompt, 90);
  return meta;
}
