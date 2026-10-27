// Montagem do prédio: núcleo + corredor + salas de projeto -> grade de caminhabilidade e spots.
import { FURNITURE, type MapThemeId } from '../../art/api';
import { BUILDING_H, COL_W } from '../constants';
import { BLOCKED, FREE, SEAT, WalkGrid } from '../path/grid';
import { furnitureBlocks, furnitureIsSeat } from './builder';
import { layoutCafe, layoutLounge, layoutReception, layoutRestroom } from './core';
import { layoutCorridor } from './corridor';
import { buildingRect } from './geometry';
import type { AreaKind, AreaLayout, SpotDef, TileRect } from './types';

export interface BuildingLayout {
  cols: number;
  rect: TileRect;
  core: AreaLayout[];
  corridor: AreaLayout;
  rooms: AreaLayout[];
  grid: WalkGrid;
  spots: SpotDef[];
}

const coreCache = new Map<MapThemeId, AreaLayout[]>();

const CORE_SKINS: Partial<Record<AreaKind, { wall: string; trim: string; floor: string }>> = {
  reception: { wall: '#dce8e3', trim: '#49756b', floor: '#8da79c' },
  restroom: { wall: '#dce9e8', trim: '#4f8282', floor: '#a4c1bd' },
  cafe: { wall: '#eae2d2', trim: '#907457', floor: '#c2a77e' },
  lounge: { wall: '#dce7de', trim: '#557565', floor: '#718778' },
};

function applyCoreSkin(area: AreaLayout, mapTheme: MapThemeId): AreaLayout {
  if (mapTheme === 'v1') return area;
  const skin = CORE_SKINS[area.kind];
  if (!skin) return area;
  return {
    ...area,
    floorTint: skin.floor,
    floors: area.floors.map((floor) => ({ ...floor, tint: skin.floor })),
    walls: area.walls.map((wall) => ({ ...wall, style: { ...wall.style, base: skin.wall, trim: skin.trim } })),
  };
}

/** Áreas fixas do núcleo (calculadas uma vez). */
export function coreAreas(mapTheme: MapThemeId = 'v1'): AreaLayout[] {
  let cached = coreCache.get(mapTheme);
  if (!cached) {
    cached = [layoutReception(mapTheme), layoutRestroom(mapTheme), layoutCafe(mapTheme), layoutLounge(mapTheme)]
      .map((area) => applyCoreSkin(area, mapTheme));
    coreCache.set(mapTheme, cached);
  }
  return cached;
}

/** Marca na grade as células caminháveis de uma área, os bloqueios e os assentos. */
export function paintArea(grid: WalkGrid, area: AreaLayout): void {
  for (const r of area.walkable) grid.fill(r.x, r.y, r.w, r.h, FREE);
  for (const r of area.blocked ?? []) grid.fill(r.x, r.y, r.w, r.h, BLOCKED);
  for (const f of area.furniture) {
    const def = FURNITURE[f.kind];
    if (def.mount !== 'floor') continue;
    const { w, h } = def.footprint;
    if (furnitureBlocks(f.kind)) grid.fill(f.tx, f.ty, w, h, BLOCKED);
    else if (furnitureIsSeat(f.kind)) {
      for (let y = f.ty; y < f.ty + h; y++) for (let x = f.tx; x < f.tx + w; x++) if (grid.get(x, y) === FREE) grid.set(x, y, SEAT);
    }
  }
}

export function buildWalkGrid(cols: number, areas: readonly AreaLayout[], version = 0): WalkGrid {
  const grid = new WalkGrid(cols * COL_W, BUILDING_H, version);
  for (const a of areas) paintArea(grid, a);
  return grid;
}

export function assembleBuilding(cols: number, rooms: readonly AreaLayout[], version = 0, mapTheme: MapThemeId = 'v1'): BuildingLayout {
  const core = coreAreas(mapTheme);
  const corridor = layoutCorridor(cols, mapTheme);
  const all = [...core, corridor, ...rooms];
  const grid = buildWalkGrid(cols, all, version);
  const spots: SpotDef[] = [];
  for (const a of all) spots.push(...a.spots);
  return { cols, rect: buildingRect(cols), core, corridor, rooms: [...rooms], grid, spots };
}
