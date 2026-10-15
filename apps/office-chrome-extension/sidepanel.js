import {
  ACTIVITY_KINDS,
  ACTIVITY_LABELS,
  normalizePreferences,
} from './activity-kinds.js';
import { ALL_FILTER, groupFeedByProject, listProjects, activityLabel } from './feed-view.js';
import { avatarInitial, avatarSourceAgent } from './avatar-fallback.js';
import { hostSupportsStop } from './host-state.js';
import { agentIdentityContext } from './agent-identity.js';

const $ = (selector) => document.querySelector(selector);
const els = {
  pill: $('#connection-pill'),
  connectionLabel: $('#connection-label'),
  connectionTitle: $('#connection-title'),
  connectionMessage: $('#connection-message'),
  progress: $('#progress-track'),
  startupNote: $('#startup-note'),
  onboarding: $('#onboarding-card'),
  connectButton: $('#connect-button'),
  openButton: $('#open-button'),
  stopButton: $('#stop-button'),
  roomList: $('#room-list'),
  rosterCount: $('#roster-count'),
  rosterEmpty: $('#roster-empty'),
  feed: $('#feed-list'),
  feedCount: $('#feed-count'),
  projectFilter: $('#project-filter'),
  activityFilter: $('#activity-filter'),
  empty: $('#empty-state'),
  gap: $('#gap-banner'),
  gapMessage: $('#gap-message'),
  clearGap: $('#clear-gap'),
  categoryList: $('#category-list'),
  toggleAll: $('#toggle-all'),
  connectOnStartup: $('#connect-on-startup'),
  includeDetails: $('#include-details'),
  noticesEnabled: $('#notices-enabled'),
  version: $('#version-label'),
  feedback: $('#action-feedback'),
  agentDialog: $('#agent-dialog'),
  dialogAvatar: $('#dialog-avatar'),
  dialogTitle: $('#agent-dialog-title'),
  dialogMeta: $('#dialog-meta'),
  closeAgentDialog: $('#close-agent-dialog'),
  terminalNote: $('#terminal-note'),
  terminalList: $('#terminal-list'),
  messageForm: $('#message-form'),
  messageInput: $('#message-input'),
  sendMessage: $('#send-message'),
  messageStatus: $('#message-status'),
};

let preferences = normalizePreferences();
let feedItems = [];
let notices = [];
let officeSnapshot = { rooms: [], agents: [] };
let currentState = { state: 'starting' };
let feedbackTimer;
let activeAgentId = null;
let activeMessageRequestId = null;
let renderedReadiness;

function send(type, extra = {}) {
  return chrome.runtime.sendMessage({ type, ...extra });
}

function setFeedback(message) {
  els.feedback.textContent = message || '';
  clearTimeout(feedbackTimer);
  if (message) feedbackTimer = setTimeout(() => { els.feedback.textContent = ''; }, 4000);
}

function renderState() {
  const isReady = currentState.state === 'ready';
  const readinessChanged = renderedReadiness !== isReady;
  renderedReadiness = isReady;
  const isStopped = currentState.state === 'stopped';
  const isError = currentState.state === 'error';
  const busy = !isReady && !isError && !isStopped;
  const version = currentState.version ? ` ${currentState.version}` : '';
  els.pill.dataset.state = currentState.state || 'starting';
  els.connectionLabel.textContent = isReady ? `Conectado${version}` : isStopped ? 'Parado' : isError ? 'Desconectado' : 'Iniciando';
  els.connectionTitle.textContent = isReady ? `AIOffice${version} conectado` : isStopped ? 'Serviço encerrado' : isError ? 'Não foi possível conectar' : 'Preparando sua conexão';
  els.connectionMessage.textContent = currentState.message || (isReady ? 'Feed ao vivo ativo neste navegador.' : isStopped ? 'O serviço está parado. Conecte novamente para iniciá-lo.' : 'Iniciando o AIOffice…');
  els.progress.hidden = !busy;
  els.startupNote.hidden = !busy;
  els.connectButton.disabled = busy || isReady;
  els.connectButton.textContent = isError ? 'Tentar novamente' : isReady ? 'Conectado' : isStopped ? 'Iniciar serviço' : 'Conectar / iniciar';
  els.openButton.disabled = !isReady;
  const canStop = isReady && hostSupportsStop(currentState.capabilities);
  els.stopButton.hidden = !canStop;
  els.stopButton.disabled = !canStop;
  els.version.textContent = currentState.version ? `AIOffice ${currentState.version}` : 'AIOffice Desktop';
  els.onboarding.hidden = !(isError && (currentState.errorCode === 'native-host-missing' || looksLikeMissingHost(currentState.message)));
  if (currentState.gap && els.gap.hidden) showGap(currentState.gap);
  if (readinessChanged && els.roomList.children.length) renderOffice();
  if (readinessChanged) syncActiveAgentConsole();
}

function showGap(message) {
  els.gapMessage.textContent = message || 'Pode haver uma lacuna no histórico de eventos. Abra o AIOffice para conferir o feed completo.';
  els.gap.hidden = false;
}

function looksLikeMissingHost(message = '') {
  return /host|native|nativo|instal|not found|not registered|specified native messaging host/i.test(message);
}

function renderFeed() {
  const recent = feedItems.slice(-50);
  const groups = groupFeedByProject(recent, {
    project: els.projectFilter.value || ALL_FILTER,
    kind: els.activityFilter.value || ALL_FILTER,
  });
  const count = groups.reduce((total, group) => total + group.items.length, 0);
  els.feedCount.textContent = `${count} ${count === 1 ? 'evento' : 'eventos'}`;
  els.empty.hidden = count > 0;
  els.empty.querySelector('p').textContent = recent.length && !count
    ? 'Nenhuma atividade corresponde a esses filtros.'
    : 'Quando os agentes trabalharem, as atividades aparecerão neste painel.';
  els.feed.replaceChildren(...groups.map(renderProjectGroup));
}

function renderOffice() {
  const agents = Array.isArray(officeSnapshot.agents) ? officeSnapshot.agents : [];
  const groups = new Map();

  for (const room of Array.isArray(officeSnapshot.rooms) ? officeSnapshot.rooms : []) {
    if (room?.name && !groups.has(room.name)) groups.set(room.name, []);
  }
  for (const agent of agents) {
    const roomName = agent.roomName || 'Sem sala';
    if (!groups.has(roomName)) groups.set(roomName, []);
    groups.get(roomName).push(agent);
  }

  const entries = [...groups.entries()];
  els.rosterCount.textContent = `${agents.length} ${agents.length === 1 ? 'agente' : 'agentes'} · ${entries.length} ${entries.length === 1 ? 'sala' : 'salas'}`;
  els.rosterEmpty.hidden = entries.length > 0;
  els.roomList.replaceChildren(...entries.map(([roomName, roomAgents]) => renderRoom(roomName, roomAgents)));
  renderFilters();
  renderFeed();
  syncActiveAgentConsole();
}

function renderFilters() {
  const project = els.projectFilter.value || ALL_FILTER;
  const projects = listProjects(feedItems.slice(-50), officeSnapshot.rooms);
  els.projectFilter.replaceChildren(createOption(ALL_FILTER, 'Todos os projetos'));
  for (const name of projects) els.projectFilter.append(createOption(name, name));
  if (projects.includes(project)) els.projectFilter.value = project;

  const kind = els.activityFilter.value || ALL_FILTER;
  els.activityFilter.replaceChildren(createOption(ALL_FILTER, 'Todos os tipos'));
  for (const value of ACTIVITY_KINDS) els.activityFilter.append(createOption(value, ACTIVITY_LABELS[value] || value));
  if (ACTIVITY_KINDS.includes(kind)) els.activityFilter.value = kind;
}

function createOption(value, label) {
  const option = document.createElement('option');
  option.value = value;
  option.textContent = label;
  return option;
}

function renderRoom(roomName, agents) {
  const room = document.createElement('li');
  room.className = 'room-card';

  const heading = document.createElement('div');
  heading.className = 'room-heading';
  const title = document.createElement('span');
  title.className = 'room-name';
  title.textContent = roomName;
  const count = document.createElement('span');
  count.className = 'room-count';
  count.textContent = `${agents.length} ${agents.length === 1 ? 'agente' : 'agentes'}`;
  heading.append(title, count);
  room.append(heading);

  if (!agents.length) {
    const empty = document.createElement('p');
    empty.className = 'room-empty';
    empty.textContent = 'Nenhum agente presente';
    room.append(empty);
    return room;
  }

  const list = document.createElement('ul');
  list.className = 'agent-list';
  for (const agent of agents) {
    const row = document.createElement('li');
    row.className = 'agent-row';
    const avatar = createAgentAvatar(agent, 'roster-avatar');
    const identity = document.createElement('span');
    identity.className = 'agent-identity';
    const name = document.createElement('span');
    name.className = 'agent-name';
    name.textContent = agent.name || 'Agente';
    const contextLabels = agentIdentityContext(agent);
    const context = document.createElement('span');
    context.className = 'agent-context';
    if (contextLabels.projectName) {
      const project = document.createElement('span');
      project.className = 'agent-project';
      project.textContent = contextLabels.projectName;
      project.title = contextLabels.projectName;
      context.append(project);
    }
    if (contextLabels.providerName) {
      const provider = document.createElement('span');
      provider.className = 'agent-provider';
      provider.textContent = contextLabels.providerName;
      provider.title = contextLabels.providerName;
      context.append(provider);
    }
    identity.append(name);
    if (context.childElementCount) identity.append(context);
    const status = document.createElement('span');
    status.className = 'agent-status';
    status.textContent = statusLabel(agent.status);
    const actions = document.createElement('span');
    actions.className = 'agent-actions';
    const terminal = document.createElement('button');
    terminal.className = 'agent-action';
    terminal.type = 'button';
    terminal.textContent = 'Terminal';
    terminal.disabled = currentState.state !== 'ready' || !officeSnapshot.meta?.terminal;
    terminal.title = terminal.disabled ? 'Terminal indisponível nesta instância do AIOffice' : `Abrir terminal de ${agent.name}`;
    terminal.setAttribute('aria-label', `Abrir terminal de ${agent.name}`);
    terminal.addEventListener('click', () => openAgentConsole(agent, false));
    const message = document.createElement('button');
    message.className = 'agent-action agent-action-primary';
    message.type = 'button';
    message.textContent = 'Instrução';
    message.disabled = !canMessage(agent);
    message.title = message.disabled ? 'Este agente não está disponível para mensagens agora' : `Enviar instrução para ${agent.name}`;
    message.setAttribute('aria-label', `Enviar instrução para ${agent.name}`);
    message.addEventListener('click', () => openAgentConsole(agent, true));
    actions.append(terminal, message);
    row.append(avatar, identity, status, actions);
    list.append(row);
  }
  room.append(list);
  return room;
}

function safeStatus(status) {
  return ['working', 'waiting', 'shell', 'idle', 'done', 'offline'].includes(status) ? status : 'offline';
}

function statusLabel(status) {
  const labels = { working: 'Trabalhando', waiting: 'Aguardando', shell: 'Comando', idle: 'Livre', done: 'Concluído', offline: 'Offline' };
  return labels[status] || 'Offline';
}

function renderProjectGroup(group) {
  const section = document.createElement('section');
  section.className = 'project-group';
  const heading = document.createElement('h3');
  heading.className = 'project-heading';
  const name = document.createElement('span');
  name.className = 'project-name';
  name.textContent = group.name;
  const count = document.createElement('span');
  count.className = 'project-count';
  count.textContent = `${group.items.length}`;
  heading.append(name, count);
  const list = document.createElement('ol');
  list.className = 'feed-list';
  for (const item of group.items) list.append(renderFeedItem(item));
  section.append(heading, list);
  return section;
}

function renderFeedItem(item) {
  const activity = item.activity || {};
  const li = document.createElement('li');
  li.className = 'feed-item';
  li.dataset.kind = activity.kind || 'other';

  const agent = findAgent(item.agentId);
  li.append(createAgentAvatar(agent, 'feed-avatar', { id: item.agentId, name: item.agentName }));

  const main = document.createElement('div');
  main.className = 'feed-main';
  const top = document.createElement('div');
  top.className = 'feed-topline';
  const title = document.createElement('p');
  title.className = 'feed-title';
  title.textContent = item.agentName || agent?.name || 'Agente';
  const time = document.createElement('time');
  time.className = 'feed-time';
  const timestamp = Number(activity.at);
  if (Number.isFinite(timestamp) && timestamp > 0) {
    time.dateTime = new Date(timestamp).toISOString();
    time.textContent = formatRelativeTime(timestamp);
  }
  top.append(title, time);

  const meta = document.createElement('p');
  meta.className = 'feed-meta';
  const contextLabels = agentIdentityContext({
    roomName: agent?.roomName || item.roomName,
    provider: agent?.provider || item.account,
  });
  if (contextLabels.projectName) {
    const project = document.createElement('span');
    project.className = 'feed-project';
    project.textContent = contextLabels.projectName;
    project.title = contextLabels.projectName;
    meta.append(project);
  }
  if (contextLabels.providerName) {
    const provider = document.createElement('span');
    provider.className = 'feed-provider';
    provider.textContent = contextLabels.providerName;
    meta.append(provider);
  }
  if (agent) {
    const status = document.createElement('span');
    status.className = 'feed-agent-status';
    status.textContent = statusLabel(agent.status);
    meta.append(status);
  }

  const action = document.createElement('div');
  action.className = 'feed-action';
  const icon = document.createElement('span');
  icon.className = 'feed-icon';
  icon.setAttribute('aria-hidden', 'true');
  icon.textContent = activity.icon || iconFor(activity.kind);
  const description = document.createElement('span');
  description.className = 'feed-description';
  description.textContent = activity.text || activityLabel(activity.kind);
  action.append(icon, description);
  if (meta.childElementCount) main.append(top, meta, action);
  else main.append(top, action);

  if (activity.detail) {
    const detail = document.createElement('p');
    detail.className = 'feed-detail';
    detail.textContent = activity.detail;
    main.append(detail);
  }
  li.append(main);
  return li;
}

function createAgentAvatar(agent, className, fallback = {}) {
  const label = agent?.name || fallback.name || 'Agente';
  const avatar = avatarSourceAgent(agent, fallback);
  const url = globalThis.AIOfficeAvatar?.render(avatar);
  if (!url) {
    const placeholder = document.createElement('div');
    placeholder.className = `${className} avatar-fallback`;
    placeholder.setAttribute('role', 'img');
    placeholder.setAttribute('aria-label', `Avatar de ${label}`);
    placeholder.textContent = avatarInitial(label);
    return placeholder;
  }

  const image = document.createElement('img');
  image.className = className;
  image.alt = '';
  image.setAttribute('aria-hidden', 'true');
  image.draggable = false;
  image.src = url;
  return image;
}

function findAgent(agentId) {
  return officeSnapshot.agents.find((agent) => agent.id === agentId);
}

function canMessage(agent) {
  return Boolean(
    currentState.state === 'ready' &&
    agent?.id &&
    agent.kind !== 'sub' &&
    agent.status !== 'offline' &&
    agent.status !== 'done' &&
    officeSnapshot.meta?.messages &&
    agent.canMessage,
  );
}

function syncActiveAgentConsole() {
  if (!activeAgentId) return;
  const agent = findAgent(activeAgentId);
  const canSend = canMessage(agent);
  els.messageInput.disabled = !canSend;
  els.sendMessage.disabled = !canSend || !els.messageInput.value.trim() || Boolean(activeMessageRequestId);
  if (currentState.state !== 'ready') {
    els.terminalNote.textContent = 'Conexão interrompida. Reconecte o AIOffice para retomar esta sessão e enviar instruções.';
  }
}

function openAgentConsole(agent, focusComposer) {
  if (!agent?.id) return;
  activeAgentId = agent.id;
  activeMessageRequestId = null;
  els.dialogTitle.textContent = agent.name || 'Agente';
  els.dialogMeta.textContent = [agent.roomName || 'Sem projeto', agent.provider || 'AIOffice', statusLabel(agent.status)].filter(Boolean).join(' · ');
  const avatar = globalThis.AIOfficeAvatar?.render(agent);
  els.dialogAvatar.src = avatar || '';
  els.dialogAvatar.hidden = !avatar;
  els.terminalList.replaceChildren();
  els.messageStatus.textContent = '';
  els.messageInput.value = '';
  els.messageInput.disabled = !canMessage(agent);
  els.sendMessage.disabled = !canMessage(agent);
  els.terminalNote.textContent = currentState.state !== 'ready'
    ? 'Conecte o AIOffice para abrir a sessão e enviar instruções.'
    : officeSnapshot.meta?.terminal
    ? 'Carregando o histórico recente e conectando ao vivo…'
    : 'O terminal ao vivo não está habilitado nesta instância. Você ainda pode enviar instrução se o agente aceitar mensagens.';
  if (!els.agentDialog.open) els.agentDialog.showModal();
  if (currentState.state === 'ready' && officeSnapshot.meta?.terminal) {
    void send('terminalOpen', { agentId: agent.id }).then((result) => {
      if (activeAgentId === agent.id && !result?.ok) {
        els.terminalNote.textContent = result?.error || 'Não foi possível abrir o terminal deste agente.';
      }
    }).catch(() => {
      if (activeAgentId === agent.id) els.terminalNote.textContent = 'A conexão com a extensão foi interrompida. Tente novamente.';
    });
  }
  if (focusComposer) requestAnimationFrame(() => els.messageInput.focus());
}

function closeAgentConsole() {
  if (!activeAgentId) return;
  void send('terminalClose', { agentId: activeAgentId });
  activeAgentId = null;
  activeMessageRequestId = null;
}

function renderTerminalEntry(entry, agentName) {
  if (!entry || typeof entry !== 'object') return null;
  const row = document.createElement('li');
  row.className = `terminal-entry terminal-entry-${entry.kind || 'system'}`;
  const heading = document.createElement('p');
  heading.className = 'terminal-entry-label';
  const labels = { user: 'Você', assistant: agentName, thinking: 'Pensando', tool: 'Ação', result: entry.error ? 'Erro da ferramenta' : 'Resultado', system: 'Sistema' };
  heading.textContent = labels[entry.kind] || 'Atividade';
  const content = document.createElement('pre');
  content.className = 'terminal-entry-content';
  if (entry.kind === 'tool') {
    content.textContent = [entry.title, entry.input].filter(Boolean).join('\n');
  } else {
    content.textContent = entry.text || entry.detail || (entry.kind === 'thinking' ? 'O agente está pensando…' : '');
  }
  row.append(heading);
  if (entry.kind === 'thinking' && content.textContent) {
    const details = document.createElement('details');
    const summary = document.createElement('summary');
    summary.textContent = 'Ver pensamento';
    details.append(summary, content);
    row.append(details);
  } else if (content.textContent) row.append(content);
  if (entry.truncated) {
    const clipped = document.createElement('small');
    clipped.className = 'terminal-entry-clipped';
    clipped.textContent = 'Saída reduzida para manter o painel responsivo.';
    row.append(clipped);
  }
  return row;
}

function acceptTerminalEvent(message) {
  if (message.agentId !== activeAgentId) return;
  if (message.event === 'init') {
    els.terminalList.replaceChildren();
    const data = message.data || {};
    const entries = Array.isArray(data.entries) ? data.entries : [];
    appendTerminalEntries(entries);
    els.terminalNote.textContent = data.truncated
      ? 'Exibindo os eventos mais recentes da conversa. O início da sessão foi resumido.'
      : 'Conversa do agente conectada ao vivo.';
  } else if (message.event === 'append' && Array.isArray(message.data)) {
    appendTerminalEntries(message.data);
    if (message.data.length) els.terminalNote.textContent = 'Conversa do agente conectada ao vivo.';
  }
}

function appendTerminalEntries(entries) {
  const name = els.dialogTitle.textContent || 'Agente';
  for (const entry of entries) {
    const row = renderTerminalEntry(entry, name);
    if (row) els.terminalList.append(row);
  }
  while (els.terminalList.children.length > 500) els.terminalList.firstElementChild.remove();
  els.terminalList.scrollTop = els.terminalList.scrollHeight;
}

function iconFor(kind) {
  const glyphs = { prompt: '↳', think: '◌', respond: '↗', read: '⌕', search: '⌕', edit: '✎', write: '＋', run: '›', test: '✓', git: '⑂', web: '◎', browser: '▣', plan: '☷', delegate: '⇢', communicate: '↔', ask: '?', mcp: '⌘', skill: '✦', wait: '◷', error: '!', compact: '↘', done: '✓' };
  return glyphs[kind] || '·';
}

function formatRelativeTime(value) {
  const at = Number(value);
  if (!Number.isFinite(at)) return '';
  const delta = Math.max(0, Date.now() - at);
  if (delta < 60_000) return 'agora';
  if (delta < 3_600_000) return `${Math.floor(delta / 60_000)} min`;
  if (delta < 86_400_000) return `${Math.floor(delta / 3_600_000)} h`;
  return new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(at);
}

function renderPreferences() {
  els.connectOnStartup.checked = preferences.connectOnStartup;
  els.includeDetails.checked = preferences.includeDetails;
  els.noticesEnabled.checked = preferences.noticesEnabled;
  els.categoryList.replaceChildren(...ACTIVITY_KINDS.map((kind) => {
    const label = document.createElement('label');
    label.className = 'category-row';
    const text = document.createElement('span');
    text.textContent = ACTIVITY_LABELS[kind] || kind;
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = preferences.activityKinds[kind];
    input.dataset.kind = kind;
    input.setAttribute('aria-label', `Notificar: ${text.textContent}`);
    label.append(text, input);
    return label;
  }));
  const allEnabled = ACTIVITY_KINDS.every((kind) => preferences.activityKinds[kind]);
  els.toggleAll.textContent = allEnabled ? 'Desativar todos' : 'Ativar todos';
}

async function savePreferences() {
  await send('savePreferences', { preferences });
  renderPreferences();
  renderFeed();
}

function consumeHostMessage(message) {
  if (message.channel !== 'aioffice-host') return;
  switch (message.type) {
    case 'status':
      if (currentState.state !== 'ready' && message.status?.state === 'ready') clearGapBanner();
      currentState = message.status || currentState;
      renderState();
      break;
    case 'feed':
      feedItems = Array.isArray(message.items) ? message.items : feedItems;
      renderFilters();
      renderFeed();
      break;
    case 'notice':
      notices = Array.isArray(message.items) ? message.items : notices;
      break;
    case 'snapshot':
      officeSnapshot = message.snapshot || officeSnapshot;
      renderOffice();
      break;
    case 'terminal':
      acceptTerminalEvent(message);
      break;
    case 'action-result':
      if (message.action === 'agent-message' && message.requestId === activeMessageRequestId) {
        activeMessageRequestId = null;
        els.sendMessage.disabled = !canMessage(findAgent(activeAgentId));
        if (message.ok) {
          els.messageInput.value = '';
          els.messageStatus.textContent = 'Instrução adicionada à fila do agente.';
        } else {
          els.messageStatus.textContent = message.error || 'Não foi possível enviar a instrução.';
        }
      } else if (message.action === 'terminal-open' && message.agentId === activeAgentId && !message.ok) {
        els.terminalNote.textContent = message.error || 'Não foi possível abrir o terminal deste agente.';
      }
      break;
    case 'gap':
      showGap(message.message);
      break;
    case 'gap-cleared':
      clearGapBanner();
      break;
  }
}

function clearGapBanner() {
  els.gap.hidden = true;
  els.gapMessage.textContent = '';
}

async function initialize() {
  const stored = await chrome.storage.local.get('preferences');
  preferences = normalizePreferences(stored.preferences);
  renderPreferences();

  chrome.runtime.onMessage.addListener(consumeHostMessage);
  const snapshot = await send('getState');
  if (snapshot?.state) currentState = snapshot.state;
  feedItems = Array.isArray(snapshot?.feed) ? snapshot.feed : [];
  notices = Array.isArray(snapshot?.notices) ? snapshot.notices : [];
  officeSnapshot = snapshot?.snapshot || officeSnapshot;
  renderState();
  renderOffice();
  renderFeed();
  await send('connect', { startIfStopped: true });
}

els.connectButton.addEventListener('click', async () => {
  currentState = { state: 'starting', message: 'Solicitando ao AIOffice Desktop…' };
  renderState();
  await send('connect', { startIfStopped: true });
});

els.openButton.addEventListener('click', async () => {
  const result = await send('open');
  setFeedback(result?.ok ? 'Abrindo a janela do AIOffice…' : result?.error || 'Não foi possível abrir o AIOffice.');
});

els.stopButton.addEventListener('click', async () => {
  const result = await send('stop');
  setFeedback(result?.ok ? 'Solicitação para encerrar o serviço enviada.' : result?.error || 'Não foi possível encerrar o serviço.');
});

els.clearGap.addEventListener('click', async () => {
  await send('clearGap');
  clearGapBanner();
});

els.includeDetails.addEventListener('change', () => {
  preferences.includeDetails = els.includeDetails.checked;
  void savePreferences();
});

els.connectOnStartup.addEventListener('change', () => {
  preferences.connectOnStartup = els.connectOnStartup.checked;
  void savePreferences();
});

els.noticesEnabled.addEventListener('change', () => {
  preferences.noticesEnabled = els.noticesEnabled.checked;
  void savePreferences();
});

els.categoryList.addEventListener('change', (event) => {
  const kind = event.target?.dataset?.kind;
  if (!ACTIVITY_KINDS.includes(kind)) return;
  preferences.activityKinds[kind] = event.target.checked;
  void savePreferences();
});

els.toggleAll.addEventListener('click', () => {
  const enable = !ACTIVITY_KINDS.every((kind) => preferences.activityKinds[kind]);
  preferences.activityKinds = Object.fromEntries(ACTIVITY_KINDS.map((kind) => [kind, enable]));
  void savePreferences();
});

els.projectFilter.addEventListener('change', renderFeed);
els.activityFilter.addEventListener('change', renderFeed);

els.closeAgentDialog.addEventListener('click', () => els.agentDialog.close());
els.agentDialog.addEventListener('close', closeAgentConsole);
els.agentDialog.addEventListener('cancel', closeAgentConsole);
els.messageInput.addEventListener('input', () => {
  els.sendMessage.disabled = !canMessage(findAgent(activeAgentId)) || !els.messageInput.value.trim();
});
els.messageForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const agent = findAgent(activeAgentId);
  const text = els.messageInput.value.replace(/\s+$/, '');
  if (!canMessage(agent) || !text || activeMessageRequestId) return;
  activeMessageRequestId = globalThis.crypto?.randomUUID?.() || `msg-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  els.messageStatus.textContent = 'Enviando instrução…';
  els.sendMessage.disabled = true;
  try {
    const result = await send('agentMessage', { requestId: activeMessageRequestId, agentId: agent.id, text });
    if (!result?.ok && activeMessageRequestId) {
      activeMessageRequestId = null;
      els.sendMessage.disabled = !canMessage(agent) || !els.messageInput.value.trim();
      els.messageStatus.textContent = result?.error || 'Não foi possível enviar a instrução.';
    }
  } catch {
    activeMessageRequestId = null;
    els.sendMessage.disabled = !canMessage(agent) || !els.messageInput.value.trim();
    els.messageStatus.textContent = 'A conexão com a extensão foi interrompida. Tente novamente.';
  }
});

void initialize();
