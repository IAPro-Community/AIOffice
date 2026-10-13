// Identificador do build do cliente compilado (dist/client): o nome do bundle principal, que muda a cada
// `npm run build`. Vai no snapshot para que páginas abertas antes de uma atualização percebam e se recarreguem.
import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const BUNDLE = /bundle\/(main-[\w-]+)\.js/;

/** Lê o id do build a partir do index.html compilado (com cache pela data de modificação). */
export function createBuildReader(rootDir: string): () => string | undefined {
  const file = join(rootDir, 'dist', 'client', 'index.html');
  let mtime = -1;
  let id: string | undefined;
  return () => {
    try {
      const m = statSync(file).mtimeMs;
      if (m !== mtime) {
        mtime = m;
        id = BUNDLE.exec(readFileSync(file, 'utf8'))?.[1];
      }
    } catch {
      mtime = -1;
      id = undefined;
    }
    return id;
  };
}
