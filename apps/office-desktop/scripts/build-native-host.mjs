import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

const appOutDir = process.argv[2];
if (!appOutDir) throw new Error('Pass electron-builder appOutDir as the first argument.');

const projectRoot = resolve(import.meta.dirname, '../../..');
const moduleDir = join(projectRoot, 'apps', 'office-desktop', 'native-host');
const outputPath = join(resolve(appOutDir), 'AIOffice Native Host.exe');
mkdirSync(dirname(outputPath), { recursive: true });

const candidates = [
  process.env.GOEXE,
  'go',
  process.env.ProgramFiles && join(process.env.ProgramFiles, 'Go', 'bin', 'go.exe'),
].filter(Boolean);
let goCommand;
for (const candidate of candidates) {
  const probe = spawnSync(candidate, ['version'], { encoding: 'utf8', windowsHide: true });
  if (!probe.error && probe.status === 0) {
    goCommand = candidate;
    break;
  }
}
if (!goCommand) {
  throw new Error('Go 1.22 or newer is required to package the Windows Native Messaging host. Install Go or add go.exe to PATH.');
}

const result = spawnSync(goCommand, [
  'build',
  '-trimpath',
  '-ldflags=-s -w',
  '-o',
  outputPath,
  '.',
], {
  cwd: moduleDir,
  encoding: 'utf8',
  windowsHide: true,
  env: { ...process.env, GOOS: 'windows', GOARCH: 'amd64', CGO_ENABLED: '0' },
});
if (result.stdout) process.stdout.write(result.stdout);
if (result.stderr) process.stderr.write(result.stderr);
if (result.error) throw result.error;
if (result.status !== 0) throw new Error(`Go failed to build the Windows Native Messaging host (exit ${result.status}).`);
if (!existsSync(outputPath) || statSync(outputPath).size < 100_000) {
  throw new Error('Go reported success but the Native Messaging host executable is missing or unexpectedly small.');
}

process.stdout.write(`Built Windows Native Messaging host: ${outputPath}\n`);
