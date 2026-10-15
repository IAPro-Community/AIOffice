import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { createProviderTools } from '../provider-tools.mjs';

const WINDOWS_TRIPLE = 'x86_64-pc-windows-msvc';
const OMP_ORIGIN = 'https://d4c085d38fe197a3f20bbeb20222b8b3.r2.cloudflarestorage.com';

async function context(t, overrides = {}) {
  const rootDir = await mkdtemp(join(tmpdir(), 'aioffice-provider-test-'));
  t.after(() => rm(rootDir, { recursive: true, force: true }));
  const calls = [];
  const events = [];
  const runner = async (command, args, options) => {
    calls.push({ command, args, options });
    if (args[0] === '--version') return { stdout: 'codex-cli 1.2.3\n' };
    const id = args.includes('@openai/codex@latest') ? 'codex' : 'claude';
    const binary = id === 'codex' ? join(options.cwd, 'node_modules', '@openai', 'codex-win32-x64', 'vendor', WINDOWS_TRIPLE, 'bin', 'codex.exe')
      : join(options.cwd, 'node_modules', '@anthropic-ai', 'claude-code-win32-x64', 'claude.exe');
    await mkdir(dirname(binary), { recursive: true });
    await writeFile(binary, 'native binary fixture');
    return { stdout: '' };
  };
  const tools = createProviderTools({ rootDir, npmCli: join(rootDir, 'npm-cli.js'), platform: 'win32', arch: 'x64',
    env: { Path: 'C:\\system', HOME: rootDir, NPM_TOKEN: 'secret', OPENAI_API_KEY: 'secret', NPM_CONFIG_REGISTRY: 'https://attacker.test/' },
    runCommand: runner, onProgress: (event) => events.push(event), ...overrides });
  return { rootDir, calls, events, tools, runner };
}

function ompFetch({ contents = Buffer.from('native fixture'), metadataChange, binaryChange, redirect } = {}) {
  const metadata = { build: { version: '1.2.3' }, file: { name: 'omp-windows-x64.exe', size: contents.length, sha256: createHash('sha256').update(contents).digest('hex') },
    download: `${OMP_ORIGIN}/ompcast/builds/omp/build-id/omp-windows-x64.exe?signature=fixture` };
  metadataChange?.(metadata);
  return async (url, options) => {
    assert.equal(options.redirect, 'manual');
    assert.equal(options.credentials, 'omit');
    if (url.startsWith('https://build.stencil.so/api/')) return Response.json(metadata);
    if (redirect) return new Response(null, { status: 302, headers: { location: redirect } });
    return new Response(binaryChange ?? contents, { headers: { 'content-length': String((binaryChange ?? contents).length) } });
  };
}

test('only allowlisted IDs are accepted, with no installer effects', async (t) => {
  const { tools, calls, rootDir } = await context(t);
  for (const value of ['__proto__', 'constructor', '../codex', '@openai/codex', ['codex'], null]) {
    await assert.rejects(tools.install(value), { code: 'INVALID_PROVIDER' });
  }
  assert.deepEqual(calls, []);
  assert.deepEqual(await readdir(rootDir), []);
  assert.equal((await tools.list()).length, 3);
});

test('Codex npm install is private, ignores scripts and ambient npm config, and uses Electron as Node', async (t) => {
  const { tools, calls, events, rootDir } = await context(t);
  assert.deepEqual(await tools.install('codex'), { id: 'codex', version: '1.2.3', installed: true, restartRequired: true });
  const npm = calls[0];
  assert.equal(npm.command, process.execPath);
  assert.ok(npm.args.includes('--ignore-scripts'));
  assert.ok(npm.args.includes('--include=optional'));
  assert.ok(npm.args.includes('--registry=https://registry.npmjs.org/'));
  assert.ok(!npm.args.includes('-g'));
  assert.equal(npm.options.env.ELECTRON_RUN_AS_NODE, '1');
  for (const secret of ['NPM_TOKEN', 'OPENAI_API_KEY', 'NPM_CONFIG_REGISTRY']) assert.equal(npm.options.env[secret], undefined);
  assert.ok(npm.options.cwd.startsWith(join(rootDir, 'codex', '.stage-')));
  assert.equal(calls[1].args[0], '--version');
  assert.equal(calls[1].options.env.ELECTRON_RUN_AS_NODE, undefined);
  const bins = await tools.executables();
  assert.ok(bins.codex.startsWith(join(rootDir, 'codex', 'current')));
  const env = await tools.environment({ NPM_CONFIG_PREFIX: 'maestro', HABBLAUD_CODEX_BIN: 'explicit-codex' });
  assert.equal(env.NPM_CONFIG_PREFIX, 'maestro');
  assert.equal(env.HABBLAUD_CODEX_BIN, 'explicit-codex');
  assert.equal(events.at(-1).state, 'installed');
  assert.equal((await tools.list())[0].installed, true);
  assert.ok(!(await readdir(join(rootDir, 'codex'))).some((name) => name.startsWith('.')));
});

test('Claude resolves its optional native package without executing postinstall or a Node launcher', async (t) => {
  const { tools, calls } = await context(t);
  await tools.install('claude');
  assert.ok(calls[0].args.includes('@anthropic-ai/claude-code@latest'));
  assert.ok(calls[1].command.endsWith(join('@anthropic-ai', 'claude-code-win32-x64', 'claude.exe')));
  assert.equal((await tools.environment({})).HABBLAUD_CLAUDE_BIN, (await tools.executables()).claude);
});

test('OMP verifies SHA-256 before execution and updates only the child PATH', async (t) => {
  const { tools, calls, rootDir } = await context(t, { fetchImpl: ompFetch() });
  await tools.install('omp');
  assert.equal(calls.length, 1);
  assert.ok(calls[0].command.endsWith('omp.exe'));
  const env = await tools.environment({ Path: 'C:\\one', PATH: 'C:\\two', NPM_CONFIG_PREFIX: 'maestro' });
  assert.equal(env.Path, undefined);
  assert.equal(env.PATH, `${join(rootDir, 'omp', 'current', 'bin')};C:\\one;C:\\two`);
  assert.equal(env.NPM_CONFIG_PREFIX, 'maestro');
});

test('a corrupt OMP download never executes and preserves the working installation', async (t) => {
  const first = await context(t, { fetchImpl: ompFetch() });
  await first.tools.install('omp');
  const oldBinary = (await first.tools.executables()).omp;
  const events = [];
  let executions = 0;
  const second = createProviderTools({ rootDir: first.rootDir, platform: 'win32', arch: 'x64', onProgress: (event) => events.push(event),
    fetchImpl: ompFetch({ binaryChange: Buffer.alloc(Buffer.byteLength('native fixture')) }), runCommand: async () => { executions++; return { stdout: '1.2.3' }; } });
  await assert.rejects(second.install('omp'), { code: 'CHECKSUM_MISMATCH' });
  assert.equal(executions, 0);
  assert.equal(await readFile(oldBinary, 'utf8'), 'native fixture');
  assert.equal((await second.list()).find((entry) => entry.id === 'omp').installed, true);
  assert.equal(events.at(-1).errorCode, 'CHECKSUM_MISMATCH');
  assert.deepEqual(await readdir(join(first.rootDir, 'omp')), ['current']);
});

test('OMP rejects insecure metadata, untrusted download hosts, wrong target and missing checksums', async (t) => {
  const changes = [
    (meta) => { meta.download = 'http://build.stencil.so/d/omp/b/omp-windows-x64.exe'; },
    (meta) => { meta.download = 'https://attacker.test/ompcast/builds/omp/b/omp-windows-x64.exe'; },
    (meta) => { meta.download = `${OMP_ORIGIN}:444/ompcast/builds/omp/b/omp-windows-x64.exe`; },
    (meta) => { meta.download = `https://user:pass@${new URL(OMP_ORIGIN).hostname}/ompcast/builds/omp/b/omp-windows-x64.exe`; },
    (meta) => { meta.file.name = 'omp-darwin-arm64'; },
    (meta) => { meta.file.sha256 = 'invalid'; },
    (meta) => { meta.file.size = 900 * 1024 * 1024; },
    (meta) => { meta.build.version = '../../evil'; },
  ];
  for (const metadataChange of changes) {
    const { tools, calls } = await context(t, { fetchImpl: ompFetch({ metadataChange }) });
    await assert.rejects(tools.install('omp'), (error) => ['UNSAFE_URL', 'INVALID_METADATA'].includes(error.code));
    assert.equal(calls.length, 0);
  }
});

test('OMP rejects a redirect to an untrusted host before following it', async (t) => {
  const { tools, calls } = await context(t, { fetchImpl: ompFetch({ redirect: 'https://attacker.test/binary.exe' }) });
  await assert.rejects(tools.install('omp'), { code: 'UNSAFE_URL' });
  assert.equal(calls.length, 0);
});

test('download size mismatch is rejected and staged files are removed', async (t) => {
  const { tools, rootDir, calls } = await context(t, { fetchImpl: ompFetch({ binaryChange: Buffer.from('short') }) });
  await assert.rejects(tools.install('omp'), { code: 'SIZE_MISMATCH' });
  assert.equal(calls.length, 0);
  assert.deepEqual(await readdir(join(rootDir, 'omp')), []);
});

test('failed native verification preserves the previous npm provider version', async (t) => {
  const first = await context(t);
  await first.tools.install('codex');
  const binary = (await first.tools.executables()).codex;
  const second = createProviderTools({ rootDir: first.rootDir, npmCli: join(first.rootDir, 'npm-cli.js'), platform: 'win32', arch: 'x64', runCommand: async (...args) => {
    if (args[1][0] === '--version') throw new Error('private raw error with a secret');
    return first.runner(...args);
  } });
  await assert.rejects(second.install('codex'), { code: 'INSTALL_FAILED' });
  assert.equal(await readFile(binary, 'utf8'), 'native binary fixture');
  assert.equal((await second.list())[0].installed, true);
  assert.ok(!(await second.list())[0].error.includes('secret'));
  assert.deepEqual(await readdir(join(first.rootDir, 'codex')), ['current']);
});

test('installation is single-flight; cancellation aborts work and allows retry', async (t) => {
  let started;
  const ready = new Promise((resolve) => { started = resolve; });
  let attempts = 0;
  const ctx = await context(t, { runCommand: async (...args) => {
    if (attempts++) return ctx.runner(...args);
    const { signal } = args[2];
    started();
    await new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true }));
  } });
  const { tools, rootDir } = ctx;
  const operation = tools.install('codex');
  await ready;
  await assert.rejects(tools.install('claude'), { code: 'BUSY' });
  tools.cancel();
  await assert.rejects(operation, { code: 'CANCELLED' });
  assert.deepEqual(await readdir(join(rootDir, 'codex')), []);
  assert.equal((await tools.install('codex')).installed, true);
});

test('deadline and an already-aborted caller signal cancel work', async (t) => {
  const pending = async (_command, _args, { signal }) => new Promise((_resolve, reject) => {
    if (signal.aborted) reject(signal.reason);
    else signal.addEventListener('abort', () => reject(signal.reason), { once: true });
  });
  const { tools } = await context(t, { timeoutMs: 25, runCommand: pending });
  await assert.rejects(tools.install('codex'), { code: 'TIMEOUT' });
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(tools.install('claude', { signal: controller.signal }), { code: 'CANCELLED' });
});

test('manifest traversal is ignored and unsupported targets fail before IO', async (t) => {
  const { rootDir, tools } = await context(t);
  await mkdir(join(rootDir, 'codex', 'current'), { recursive: true });
  await writeFile(join(rootDir, 'outside.exe'), 'fixture');
  await writeFile(join(rootDir, 'codex', 'current', 'aioffice-provider.json'), JSON.stringify({ id: 'codex', platform: 'win32', arch: 'x64', version: '1.2.3', binary: '../../outside.exe' }));
  assert.deepEqual(await tools.executables(), {});
  const other = createProviderTools({ rootDir, platform: 'freebsd', arch: 'x64' });
  assert.ok((await other.list()).every((entry) => !entry.canInstall && !entry.supported));
  await assert.rejects(other.install('omp'), { code: 'UNSUPPORTED' });
});

test('Linux arm64 musl and macOS x64 use the official OMP target identifiers', async (t) => {
  for (const [platform, arch, musl, expected] of [['linux', 'arm64', true, 'linux-musl-arm64'], ['darwin', 'x64', false, 'macos-x86_64']]) {
    const { rootDir } = await context(t);
    let requested;
    const tools = createProviderTools({ rootDir, platform, arch, musl, fetchImpl: async (url) => {
      requested = url;
      return new Response(null, { status: 503 });
    } });
    await assert.rejects(tools.install('omp'), { code: 'DOWNLOAD_FAILED' });
    assert.equal(requested, `https://build.stencil.so/api/products/omp/latest/${expected}?channel=stable`);
  }
});

test('a provider directory junction cannot redirect installation or cleanup', async (t) => {
  const { rootDir, tools } = await context(t);
  const elsewhere = await mkdtemp(join(tmpdir(), 'aioffice-provider-elsewhere-'));
  t.after(() => rm(elsewhere, { recursive: true, force: true }));
  await writeFile(join(elsewhere, 'keep.txt'), 'must remain');
  await symlink(elsewhere, join(rootDir, 'codex'), process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(tools.install('codex'), { code: 'UNSAFE_DIRECTORY' });
  assert.equal(await readFile(join(elsewhere, 'keep.txt'), 'utf8'), 'must remain');
  assert.deepEqual(await readdir(elsewhere), ['keep.txt']);
});

test('a successful replacement removes backup and persists across manager instances', async (t) => {
  const { tools, rootDir } = await context(t);
  await tools.install('codex');
  await tools.install('codex');
  assert.deepEqual(await readdir(join(rootDir, 'codex')), ['current']);
  const reopened = createProviderTools({ rootDir, platform: 'win32', arch: 'x64' });
  const codex = (await reopened.list()).find((entry) => entry.id === 'codex');
  assert.equal(codex.state, 'installed');
  assert.equal(codex.version, '1.2.3');
  assert.equal((await reopened.executables()).codex, (await tools.executables()).codex);
});
