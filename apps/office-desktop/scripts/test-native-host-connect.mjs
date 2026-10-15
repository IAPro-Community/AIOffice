import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { normalizeOfficeSnapshot } from '../../office-chrome-extension/host-state.js';

const executable = process.argv[2] ? path.resolve(process.argv[2]) : '';
if (!executable) throw new Error('Informe o caminho do executável Native Messaging host.');

const origin = 'chrome-extension://kcapmchomgbpjgdfdijhlnnjehmhdfdc/';
const request = Buffer.from(JSON.stringify({
  v: 1,
  id: 'local-connect-smoke',
  action: 'connect',
  startIfStopped: false,
}));
const frame = Buffer.allocUnsafe(request.length + 4);
frame.writeUInt32LE(request.length, 0);
request.copy(frame, 4);

const child = spawn(executable, [origin, '--parent-window=0'], {
  env: { ...process.env, HABBLAUD_PORT: process.env.HABBLAUD_PORT || '4747' },
  stdio: ['pipe', 'pipe', 'pipe'],
  windowsHide: true,
});

let buffered = Buffer.alloc(0);
let status;
let snapshot;
let feedCount;
let initialFeed = [];
let timer;
const connected = new Promise((resolve, reject) => {
  timer = setTimeout(() => reject(new Error('O host não conectou ao AIOffice dentro de 10 segundos.')), 10_000);
  child.once('error', () => reject(new Error('O executável Native Messaging host não iniciou.')));
  child.once('close', (code) => {
    if (!status || status.state !== 'ready') reject(new Error(`O host encerrou antes de conectar (código ${code}).`));
  });
  child.stdout.on('data', (chunk) => {
    buffered = Buffer.concat([buffered, chunk]);
    while (buffered.length >= 4) {
      const size = buffered.readUInt32LE(0);
      if (size <= 0 || size > 1024 * 1024) return reject(new Error('O host enviou um frame inválido.'));
      if (buffered.length < size + 4) return;
      const value = JSON.parse(buffered.subarray(4, size + 4).toString('utf8'));
      buffered = buffered.subarray(size + 4);
      if (value.type === 'status' && value.state === 'ready') status = value;
      if (value.type === 'snapshot') snapshot = typeof value.snapshot === 'string' ? JSON.parse(value.snapshot) : value.snapshot;
      if (value.type === 'feed' && value.initial) {
        initialFeed = Array.isArray(value.items) ? value.items : [];
        feedCount = initialFeed.length;
      }
      if (status && snapshot && feedCount !== undefined) {
        clearTimeout(timer);
        resolve({ status, snapshot, feedCount });
      }
    }
  });
});

child.stdin.write(frame);
const result = await connected.catch((error) => {
  child.kill();
  throw error;
});
child.stdin.end();
await new Promise((resolve, reject) => {
  const timeout = setTimeout(() => {
    child.kill();
    reject(new Error('O host não encerrou o smoke test depois da desconexão.'));
  }, 5_000);
  child.once('close', () => {
    clearTimeout(timeout);
    resolve();
  });
});

assert.equal(result.status.state, 'ready');
assert.ok(Array.isArray(result.snapshot.rooms));
assert.ok(Array.isArray(result.snapshot.agents));
assert.equal(typeof result.snapshot.meta?.terminal, 'boolean');
assert.equal(typeof result.snapshot.meta?.messages, 'boolean');
const normalized = normalizeOfficeSnapshot(result.snapshot);
const avatars = normalized.agents.filter((agent) => Number.isInteger(agent.seed)).length;
const matchedEvents = new Set(normalized.agents.map((agent) => agent.id));
const eventsWithAgent = result.feedCount === 0 ? 0 : initialFeed.filter((item) => matchedEvents.has(item.agentId)).length;
process.stdout.write(`Native host conectado ao AIOffice ${result.status.version}; ${result.snapshot.rooms.length} projetos, ${result.snapshot.agents.length} agentes no snapshot (${normalized.agents.length} aceitos pela extensão, ${avatars} com avatar) e ${result.feedCount} eventos iniciais (${eventsWithAgent} associados a agente). Terminal ${result.snapshot.meta.terminal ? 'disponível' : 'indisponível'}; instruções ${result.snapshot.meta.messages ? 'disponíveis' : 'indisponíveis'}.\n`);
