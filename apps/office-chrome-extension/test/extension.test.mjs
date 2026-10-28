import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import vm from 'node:vm';
import {
  ACTIVITY_KINDS,
  DEFAULT_PREFERENCES,
  normalizePreferences,
  safeNotificationBody,
  shouldNotifyFeedItem,
} from '../activity-kinds.js';
import {
  hostSupportsStop,
  normalizeHostMessage,
  normalizeHostState,
  normalizeOfficeSnapshot,
} from '../host-state.js';
import { recoverMissedFeedItems } from '../feed-recovery.js';
import { groupFeedByProject, listProjects } from '../feed-view.js';
import { avatarInitial, avatarSourceAgent } from '../avatar-fallback.js';
import { agentIdentityContext } from '../agent-identity.js';
import { validateNativeRequest } from '../../office-desktop/native-messaging-protocol.mjs';

const extensionDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

test('uses the AIOffice brand artwork for extension and toolbar icons at Chrome sizes', async () => {
  const manifest = JSON.parse(await readFile(path.join(extensionDir, 'manifest.json'), 'utf8'));
  for (const size of ['16', '32', '48', '128']) {
    const iconPath = `icon-${size}.png`;
    assert.equal(manifest.icons[size], iconPath);
    assert.equal(manifest.action.default_icon[size], iconPath);
    const icon = await readFile(path.join(extensionDir, iconPath));
    assert.deepEqual([...icon.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
    assert.equal(icon.readUInt32BE(16), Number(size));
    assert.equal(icon.readUInt32BE(20), Number(size));
  }
});

test('includes every shared ActivityKind with notifications enabled by default', async () => {
  const sharedTypes = await readFile(path.resolve(extensionDir, '../../apps/office-web/shared/types.ts'), 'utf8');
  const block = sharedTypes.match(/export type ActivityKind\s*=([\s\S]*?);/);
  assert.ok(block, 'shared ActivityKind declaration exists');
  const sharedKinds = [...block[1].matchAll(/'([^']+)'/g)].map((match) => match[1]);
  assert.deepEqual([...ACTIVITY_KINDS].sort(), [...sharedKinds].sort());
  assert.ok(ACTIVITY_KINDS.every((kind) => DEFAULT_PREFERENCES.activityKinds[kind] === true));
});

test('fills missing preferences safely and keeps detail disabled by default', () => {
  const normalized = normalizePreferences({ activityKinds: { prompt: false }, noticesEnabled: false });
  assert.equal(normalized.activityKinds.prompt, false);
  assert.equal(normalized.activityKinds.error, true);
  assert.equal(normalized.noticesEnabled, false);
  assert.equal(normalized.includeDetails, false);
  assert.equal(normalized.connectOnStartup, true);
});

test('routes only enabled known activity kinds to notifications', () => {
  const item = { id: 'a1', activity: { kind: 'error' } };
  assert.equal(shouldNotifyFeedItem(item, {}), true);
  assert.equal(shouldNotifyFeedItem(item, { activityKinds: { error: false } }), false);
  assert.equal(shouldNotifyFeedItem({ ...item, activity: { kind: 'unknown' } }, {}), false);
  assert.equal(shouldNotifyFeedItem({ activity: { kind: 'error' } }, {}), false);
});

test('uses metadata by default and sanitizes optional details', () => {
  const item = { roomName: 'Code\nRoom', activity: { kind: 'run', text: 'npm test\nsecret', detail: '  command\u0000 output  ' } };
  assert.equal(safeNotificationBody(item, {}), 'Code Room · Comando');
  assert.equal(safeNotificationBody(item, { includeDetails: true }), 'Code Room · npm test secret · command output');
});

test('keeps the stopped host state distinct from a connection error', () => {
  assert.equal(normalizeHostState('stopped'), 'stopped');
  assert.equal(normalizeHostState('ready'), 'ready');
  assert.equal(normalizeHostState('unknown'), 'error');
});

test('localizes Chrome missing-host errors into actionable Portuguese guidance', () => {
  const normalized = normalizeHostMessage('Specified native messaging host not found.');
  assert.equal(normalized.errorCode, 'native-host-missing');
  assert.match(normalized.message, /Instale ou repare o AIOffice Desktop/);
  assert.doesNotMatch(normalized.message, /Specified native messaging host not found/i);
});

test('Native Messaging permits only validated agent conversation actions', () => {
  assert.equal(validateNativeRequest({ v: 1, id: 'a1', action: 'agent-message', agentId: '.codex:thread', text: 'Revisar o build' }), undefined);
  assert.equal(validateNativeRequest({ v: 1, id: 'a2', action: 'terminal-open', agentId: '.claude:123' }), undefined);
  assert.match(validateNativeRequest({ v: 1, id: 'a3', action: 'agent-message', agentId: '../other', text: 'run' }), /Identificador de agente inválido/);
  assert.match(validateNativeRequest({ v: 1, id: 'a4', action: 'agent-message', agentId: 'agent', text: ' ' }), /instrução precisa/);
});

test('allows service shutdown only when the host explicitly advertises the capability', () => {
  assert.equal(hostSupportsStop(undefined), false);
  assert.equal(hostSupportsStop([]), false);
  assert.equal(hostSupportsStop(['open']), false);
  assert.equal(hostSupportsStop(['stop']), true);
  assert.equal(hostSupportsStop({ stop: true }), true);
  assert.equal(hostSupportsStop({ stop: false }), false);
});

test('keeps only the supported minimal office snapshot fields', () => {
  assert.deepEqual(normalizeOfficeSnapshot({
    version: 'ignored',
    rooms: [{ name: 'Build\nRoom', path: 'ignored' }, { name: '' }],
    meta: { terminal: true, messages: true, build: 'ignored' },
    agents: [{ id: 'agent:1', name: 'Agent\u0000 One', roomName: 'Build Room', status: 'working', provider: 'codex', kind: 'main', seed: 73, look: 'f', parts: { hair: '#d9dbe0', script: 'ignored' }, canMessage: true, token: 'ignored' }],
    accounts: [{ id: '.codex', short: 'X', name: 'Conta Codex', provider: 'codex', plan: 'Pro', sessions: 2, usageStatus: 'ok', color: '#4fd18b', email: 'ignored', configDir: 'ignored', usage: { source: 'codex', fetchedAt: 1_700_000_000_000, fiveHour: { utilization: 42, resetsAt: 1_700_000_300_000 }, token: 'ignored' } }, null, { id: '../invalid', name: 'Ignored' }],
  }), {
    rooms: [{ name: 'Build Room' }],
    agents: [{ id: 'agent:1', name: 'Agent One', roomName: 'Build Room', status: 'working', provider: 'codex', kind: 'main', seed: 73, look: 'f', parts: { hair: '#d9dbe0' }, canMessage: true }],
    accounts: [{ id: '.codex', short: 'X', name: 'Conta Codex', sessions: 2, usageStatus: 'ok', provider: 'codex', plan: 'Pro', color: '#4fd18b', usage: { source: 'codex', fetchedAt: 1_700_000_000_000, fiveHour: { utilization: 42, resetsAt: 1_700_000_300_000 } } }],
    meta: { terminal: true, messages: true },
  });
});

test('shows supplied project and provider labels without inventing missing values', () => {
  assert.deepEqual(agentIdentityContext({ roomName: '  Payments API  ', provider: 'codex' }), {
    projectName: 'Payments API',
    providerName: 'codex',
  });
  assert.deepEqual(agentIdentityContext({ roomName: '', provider: undefined }), {
    projectName: undefined,
    providerName: undefined,
  });
});

test('renders a stable avatar seed when an event has no matching agent snapshot', () => {
  const first = avatarSourceAgent(undefined, { id: 'codex:session-42', name: 'Jonas' });
  const repeated = avatarSourceAgent(undefined, { id: 'codex:session-42', name: 'Jonas' });
  const other = avatarSourceAgent(undefined, { id: 'codex:session-43', name: 'Jonas' });

  assert.ok(Number.isInteger(first.seed));
  assert.equal(first.seed, repeated.seed);
  assert.notEqual(first.seed, other.seed);
  assert.equal(first.name, 'Jonas');
  assert.equal(avatarInitial(first.name), 'J');
  assert.equal(avatarInitial(''), 'A');
});

test('keeps the official appearance seed and synthesizes one only when it is missing', () => {
  const official = avatarSourceAgent({ id: 'agent:1', name: 'Clara', seed: 23, kind: 'sub', look: 'f' });
  const recovered = avatarSourceAgent({ id: 'agent:2', name: 'Jonas', seed: -1 });

  assert.deepEqual(official, { id: 'agent:1', name: 'Clara', seed: 23, kind: 'sub', look: 'f' });
  assert.ok(Number.isInteger(recovered.seed));
  assert.equal(recovered.seed >= 0 && recovered.seed <= 0xffffffff, true);
});

test('groups and filters feed items by their project room, then orders projects and events by recency', () => {
  const items = [
    { id: 'a1', roomName: 'Alpha', account: 'codex', activity: { kind: 'run', at: 10 } },
    { id: 'b1', roomName: 'Beta', account: 'claude', activity: { kind: 'edit', at: 30 } },
    { id: 'a2', roomName: 'Alpha', account: 'claude', activity: { kind: 'edit', at: 20 } },
  ];
  assert.deepEqual(listProjects(items, [{ name: 'Gamma' }]), ['Alpha', 'Beta', 'Gamma']);
  assert.deepEqual(groupFeedByProject(items).map(({ name, items: events }) => [name, events.map(({ id }) => id)]), [
    ['Beta', ['b1']],
    ['Alpha', ['a2', 'a1']],
  ]);
  assert.deepEqual(groupFeedByProject(items, { project: 'Alpha', kind: 'edit' }).map(({ items: events }) => events.map(({ id }) => id)), [['a2']]);
  assert.deepEqual(groupFeedByProject([{ id: 'unknown', activity: { at: 1 } }]).map(({ name }) => name), ['Sem projeto']);
});

test('recovers unseen events after Chrome was closed and flags an expired feed cursor', () => {
  const previous = [
    { id: 'old', activity: { at: 10 } },
    { id: 'last-seen', activity: { at: 20 } },
  ];
  const recovered = recoverMissedFeedItems([
    { id: 'last-seen', activity: { at: 20 } },
    { id: 'new-a', activity: { at: 30 } },
  ], previous, ['old', 'last-seen']);
  assert.deepEqual(recovered, { fresh: [{ id: 'new-a', activity: { at: 30 } }], gap: false });

  const expired = recoverMissedFeedItems([
    { id: 'new-a', activity: { at: 30 } },
    { id: 'new-b', activity: { at: 40 } },
  ], previous, ['old', 'last-seen']);
  assert.deepEqual(expired, {
    fresh: [{ id: 'new-a', activity: { at: 30 } }, { id: 'new-b', activity: { at: 40 } }],
    gap: true,
  });
  assert.deepEqual(recoverMissedFeedItems([{ id: 'first', activity: { at: 1 } }], [], []), { fresh: [], gap: false });
});

async function createServiceWorkerHarness(initialStorage = {}, { failNotificationAttempts = 0 } = {}) {
  const listeners = { startup: [], messages: [], nativeMessages: [], notificationsClicked: [], installed: [], actionClicked: [], alarms: [] };
  const storage = { ...initialStorage };
  const notifications = [];
  const alarms = new Map();
  let nativeConnections = 0;
  let notificationAttempts = 0;
  let latestDisconnectListeners = [];
  const nativeRequests = [];
  const viewMessages = [];
  const event = (collection) => ({ addListener: (listener) => collection.push(listener) });
  const chrome = {
    storage: {
      local: {
        async get(keys) {
          const selected = Array.isArray(keys) ? keys : [keys];
          return Object.fromEntries(selected.map((key) => [key, storage[key]]).filter(([, value]) => value !== undefined));
        },
        async set(values) { Object.assign(storage, values); },
        async remove(keys) { for (const key of Array.isArray(keys) ? keys : [keys]) delete storage[key]; },
      },
    },
    runtime: {
      onStartup: event(listeners.startup),
      onInstalled: event(listeners.installed),
      onMessage: event(listeners.messages),
      sendMessage: async (message) => { viewMessages.push(message); },
      connectNative() {
        nativeConnections += 1;
        latestDisconnectListeners = [];
        return {
          onMessage: event(listeners.nativeMessages),
          onDisconnect: event(latestDisconnectListeners),
          postMessage(message) { nativeRequests.push(message); },
        };
      },
      lastError: undefined,
    },
    notifications: {
      onClicked: event(listeners.notificationsClicked),
      async create(id, options) {
        notificationAttempts += 1;
        if (notificationAttempts <= failNotificationAttempts) throw new Error('OS notifications temporarily unavailable');
        notifications.push({ id, options });
      },
    },
    alarms: {
      onAlarm: event(listeners.alarms),
      async create(name, schedule) { alarms.set(name, schedule); },
      async clear(name) { return alarms.delete(name); },
    },
    windows: { getLastFocused: (_options, callback) => callback({ id: 1 }) },
    sidePanel: { setPanelBehavior: async () => {}, open: async () => {} },
    action: { onClicked: event(listeners.actionClicked) },
  };

  const source = await readFile(path.join(extensionDir, 'service-worker.js'), 'utf8');
  const workerSource = source.replace(/^import \{[\s\S]*?\} from '[^']+';\r?\n/gm, '');
  vm.runInNewContext(workerSource, {
    chrome,
    normalizePreferences,
    safeNotificationBody,
    shouldNotifyFeedItem,
    recoverMissedFeedItems,
    normalizeHostState,
    normalizeHostMessage,
    normalizeOfficeSnapshot,
  }, { filename: 'service-worker.js' });

  return {
    listeners,
    notifications,
    alarms,
    storage,
    nativeRequests,
    viewMessages,
    triggerDisconnect(message = 'Native host disconnected') {
      chrome.runtime.lastError = { message };
      for (const listener of latestDisconnectListeners) listener();
      chrome.runtime.lastError = undefined;
    },
    get nativeConnections() { return nativeConnections; },
  };
}

async function waitForWorkerTurn() {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

test('service worker reconnects on Chrome startup and notifies each fresh feed item once', async () => {
  const harness = await createServiceWorkerHarness();
  const { listeners, notifications } = harness;

  listeners.startup[0]();
  await waitForWorkerTurn();
  assert.equal(harness.nativeConnections, 1, 'Chrome startup should connect the background host without opening the panel');

  const feedMessage = listeners.nativeMessages[0];
  const item = { id: 'activity-1', agentName: 'Maestro', roomName: 'Build', activity: { kind: 'error' } };
  feedMessage({ v: 1, type: 'feed', items: [item], initial: false });
  await waitForWorkerTurn();
  assert.equal(notifications.length, 1, 'a fresh enabled feed item should create a notification');
  assert.match(notifications[0].options.title, /Maestro/);

  feedMessage({ v: 1, type: 'feed', items: [item], initial: false });
  await waitForWorkerTurn();
  assert.equal(notifications.length, 1, 'a duplicate feed item should not notify twice');
});

test('Chrome startup auto-connect can be disabled in extension preferences', async () => {
  const harness = await createServiceWorkerHarness({ preferences: { connectOnStartup: false } });
  harness.listeners.startup[0]();
  await waitForWorkerTurn();
  assert.equal(harness.nativeConnections, 0);
});

test('Chrome startup connects without requesting a visible start; panel can opt in', async () => {
  const harness = await createServiceWorkerHarness();
  harness.listeners.startup[0]();
  await waitForWorkerTurn();
  assert.equal(harness.nativeRequests[0].action, 'connect');
  assert.equal(harness.nativeRequests[0].startIfStopped, false);

  const sendWorkerMessage = (message) => new Promise((resolve) => {
    harness.listeners.messages[0](message, {}, resolve);
  });
  await sendWorkerMessage({ type: 'connect', startIfStopped: true });
  assert.equal(harness.nativeRequests[1].startIfStopped, true);
  await sendWorkerMessage({ type: 'connect' });
  assert.equal(Object.hasOwn(harness.nativeRequests[2], 'startIfStopped'), false);
});

test('service worker forwards only the explicit terminal and agent-message actions', async () => {
  const harness = await createServiceWorkerHarness();
  harness.listeners.startup[0]();
  await waitForWorkerTurn();
  harness.listeners.nativeMessages[0]({ v: 1, type: 'status', state: 'ready' });
  await waitForWorkerTurn();
  const sendWorkerMessage = (message) => new Promise((resolve) => harness.listeners.messages[0](message, {}, resolve));
  assert.equal((await sendWorkerMessage({ type: 'agentMessage', requestId: 'request-1', agentId: 'agent:1', text: 'Verificar os testes' })).ok, true);
  assert.deepEqual(JSON.parse(JSON.stringify(harness.nativeRequests.at(-1))), { v: 1, id: 'request-1', action: 'agent-message', agentId: 'agent:1', text: 'Verificar os testes' });
  assert.equal((await sendWorkerMessage({ type: 'terminalOpen', requestId: 'request-2', agentId: 'agent:1' })).ok, true);
  assert.deepEqual(JSON.parse(JSON.stringify(harness.nativeRequests.at(-1))), { v: 1, id: 'request-2', action: 'terminal-open', agentId: 'agent:1' });

  harness.listeners.nativeMessages[0]({ v: 1, type: 'terminal', requestId: 'request-2', agentId: 'agent:1', event: 'init', data: { entries: [] } });
  harness.listeners.nativeMessages[0]({ v: 1, type: 'action-result', requestId: 'request-1', action: 'agent-message', agentId: 'agent:1', ok: true });
  await waitForWorkerTurn();
  assert.ok(harness.viewMessages.some((message) => message.type === 'terminal' && message.agentId === 'agent:1'));
  assert.ok(harness.viewMessages.some((message) => message.type === 'action-result' && message.action === 'agent-message'));
});

test('native host not-found status is localized before the panel receives it', async () => {
  const harness = await createServiceWorkerHarness();
  harness.listeners.startup[0]();
  await waitForWorkerTurn();
  harness.listeners.nativeMessages[0]({
    v: 1,
    type: 'status',
    state: 'error',
    message: 'Specified native messaging host not found.',
  });
  await waitForWorkerTurn();
  const statusMessage = harness.viewMessages.filter((message) => message.type === 'status').at(-1);
  assert.equal(statusMessage.status.errorCode, 'native-host-missing');
  assert.match(statusMessage.status.message, /Instale ou repare o AIOffice Desktop/);
  assert.doesNotMatch(statusMessage.status.message, /Specified native messaging host not found/i);
});

test('native snapshots are minimized, persisted, and available to the side panel', async () => {
  const harness = await createServiceWorkerHarness();
  harness.listeners.startup[0]();
  await waitForWorkerTurn();
  harness.listeners.nativeMessages[0]({
    v: 1,
    type: 'snapshot',
    snapshot: {
      rooms: [{ name: 'Build' }],
      meta: { terminal: true, messages: true, build: 'private' },
      agents: [{ id: 'agent:codex', name: 'Codex', roomName: 'Build', status: 'working', provider: 'codex', kind: 'main', seed: 23, look: 'm', canMessage: true, prompt: 'private' }],
      accounts: [{ id: '.codex', short: 'X', name: 'Codex pessoal', provider: 'codex', plan: 'Plus', sessions: 2, usageStatus: 'ok', email: 'private', usage: { source: 'codex', fetchedAt: 1_700_000_000_000, fiveHour: { utilization: 42, resetsAt: 1_700_000_300_000 } } }],
    },
  });
  await waitForWorkerTurn();
  assert.deepEqual(harness.storage.aiofficeSnapshot, {
    rooms: [{ name: 'Build' }],
    agents: [{ id: 'agent:codex', name: 'Codex', roomName: 'Build', status: 'working', provider: 'codex', kind: 'main', seed: 23, look: 'm', parts: undefined, canMessage: true }],
    accounts: [{ id: '.codex', short: 'X', name: 'Codex pessoal', sessions: 2, usageStatus: 'ok', provider: 'codex', plan: 'Plus', usage: { source: 'codex', fetchedAt: 1_700_000_000_000, fiveHour: { utilization: 42, resetsAt: 1_700_000_300_000 } } }],
    meta: { terminal: true, messages: true },
  });
  assert.ok(harness.viewMessages.some((message) => message.type === 'snapshot'));

  const state = await new Promise((resolve) => harness.listeners.messages[0]({ type: 'getState' }, {}, resolve));
  assert.deepEqual(state.snapshot, harness.storage.aiofficeSnapshot);
});

test('failed OS notification stays queued and retries from a Chrome alarm', async () => {
  const harness = await createServiceWorkerHarness({}, { failNotificationAttempts: 1 });
  harness.listeners.startup[0]();
  await waitForWorkerTurn();
  const item = { id: 'retry-me', agentName: 'Codex', roomName: 'Build', activity: { kind: 'done' } };

  harness.listeners.nativeMessages[0]({ v: 1, type: 'feed', items: [item], initial: false });
  await waitForWorkerTurn();
  assert.equal(harness.notifications.length, 0);
  assert.equal(harness.storage.aiofficePendingNotifications.length, 1);
  assert.ok(harness.alarms.has('aioffice-notification-retry'));

  harness.listeners.alarms[0]({ name: 'aioffice-notification-retry' });
  await waitForWorkerTurn();
  assert.equal(harness.notifications.length, 1);
  assert.equal(harness.storage.aiofficePendingNotifications.length, 0);
});

test('unexpected Native Messaging disconnect reconnects with bounded alarm backoff', async () => {
  const harness = await createServiceWorkerHarness();
  harness.listeners.startup[0]();
  await waitForWorkerTurn();
  harness.triggerDisconnect();
  await waitForWorkerTurn();
  assert.ok(harness.alarms.has('aioffice-native-reconnect'));

  harness.listeners.alarms[0]({ name: 'aioffice-native-reconnect' });
  await waitForWorkerTurn();
  assert.equal(harness.nativeConnections, 2);
});
