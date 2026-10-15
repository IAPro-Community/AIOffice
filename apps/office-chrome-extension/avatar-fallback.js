function validSeed(value) {
  return Number.isInteger(value) && value >= 0 && value <= 0xffffffff;
}

function stableSeed(identity) {
  let hash = 2166136261;
  for (let index = 0; index < identity.length; index += 1) {
    hash ^= identity.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function avatarSourceAgent(agent, fallback = {}) {
  const source = agent && typeof agent === 'object' && !Array.isArray(agent) ? agent : {};
  const id = typeof source.id === 'string' && source.id ? source.id : (typeof fallback.id === 'string' ? fallback.id : '');
  const name = typeof source.name === 'string' && source.name.trim()
    ? source.name
    : (typeof fallback.name === 'string' && fallback.name.trim() ? fallback.name : 'Agente');
  const identity = id || name;

  return {
    ...source,
    id,
    name,
    seed: validSeed(source.seed) ? source.seed : stableSeed(identity),
  };
}

export function avatarInitial(name) {
  const first = typeof name === 'string' ? Array.from(name.trim())[0] : '';
  return first ? first.toLocaleUpperCase('pt-BR') : 'A';
}
