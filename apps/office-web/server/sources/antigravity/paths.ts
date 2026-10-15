import { realpathSync, statSync } from 'node:fs';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';

/** Resolve antes de autorizar a leitura: um transcript não pode escapar por junction/symlink. */
export function canonicalTranscript(brain: string, sessionId: string, candidate = transcriptPath(brain, sessionId)): string | undefined {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sessionId)) return undefined;
  try {
    const root = realpathSync(brain);
    const expected = realpathSync(transcriptPath(brain, sessionId));
    const actual = realpathSync(resolve(candidate));
    const child = relative(root, actual);
    if (!child || child === '..' || child.startsWith(`..${sep}`) || isAbsolute(child)) return undefined;
    const same = process.platform === 'win32' ? actual.toLowerCase() === expected.toLowerCase() : actual === expected;
    return same && statSync(actual).isFile() ? actual : undefined;
  } catch {
    return undefined;
  }
}

export interface AntigravityStore {
  id: 'app' | 'ide' | 'cli';
  label: string;
  root: string;
  brain: string;
}

/** Diretórios de transcript oficiais do Antigravity App, IDE e CLI. */
export function antigravityStores(home: string): AntigravityStore[] {
  return [
    { id: 'app', label: 'Antigravity', root: join(home, '.gemini', 'antigravity'), brain: join(home, '.gemini', 'antigravity', 'brain') },
    { id: 'ide', label: 'Antigravity IDE', root: join(home, '.gemini', 'antigravity-ide'), brain: join(home, '.gemini', 'antigravity-ide', 'brain') },
    { id: 'cli', label: 'Antigravity CLI', root: join(home, '.gemini', 'antigravity-cli'), brain: join(home, '.gemini', 'antigravity-cli', 'brain') },
  ];
}

export function transcriptPath(brain: string, sessionId: string): string {
  return join(brain, sessionId, '.system_generated', 'logs', 'transcript.jsonl');
}
