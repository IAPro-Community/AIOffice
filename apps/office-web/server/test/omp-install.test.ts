import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { EXTENSION_MARKER, ensureOmpBridgeInstalled } from '../../scripts/omp-install';
import { tempDir } from './fixtures';

let tmp: ReturnType<typeof tempDir>;
let root: string;
let home: string;
let sourcePath: string;

beforeEach(() => {
  tmp = tempDir();
  root = join(tmp.dir, 'office-web');
  home = join(tmp.dir, 'user');
  sourcePath = join(root, 'mod', 'omp', 'aioffice-bridge.ts');
  mkdirSync(join(root, 'mod', 'omp'), { recursive: true });
  writeFileSync(sourcePath, `${EXTENSION_MARKER}\nconst HABBLAUD_URL = 'http://127.0.0.1:4747';\n`);
});

afterEach(() => tmp.cleanup());

describe('ponte OMP no perfil instalado', () => {
  it('instala sem Node global e grava a porta configurada; a segunda inicialização não reescreve', () => {
    const first = ensureOmpBridgeInstalled(root, home, 4851);
    expect(first).toMatchObject({ state: 'installed' });
    expect(readFileSync(first.target, 'utf8')).toContain("const HABBLAUD_URL = 'http://127.0.0.1:4851';");
    expect(ensureOmpBridgeInstalled(root, home, 4851)).toEqual({ state: 'current', target: first.target });
    expect(readdirSync(join(home, '.omp', 'agent', 'extensions'))).toEqual(['aioffice-bridge.ts']);
  });

  it('atualiza somente uma cópia identificada e mantém backup da anterior', () => {
    const first = ensureOmpBridgeInstalled(root, home, 4747);
    writeFileSync(sourcePath, `${EXTENSION_MARKER}\nconst HABBLAUD_URL = 'http://127.0.0.1:4747';\n// nova implementação\n`);
    const update = ensureOmpBridgeInstalled(root, home, 4848);
    expect(update).toMatchObject({ state: 'updated' });
    expect(update.backup).toBeDefined();
    expect(existsSync(update.backup!)).toBe(true);
    expect(readFileSync(first.target, 'utf8')).toContain("const HABBLAUD_URL = 'http://127.0.0.1:4848';");
    expect(readFileSync(first.target, 'utf8')).toContain('// nova implementação');
  });

  it('preserva uma extensão global que não pertence ao AIOffice', () => {
    const target = join(home, '.omp', 'agent', 'extensions', 'aioffice-bridge.ts');
    mkdirSync(join(home, '.omp', 'agent', 'extensions'), { recursive: true });
    writeFileSync(target, 'extensão de outra origem');
    expect(ensureOmpBridgeInstalled(root, home, 4747)).toEqual({ state: 'conflict', target });
    expect(readFileSync(target, 'utf8')).toBe('extensão de outra origem');
  });

  it('recusa porta inválida sem escrever arquivo', () => {
    expect(() => ensureOmpBridgeInstalled(root, home, 0)).toThrow(/porta/);
    expect(existsSync(join(home, '.omp', 'agent', 'extensions', 'aioffice-bridge.ts'))).toBe(false);
  });
});
