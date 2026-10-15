import { avatarCanvas } from '../office-web/client/src/art/index';
import type { AppearanceParts } from '../office-web/shared/appearance';

interface AgentAppearance {
  seed?: number;
  look?: 'f' | 'm';
  kind?: 'main' | 'sub';
  parts?: AppearanceParts;
}

declare global {
  var AIOfficeAvatar: { render(agent: AgentAppearance): string } | undefined;
}

const cache = new Map<string, string>();

function render(agent: AgentAppearance): string {
  const seed = Number(agent?.seed);
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) return '';
  const look = agent.look === 'f' || agent.look === 'm' ? agent.look : undefined;
  const kind = agent.kind === 'sub' ? 'sub' : 'main';
  const parts = agent.parts && typeof agent.parts === 'object' && !Array.isArray(agent.parts)
    ? agent.parts
    : undefined;
  const key = JSON.stringify([seed, look, kind, parts ?? null]);
  const cached = cache.get(key);
  if (cached) return cached;
  const url = avatarCanvas(seed, { look, sub: kind === 'sub', scale: 4, parts }).toDataURL('image/png');
  if (cache.size >= 300) cache.clear();
  cache.set(key, url);
  return url;
}

globalThis.AIOfficeAvatar = { render };
