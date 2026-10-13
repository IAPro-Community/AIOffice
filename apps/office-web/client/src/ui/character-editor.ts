// Editor do personagem na gaveta do agente: nome, "Sortear" e as peças (pele, cabelo, roupa...) com prévia de corpo
// inteiro. "Salvar" grava o personagem do projeto (a sala) no servidor; as regras puras (quando aparece, rótulos, o
// que vai em `parts`) estão em character-model.ts.
import { NAME_MAX, type PartKey } from '../../../shared/appearance';
import type { AgentInfo } from '../../../shared/types';
import { appearanceFromSeed, characterSprite, editorConflict, editorOptions, fitToOptions } from '../art';
import type { Appearance } from '../art/api';
import { canEditCharacter, changedParts, EDITOR_GROUPS, rowVisible, styleLabel, type EditorRow } from './character-model';
import type { UiContext } from './context';
import { h, iconButton, setAttr, setHidden, setText } from './dom';
import { ICONS } from './icons';
import { isLocalHostname } from './permission';
import { tr } from '../../../shared/i18n';

/** Pixels de tela por pixel do personagem na prévia. */
const PREVIEW_SCALE = 4;

function randomSeed(): number {
  return crypto.getRandomValues(new Uint32Array(1))[0];
}

export class CharacterEditor {
  /** Lápis "Editar personagem", ao lado do nome no topo da gaveta. */
  readonly button: HTMLButtonElement;
  /** Painel do editor (escondido enquanto não está editando). */
  readonly el: HTMLElement;
  private agentId = '';
  private editId = 0;
  private editing = false;
  private busy = false;
  private confirmingReset = false;
  private seed = 0;
  private look: 'f' | 'm' = 'f';
  /** Aparência sorteada pela seed (sem peças): o que não mudar não vai em `parts`. */
  private base: Appearance | null = null;
  private draft: Appearance | null = null;
  private readonly nameInput: HTMLInputElement;
  private readonly preview: HTMLCanvasElement;
  private readonly groups: HTMLElement;
  private readonly error: HTMLElement;
  private readonly saveBtn: HTMLButtonElement;
  private readonly resetBtn: HTMLButtonElement;

  constructor(private ctx: UiContext) {
    this.button = iconButton(ICONS.pencil, tr('Editar personagem'), () => (this.editing ? this.cancel() : this.start()), 'ui-icon-btn--sm ui-char-edit');
    setAttr(this.button, 'aria-expanded', 'false');
    this.button.hidden = true;

    this.nameInput = h('input', { class: 'ui-char__name', type: 'text', attrs: { maxlength: NAME_MAX, autocomplete: 'off', spellcheck: 'false' } });
    this.preview = h('canvas', { class: 'ui-char__preview', role: 'img', attrs: { 'aria-label': tr('Prévia do personagem') } });
    const roll = h('button', { class: 'ui-btn ui-btn--sm', type: 'button', text: tr('Sortear'), title: tr('Sortear outra aparência (desfaz as peças escolhidas)'), on: { click: () => this.roll() } });
    this.groups = h('div', { class: 'ui-char__groups' });
    this.error = h('p', { class: 'ui-char__error', role: 'alert', hidden: true });
    this.saveBtn = h('button', { class: 'ui-btn ui-btn--primary', type: 'button', text: tr('Salvar'), on: { click: () => void this.save() } });
    const cancel = h('button', { class: 'ui-btn', type: 'button', text: tr('Cancelar'), on: { click: () => this.cancel() } });
    this.resetBtn = h('button', { class: 'ui-link-btn ui-char__reset', type: 'button', text: tr('Voltar ao sorteio'), on: { click: () => void this.reset() } });
    this.el = h(
      'section',
      { class: 'ui-char', hidden: true, attrs: { 'aria-label': tr('Editar personagem') }, on: { keydown: (ev) => this.onKey(ev) } },
      h(
        'div',
        { class: 'ui-char__top' },
        this.preview,
        h('div', { class: 'ui-char__head' }, h('label', { class: 'ui-char__label' }, h('span', { text: tr('Nome') }), this.nameInput), roll),
      ),
      h('p', { class: 'ui-muted ui-small', text: tr('Vale para o projeto: a próxima sessão nesta sala chega com este personagem.') }),
      this.groups,
      this.error,
      h('div', { class: 'ui-char__actions' }, this.saveBtn, cancel, this.resetBtn),
    );
  }

  /** Outro agente na gaveta: descarta a edição em andamento. */
  open(id: string): void {
    if (id !== this.agentId) this.close();
    this.agentId = id;
  }

  /** A cada render da gaveta: o lápis só aparece quando dá para editar; o editor fecha se o agente saiu. */
  render(a: AgentInfo, live: boolean): void {
    const store = this.ctx.store;
    const allowed = canEditCharacter(a, {
      live,
      terminal: !!store.snapshot?.meta.terminal,
      local: isLocalHostname(location.hostname),
      replaying: store.replaying,
      mock: store.mock,
    });
    setHidden(this.button, !allowed);
    if (this.editing && !allowed) {
      this.close();
      if (!live || a.status === 'offline') this.ctx.announce(tr('O agente saiu do escritório.'));
    }
    if (this.editing && !this.confirmingReset) setHidden(this.resetBtn, !a.custom);
  }

  private start(): void {
    const a = this.ctx.agent(this.agentId);
    if (!a) return;
    this.editId++;
    this.seed = a.seed;
    this.look = a.look;
    this.base = appearanceFromSeed(a.seed, { look: a.look });
    this.draft = { ...this.base, ...a.parts };
    this.nameInput.value = a.name;
    this.confirmingReset = false;
    setText(this.resetBtn, tr('Voltar ao sorteio'));
    setHidden(this.resetBtn, !a.custom);
    this.showError(null);
    this.editing = true;
    setHidden(this.el, false);
    setAttr(this.button, 'aria-expanded', 'true');
    this.paint();
    this.nameInput.focus();
    this.nameInput.select();
  }

  /** Fecha o editor e descarta o rascunho (também quando a gaveta fecha ou sai do agente). */
  close(): void {
    if (!this.editing) return;
    this.editing = false;
    this.busy = false;
    this.saveBtn.disabled = false;
    setHidden(this.el, true);
    setAttr(this.button, 'aria-expanded', 'false');
  }

  private cancel(): void {
    this.close();
    this.button.focus();
  }

  private roll(): void {
    this.seed = randomSeed();
    this.base = appearanceFromSeed(this.seed, { look: this.look });
    this.draft = { ...this.base };
    this.paint();
  }

  private pick(key: PartKey, value: string): void {
    if (!this.draft) return;
    this.draft = fitToOptions({ ...this.draft, [key]: value });
    this.paint(key);
  }

  private async save(): Promise<void> {
    if (this.busy || !this.base || !this.draft) return;
    const name = this.nameInput.value.trim();
    if (!name) return this.showError(tr('Dê um nome ao personagem.'));
    const id = this.agentId;
    const editId = this.editId;
    this.busy = true;
    this.saveBtn.disabled = true;
    const err = await this.ctx.store.saveCharacter(id, { name, seed: this.seed, parts: changedParts(this.base, this.draft) });
    if (!this.editing || this.agentId !== id || this.editId !== editId) return;
    this.busy = false;
    this.saveBtn.disabled = false;
    if (err) return this.showError(err);
    this.close();
    this.button.focus();
    this.ctx.announce(tr('Personagem salvo: {0}.', [name]));
  }

  private async reset(): Promise<void> {
    if (this.busy) return;
    if (!this.confirmingReset) {
      this.confirmingReset = true;
      setText(this.resetBtn, tr('Confirmar: voltar ao sorteio'));
      return;
    }
    const id = this.agentId;
    const editId = this.editId;
    this.busy = true;
    const err = await this.ctx.store.resetCharacter(id);
    if (!this.editing || this.agentId !== id || this.editId !== editId) return;
    this.busy = false;
    if (err) return this.showError(err);
    this.close();
    this.button.focus();
    this.ctx.announce(tr('O personagem voltou ao sorteio.'));
  }

  private showError(message: string | null): void {
    setText(this.error, message ?? '');
    setHidden(this.error, !message);
    if (message) this.nameInput.focus();
  }

  private onKey(ev: KeyboardEvent): void {
    if (ev.key === 'Escape') {
      ev.stopPropagation();
      this.cancel();
    } else if (ev.key === 'Enter' && ev.target === this.nameInput) {
      ev.preventDefault();
      void this.save();
    }
  }

  /** Redesenha a prévia e as opções; `focusKey` devolve o foco à opção marcada daquela linha. */
  private paint(focusKey?: PartKey): void {
    const a = this.draft;
    if (!a) return;
    this.drawPreview(a);
    const options = editorOptions(a);
    this.groups.replaceChildren(
      ...EDITOR_GROUPS.map((g) =>
        h(
          'fieldset',
          { class: 'ui-char__group' },
          h('legend', { text: g.title }),
          ...g.rows.filter((r) => rowVisible(r, a)).map((r) => this.row(g.title, r, a, options[r.key])),
        ),
      ),
    );
    if (focusKey) this.groups.querySelector<HTMLElement>(`[data-key="${focusKey}"] [aria-checked="true"]`)?.focus();
  }

  private row(group: string, r: EditorRow, a: Appearance, values: readonly string[]): HTMLElement {
    const current = a[r.key] ?? '';
    const isColor = r.kind === 'color';
    const buttons = values.map((v) => {
      const conflict = editorConflict(a, r.key, v);
      const label = isColor ? v : styleLabel(r.key, v);
      return h('button', {
        class: isColor ? 'ui-char__swatch' : 'ui-char__chip',
        type: 'button',
        role: 'radio',
        tabIndex: v === current ? 0 : -1,
        title: conflict ?? label,
        style: isColor ? `--swatch: ${v}` : undefined,
        text: isColor ? undefined : label,
        attrs: { 'aria-checked': String(v === current), 'aria-disabled': conflict ? 'true' : undefined, 'aria-label': isColor ? v : undefined },
        on: { click: () => (conflict ? undefined : this.pick(r.key, v)) },
      });
    });
    if (buttons.length && !buttons.some((b) => b.tabIndex === 0)) buttons[0].tabIndex = 0;
    const list = h(
      'div',
      { class: `ui-char__opts ui-char__opts--${r.kind}`, role: 'radiogroup', attrs: { 'aria-label': `${group}: ${r.label}`, 'data-key': r.key } },
      ...buttons,
    );
    list.addEventListener('keydown', (ev) => this.onRadioKey(ev, buttons, r.key, values));
    return h('div', { class: 'ui-char__row' }, h('span', { class: 'ui-char__row-label', text: r.label }), list);
  }

  /** Setas mudam a escolha dentro da linha (padrão de radiogroup), pulando opções desabilitadas. */
  private onRadioKey(ev: KeyboardEvent, buttons: HTMLButtonElement[], key: PartKey, values: readonly string[]): void {
    const step = ev.key === 'ArrowRight' || ev.key === 'ArrowDown' ? 1 : ev.key === 'ArrowLeft' || ev.key === 'ArrowUp' ? -1 : 0;
    if (!step) return;
    ev.preventDefault();
    const n = buttons.length;
    const from = Math.max(0, buttons.indexOf(document.activeElement as HTMLButtonElement));
    for (let i = 1; i < n; i++) {
      const j = (((from + step * i) % n) + n) % n;
      if (buttons[j].getAttribute('aria-disabled') !== 'true') return this.pick(key, values[j]);
    }
  }

  private drawPreview(a: Appearance): void {
    try {
      const s = characterSprite({ appearance: a, dir: 'down', pose: 'stand', frame: 0 });
      const c = this.preview;
      c.width = s.canvas.width * PREVIEW_SCALE;
      c.height = s.canvas.height * PREVIEW_SCALE;
      const g = c.getContext('2d');
      if (!g) return;
      g.imageSmoothingEnabled = false;
      g.clearRect(0, 0, c.width, c.height);
      g.drawImage(s.canvas, 0, 0, c.width, c.height);
    } catch (err) {
      // A arte ainda pode estar em construção: o editor continua utilizável sem a prévia.
      console.warn('[ui] falha ao desenhar a prévia do personagem', err);
    }
  }
}
