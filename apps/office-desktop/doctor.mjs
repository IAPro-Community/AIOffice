import { accessSync, constants, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { delimiter, join } from 'node:path';

function findOnPath(name) {
  const directories = (process.env.PATH ?? '').split(delimiter).filter(Boolean);
  const extensions = process.platform === 'win32' ? (process.env.PATHEXT ?? '.EXE;.CMD;.BAT').split(';') : [''];
  for (const directory of directories) {
    for (const extension of extensions) {
      const candidate = join(directory, `${name}${extension}`);
      try {
        if (!existsSync(candidate)) continue;
        if (process.platform !== 'win32') accessSync(candidate, constants.X_OK);
        return candidate;
      } catch { /* Continue searching PATH. */ }
    }
  }
  return undefined;
}

console.log(`AIOffice desktop diagnostics — ${process.platform} ${process.arch}`);
console.log(`Bundled Node.js runtime: ${process.version}`);
for (const [label, executable] of [['Claude Code', 'claude'], ['Codex CLI', 'codex']]) {
  console.log(`${label}: ${findOnPath(executable) ?? 'not detected on PATH (optional; install and authenticate separately)'}`);
}
console.log(`oh-my-pi sessions: ${existsSync(join(homedir(), '.omp', 'agent', 'sessions')) ? 'found' : 'not found (session monitoring stays idle until OMP creates sessions)'}`);
console.log('PATH detection does not verify an agent CLI login or subscription.');
