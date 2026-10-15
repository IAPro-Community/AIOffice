import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';

const executable = process.argv[2] ? path.resolve(process.argv[2]) : '';
if (!executable || !existsSync(executable)) throw new Error('Pass the built Native Messaging host executable path.');

const origin = 'chrome-extension://kcapmchomgbpjgdfdijhlnnjehmhdfdc/';
const payload = Buffer.from(JSON.stringify({ v: 1, id: 'package-smoke', action: 'unsupported' }), 'utf8');
const frame = Buffer.allocUnsafe(payload.length + 4);
frame.writeUInt32LE(payload.length, 0);
payload.copy(frame, 4);

const child = spawn(executable, [origin, '--parent-window=0'], {
  env: { ...process.env, HABBLAUD_PORT: '4747' },
  stdio: ['pipe', 'pipe', 'pipe'],
  windowsHide: true,
});
const output = [];
const errors = [];
child.stdout.on('data', (chunk) => output.push(chunk));
child.stderr.on('data', (chunk) => errors.push(chunk));
child.stdin.end(frame);

const exitCode = await new Promise((resolve, reject) => {
  const timeout = setTimeout(() => {
    child.kill();
    reject(new Error('Native Messaging host did not exit after stdin closed.'));
  }, 5000);
  child.once('error', (error) => {
    clearTimeout(timeout);
    reject(error);
  });
  child.once('close', (code) => {
    clearTimeout(timeout);
    resolve(code);
  });
});

assert.equal(exitCode, 0, `host exited unexpectedly: ${Buffer.concat(errors).toString('utf8')}`);
const bytes = Buffer.concat(output);
assert.ok(bytes.length >= 4, `host wrote no framed response: ${Buffer.concat(errors).toString('utf8')}`);
const responseSize = bytes.readUInt32LE(0);
assert.equal(bytes.length, responseSize + 4, 'stdout must contain exactly one Native Messaging frame');
const response = JSON.parse(bytes.subarray(4).toString('utf8'));
assert.equal(response.v, 1);
assert.equal(response.type, 'status');
assert.equal(response.state, 'error');
process.stdout.write('Native Messaging executable framing smoke test passed.\n');
