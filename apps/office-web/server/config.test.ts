import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { readPackage } from './config';

const temporary: string[] = [];

function tempRoot(): string {
  const dir = mkdtempSync(join(tmpdir(), 'aioffice-config-'));
  temporary.push(dir);
  return dir;
}

function writeJson(path: string, value: unknown): void {
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value)}\n`);
}

afterEach(() => {
  for (const dir of temporary.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('readPackage', () => {
  it('usa versão e repositório do produto AIOffice quando roda no monorepo', () => {
    const root = tempRoot();
    const app = join(root, 'apps', 'office-web');
    writeJson(join(root, 'package.json'), {
      name: 'aioffice',
      version: '2.0.0',
      repository: { type: 'git', url: 'https://github.com/IAPro-Community/AIOffice.git' },
    });
    writeJson(join(app, 'package.json'), {
      name: 'habblaud',
      version: '0.10.0',
      repository: 'marmottajr/habblaud',
    });

    expect(readPackage(app)).toEqual({ version: '2.0.0', repo: 'IAPro-Community/AIOffice' });
  });

  it('mantém a versão e o repositório upstream em instalação standalone', () => {
    const app = join(tempRoot(), 'habblaud');
    writeJson(join(app, 'package.json'), {
      name: 'habblaud',
      version: '0.10.0',
      repository: 'marmottajr/habblaud',
    });

    expect(readPackage(app)).toEqual({ version: '0.10.0', repo: 'marmottajr/habblaud' });
  });
});
