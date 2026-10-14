import type { CharacterFrameRequest, FurnitureKind, Sprite, WallStyle } from '../../art/api';
import { mix } from '../../art/core/color';
import { hash32 } from '../../../../shared/hash';
import { renderSeasonalProp, type SeasonalProp } from '../../art/seasonal';
import type { SeasonalTheme } from '../api';
import type { AreaLayout, WallSegment } from '../layout/types';

const sprites = new Map<SeasonalProp, Sprite>();
function prop(kind: SeasonalProp): Sprite {
  let sprite = sprites.get(kind);
  if (!sprite) {
    const { buf, ax, ay } = renderSeasonalProp(kind);
    const canvas = document.createElement('canvas');
    canvas.width = buf.w;
    canvas.height = buf.h;
    canvas.getContext('2d')!.putImageData(new ImageData(buf.data, buf.w, buf.h), 0, 0);
    sprites.set(kind, sprite = { canvas, ax, ay });
  }
  return sprite;
}

interface ScenePalette {
  wall: string;
  trim: string;
  rug: string;
  light: string;
  leaf: string;
}

type DecoratedTheme = Exclude<SeasonalTheme, 'none'>;

const SCENE_PALETTES: Record<DecoratedTheme, ScenePalette> = {
  christmas: { wall: '#ffe3b4', trim: '#4e7756', rug: '#a93649', light: '#ffd58b', leaf: '#347653' },
  halloween: { wall: '#bc97d1', trim: '#725486', rug: '#60416f', light: '#d8a5ed', leaf: '#584068' },
  garden: { wall: '#d4e7c4', trim: '#4f7951', rug: '#557b53', light: '#f2d080', leaf: '#4e8a5b' },
  aurora: { wall: '#b9d9e2', trim: '#4f8393', rug: '#31596c', light: '#83d8d2', leaf: '#526f9b' },
  sunset: { wall: '#f2c5a5', trim: '#a75749', rug: '#b85c4d', light: '#ffc56e', leaf: '#9c6950' },
  'new-year': { wall: '#c5d2e5', trim: '#9a7544', rug: '#344b70', light: '#ffe39a', leaf: '#b58152' },
  carnival: { wall: '#edc9e4', trim: '#9f4d8b', rug: '#a74379', light: '#ffe383', leaf: '#458460' },
  easter: { wall: '#e2d6ee', trim: '#8272a7', rug: '#b984b8', light: '#ffe39a', leaf: '#70a06e' },
  valentine: { wall: '#f1c8d0', trim: '#a74d67', rug: '#a74761', light: '#ffe1aa', leaf: '#71936b' },
  'festa-junina': { wall: '#f0d6a6', trim: '#9c5942', rug: '#985c43', light: '#ffdc82', leaf: '#688249' },
  independence: { wall: '#cfe2c1', trim: '#3a7650', rug: '#397852', light: '#f4d45f', leaf: '#2f8150' },
};

export function seasonalCostume(theme: SeasonalTheme, seed: number): CharacterFrameRequest['costume'] {
  if (theme === 'christmas') return 'santa';
  if (theme === 'halloween') return (['witch', 'pumpkin', 'vampire'] as const)[(seed >>> 0) % 3];
  return undefined;
}

/** Reutiliza footprints de plantas: nenhuma nova colisão ou mudança de caminhos. */
export function seasonalFurniture(theme: SeasonalTheme, kind: FurnitureKind, area: AreaLayout, seed: number): Sprite | null {
  if (theme === 'none' || area.kind === 'restroom') return null;
  if (kind === 'plant_tall') {
    const first = area.furniture.find((f) => f.kind === 'plant_tall');
    if (!first || hash32(first.id) !== seed) return null;
    if (theme === 'christmas') return prop('tree');
    if (theme === 'halloween') return prop(seed % 3 === 0 ? 'ghost' : 'pumpkin');
    if (theme === 'garden') return prop('flower');
    if (theme === 'aurora') return prop('crystal');
    if (theme === 'new-year') return prop('sun');
    if (theme === 'carnival' || theme === 'easter' || theme === 'valentine' || theme === 'festa-junina' || theme === 'independence') return prop('flower');
    return null;
  }
  if (kind === 'plant_small') {
    if (theme === 'christmas') return prop('gift');
    if (theme === 'halloween') return prop('pumpkin');
    if (theme === 'garden') return prop('flower');
    if (theme === 'aurora') return prop('crystal');
    if (theme === 'new-year') return prop('sun');
    if (theme === 'carnival' || theme === 'easter' || theme === 'valentine' || theme === 'festa-junina' || theme === 'independence') return prop('flower');
  }
  return null;
}

export function seasonalRugColor(theme: SeasonalTheme, original: string): string {
  return theme === 'none' ? original : SCENE_PALETTES[theme].rug;
}

export function seasonalWallStyle(theme: SeasonalTheme, original: WallStyle): WallStyle {
  if (theme === 'none' || original.pattern === 'glass') return original;
  const palette = SCENE_PALETTES[theme];
  return { ...original, base: mix(original.base, palette.wall, 0.18), trim: palette.trim };
}

/** Motivos de tapete (cacheados junto com o piso). */
export function decorateSeasonalRug(ctx: CanvasRenderingContext2D, theme: SeasonalTheme, rug: { x: number; y: number; w: number; h: number }): void {
  if (theme === 'none') return;
  const x = Math.round(rug.x), y = Math.round(rug.y), w = Math.floor(rug.w), h = Math.floor(rug.h);
  if (w < 25 || h < 16) return;
  const palette = SCENE_PALETTES[theme];
  ctx.save();
  ctx.fillStyle = palette.light;
  ctx.fillRect(x + 4, y + 4, w - 8, 1);
  ctx.fillRect(x + 4, y + h - 5, w - 8, 1);
  for (let cx = x + 14; cx < x + w - 10; cx += 28) {
    const cy = Math.round(y + h / 2);
    if (theme === 'christmas') {
      ctx.fillRect(cx - 4, cy, 9, 1);
      ctx.fillRect(cx, cy - 4, 1, 9);
      for (const d of [-2, 2]) {
        ctx.fillRect(cx + d, cy + d, 1, 1);
        ctx.fillRect(cx + d, cy - d, 1, 1);
      }
    } else if (theme === 'halloween') {
      ctx.fillRect(cx - 3, cy - 2, 7, 5);
      ctx.fillRect(cx, cy - 4, 1, 2);
      ctx.fillStyle = '#60416f';
      ctx.fillRect(cx - 2, cy - 1, 1, 1);
      ctx.fillRect(cx + 2, cy - 1, 1, 1);
      ctx.fillStyle = palette.light;
    } else if (theme === 'garden') {
      ctx.fillStyle = palette.leaf;
      ctx.fillRect(cx - 5, cy, 4, 2);
      ctx.fillRect(cx - 3, cy - 2, 3, 2);
      ctx.fillRect(cx + 1, cy - 1, 4, 2);
      ctx.fillRect(cx, cy, 1, 3);
      ctx.fillStyle = palette.light;
      ctx.fillRect(cx, cy - 3, 2, 2);
    } else if (theme === 'aurora') {
      ctx.fillRect(cx, cy - 4, 1, 9);
      ctx.fillRect(cx - 4, cy, 9, 1);
      ctx.fillRect(cx - 2, cy - 2, 1, 1);
      ctx.fillRect(cx + 2, cy - 2, 1, 1);
      ctx.fillRect(cx - 2, cy + 2, 1, 1);
      ctx.fillRect(cx + 2, cy + 2, 1, 1);
    } else if (theme === 'new-year') {
      ctx.fillRect(cx - 5, cy, 11, 1);
      ctx.fillRect(cx, cy - 5, 1, 11);
      ctx.fillRect(cx - 3, cy - 3, 1, 1);
      ctx.fillRect(cx + 3, cy - 3, 1, 1);
      ctx.fillRect(cx - 3, cy + 3, 1, 1);
      ctx.fillRect(cx + 3, cy + 3, 1, 1);
    } else if (theme === 'carnival') {
      for (let i = -5; i <= 5; i += 5) {
        ctx.fillRect(cx + i, cy - 3 + (i % 2 ? 2 : 0), 2, 4);
        ctx.fillRect(cx + i + 2, cy + (i % 2 ? 0 : 2), 2, 2);
      }
    } else if (theme === 'easter') {
      ctx.fillRect(cx - 3, cy - 3, 7, 6);
      ctx.fillRect(cx - 2, cy - 4, 5, 1);
      ctx.fillStyle = '#b984b8';
      ctx.fillRect(cx - 1, cy - 2, 3, 1);
      ctx.fillStyle = palette.light;
      ctx.fillRect(cx - 1, cy + 1, 3, 1);
    } else if (theme === 'valentine') {
      ctx.fillRect(cx - 4, cy - 3, 3, 3);
      ctx.fillRect(cx + 1, cy - 3, 3, 3);
      ctx.fillRect(cx - 3, cy - 1, 7, 3);
      ctx.fillRect(cx - 2, cy + 2, 5, 2);
      ctx.fillRect(cx - 1, cy + 4, 3, 1);
    } else if (theme === 'festa-junina') {
      ctx.fillRect(cx - 5, cy - 3, 10, 2);
      ctx.fillRect(cx - 4, cy - 1, 8, 2);
      ctx.fillRect(cx - 3, cy + 1, 6, 2);
      ctx.fillRect(cx - 2, cy + 3, 4, 1);
      ctx.fillStyle = palette.leaf;
      ctx.fillRect(cx - 5, cy - 4, 2, 2);
      ctx.fillStyle = palette.light;
    } else if (theme === 'independence') {
      ctx.fillStyle = palette.leaf;
      ctx.fillRect(cx - 5, cy - 3, 11, 7);
      ctx.fillStyle = palette.light;
      ctx.fillRect(cx - 2, cy - 1, 5, 3);
      ctx.fillStyle = '#4579a7';
      ctx.fillRect(cx, cy, 1, 1);
      ctx.fillStyle = palette.light;
    } else {
      ctx.fillRect(cx - 4, cy - 2, 9, 5);
      ctx.fillRect(cx - 2, cy - 4, 5, 2);
      ctx.fillRect(cx - 2, cy + 3, 5, 2);
      ctx.fillStyle = '#a75749';
      ctx.fillRect(cx, cy - 1, 1, 3);
      ctx.fillStyle = palette.light;
    }
  }
  ctx.restore();
}

/** Enfeites no alto da parede, longe das telas e placas. Os vãos ficam livres. */
export function decorateSeasonalWall(ctx: CanvasRenderingContext2D, theme: SeasonalTheme, wall: WallSegment): void {
  if (theme === 'none' || wall.kind !== 'face') return;
  ctx.save();
  const x0 = Math.round(wall.x + 3), end = Math.floor(wall.x + wall.w - 3), y = Math.round(wall.y + 5);
  const palette = SCENE_PALETTES[theme];
  if (theme === 'garden') {
    for (let x = x0; x < end; x += 12) {
      if (wall.doorways?.some((d) => x >= d.x - 1 && x < d.x + d.w + 1)) continue;
      const lift = (x % 24) < 12 ? 0 : 2;
      ctx.fillStyle = palette.leaf;
      ctx.fillRect(x, y + lift, 7, 1);
      ctx.fillRect(x + 4, y + lift - 2, 2, 2);
      ctx.fillRect(x + 5, y + lift + 1, 2, 2);
      if ((x - x0) % 48 === 0) {
        ctx.fillStyle = '#f4a3ad';
        ctx.fillRect(x + 2, y + lift - 5, 3, 2);
        ctx.fillRect(x + 1, y + lift - 4, 5, 1);
        ctx.fillStyle = '#ffe28b';
        ctx.fillRect(x + 3, y + lift - 4, 1, 1);
      }
    }
    ctx.restore();
    return;
  }
  if (theme === 'aurora') {
    for (let x = x0; x < end; x += 24) {
      if (wall.doorways?.some((d) => x >= d.x - 1 && x < d.x + d.w + 1)) continue;
      const lift = ((x - x0) / 24) % 2 === 0 ? 1 : 4;
      ctx.fillStyle = palette.leaf;
      ctx.fillRect(x, y + lift, 1, 3);
      ctx.fillRect(x - 1, y + lift + 1, 3, 1);
      ctx.fillStyle = palette.light;
      ctx.fillRect(x, y + lift + 2, 2, 2);
      ctx.fillStyle = '#d7f0dc';
      ctx.fillRect(x, y + lift + 2, 1, 1);
    }
    ctx.restore();
    return;
  }
  if (theme === 'sunset') {
    ctx.fillStyle = palette.trim;
    for (let x = x0; x < end; x += 24) {
      if (wall.doorways?.some((d) => x >= d.x - 1 && x < d.x + d.w + 1)) continue;
      ctx.fillRect(x, y + 3, 7, 1);
      ctx.fillRect(x + 2, y + 4, 4, 1);
    }
    ctx.restore();
    return;
  }
  if (theme === 'carnival' || theme === 'festa-junina') {
    for (let x = x0; x < end; x += 18) {
      if (wall.doorways?.some((d) => x >= d.x - 1 && x < d.x + d.w + 1)) continue;
      const colors = theme === 'carnival' ? ['#f2cc58', '#6eb89a', '#d9678d'] : ['#e15c4d', '#f1cb59', '#497aa0'];
      const flag = Math.floor((x - x0) / 18) % colors.length;
      ctx.fillStyle = palette.trim;
      ctx.fillRect(x, y + 1, 1, 8);
      ctx.fillStyle = colors[flag];
      ctx.fillRect(x + 1, y + 2, 7, 4);
      ctx.fillRect(x + 2, y + 6, 5, 2);
      ctx.fillRect(x + 3, y + 8, 3, 1);
    }
    ctx.restore();
    return;
  }
  if (theme === 'easter' || theme === 'valentine' || theme === 'independence') {
    for (let x = x0; x < end; x += theme === 'valentine' ? 18 : 24) {
      if (wall.doorways?.some((d) => x >= d.x - 1 && x < d.x + d.w + 1)) continue;
      if (theme === 'easter') {
        ctx.fillStyle = '#f3d46f';
        ctx.fillRect(x, y + 3, 6, 2);
        ctx.fillRect(x + 1, y + 1, 4, 2);
        ctx.fillRect(x + 2, y, 2, 1);
        ctx.fillStyle = palette.trim;
        ctx.fillRect(x + 1, y + 3, 1, 1);
        ctx.fillRect(x + 4, y + 3, 1, 1);
      } else if (theme === 'valentine') {
        ctx.fillStyle = '#d96c83';
        ctx.fillRect(x, y + 1, 3, 3);
        ctx.fillRect(x + 4, y + 1, 3, 3);
        ctx.fillRect(x + 1, y + 3, 5, 2);
        ctx.fillRect(x + 2, y + 5, 3, 1);
        ctx.fillRect(x + 3, y + 6, 1, 1);
      } else {
        ctx.fillStyle = palette.leaf;
        ctx.fillRect(x, y + 1, 12, 6);
        ctx.fillStyle = palette.light;
        ctx.fillRect(x + 3, y + 2, 6, 4);
        ctx.fillStyle = '#4579a7';
        ctx.fillRect(x + 5, y + 3, 2, 2);
      }
    }
    ctx.restore();
    return;
  }
  if (theme === 'new-year') {
    for (let x = x0 + 8; x < end; x += 32) {
      if (wall.doorways?.some((d) => x >= d.x - 1 && x < d.x + d.w + 1)) continue;
      ctx.fillStyle = palette.trim;
      ctx.fillRect(x, y + 1, 1, 5);
      ctx.fillStyle = palette.light;
      ctx.fillRect(x - 3, y + 4, 7, 1);
      ctx.fillRect(x, y + 1, 1, 7);
      ctx.fillRect(x - 2, y + 2, 1, 1);
      ctx.fillRect(x + 2, y + 6, 1, 1);
    }
    ctx.restore();
    return;
  }
  for (let x = x0; x < end; x++) {
    if (wall.doorways?.some((d) => x >= d.x - 1 && x < d.x + d.w + 1)) continue;
    const sag = Math.round(Math.sin(((x - x0) % 48) / 48 * Math.PI) * 3);
    ctx.fillStyle = palette.leaf;
    ctx.fillRect(x, y + sag, 1, theme === 'christmas' ? 3 : 1);
    if ((x - x0) % 12 === 6) {
      ctx.fillStyle = theme === 'christmas' ? '#f5d491' : '#eea24d';
      ctx.fillRect(x, y + sag + 3, 2, 3);
      ctx.fillStyle = theme === 'christmas' ? '#fff0be' : '#ffd78a';
      ctx.fillRect(x, y + sag + 3, 1, 1);
    }
  }
  if (theme === 'halloween') {
    // Teias pequenas nos cantos; não cobrem os equipamentos.
    ctx.strokeStyle = '#d6bfdd';
    ctx.lineWidth = 1;
    for (const side of [1, -1]) {
      const x = side === 1 ? x0 : end;
      ctx.beginPath();
      for (const [dx, dy] of [[15, 0], [13, 7], [7, 13], [0, 15]]) {
        ctx.moveTo(x, y + 2);
        ctx.lineTo(x + side * dx, y + 2 + dy);
      }
      for (const r of [5, 10, 15]) {
        ctx.moveTo(x + side * r, y + 2);
        ctx.lineTo(x + side * Math.round(r * 0.7), y + 2 + Math.round(r * 0.7));
        ctx.lineTo(x, y + 2 + r);
      }
      ctx.stroke();
    }
    if (wall.w > 90) {
      const bat = prop('bat');
      ctx.drawImage(bat.canvas, Math.round(wall.x + wall.w / 2 - bat.ax), y + 18 - bat.ay);
    }
  }
  ctx.restore();
}

/** Guirlandas nas molduras dos elevadores (sem cobrir a porta animada). */
export function decorateElevator(ctx: CanvasRenderingContext2D, theme: SeasonalTheme, x: number, y: number): void {
  if (theme === 'none') return;
  const sprite = theme === 'christmas' ? prop('wreath')
    : theme === 'halloween' ? prop('bat')
      : theme === 'garden' ? prop('flower')
        : theme === 'aurora' ? prop('crystal')
          : theme === 'carnival' || theme === 'easter' || theme === 'valentine' || theme === 'festa-junina' || theme === 'independence' ? prop('flower') : prop('sun');
  ctx.drawImage(sprite.canvas, Math.round(x - sprite.ax), Math.round(y - 19 - sprite.ay));
}

const glows = new Map<DecoratedTheme, HTMLCanvasElement>();
function glowSprite(theme: DecoratedTheme): HTMLCanvasElement {
  let canvas = glows.get(theme);
  if (!canvas) {
    canvas = document.createElement('canvas');
    canvas.width = canvas.height = 34;
    const ctx = canvas.getContext('2d')!;
    const glow = ctx.createRadialGradient(17, 17, 1, 17, 17, 17);
    glow.addColorStop(0, SCENE_PALETTES[theme].light);
    glow.addColorStop(1, 'rgba(255,220,180,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, 34, 34);
    glows.set(theme, canvas);
  }
  return canvas;
}

/** Luz decorativa suave, limitada à face da parede. Não interfere com salas apagadas. */
export function drawSeasonalLights(ctx: CanvasRenderingContext2D, theme: SeasonalTheme, layout: AreaLayout, light: number): void {
  if (theme === 'none' || light <= 0.01) return;
  ctx.save();
  for (const wall of layout.walls) {
    if (wall.kind !== 'face') continue;
    ctx.save();
    ctx.beginPath();
    ctx.rect(wall.x, wall.y + 4, wall.w, 27);
    ctx.clip();
    for (let x = wall.x + 14; x < wall.x + wall.w - 6; x += 24) {
      if (wall.doorways?.some((d) => x >= d.x - 10 && x <= d.x + d.w + 10)) continue;
      ctx.globalAlpha = light * 0.3;
      ctx.drawImage(glowSprite(theme), Math.round(x - 17), wall.y - 8);
      ctx.globalAlpha = light * 0.85;
      ctx.fillStyle = SCENE_PALETTES[theme].light;
      ctx.fillRect(Math.round(x), wall.y + 9, 2, 2);
    }
    ctx.restore();
  }
  ctx.restore();
}

export function drawSeasonalWindow(ctx: CanvasRenderingContext2D, theme: SeasonalTheme, glass: { x: number; y: number; w: number; h: number }, now: number, seed: number): void {
  if (!['christmas', 'aurora', 'sunset', 'new-year', 'carnival', 'easter', 'valentine', 'festa-junina', 'independence'].includes(theme)) return;
  ctx.save();
  ctx.beginPath();
  ctx.rect(glass.x, glass.y, glass.w, glass.h);
  ctx.clip();
  if (theme === 'christmas') {
    ctx.fillStyle = '#edf3f3';
    ctx.globalAlpha *= 0.7;
    ctx.fillRect(glass.x, glass.y + glass.h - 2, glass.w, 2);
    for (let i = 0; i < 12; i++) {
      const x = ((seed >>> 0) + i * 17) % Math.max(1, Math.floor(glass.w));
      const y = (Math.floor(now / 180) + i * 11) % Math.max(1, Math.floor(glass.h));
      ctx.fillRect(Math.floor(glass.x + x), Math.floor(glass.y + y), 1, 1);
    }
  } else if (theme === 'aurora') {
    const bands = ['#71c8bc', '#9c9de0', '#c5e7c5'];
    const baseAlpha = ctx.globalAlpha;
    for (let row = 0; row < bands.length; row++) {
      ctx.globalAlpha = baseAlpha * 0.23;
      ctx.fillStyle = bands[row];
      const baseY = glass.y + 2 + row * Math.max(2, Math.floor(glass.h / 4));
      const drift = Math.floor(now / 900 + row * 3) % 5;
      for (let x = Math.floor(glass.x); x < glass.x + glass.w; x += 4) {
        const rise = (Math.floor((x - glass.x + drift) / 4) % 3) - 1;
        ctx.fillRect(x, baseY + rise, Math.min(4, glass.x + glass.w - x), 2);
      }
    }
    ctx.globalAlpha = baseAlpha * 0.8;
    ctx.fillStyle = '#f1f6d0';
    for (let i = 0; i < 4; i++) {
      const x = ((seed >>> 0) + i * 13) % Math.max(1, Math.floor(glass.w));
      const y = (i * 7 + 2) % Math.max(1, Math.floor(glass.h));
      ctx.fillRect(Math.floor(glass.x + x), Math.floor(glass.y + y), 1, 1);
    }
  } else if (theme === 'new-year' || theme === 'carnival' || theme === 'valentine' || theme === 'festa-junina' || theme === 'independence') {
    const colors = theme === 'new-year' ? ['#ffe39a', '#fc877e', '#7dd5c0']
      : theme === 'valentine' ? ['#f27d96', '#ffe0ad']
        : theme === 'independence' ? ['#3d9a62', '#f4d45f', '#4e84ad']
          : theme === 'festa-junina' ? ['#e15c4d', '#f1cb59', '#497aa0'] : ['#f2cc58', '#6eb89a', '#d9678d'];
    for (let i = 0; i < 10; i++) {
      const x = Math.floor(glass.x + (((seed >>> 0) + i * 17) % Math.max(1, Math.floor(glass.w))));
      const y = Math.floor(glass.y + ((i * 7 + Math.floor(now / 260)) % Math.max(1, Math.floor(glass.h))));
      ctx.fillStyle = colors[i % colors.length];
      if (theme === 'new-year' && i % 3 === 0) {
        ctx.fillRect(x - 2, y, 5, 1);
        ctx.fillRect(x, y - 2, 1, 5);
      } else {
        ctx.fillRect(x, y, 2, 2);
      }
    }
  } else if (theme === 'easter') {
    const colors = ['#f1ca68', '#7bc4b0', '#cb8ab5'];
    for (let i = 0; i < 5; i++) {
      const x = Math.floor(glass.x + (((seed >>> 0) + i * 13) % Math.max(1, Math.floor(glass.w))));
      const y = Math.floor(glass.y + glass.h * 0.55 + (i % 2) * 3);
      ctx.fillStyle = colors[i % colors.length];
      ctx.fillRect(x, y + 1, 4, 3);
      ctx.fillRect(x + 1, y, 2, 1);
    }
  } else {
    const cx = Math.floor(glass.x + glass.w * 0.66);
    const cy = Math.floor(glass.y + glass.h * 0.4);
    ctx.globalAlpha *= 0.9;
    ctx.fillStyle = '#ee9a55';
    ctx.fillRect(cx - 6, cy - 3, 12, 8);
    ctx.fillRect(cx - 4, cy - 5, 8, 2);
    ctx.fillRect(cx - 3, cy + 5, 6, 2);
    ctx.fillStyle = '#ffe08a';
    ctx.fillRect(cx - 4, cy - 2, 8, 6);
    ctx.fillStyle = '#d67c56';
    ctx.globalAlpha *= 0.7;
    for (let row = 0; row < 3; row++) {
      const y = Math.floor(glass.y + glass.h * 0.72 + row * 2);
      ctx.fillRect(glass.x, y, glass.w, 1);
    }
  }
  ctx.restore();
}
