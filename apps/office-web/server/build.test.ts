import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createBuildReader } from './build';

const dirs: string[] = [];
afterEach(() => dirs.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true })));

describe('createBuildReader', () => {
  it('lê o nome do bundle do index.html e acompanha um build novo', () => {
    const root = mkdtempSync(join(tmpdir(), 'habblaud-build-'));
    dirs.push(root);
    const read = createBuildReader(root);
    expect(read()).toBeUndefined();
    const html = join(root, 'dist', 'client', 'index.html');
    mkdirSync(join(root, 'dist', 'client'), { recursive: true });
    writeFileSync(html, '<script type="module" crossorigin src="/bundle/main-AAA111.js"></script>');
    expect(read()).toBe('main-AAA111');
    writeFileSync(html, '<script type="module" crossorigin src="/bundle/main-BBB222.js"></script>');
    utimesSync(html, new Date(), new Date(Date.now() + 5_000));
    expect(read()).toBe('main-BBB222');
  });
});
