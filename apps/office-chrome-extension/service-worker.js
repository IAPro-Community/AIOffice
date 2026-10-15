import {
  normalizePreferences,
  safeNotificationBody,
  shouldNotifyFeedItem,
} from './activity-kinds.js';
import { recoverMissedFeedItems } from './feed-recovery.js';
import {
  normalizeHostMessage,
  normalizeHostState,
  normalizeOfficeSnapshot,
} from './host-state.js';

const HOST_NAME = 'com.iapro.aioffice';
const MAX_SEEN_IDS = 800;
const MAX_FEED_ITEMS = 80;
const MAX_PENDING_NOTIFICATIONS = 100;
const MAX_RECONNECT_ATTEMPTS = 8;
const RECONNECT_ALARM = 'aioffice-native-reconnect';
const NOTIFICATION_ALARM = 'aioffice-notification-retry';

let nativePort = null;
let state = { state: 'starting', message: 'Conectando ao AIOffice…' };
let feed = [];
let notices = [];
let officeSnapshot = { rooms: [], agents: [] };
let seenIds = new Set();
let pendingNotifications = new Map();
let initialized = false;
let nextRequestId = 1;
let connectInFlight = null;
let reconnectAttempt = 0;

async function initialize() {
  if (initialized) return;
  const stored = await chrome.storage.local.get([
    'aiofficeSeenIds',
    'aiofficeFeed',
    'aiofficeNotices',
    'aiofficeGap',
    'aiofficeSnapshot',
    'aiofficePendingNotifications',
  ]);
  seenIds = new Set(Array.isArray(stored.aiofficeSeenIds) ? stored.aiofficeSeenIds : []);
  feed = Array.isArray(stored.aiofficeFeed) ? stored.aiofficeFeed : [];
  notices = Array.isArray(stored.aiofficeNotices) ? stored.aiofficeNotices : [];
  officeSnapshot = normalizeOfficeSnapshot(stored.aiofficeSnapshot);
  pendingNotifications = new Map(
    (Array.isArray(stored.aiofficePendingNotifications) ? stored.aiofficePendingNotifications : [])
      .filter((entry) => entry?.key && entry?.item?.id)
      .map((entry) => [entry.key, entry]),
  );
  if (typeof stored.aiofficeGap === 'string' && stored.aiofficeGap) {
    state = { ...state, gap: stored.aiofficeGap };
  }
  initialized = true;
}

function notifyViews(message) {
  chrome.runtime.sendMessage({ channel: 'aioffice-host', ...message }).catch(() => {});
}

function getSnapshot() {
  return { state, feed, notices, snapshot: officeSnapshot };
}

function nextId() {
  return `chrome-${Date.now().toString(36)}-${(nextRequestId++).toString(36)}`;
}

function postAction(action, startIfStopped, fields = {}) {
  if (!nativePort) return false;
  const { requestId, ...payload } = fields;
  const request = { v: 1, id: requestId || nextId(), action, ...payload };
  if (action === 'connect' && typeof startIfStopped === 'boolean') request.startIfStopped = startIfStopped;
  nativePort.postMessage(request);
  return true;
}

async function saveState() {
  if (seenIds.size > MAX_SEEN_IDS) {
    seenIds = new Set([...seenIds].slice(-MAX_SEEN_IDS));
  }
  await chrome.storage.local.set({
    aiofficeSeenIds: [...seenIds].slice(-MAX_SEEN_IDS),
    aiofficeFeed: feed.slice(0, MAX_FEED_ITEMS),
    aiofficeNotices: notices.slice(0, 30),
    aiofficePendingNotifications: [...pendingNotifications.values()].slice(-MAX_PENDING_NOTIFICATIONS),
  });
}

async function showPendingNotifications() {
  const { preferences = {} } = await chrome.storage.local.get('preferences');
  const prefs = normalizePreferences(preferences);
  for (const [key, pending] of pendingNotifications) {
    const { item } = pending;
    if (pending.kind === 'feed' && !shouldNotifyFeedItem(item, prefs)) {
      pendingNotifications.delete(key);
      continue;
    }
    if (pending.kind === 'notice' && !prefs.noticesEnabled) {
      pendingNotifications.delete(key);
      continue;
    }

    const isFeed = pending.kind === 'feed';
    const title = isFeed
      ? `${item.agentName || 'Agente'} · ${item.activity?.kind || 'atividade'}`
      : 'AIOffice';
    const message = isFeed
      ? safeNotificationBody(item, prefs)
      : String(item.text || 'Novo aviso do escritório');
    try {
      await chrome.notifications.create(`${isFeed ? 'aioffice-feed' : 'aioffice-notice'}-${item.id}`, {
        type: 'basic',
        iconUrl: 'notification.svg',
        title: title.slice(0, 80),
        message: message.slice(0, 240),
        priority: isFeed ? (item.activity?.error ? 2 : 0) : item.level === 'alert' ? 2 : 0,
        requireInteraction: isFeed
          ? item.activity?.kind === 'ask' || item.activity?.kind === 'error'
          : item.level === 'alert' || item.level === 'warn',
      });
      pendingNotifications.delete(key);
    } catch {
      // Keep the event queued so a transient OS/Chrome notification failure can be retried.
    }
  }
  await saveState();
  if (pendingNotifications.size) {
    await chrome.alarms.create(NOTIFICATION_ALARM, { delayInMinutes: 1 });
  } else {
    await chrome.alarms.clear(NOTIFICATION_ALARM);
  }
}

async function acceptFeed(message) {
  const items = Array.isArray(message.items) ? message.items : [];
  const fresh = [];
  if (message.initial) {
    const recovered = recoverMissedFeedItems(items, feed, seenIds);
    fresh.push(...recovered.fresh);
    if (recovered.gap) {
      state = { ...state, gap: 'A extensão ficou desconectada e parte do histórico pode ter expirado. Os eventos disponíveis foram recuperados.' };
      await chrome.storage.local.set({ aiofficeGap: state.gap });
      notifyViews({ type: 'gap', message: state.gap });
    }
  }

  for (const item of items) {
    if (!item?.id) continue;
    if (!message.initial && !seenIds.has(item.id)) {
      fresh.push(item);
    }
    seenIds.add(item.id);
  }

  for (const item of fresh) {
    pendingNotifications.set(`feed:${item.id}`, { key: `feed:${item.id}`, kind: 'feed', item });
  }
  feed = [...items, ...feed.filter((old) => !items.some((item) => item?.id === old.id))].slice(0, MAX_FEED_ITEMS);
  await saveState();
  notifyViews({ type: 'feed', items: feed, initial: Boolean(message.initial) });
  if (fresh.length || pendingNotifications.size) await showPendingNotifications();
}

async function acceptNotices(message) {
  const items = Array.isArray(message.items) ? message.items : [];
  const fresh = items.filter((item) => item?.id && !seenIds.has(item.id));
  for (const item of items) if (item?.id) seenIds.add(item.id);
  for (const notice of fresh) {
    pendingNotifications.set(`notice:${notice.id}`, { key: `notice:${notice.id}`, kind: 'notice', item: notice });
  }
  notices = [...items, ...notices.filter((old) => !items.some((item) => item?.id === old.id))].slice(0, 30);
  await saveState();
  notifyViews({ type: 'notice', items: notices });
  if (fresh.length || pendingNotifications.size) await showPendingNotifications();
}

function handleNativeMessage(message) {
  if (!message || message.v !== 1) return;
  if (message.type === 'status') {
    const previousState = state.state;
    const normalizedMessage = typeof message.message === 'string' && message.message.trim()
      ? normalizeHostMessage(message.message)
      : { message: message.message, errorCode: undefined };
    state = {
      ...state,
      state: normalizeHostState(message.state),
      version: message.version,
      port: message.port,
      message: normalizedMessage.message,
      errorCode: normalizedMessage.errorCode,
      capabilities: message.capabilities,
    };
    if (state.state === 'ready') {
      reconnectAttempt = 0;
      void chrome.alarms.clear(RECONNECT_ALARM);
    }
    if (state.state === 'ready' && previousState !== 'ready' && state.gap) {
      delete state.gap;
      void chrome.storage.local.remove('aiofficeGap');
      notifyViews({ type: 'gap-cleared' });
    }
    notifyViews({ type: 'status', status: state });
  } else if (message.type === 'feed') {
    void acceptFeed(message).catch(() => {});
  } else if (message.type === 'notice') {
    void acceptNotices(message).catch(() => {});
  } else if (message.type === 'gap') {
    state = { ...state, gap: message.message || 'Alguns eventos podem ter ficado indisponíveis.' };
    void chrome.storage.local.set({ aiofficeGap: state.gap });
    notifyViews({ type: 'gap', message: state.gap });
  } else if (message.type === 'snapshot') {
    officeSnapshot = normalizeOfficeSnapshot(message.snapshot ?? message.data ?? message);
    void chrome.storage.local.set({ aiofficeSnapshot: officeSnapshot });
    notifyViews({ type: 'snapshot', snapshot: officeSnapshot });
  } else if (message.type === 'terminal' || message.type === 'action-result') {
    notifyViews(message);
  }
}

async function scheduleReconnect() {
  const { preferences = {} } = await chrome.storage.local.get('preferences');
  if (!normalizePreferences(preferences).connectOnStartup || reconnectAttempt >= MAX_RECONNECT_ATTEMPTS) return;
  const delayMs = Math.min(30_000 * (2 ** reconnectAttempt), 5 * 60_000);
  reconnectAttempt += 1;
  await chrome.alarms.create(RECONNECT_ALARM, { delayInMinutes: Math.max(0.5, delayMs / 60_000) });
}

async function connect(startIfStopped) {
  await initialize();
  if (nativePort) {
    if (state.state !== 'ready') postAction('connect', startIfStopped);
    return getSnapshot();
  }
  if (connectInFlight) return connectInFlight;

  state = { ...state, state: 'starting', message: 'Iniciando o AIOffice…' };
  notifyViews({ type: 'status', status: state });

  connectInFlight = new Promise((resolve) => {
    try {
      nativePort = chrome.runtime.connectNative(HOST_NAME);
      nativePort.onMessage.addListener(handleNativeMessage);
      nativePort.onDisconnect.addListener(() => {
        const error = chrome.runtime.lastError?.message;
        nativePort = null;
        connectInFlight = null;
        const normalizedError = normalizeHostMessage(error);
        state = error
          ? { ...state, state: 'error', message: normalizedError.message, errorCode: normalizedError.errorCode }
          : { ...state, state: 'error', message: 'A conexão com o serviço AIOffice foi encerrada.' };
        notifyViews({ type: 'status', status: state });
        void scheduleReconnect().catch(() => {});
      });
      const request = { v: 1, id: nextId(), action: 'connect' };
      if (typeof startIfStopped === 'boolean') request.startIfStopped = startIfStopped;
      nativePort.postMessage(request);
      resolve(getSnapshot());
    } catch (error) {
      nativePort = null;
      connectInFlight = null;
      const normalizedError = normalizeHostMessage(error?.message);
      state = { ...state, state: 'error', message: normalizedError.message, errorCode: normalizedError.errorCode };
      notifyViews({ type: 'status', status: state });
      resolve(getSnapshot());
    }
  });
  return connectInFlight;
}

async function handleMessage(message) {
  await initialize();
  switch (message?.type) {
    case 'connect':
      reconnectAttempt = 0;
      void chrome.alarms.clear(RECONNECT_ALARM);
      return connect(typeof message.startIfStopped === 'boolean' ? message.startIfStopped : undefined);
    case 'open':
      return postAction('open') ? { ok: true } : { ok: false, error: 'Conecte ao AIOffice primeiro.' };
    case 'stop':
      return postAction('stop') ? { ok: true } : { ok: false, error: 'Conecte ao AIOffice primeiro.' };
    case 'terminalOpen':
      if (state.state !== 'ready') return { ok: false, error: 'Conecte ao AIOffice primeiro.' };
      return postAction('terminal-open', undefined, { requestId: message.requestId, agentId: message.agentId })
        ? { ok: true }
        : { ok: false, error: 'Conecte ao AIOffice primeiro.' };
    case 'terminalClose':
      return postAction('terminal-close', undefined, { requestId: nextId(), agentId: message.agentId })
        ? { ok: true }
        : { ok: false, error: 'Conecte ao AIOffice primeiro.' };
    case 'agentMessage':
      if (state.state !== 'ready') return { ok: false, error: 'Conecte ao AIOffice primeiro.' };
      return postAction('agent-message', undefined, {
        requestId: message.requestId,
        agentId: message.agentId,
        text: message.text,
      })
        ? { ok: true }
        : { ok: false, error: 'Conecte ao AIOffice primeiro.' };
    case 'getState':
      return getSnapshot();
    case 'clearGap':
      delete state.gap;
      await chrome.storage.local.remove('aiofficeGap');
      notifyViews({ type: 'gap-cleared' });
      return { ok: true };
    case 'savePreferences': {
      const preferences = normalizePreferences(message.preferences);
      await chrome.storage.local.set({ preferences });
      if (!preferences.connectOnStartup) {
        reconnectAttempt = 0;
        void chrome.alarms.clear(RECONNECT_ALARM);
      }
      return { ok: true, preferences };
    }
    default:
      return { ok: false, error: 'Ação desconhecida.' };
  }
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  handleMessage(message).then(sendResponse).catch((error) => {
    sendResponse({ ok: false, error: error?.message || 'Falha inesperada.' });
  });
  return true;
});

chrome.notifications.onClicked.addListener(() => {
  chrome.windows.getLastFocused({ populate: false }, (window) => {
    if (window?.id !== undefined) void chrome.sidePanel.open({ windowId: window.id });
  });
});

chrome.runtime.onInstalled.addListener(() => {
  void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
});

chrome.runtime.onStartup.addListener(() => {
  void chrome.storage.local.get('preferences').then(({ preferences = {} }) => {
    if (normalizePreferences(preferences).connectOnStartup) void connect(false);
  });
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === RECONNECT_ALARM) {
    void connect(false);
  } else if (alarm.name === NOTIFICATION_ALARM) {
    void showPendingNotifications().catch(() => {});
  }
});

chrome.action.onClicked.addListener((tab) => {
  if (tab?.windowId !== undefined) void chrome.sidePanel.open({ windowId: tab.windowId });
});

void initialize();
