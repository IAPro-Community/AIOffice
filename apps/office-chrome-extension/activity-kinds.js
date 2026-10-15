export const ACTIVITY_KINDS = [
  'prompt',
  'think',
  'respond',
  'read',
  'search',
  'edit',
  'write',
  'run',
  'test',
  'git',
  'web',
  'browser',
  'plan',
  'delegate',
  'communicate',
  'ask',
  'mcp',
  'skill',
  'wait',
  'error',
  'compact',
  'done',
  'other',
];

export const ACTIVITY_LABELS = {
  prompt: 'Nova instrução',
  think: 'Pensamento',
  respond: 'Resposta',
  read: 'Leitura',
  search: 'Pesquisa',
  edit: 'Edição',
  write: 'Escrita',
  run: 'Comando',
  test: 'Teste',
  git: 'Git',
  web: 'Web',
  browser: 'Navegador',
  plan: 'Planejamento',
  delegate: 'Subagente',
  communicate: 'Comunicação',
  ask: 'Pergunta',
  mcp: 'Integração MCP',
  skill: 'Skill',
  wait: 'Aguardando',
  error: 'Erro',
  compact: 'Compactação',
  done: 'Concluído',
  other: 'Outra atividade',
};

export const DEFAULT_PREFERENCES = Object.freeze({
  activityKinds: Object.freeze(Object.fromEntries(ACTIVITY_KINDS.map((kind) => [kind, true]))),
  noticesEnabled: true,
  includeDetails: false,
  connectOnStartup: true,
});

export function normalizePreferences(value) {
  const input = value && typeof value === 'object' ? value : {};
  const kinds = input.activityKinds && typeof input.activityKinds === 'object'
    ? input.activityKinds
    : {};

  return {
    activityKinds: Object.fromEntries(
      ACTIVITY_KINDS.map((kind) => [kind, typeof kinds[kind] === 'boolean' ? kinds[kind] : true]),
    ),
    noticesEnabled: typeof input.noticesEnabled === 'boolean' ? input.noticesEnabled : true,
    includeDetails: typeof input.includeDetails === 'boolean' ? input.includeDetails : false,
    connectOnStartup: typeof input.connectOnStartup === 'boolean' ? input.connectOnStartup : true,
  };
}

export function shouldNotifyFeedItem(item, preferences) {
  const prefs = normalizePreferences(preferences);
  return Boolean(item?.id && ACTIVITY_KINDS.includes(item?.activity?.kind) && prefs.activityKinds[item.activity.kind]);
}

export function safeNotificationBody(item, preferences) {
  const prefs = normalizePreferences(preferences);
  const room = cleanText(item?.roomName, 80) || 'AIOffice';
  if (!prefs.includeDetails) return `${room} · ${ACTIVITY_LABELS[item?.activity?.kind] || 'Atividade'}`;

  const text = cleanText(item?.activity?.text, 160);
  const detail = cleanText(item?.activity?.detail, 220);
  return [room, text || ACTIVITY_LABELS[item?.activity?.kind], detail].filter(Boolean).join(' · ');
}

export function cleanText(value, maxLength) {
  if (typeof value !== 'string') return '';
  return value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, maxLength);
}
