function suppliedLabel(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

export function agentIdentityContext({ roomName, provider } = {}) {
  return {
    projectName: suppliedLabel(roomName),
    providerName: suppliedLabel(provider),
  };
}
