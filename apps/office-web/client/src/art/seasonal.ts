// Decorações procedurais em pixel art. Mesma escala dos móveis do escritório.
import { PixelBuf } from './core/pixbuf';
import type { BufSprite } from './core/sprite';

export type SeasonalProp = 'tree' | 'gift' | 'pumpkin' | 'ghost' | 'wreath' | 'bat' | 'flower' | 'crystal' | 'sun';

export function renderSeasonalProp(kind: SeasonalProp): BufSprite {
  const b = new PixelBuf(40, 64);
  const rect = (x: number, y: number, w: number, h: number, c: string) => b.rect(x, y, w, h, c);
  if (kind === 'tree') {
    b.shadow(20, 59, 17, 3, '#252c39', 0.22);
    rect(17, 49, 6, 9, '#80573d');
    for (let row = 0; row < 4; row++) {
      const y = 13 + row * 8;
      const half = 6 + row * 3;
      rect(20 - half, y, half * 2 + 1, 9, '#245644');
      rect(22 - half, y, half * 2 - 4, 6, '#387956');
      rect(22 - half, y + 1, half - 1, 3, '#4d9361');
    }
    b.vline(20, 5, 13, '#ffe0a0');
    b.hline(16, 24, 9, '#ffe0a0');
    rect(18, 7, 5, 5, '#ffc45d');
    for (const [x, y] of [[16, 20], [24, 24], [13, 31], [25, 36], [9, 42], [20, 43], [31, 44]]) {
      rect(x, y, 3, 3, '#e05250');
      b.set(x, y, '#ffb27b');
    }
    for (const [x, y] of [[21, 17], [15, 26], [23, 30], [15, 38], [26, 42], [11, 47]]) {
      rect(x, y, 2, 2, '#ffe8b2');
    }
    rect(3, 52, 10, 8, '#a82d42');
    rect(6, 51, 2, 9, '#e5c17b');
    rect(3, 54, 10, 1, '#e5c17b');
    rect(26, 51, 10, 9, '#e6b357');
    rect(30, 50, 2, 10, '#b33549');
    rect(26, 54, 10, 1, '#b33549');
  } else if (kind === 'gift') {
    b.shadow(20, 59, 9, 2, '#252c39', 0.2);
    rect(11, 49, 17, 11, '#bf3849');
    rect(11, 49, 17, 3, '#e35a58');
    rect(18, 49, 3, 11, '#efd1a0');
    rect(11, 54, 17, 2, '#efd1a0');
    rect(14, 46, 5, 3, '#e8b860');
    rect(21, 46, 5, 3, '#e8b860');
  } else if (kind === 'pumpkin') {
    b.shadow(20, 59, 11, 2, '#252c39', 0.2);
    rect(18, 41, 3, 6, '#557342');
    rect(11, 46, 18, 14, '#c56832');
    rect(8, 49, 24, 8, '#e18b39');
    rect(13, 46, 4, 13, '#f0a647');
    rect(23, 47, 3, 12, '#f0a647');
    rect(12, 50, 4, 3, '#523347');
    rect(24, 50, 4, 3, '#523347');
    rect(17, 56, 7, 2, '#523347');
    b.set(13, 51, '#ffd680');
    b.set(25, 51, '#ffd680');
    b.hline(18, 22, 56, '#ffd680');
  } else if (kind === 'ghost') {
    rect(15, 39, 10, 3, '#e0dae9');
    rect(12, 42, 16, 15, '#e0dae9');
    rect(14, 41, 11, 15, '#fff4ed');
    rect(10, 47, 4, 4, '#e0dae9');
    rect(26, 47, 4, 4, '#e0dae9');
    for (const x of [12, 18, 24]) rect(x, 56, 4, 3, '#e0dae9');
    rect(16, 46, 2, 3, '#574563');
    rect(23, 46, 2, 3, '#574563');
    rect(19, 51, 3, 2, '#574563');
  } else if (kind === 'wreath') {
    rect(12, 39, 16, 4, '#347653');
    rect(10, 43, 5, 10, '#245644');
    rect(25, 43, 5, 10, '#347653');
    rect(13, 53, 15, 4, '#245644');
    for (const [x, y] of [[14, 41], [26, 47], [12, 50], [23, 54]]) rect(x, y, 2, 2, '#e45c58');
    rect(15, 55, 4, 4, '#c93945');
    rect(21, 55, 4, 4, '#c93945');
    rect(19, 54, 2, 4, '#f07368');
  } else if (kind === 'bat') {
    rect(18, 51, 5, 6, '#47344f');
    rect(10, 50, 9, 4, '#47344f');
    rect(22, 50, 9, 4, '#47344f');
    rect(7, 48, 4, 4, '#47344f');
    rect(30, 48, 4, 4, '#47344f');
    rect(13, 53, 3, 3, '#47344f');
    rect(25, 53, 3, 3, '#47344f');
    b.set(19, 52, '#f5b95f');
    b.set(21, 52, '#f5b95f');
  } else if (kind === 'flower') {
    b.shadow(20, 59, 13, 2, '#252c39', 0.2);
    rect(12, 51, 16, 8, '#a86d4b');
    rect(10, 48, 20, 4, '#d59a66');
    rect(19, 31, 2, 18, '#4c8a59');
    rect(13, 38, 7, 2, '#579764');
    rect(21, 42, 7, 2, '#579764');
    rect(12, 24, 5, 5, '#f08f9d');
    rect(10, 26, 9, 3, '#f7b0b8');
    rect(14, 23, 2, 7, '#f7b0b8');
    rect(22, 19, 5, 5, '#f4c75f');
    rect(20, 21, 9, 3, '#ffe28b');
    rect(24, 18, 2, 7, '#ffe28b');
    rect(29, 27, 5, 5, '#a88ce2');
    rect(27, 29, 9, 3, '#c1a9f2');
    rect(31, 26, 2, 7, '#c1a9f2');
    b.set(14, 26, '#ffe28b');
    b.set(24, 21, '#e8894d');
    b.set(31, 29, '#ffe28b');
  } else if (kind === 'crystal') {
    b.shadow(20, 59, 15, 3, '#252c39', 0.24);
    rect(8, 53, 24, 6, '#456d82');
    rect(12, 42, 7, 12, '#4f9cae');
    rect(13, 38, 5, 5, '#82d6d2');
    rect(19, 34, 8, 20, '#6e7fd0');
    rect(20, 29, 6, 6, '#abb4f0');
    rect(27, 43, 6, 11, '#a273c6');
    rect(28, 39, 4, 5, '#d09ce3');
    rect(14, 42, 2, 9, '#b8f0e2');
    rect(21, 35, 2, 15, '#e1e7ff');
    rect(29, 44, 2, 7, '#f1d6ff');
  } else {
    b.shadow(20, 59, 12, 2, '#252c39', 0.2);
    rect(19, 31, 3, 5, '#f2a849');
    rect(19, 46, 3, 5, '#f2a849');
    rect(10, 40, 5, 3, '#f2a849');
    rect(26, 40, 5, 3, '#f2a849');
    rect(14, 33, 3, 3, '#f2a849');
    rect(24, 45, 3, 3, '#f2a849');
    rect(24, 33, 3, 3, '#f2a849');
    rect(14, 45, 3, 3, '#f2a849');
    rect(14, 35, 14, 12, '#f2a849');
    rect(16, 36, 10, 10, '#ffd36f');
    rect(18, 37, 6, 8, '#ffe99f');
  }
  b.outline();
  return { buf: b, ax: 20, ay: 60 };
}
