import { afterEach, describe, expect, it } from 'vitest';
import type { Camera } from './camera';
import { attachInput, type InputHandlers } from './input';

/** `window` mínimo: o listener de teclado da câmera registra em `keydown`. */
function installWindow(): { dispatch(ev: { key: string; target: unknown }): void; restore(): void } {
  const prev = globalThis.window;
  const listeners = new Set<(ev: KeyboardEvent) => void>();
  globalThis.window = {
    addEventListener(_type: string, fn: (ev: KeyboardEvent) => void) {
      listeners.add(fn);
    },
    removeEventListener(_type: string, fn: (ev: KeyboardEvent) => void) {
      listeners.delete(fn);
    },
  } as unknown as Window & typeof globalThis;
  return {
    dispatch(partial) {
      const ev = {
        defaultPrevented: false,
        ctrlKey: false,
        metaKey: false,
        altKey: false,
        preventDefault() {
          this.defaultPrevented = true;
        },
        ...partial,
      };
      for (const fn of listeners) fn(ev as unknown as KeyboardEvent);
    },
    restore() {
      globalThis.window = prev;
    },
  };
}

function canvas(): HTMLCanvasElement {
  return {
    style: {},
    addEventListener() {},
    removeEventListener() {},
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 0, height: 0 }),
    setPointerCapture() {},
  } as unknown as HTMLCanvasElement;
}

function handlers(): InputHandlers {
  return { pick: () => null, click() {}, doubleClick() {}, hover() {}, interact() {}, overview() {}, zoomStep() {} };
}

describe('teclado da câmera', () => {
  let win: ReturnType<typeof installWindow>;
  let off: (() => void) | null = null;

  afterEach(() => {
    off?.();
    off = null;
    win?.restore();
  });

  it('ArrowRight com foco num rádio não move a câmera', () => {
    win = installWindow();
    const pans: [number, number][] = [];
    const camera = { zoom: 1, panBy: (dx: number, dy: number) => pans.push([dx, dy]), zoomAt() {}, settle() {} } as unknown as Camera;
    off = attachInput(canvas(), camera, handlers());
    win.dispatch({
      key: 'ArrowRight',
      target: {
        tagName: 'BUTTON',
        isContentEditable: false,
        getAttribute: (name: string) => (name === 'role' ? 'radio' : null),
      },
    });
    // O bug: a seta do grupo de velocidade chegava aqui como panBy(-90, 0).
    expect(pans).toEqual([]);
  });

  it('ArrowRight com foco num botão comum continua movendo a câmera', () => {
    win = installWindow();
    const pans: [number, number][] = [];
    const camera = { zoom: 1, panBy: (dx: number, dy: number) => pans.push([dx, dy]), zoomAt() {}, settle() {} } as unknown as Camera;
    off = attachInput(canvas(), camera, handlers());
    // Depois de clicar num botão da barra, o foco fica nele: as setas ainda são da câmera.
    win.dispatch({ key: 'ArrowRight', target: { tagName: 'BUTTON', isContentEditable: false, getAttribute: () => null } });
    expect(pans).toEqual([[-90, 0]]);
  });

  it('ArrowRight com foco no mundo continua movendo a câmera', () => {
    win = installWindow();
    const pans: [number, number][] = [];
    const camera = { zoom: 1, panBy: (dx: number, dy: number) => pans.push([dx, dy]), zoomAt() {}, settle() {} } as unknown as Camera;
    off = attachInput(canvas(), camera, handlers());
    win.dispatch({
      key: 'ArrowRight',
      target: { tagName: 'BODY', isContentEditable: false },
    });
    expect(pans).toEqual([[-90, 0]]);
  });
});
