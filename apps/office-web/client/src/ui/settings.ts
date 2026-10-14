// Configurações (popover): opções do escritório, avisos, modo demonstração e Sobre (versão).
import type { UiComponent, UiContext } from './context';
import { h, iconButton, setAttr, setHidden, setText } from './dom';
import { ICONS } from './icons';
import { notificationState, type Notifier } from './notify';
import { isValidThemeSchedule, type UiPrefs } from './prefs';
import { SoundSettingsGroup } from './settings-sound';
import type { SoundControl } from './sound';
import { AboutGroup } from './version';
import { LOCALE_STORAGE_KEY, LOCALES, normalizeLocale, tr, type Locale } from '../../../shared/i18n';
import { DEFAULT_THEME_SCHEDULE, type SeasonalTheme, type ThemeSchedule } from '../world/api';

type LanguageChoice = 'auto' | Locale;

const THEME_SCHEDULE_LABELS = [tr('Amanhecer'), tr('Dia'), tr('Fim de tarde'), tr('Noite')] as const;
const SCENE_CHOICES: [SeasonalTheme, string][] = [
  ['none', tr('Original')],
  ['garden', tr('Jardim')],
  ['sunset', tr('Pôr do sol')],
  ['aurora', tr('Aurora')],
  ['christmas', tr('Natal')],
  ['halloween', tr('Halloween')],
  ['new-year', tr('Ano-Novo')],
  ['carnival', tr('Carnaval')],
  ['easter', tr('Páscoa')],
  ['valentine', tr('Dia dos Namorados')],
  ['festa-junina', tr('Festa Junina')],
  ['independence', tr('Independência')],
];

/** Idioma escolhido nas Configurações ("auto" = o do navegador). */
function savedLanguage(): LanguageChoice {
  try {
    return normalizeLocale(localStorage.getItem(LOCALE_STORAGE_KEY)) ?? 'auto';
  } catch {
    return 'auto';
  }
}

/** Salva a escolha e recarrega: os textos são montados uma vez, ao carregar a página. */
function pickLanguage(v: LanguageChoice): void {
  if (v === savedLanguage()) return;
  try {
    if (v === 'auto') localStorage.removeItem(LOCALE_STORAGE_KEY);
    else localStorage.setItem(LOCALE_STORAGE_KEY, v);
  } catch {
    return;
  }
  location.reload();
}

type BoolPref = { [K in keyof UiPrefs]: UiPrefs[K] extends boolean ? K : never }[keyof UiPrefs];

interface SwitchRefs {
  btn: HTMLButtonElement;
  hint: HTMLElement;
}

function switchRow(label: string, hintText: string, onToggle: () => void): SwitchRefs & { row: HTMLElement } {
  const id = `ui-sw-${label.replace(/\W+/g, '-').toLowerCase()}`;
  const btn = h('button', { class: 'ui-switch', type: 'button', role: 'switch', attrs: { 'aria-checked': 'false', 'aria-labelledby': id } }, h('span', { class: 'ui-switch__knob' }));
  btn.addEventListener('click', onToggle);
  const hint = h('span', { class: 'ui-set__hint', text: hintText });
  const row = h('div', { class: 'ui-set' }, h('div', { class: 'ui-set__text' }, h('span', { class: 'ui-set__label', text: label, attrs: { id } }), hint), btn);
  return { row, btn, hint };
}

function segmented<T extends string>(label: string, options: readonly [T, string][], onPick: (v: T) => void): { row: HTMLElement; set(v: T): void } {
  const group = h('div', { class: 'ui-seg', role: 'radiogroup', attrs: { 'aria-label': label } });
  const buttons = options.map(([value, text]) => {
    const b = h('button', { class: 'ui-seg__opt', type: 'button', role: 'radio', text, attrs: { 'aria-checked': 'false' } });
    b.addEventListener('click', () => onPick(value));
    b.addEventListener('keydown', (e) => {
      // Setas navegam entre as opções (padrão de radiogroup).
      if (!['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp'].includes(e.key)) return;
      e.preventDefault();
      e.stopPropagation();
      const i = options.findIndex(([v]) => v === value);
      const forward = e.key === 'ArrowRight' || e.key === 'ArrowDown';
      const next = options[(i + (forward ? 1 : options.length - 1)) % options.length];
      onPick(next[0]);
      buttons[options.indexOf(next)].focus();
    });
    group.append(b);
    return b;
  });
  const row = h('div', { class: 'ui-set ui-set--stack' }, h('span', { class: 'ui-set__label', text: label }), group);
  return {
    row,
    set(v: T) {
      options.forEach(([value], i) => {
        const on = value === v;
        setAttr(buttons[i], 'aria-checked', String(on));
        buttons[i].tabIndex = on ? 0 : -1;
      });
    },
  };
}

export class SettingsPopover implements UiComponent {
  readonly el: HTMLElement;
  private switches = new Map<BoolPref | 'demo', SwitchRefs>();
  private bubbles: ReturnType<typeof segmented<UiPrefs['bubbles']>>;
  private liveliness: ReturnType<typeof segmented<UiPrefs['liveliness']>>;
  private daylight: ReturnType<typeof segmented<UiPrefs['daylight']>>;
  private uiPalette: ReturnType<typeof segmented<UiPrefs['uiPalette']>>;
  private theme: ReturnType<typeof segmented<UiPrefs['theme']>>;
  private holidayThemesRow: HTMLElement;
  private themeScheduleGroup: HTMLElement;
  private themeScheduleFields: { start: HTMLInputElement; theme: HTMLSelectElement }[] = [];
  private language: ReturnType<typeof segmented<LanguageChoice>>;
  private soundGroup: SoundSettingsGroup;
  private demoGroup: HTMLElement;
  private about: AboutGroup;
  private demoBusy = false;
  private anchor: HTMLElement | null = null;

  constructor(
    private ctx: UiContext,
    private notifier: Notifier,
    sound: SoundControl,
  ) {
    const sw = (key: BoolPref | 'demo', label: string, hint: string, onToggle: () => void) => {
      const r = switchRow(label, hint, onToggle);
      this.switches.set(key, r);
      return r.row;
    };
    const flip = (key: BoolPref) => () => ctx.updatePrefs({ [key]: !ctx.prefs[key] } as Partial<UiPrefs>);

    this.bubbles = segmented<UiPrefs['bubbles']>(
      tr('Balões de atividade'),
      [
        ['all', tr('Todos')],
        ['important', tr('Importantes')],
        ['none', tr('Nenhum')],
      ],
      (v) => ctx.updatePrefs({ bubbles: v }),
    );
    this.liveliness = segmented<UiPrefs['liveliness']>(
      tr('Movimento pelo escritório'),
      [
        ['calm', tr('Calmo')],
        ['normal', tr('Normal')],
        ['lively', tr('Agitado')],
      ],
      (v) => ctx.updatePrefs({ liveliness: v }),
    );
    this.daylight = segmented<UiPrefs['daylight']>(
      tr('Ciclo dia/noite'),
      [
        ['auto', tr('Automático')],
        ['day', tr('Sempre dia')],
        ['night', tr('Sempre noite')],
      ],
      (v) => ctx.updatePrefs({ daylight: v }),
    );
    this.daylight.row.append(h('span', { class: 'ui-set__hint', text: tr('Automático: céu, luzes e sol nas janelas seguem a hora local.') }));
    this.uiPalette = segmented<UiPrefs['uiPalette']>(
      tr('Paleta da interface'),
      [
        ['midnight', tr('Noite')],
        ['forest', tr('Mata')],
        ['ember', tr('Âmbar')],
        ['high-contrast', tr('Alto contraste')],
      ],
      (v) => ctx.updatePrefs({ uiPalette: v }),
    );
    this.uiPalette.row.classList.add('ui-set--palette');
    this.uiPalette.row.append(h('span', { class: 'ui-set__hint', text: tr('A paleta muda os painéis e destaques. Ela é independente do cenário do escritório.') }));
    this.theme = segmented<UiPrefs['theme']>(
      tr('Cenário do escritório'),
      [
        ['auto', tr('Automático')],
        ['none', tr('Original')],
        ['christmas', tr('Natal')],
        ['halloween', tr('Halloween')],
        ['garden', tr('Jardim')],
        ['aurora', tr('Aurora')],
        ['sunset', tr('Pôr do sol')],
        ['new-year', tr('Ano-Novo')],
        ['carnival', tr('Carnaval')],
        ['easter', tr('Páscoa')],
        ['valentine', tr('Dia dos Namorados')],
        ['festa-junina', tr('Festa Junina')],
        ['independence', tr('Independência')],
      ],
      (v) => ctx.updatePrefs({ theme: v }),
    );
    this.theme.row.classList.add('ui-set--scene-theme');
    this.theme.row.append(h('span', { class: 'ui-set__hint', text: tr('Automático alterna por datas e horários; selecione outro cenário para mantê-lo fixo.') }));
    this.holidayThemesRow = sw(
      'holidayThemes',
      tr('Datas comemorativas'),
      tr('Calendário brasileiro e internacional no fuso local: Carnaval (sexta a terça antes da Quaresma), Páscoa (sexta a domingo), Namorados (14/02 e 12/06), Festa Junina (15–30/06), Independência (07/09), Halloween (outubro), Natal (01/11–26/12) e Ano-Novo (27/12–02/01).'),
      flip('holidayThemes'),
    );
    const scheduleRows = THEME_SCHEDULE_LABELS.map((label, index) => {
      const slotName = label;
      const start = h('input', {
        class: 'ui-theme-schedule__time',
        type: 'time',
        attrs: { step: 60, 'aria-label': tr('Horário de início: {0}', [slotName]) },
      });
      const themeSelect = h('select', {
        class: 'ui-theme-schedule__scene',
        attrs: { 'aria-label': tr('Cenário de {0}', [slotName]) },
      });
      for (const [value, name] of SCENE_CHOICES) {
        themeSelect.append(h('option', { text: name, attrs: { value } }));
      }
      start.addEventListener('change', () => this.updateThemeSchedule(index, { start: start.value }));
      themeSelect.addEventListener('change', () => this.updateThemeSchedule(index, { theme: themeSelect.value as SeasonalTheme }));
      this.themeScheduleFields.push({ start, theme: themeSelect });
      return h(
        'div',
        { class: 'ui-theme-schedule__row' },
        h('span', { class: 'ui-theme-schedule__period', text: slotName }),
        start,
        themeSelect,
      );
    });
    this.themeScheduleGroup = h(
      'div',
      { class: 'ui-theme-schedule' },
      h('h3', { text: tr('Programação por horário') }),
      h('span', { class: 'ui-set__hint', text: tr('Usa o relógio e o fuso horário do dispositivo. Cada cenário vale até o próximo horário.') }),
      h('div', { class: 'ui-theme-schedule__grid' }, ...scheduleRows),
      h('span', { class: 'ui-set__hint', text: tr('As datas comemorativas ativadas têm prioridade sobre estes horários.') }),
    );
    this.soundGroup = new SoundSettingsGroup(ctx, sound);

    // Nomes dos idiomas sempre na própria língua, para quem não entende o idioma atual achar o seu.
    this.language = segmented<LanguageChoice>(
      tr('Idioma da interface'),
      [['auto', tr('Automático')], ...LOCALES.map((l): [LanguageChoice, string] => [l.id, l.name])],
      (v) => pickLanguage(v),
    );
    this.language.row.append(
      h('span', { class: 'ui-set__hint', text: tr('Os textos das atividades vêm do servidor: seguem HABBLAUD_LANG ou o idioma do sistema onde o Habblaud roda (o inglês, só com HABBLAUD_LANG=en).') }),
    );

    this.demoGroup = h(
      'div',
      { class: 'ui-set-group' },
      h('h3', { text: tr('Dados') }),
      sw('demo', tr('Modo demonstração'), tr('Coloca agentes fictícios no escritório, junto com os reais.'), () => void this.toggleDemo()),
    );

    this.about = new AboutGroup(ctx);

    const close = iconButton(ICONS.close, tr('Fechar configurações'), () => this.hide(), 'ui-icon-btn--sm');
    this.el = h(
      'div',
      { class: 'ui-popover ui-settings', role: 'dialog', tabIndex: -1, attrs: { 'aria-label': tr('Configurações'), id: 'ui-settings', popover: 'auto' } },
      h('div', { class: 'ui-popover__head' }, h('h2', { text: tr('Configurações') }), close),
      h('div', { class: 'ui-set-group' }, h('h3', { text: tr('Aparência') }), this.uiPalette.row, this.theme.row, this.holidayThemesRow, this.themeScheduleGroup),
      h(
        'div',
        { class: 'ui-set-group' },
        h('h3', { text: tr('Escritório') }),
        sw('showNames', tr('Mostrar nomes'), tr('Etiqueta com o nome acima de cada personagem.'), flip('showNames')),
        this.bubbles.row,
        this.liveliness.row,
        this.daylight.row,
      ),
      h(
        'div',
        { class: 'ui-set-group' },
        h('h3', { text: tr('Avisos') }),
        sw('browserNotifications', tr('Notificações do navegador'), tr('Avisa quando alguém precisa de você e a aba está em segundo plano.'), () => void this.toggleNotifications()),
      ),
      this.soundGroup.el,
      h('div', { class: 'ui-set-group' }, h('h3', { text: tr('Idioma') }), this.language.row),
      this.demoGroup,
      this.about.el,
    );
    this.el.addEventListener('toggle', () => {
      this.anchor?.setAttribute('aria-expanded', String(this.isOpen));
      this.syncRootClass();
      if (this.isOpen) this.render();
    });
  }

  get isOpen(): boolean {
    try {
      return this.el.matches(':popover-open');
    } catch {
      return this.el.classList.contains('is-open');
    }
  }

  toggle(anchor: HTMLElement): void {
    this.anchor = anchor;
    if (this.isOpen) return this.hide();
    const r = anchor.getBoundingClientRect();
    this.el.style.top = `${Math.round(r.bottom + 8)}px`;
    this.el.style.right = `${Math.max(8, Math.round(innerWidth - r.right - 4))}px`;
    if (typeof this.el.showPopover === 'function') this.el.showPopover();
    else this.el.classList.add('is-open');
    anchor.setAttribute('aria-expanded', 'true');
    this.syncRootClass();
    // Leva o foco para dentro do popover (sem anel de foco num controle específico).
    this.el.focus();
  }

  /** Abre (se fechado) e leva até a seção "Sobre". */
  showAbout(anchor: HTMLElement): void {
    if (!this.isOpen) this.toggle(anchor);
    this.render();
    requestAnimationFrame(() => this.about.highlight());
  }

  hide(): void {
    if (typeof this.el.hidePopover === 'function' && this.isOpen) this.el.hidePopover();
    this.el.classList.remove('is-open');
    this.anchor?.setAttribute('aria-expanded', 'false');
    this.syncRootClass();
  }

  /** Com o popover aberto, os avisos recolhem (não aparecem por trás nem ao lado dele). */
  private syncRootClass(): void {
    this.ctx.root.classList.toggle('has-popover', this.isOpen);
  }

  render(): void {
    const p = this.ctx.prefs;
    for (const [key, r] of this.switches) {
      const on = key === 'demo' ? !!this.ctx.store.liveSnapshot?.meta.demo : p[key];
      setAttr(r.btn, 'aria-checked', String(on));
      r.btn.disabled = key === 'demo' && this.demoBusy;
    }
    this.bubbles.set(p.bubbles);
    this.liveliness.set(p.liveliness);
    this.daylight.set(p.daylight);
    this.uiPalette.set(p.uiPalette);
    this.theme.set(p.theme);
    setHidden(this.holidayThemesRow, p.theme !== 'auto');
    setHidden(this.themeScheduleGroup, p.theme !== 'auto');
    this.themeScheduleFields.forEach((field, index) => {
      field.start.value = p.themeSchedule[index].start || DEFAULT_THEME_SCHEDULE[index].start;
      field.theme.value = p.themeSchedule[index].theme;
    });
    this.language.set(savedLanguage());
    this.soundGroup.render();
    setHidden(this.demoGroup, this.ctx.store.mock);
    this.about.render();

    const notif = this.switches.get('browserNotifications')!;
    const state = notificationState();
    const hint =
      state === 'unsupported'
        ? tr('Este navegador não oferece notificações.')
        : state === 'denied'
          ? tr('Bloqueadas pelo navegador: libere nas permissões do site.')
          : tr('Avisa quando alguém precisa de você e a aba está em segundo plano.');
    setText(notif.hint, hint);
    notif.btn.disabled = state === 'unsupported';
  }

  private updateThemeSchedule(index: number, patch: Partial<UiPrefs['themeSchedule'][number]>): void {
    const schedule = this.ctx.prefs.themeSchedule.map((slot) => ({ ...slot })) as ThemeSchedule;
    schedule[index] = { ...schedule[index], ...patch };
    if (!isValidThemeSchedule(schedule)) {
      this.ctx.announce(tr('Mantenha os horários em ordem, do mais cedo ao mais tarde.'));
      this.themeScheduleFields[index].start.value = this.ctx.prefs.themeSchedule[index].start;
      this.themeScheduleFields[index].theme.value = this.ctx.prefs.themeSchedule[index].theme;
      return;
    }
    this.ctx.updatePrefs({ themeSchedule: schedule });
  }

  private async toggleNotifications(): Promise<void> {
    if (this.ctx.prefs.browserNotifications) {
      this.ctx.updatePrefs({ browserNotifications: false });
      return;
    }
    const state = await this.notifier.enableBrowserNotifications();
    this.ctx.updatePrefs({ browserNotifications: state === 'granted' });
    if (state === 'denied') this.ctx.announce(tr('Notificações bloqueadas pelo navegador.'));
  }

  private async toggleDemo(): Promise<void> {
    if (this.demoBusy) return;
    this.demoBusy = true;
    this.render();
    const enable = !this.ctx.store.snapshot?.meta.demo;
    try {
      const ok = await this.ctx.store.setDemo(enable);
      this.ctx.announce(ok ? (enable ? tr('Modo demonstração ligado.') : tr('Modo demonstração desligado.')) : tr('Não foi possível mudar o modo demonstração.'));
    } catch {
      this.ctx.announce(tr('Não foi possível falar com o servidor.'));
    } finally {
      this.demoBusy = false;
      this.ctx.invalidate();
    }
  }
}
