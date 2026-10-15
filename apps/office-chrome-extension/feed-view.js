import { ACTIVITY_LABELS } from './activity-kinds.js';

export const ALL_FILTER = 'all';

export function projectName(item) {
  return typeof item?.roomName === 'string' && item.roomName.trim()
    ? item.roomName.trim()
    : 'Sem projeto';
}

export function listProjects(items, rooms = []) {
  const names = new Set();
  for (const room of rooms) {
    if (typeof room?.name === 'string' && room.name.trim()) names.add(room.name.trim());
  }
  for (const item of items) names.add(projectName(item));
  return [...names].sort((a, b) => a.localeCompare(b, 'pt-BR'));
}

export function groupFeedByProject(items, { project = ALL_FILTER, kind = ALL_FILTER } = {}) {
  const groups = new Map();
  for (const item of items) {
    const name = projectName(item);
    if (project !== ALL_FILTER && name !== project) continue;
    if (kind !== ALL_FILTER && item?.activity?.kind !== kind) continue;
    if (!groups.has(name)) groups.set(name, []);
    groups.get(name).push(item);
  }

  return [...groups.entries()]
    .map(([name, events]) => ({
      name,
      items: events.sort((a, b) => Number(b?.activity?.at ?? 0) - Number(a?.activity?.at ?? 0)),
      latestAt: Math.max(...events.map((item) => Number(item?.activity?.at ?? 0))),
    }))
    .sort((a, b) => b.latestAt - a.latestAt || a.name.localeCompare(b.name, 'pt-BR'));
}

export function activityLabel(kind) {
  return ACTIVITY_LABELS[kind] || 'Atividade';
}
