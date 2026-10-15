export const HOST_STATES = Object.freeze(['starting', 'ready', 'stopped', 'error']);

export function normalizeHostState(value) {
  return HOST_STATES.includes(value) ? value : 'error';
}

export function normalizeHostMessage(value) {
  const raw = typeof value === 'string' ? value.trim() : '';
  if (/specified native messaging host not found|native messaging host.*(?:not found|not registered)|host.*not registered/i.test(raw)) {
    return {
      message: 'O componente de integração do AIOffice não foi encontrado. Instale ou repare o AIOffice Desktop e tente novamente.',
      errorCode: 'native-host-missing',
    };
  }
  if (/^(?:access to the specified native messaging host is forbidden|native host has exited|failed to connect to native host)/i.test(raw)) {
    return {
      message: 'O Chrome não conseguiu iniciar o componente de integração do AIOffice. Verifique a instalação do AIOffice Desktop e tente novamente.',
      errorCode: 'native-host-unavailable',
    };
  }
  if (/^(?:specified|access to|native messaging|native host|failed to connect|could not connect)/i.test(raw)) {
    return {
      message: 'Não foi possível conectar ao componente de integração do AIOffice. Verifique o AIOffice Desktop e tente novamente.',
      errorCode: 'native-host-error',
    };
  }
  return { message: raw || 'Não foi possível conectar ao AIOffice.', errorCode: undefined };
}

function safeLabel(value) {
  return typeof value === 'string'
    ? value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80)
    : '';
}

function safeAgentId(value) {
  return typeof value === 'string' && value.length <= 512 && value.trim() === value && !/[\\/\u0000-\u001f\u007f]/.test(value)
    ? value
    : '';
}

function safeParts(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const enums = {
    hairStyle: new Set(['short', 'buzz', 'spiky', 'side_part', 'curly', 'afro', 'bob', 'long', 'ponytail', 'bun', 'pigtails', 'mohawk', 'bald', 'wavy']),
    topStyle: new Set(['tshirt', 'hoodie', 'shirt_tie', 'sweater', 'jacket', 'blouse', 'polo']),
    bottomStyle: new Set(['pants', 'shorts', 'skirt']),
    accessory: new Set(['none', 'glasses', 'sunglasses', 'headphones', 'cap', 'beanie', 'earrings', 'bow']),
    facialHair: new Set(['none', 'stubble', 'beard', 'mustache', 'goatee']),
  };
  const colors = new Set(['skin', 'hair', 'eyes', 'top', 'topAccent', 'bottom', 'shoes', 'accessoryColor']);
  const parts = {};
  for (const [key, raw] of Object.entries(value)) {
    const entry = typeof raw === 'string' ? raw : '';
    if (enums[key]?.has(entry) || (colors.has(key) && /^#[0-9a-f]{6}$/i.test(entry))) parts[key] = entry;
  }
  return Object.keys(parts).length ? parts : undefined;
}

export function normalizeOfficeSnapshot(value) {
  const input = value && typeof value === 'object' ? value : {};
  const rooms = Array.isArray(input.rooms)
    ? input.rooms.map((room) => ({ name: safeLabel(room?.name) })).filter((room) => room.name).slice(0, 100)
    : [];
  const agents = Array.isArray(input.agents)
    ? input.agents.map((agent) => ({
      id: safeAgentId(agent?.id),
      name: safeLabel(agent?.name),
      roomName: safeLabel(agent?.roomName),
      status: safeLabel(agent?.status) || 'unknown',
      provider: safeLabel(agent?.provider),
      kind: agent?.kind === 'main' || agent?.kind === 'sub' ? agent.kind : undefined,
      seed: Number.isInteger(agent?.seed) && agent.seed >= 0 && agent.seed <= 0xffffffff ? agent.seed : undefined,
      look: agent?.look === 'f' || agent?.look === 'm' ? agent.look : undefined,
      parts: safeParts(agent?.parts),
      canMessage: agent?.canMessage === true,
    })).filter((agent) => agent.name).slice(0, 300)
    : [];
  const meta = input.meta && typeof input.meta === 'object' ? input.meta : {};
  return {
    rooms,
    agents,
    meta: { terminal: meta.terminal === true, messages: meta.messages === true },
  };
}

export function hostSupportsStop(capabilities) {
  if (Array.isArray(capabilities)) return capabilities.includes('stop');
  return Boolean(capabilities && typeof capabilities === 'object' && capabilities.stop === true);
}
