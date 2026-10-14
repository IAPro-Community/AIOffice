// Configurações (popover): opções do escritório, avisos, modo demonstração e Sobre (versão).
import type { UiComponent, UiContext } from './context';
import { h, iconButton, setAttr, setHidden, setText, setVariant } from './dom';
import { ICONS } from './icons';
import { notificationState, type Notifier } from './notify';
import { isValidThemeSchedule, type UiPrefs } from './prefs';
import { SoundSettingsGroup } from './settings-sound';
import type { SoundControl } from './sound';
import { AboutGroup } from './version';
import { MaestroUpdateGroup } from './maestro-update';
import { intlLocale, LOCALE_STORAGE_KEY, LOCALES, normalizeLocale, tr, type Locale } from '../../../shared/i18n';
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
  private maestro: MaestroUpdateGroup;
  private mobileAccess: MobileAccessGroup;
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
    this.maestro = new MaestroUpdateGroup(ctx);
    this.mobileAccess = new MobileAccessGroup(ctx);

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
      this.mobileAccess.el,
      this.maestro.el,
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
    this.mobileAccess.setVisible(this.isOpen);
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
    this.mobileAccess.render();
    this.maestro.render();
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

interface MobileSession {
  id: string;
  device: string;
  loggedInAt: number;
  lastSeenAt: number;
  expiresAt: number;
}

interface MobileSessionRow {
  el: HTMLElement;
  device: HTMLElement;
  login: HTMLElement;
  activity: HTMLElement;
  expiry: HTMLElement;
  revoke: HTMLButtonElement;
  feedback: HTMLElement;
}

/** Lista local de acessos autenticados, sem cookies ou credenciais no DOM. */
class MobileSessionsGroup {
  readonly el: HTMLElement;
  private list = h('ul', { class: 'ui-mobile-access__session-list' });
  private status = h('p', { class: 'ui-set__hint', role: 'status', attrs: { 'aria-live': 'polite' } });
  private rows = new Map<string, MobileSessionRow>();
  private sessions: MobileSession[] = [];
  private revoking = new Set<string>();
  private errors = new Map<string, string>();
  private active = false;
  private visible = false;
  private controlsAllowed = false;
  private tunnel = '';
  private timer: number | undefined;
  private generation = 0;
  private loading = false;
  private loaded = false;
  private error = '';
  private feedback = '';

  constructor(private ctx: UiContext) {
    this.el = h('section', { class: 'ui-mobile-access__sessions', attrs: { 'aria-labelledby': 'ui-mobile-sessions-heading' } },
      h('h4', { text: tr('Dispositivos com acesso'), attrs: { id: 'ui-mobile-sessions-heading' } }),
      h('p', { class: 'ui-set__hint', text: tr('Revogue um dispositivo para exigir um novo código de acesso. Datas e horários são exibidos no horário local deste navegador.') }),
      this.status,
      this.list,
    );
    document.addEventListener('visibilitychange', () => this.syncPolling());
  }

  setVisible(visible: boolean): void {
    this.visible = visible;
    this.syncPolling();
  }

  update(active: boolean, tunnel: string, controlsAllowed: boolean): void {
    if (this.active !== active || this.tunnel !== tunnel) {
      this.generation += 1;
      this.sessions = [];
      this.revoking.clear();
      this.errors.clear();
      this.loading = this.loaded = false;
      this.error = this.feedback = '';
    }
    this.active = active;
    this.tunnel = tunnel;
    this.controlsAllowed = controlsAllowed;
    this.render();
    this.syncPolling();
  }

  private syncPolling(): void {
    const shouldPoll = this.active && this.visible && document.visibilityState === 'visible';
    if (!shouldPoll && this.timer !== undefined) {
      window.clearInterval(this.timer);
      this.timer = undefined;
    } else if (shouldPoll && this.timer === undefined) {
      this.timer = window.setInterval(() => void this.refresh(), 15_000);
      void this.refresh();
    } else if (shouldPoll && !this.loaded && !this.loading && !this.error) {
      void this.refresh();
    }
  }

  async refresh(): Promise<void> {
    if (!this.active || !this.visible || document.visibilityState !== 'visible' || this.loading || this.revoking.size) return;
    const generation = this.generation;
    this.loading = true;
    this.error = '';
    this.render();
    try {
      const response = await fetch('/api/remote-access/sessions', { cache: 'no-store', credentials: 'omit', signal: AbortSignal.timeout(8_000) });
      const body: unknown = await response.json();
      if (!response.ok || !body || typeof body !== 'object' || !('sessions' in body) || !Array.isArray(body.sessions)) throw new Error('invalid sessions');
      const sessions: MobileSession[] = [];
      const ids = new Set<string>();
      for (const value of body.sessions as unknown[]) {
        if (!value || typeof value !== 'object') throw new Error('invalid session');
        const data = value as Record<string, unknown>;
        if (typeof data.id !== 'string' || !data.id || ids.has(data.id) || typeof data.device !== 'string' ||
          typeof data.loggedInAt !== 'number' || !Number.isFinite(data.loggedInAt) ||
          typeof data.lastSeenAt !== 'number' || !Number.isFinite(data.lastSeenAt) ||
          typeof data.expiresAt !== 'number' || !Number.isFinite(data.expiresAt)) throw new Error('invalid session');
        ids.add(data.id);
        sessions.push({ id: data.id, device: data.device, loggedInAt: data.loggedInAt, lastSeenAt: data.lastSeenAt, expiresAt: data.expiresAt });
      }
      if (generation !== this.generation) return;
      this.sessions = sessions;
      this.loaded = true;
    } catch {
      if (generation !== this.generation) return;
      this.error = tr('Não foi possível consultar os dispositivos. Atualize o estado para tentar novamente.');
    } finally {
      if (generation === this.generation) {
        this.loading = false;
        this.render();
      }
    }
  }

  private render(): void {
    setAttr(this.list, 'aria-busy', String(this.loading));
    setText(this.status, !this.active ? tr('Inicie o túnel para consultar os dispositivos com acesso.')
      : this.error || this.feedback || (!this.loaded && this.loading ? tr('Consultando dispositivos…')
        : this.loaded && !this.sessions.length ? tr('Nenhum dispositivo com acesso. Entre pelo celular usando um código gerado neste painel.') : ''));
    this.status.classList.toggle('ui-mobile-access__error', !!this.error);
    const ids = new Set(this.sessions.map((session) => session.id));
    for (const [id, row] of this.rows) {
      if (!ids.has(id)) { row.el.remove(); this.rows.delete(id); this.errors.delete(id); }
    }
    const formatDate = (value: number) => new Date(value).toLocaleString(intlLocale(), { dateStyle: 'short', timeStyle: 'short' });
    this.sessions.forEach((session, index) => {
      let row = this.rows.get(session.id);
      if (!row) {
        const device = h('strong', { class: 'ui-mobile-access__session-device' });
        const login = h('span', { class: 'ui-set__hint' });
        const activity = h('span', { class: 'ui-set__hint' });
        const expiry = h('span', { class: 'ui-set__hint' });
        const feedback = h('p', { class: 'ui-mobile-access__error', role: 'alert', hidden: true });
        const revoke = h('button', { class: 'ui-btn ui-btn--sm ui-btn--danger', type: 'button', on: { click: () => void this.revoke(session) } });
        const el = h('li', { class: 'ui-mobile-access__session' }, h('div', { class: 'ui-mobile-access__session-details' }, device, login, activity, expiry), revoke, feedback);
        row = { el, device, login, activity, expiry, revoke, feedback };
        this.rows.set(session.id, row);
      }
      const label = session.device.trim() || tr('Dispositivo desconhecido');
      setText(row.device, label);
      setText(row.login, tr('Entrada: {0}', [formatDate(session.loggedInAt)]));
      setText(row.activity, tr('Última atividade: {0}', [formatDate(session.lastSeenAt)]));
      setText(row.expiry, tr('Acesso válido até: {0}', [formatDate(session.expiresAt)]));
      setText(row.revoke, this.revoking.has(session.id) ? tr('Revogando…') : tr('Revogar'));
      setAttr(row.revoke, 'aria-label', tr('Revogar acesso de {0}', [label]));
      row.revoke.disabled = !this.active || !this.controlsAllowed || this.loading || this.revoking.has(session.id);
      const error = this.errors.get(session.id) ?? '';
      setText(row.feedback, error);
      setHidden(row.feedback, !error);
      if (this.list.children[index] !== row.el) this.list.insertBefore(row.el, this.list.children[index] ?? null);
    });
  }

  private async revoke(session: MobileSession): Promise<void> {
    if (!this.active || !this.controlsAllowed || this.loading || this.revoking.has(session.id)) return;
    const generation = this.generation;
    this.revoking.add(session.id);
    this.errors.delete(session.id);
    this.feedback = '';
    this.render();
    try {
      const response = await fetch(`/api/remote-access/sessions/${encodeURIComponent(session.id)}/revoke`, {
        method: 'POST', credentials: 'omit', headers: { 'Content-Type': 'application/json' }, body: '{}', signal: AbortSignal.timeout(8_000),
      });
      if (response.status !== 404) {
        const body: unknown = await response.json();
        if (!response.ok || !body || typeof body !== 'object' || !('ok' in body) || body.ok !== true) throw new Error('revoke failed');
      }
      if (generation !== this.generation) return;
      const row = this.rows.get(session.id);
      const focusRemoved = row?.el.contains(document.activeElement);
      this.sessions = this.sessions.filter((item) => item.id !== session.id);
      this.feedback = response.status === 404 ? tr('Este dispositivo já não tem acesso.') : tr('Acesso de {0} revogado.', [session.device.trim() || tr('Dispositivo desconhecido')]);
      this.ctx.announce(this.feedback);
      this.render();
      if (focusRemoved) {
        const next = [...this.rows.values()].find((item) => !item.revoke.disabled)?.revoke;
        if (next) next.focus();
        else { this.status.tabIndex = -1; this.status.focus(); }
      }
    } catch {
      if (generation === this.generation) this.errors.set(session.id, tr('Não foi possível revogar este acesso. Tente novamente.'));
    } finally {
      if (generation === this.generation) {
        this.revoking.delete(session.id);
        this.render();
        void this.refresh();
      }
    }
  }
}

type MobileAccessAction = 'configure' | 'start' | 'stop';
type CloudflareAccessStatus = {
  available?: boolean;
  unavailableReason?: 'docker' | 'cloudflared_missing' | 'development_mode';
  configured: boolean;
  state: 'disabled' | 'starting' | 'active' | 'error';
  url?: string;
  error?: string;
};

function readRemoteAccess(value: unknown): CloudflareAccessStatus | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const data = value as Record<string, unknown>;
  if (typeof data.configured !== 'boolean' || !['disabled', 'starting', 'active', 'error'].includes(String(data.state))) return undefined;
  return {
    available: typeof data.available === 'boolean' ? data.available : undefined,
    unavailableReason: data.unavailableReason === 'docker' || data.unavailableReason === 'cloudflared_missing' || data.unavailableReason === 'development_mode' ? data.unavailableReason : undefined,
    configured: data.configured,
    state: data.state as CloudflareAccessStatus['state'],
    url: typeof data.url === 'string' ? data.url : undefined,
    error: typeof data.error === 'string' ? data.error : undefined,
  };
}

function remoteAccessError(value: unknown): string {
  if (value === 'cloudflared_missing') return tr('O Cloudflare Tunnel não está instalado. Instale o cloudflared e atualize o estado.');
  if (value === 'development_mode') return tr('Para acessar pelo celular, feche o servidor de desenvolvimento e inicie o AIOffice pelo arquivo start-aioffice.bat.');
  if (value === 'tunnel_start_failed') return tr('Não foi possível iniciar o túnel. Corrija o problema indicado e tente novamente.');
  if (value === 'tunnel_stopped') return tr('Não foi possível parar o túnel. Atualize o estado e tente novamente.');
  if (value === 'not_configured') return tr('Configure o acesso antes de iniciar o túnel.');
  if (value === 'tunnel_not_active') return tr('Inicie o túnel antes de gerar um código de acesso.');
  return tr('Não foi possível alterar o túnel. Atualize o estado e tente novamente.');
}

function publicTunnelUrl(value: unknown): URL | undefined {
  if (typeof value !== 'string') return undefined;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || !url.hostname.endsWith('.trycloudflare.com')) return undefined;
    return url;
  } catch {
    return undefined;
  }
}

/** Configuração e controle do Cloudflare Quick Tunnel apenas pelo navegador local do servidor. */
class MobileAccessGroup implements UiComponent {
  readonly el: HTMLElement;
  private sessions: MobileSessionsGroup;
  private status: HTMLElement;
  private detail: HTMLElement;
  private address: HTMLAnchorElement;
  private addressPanel: HTMLElement;
  private qrPanel: HTMLElement;
  private qrImage: HTMLImageElement;
  private qrStatus: HTMLElement;
  private codePanel: HTMLElement;
  private codeOutput: HTMLElement;
  private codeStatus: HTMLElement;
  private codeButton: HTMLButtonElement;
  private copyCodeButton: HTMLButtonElement;
  private setup: HTMLFormElement;
  private configureBtn: HTMLButtonElement;
  private actionBtn: HTMLButtonElement;
  private refreshBtn: HTMLButtonElement;
  private copyBtn: HTMLButtonElement;
  private copyStatus: HTMLElement;
  private confirmation: HTMLElement;
  private confirmationText: HTMLElement;
  private confirmBtn: HTMLButtonElement;
  private cancelBtn: HTMLButtonElement;
  private failure: HTMLElement;
  private install: HTMLElement;
  private localHint: HTMLElement;
  private pending: MobileAccessAction | null = null;
  private busy: MobileAccessAction | 'status' | 'code' | null = null;
  private requestError = '';
  private stateUnconfirmed = false;
  private responseRemote: CloudflareAccessStatus | undefined;
  private snapshotRemote: unknown;
  private linksKey = '';
  private qrKey = '';
  private qrGeneration = 0;
  private loginCode = '';
  private codeExpiryTimer: number | undefined;

  constructor(private ctx: UiContext) {
    this.sessions = new MobileSessionsGroup(ctx);
    this.status = h('p', { class: 'ui-about__status', role: 'status', attrs: { 'aria-live': 'polite' } });
    this.detail = h('p', { class: 'ui-set__hint', text: tr('Configure o acesso pelo painel. O AIOffice abrirá um túnel público temporário do Cloudflare.') });
    this.address = h('a', { class: 'ui-link-btn ui-mobile-access__url', attrs: { target: '_blank', rel: 'noopener noreferrer' } });
    this.copyStatus = h('span', { class: 'ui-set__hint', role: 'status', attrs: { 'aria-live': 'polite' } });
    this.copyBtn = h('button', { class: 'ui-btn ui-btn--sm', type: 'button', text: tr('Copiar link'), on: { click: () => void this.copyUrl() } });
    this.qrImage = h('img', {
      class: 'ui-mobile-access__qr-image',
      attrs: { alt: tr('QR code do acesso móvel do AIOffice'), width: '192', height: '192', decoding: 'async' },
    });
    this.qrStatus = h('span', { class: 'ui-set__hint', role: 'status', attrs: { 'aria-live': 'polite' } });
    this.qrPanel = h('div', { class: 'ui-mobile-access__qr', hidden: true },
      h('p', { class: 'ui-set__hint', text: tr('Escaneie este QR code com a câmera do celular para abrir o link.') }),
      this.qrImage,
      this.qrStatus,
    );
    this.codeOutput = h('code', { class: 'ui-mobile-access__code-value' });
    this.codeStatus = h('p', { class: 'ui-set__hint', role: 'status', attrs: { 'aria-live': 'polite' } });
    this.codeButton = h('button', { class: 'ui-btn ui-btn--sm ui-btn--primary', type: 'button', text: tr('Gerar código de acesso'), on: { click: () => void this.refreshAccessCode() } });
    this.copyCodeButton = h('button', { class: 'ui-btn ui-btn--sm', type: 'button', text: tr('Copiar código'), on: { click: () => void this.copyAccessCode() } });
    this.codePanel = h('div', { class: 'ui-mobile-access__code', hidden: true },
      h('p', { class: 'ui-set__hint', text: tr('Gere o código de seis caracteres aqui e digite-o na página aberta no celular. Ele expira em cinco minutos, funciona uma vez e não fica no link nem no QR code.') }),
      this.codeOutput,
      h('div', { class: 'ui-mobile-access__actions' }, this.codeButton, this.copyCodeButton),
      this.codeStatus,
    );
    this.addressPanel = h('div', { class: 'ui-mobile-access__links' },
      this.address,
      this.copyBtn,
      this.copyStatus,
      this.qrPanel,
      this.codePanel,
      h('p', { class: 'ui-set__hint ui-mobile-access__security', text: tr('Este link usa um endereço temporário do Cloudflare. Se o Chrome marcar o site como perigoso, não prossiga nem informe o código. Trocar a senha por um código não remove um alerta do Safe Browsing.') }),
    );
    this.configureBtn = h('button', { class: 'ui-btn ui-btn--sm ui-btn--primary', type: 'submit', text: tr('Criar acesso e gerar link') });
    this.setup = h(
      'form',
      { class: 'ui-mobile-access__setup', on: { submit: (event) => { event.preventDefault(); this.ask('configure'); } } },
      h('p', { class: 'ui-set__hint', text: tr('O painel gera códigos temporários para entrar pelo celular. Nenhuma senha mestra é solicitada ou armazenada.') }),
      this.configureBtn,
    );
    this.actionBtn = h('button', { class: 'ui-btn ui-btn--sm', type: 'button', on: { click: () => this.ask(this.remote?.state === 'active' ? 'stop' : 'start') } });
    this.refreshBtn = h('button', { class: 'ui-btn ui-btn--sm', type: 'button', text: tr('Atualizar estado'), on: { click: () => void this.refresh() } });
    this.confirmationText = h('p', { class: 'ui-set__hint', attrs: { id: 'ui-mobile-access-confirmation' } });
    this.confirmBtn = h('button', { class: 'ui-btn ui-btn--sm is-confirm', type: 'button', attrs: { 'aria-describedby': 'ui-mobile-access-confirmation' }, on: { click: () => void this.perform() } });
    this.cancelBtn = h('button', { class: 'ui-btn ui-btn--sm', type: 'button', text: tr('Cancelar'), on: { click: () => { this.pending = null; this.render(); (this.remote?.configured ? this.actionBtn : this.configureBtn).focus(); } } });
    this.confirmation = h('div', { class: 'ui-mobile-access__confirmation', hidden: true }, this.confirmationText, h('div', { class: 'ui-mobile-access__actions' }, this.confirmBtn, this.cancelBtn));
    this.failure = h('p', { class: 'ui-mobile-access__error', role: 'alert', hidden: true });
    const installLink = h('a', { class: 'ui-link-btn', text: tr('Instruções para instalar o cloudflared'), attrs: { href: 'https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/', target: '_blank', rel: 'noopener noreferrer' } });
    this.install = h('div', { class: 'ui-mobile-access__install', hidden: true },
      h('p', { class: 'ui-set__hint', text: tr('O serviço cloudflared não foi encontrado neste computador. Instale-o pelas instruções oficiais, reinicie o AIOffice e atualize o estado.') }), installLink,
    );
    this.localHint = h('p', { class: 'ui-set__hint', text: tr('Configure, inicie ou pare o túnel no navegador do computador que executa o AIOffice, por localhost ou 127.0.0.1.') });
    this.el = h(
      'div',
      { class: 'ui-set-group ui-mobile-access' },
      h('h3', { text: tr('Acesso pelo celular') }),
      this.status,
      this.detail,
      this.install,
      this.addressPanel,
      this.setup,
      h('div', { class: 'ui-mobile-access__actions' }, this.actionBtn, this.refreshBtn),
      this.confirmation,
      this.failure,
      this.localHint,
      this.sessions.el,
      h('p', { class: 'ui-set__hint ui-mobile-access__privacy', text: tr('O link é público e temporário. Qualquer pessoa com o endereço pode abrir a tela de acesso; só o código temporário permite entrar. O tráfego passa pela infraestrutura do Cloudflare, que pode processá-lo. Compartilhe link e código com cuidado.') }),
    );
  }

  private get remote(): CloudflareAccessStatus | undefined {
    const snapshot = this.ctx.store.liveSnapshot?.meta.remoteAccess;
    if (snapshot !== this.snapshotRemote) {
      this.snapshotRemote = snapshot;
      this.responseRemote = undefined;
      if (snapshot) this.stateUnconfirmed = false;
    }
    return this.responseRemote ?? readRemoteAccess(snapshot);
  }

  private get localControl(): boolean {
    const hostname = location.hostname;
    const ipv4 = hostname.split('.');
    const loopback = ['localhost', '[::1]', '::1'].includes(hostname)
      || (ipv4.length === 4 && ipv4[0] === '127' && ipv4.every((part) => /^\d{1,3}$/.test(part) && Number(part) <= 255));
    return loopback && !this.ctx.store.mock && !this.ctx.store.replaying;
  }

  setVisible(visible: boolean): void {
    this.sessions.setVisible(visible);
  }

  render(): void {
    const remote = this.remote;
    const configured = !!remote?.configured;
    const active = remote?.state === 'active';
    const starting = remote?.state === 'starting';
    if (!active && this.qrKey) this.clearQr();
    const unavailable = remote?.available === false;
    setHidden(this.sessions.el, !this.localControl || unavailable);
    this.sessions.update(active && this.localControl && !unavailable, active ? remote?.url ?? '' : '', !this.busy && !this.stateUnconfirmed);
    const blocked = !this.localControl || !!this.busy || !remote || unavailable || starting || this.stateUnconfirmed;
    if (!active && this.loginCode) this.clearAccessCode();
    if (this.pending && (blocked || this.pending !== (active ? 'stop' : configured ? 'start' : 'configure'))) this.pending = null;
    setAttr(this.el, 'aria-busy', String(!!this.busy || starting));
    setHidden(this.setup, !remote || unavailable || configured || active || starting);
    setHidden(this.actionBtn, unavailable || !configured || starting);
    setHidden(this.refreshBtn, !remote || !this.localControl);
    setHidden(this.localHint, unavailable || this.localControl);
    setHidden(this.addressPanel, unavailable || !active);
    setHidden(this.install, !unavailable || remote?.unavailableReason !== 'cloudflared_missing');
    this.actionBtn.disabled = blocked;
    this.refreshBtn.disabled = !!this.busy;
    this.configureBtn.disabled = blocked;
    setText(this.actionBtn, this.busy === 'stop' ? tr('Parando túnel…') : this.busy === 'start' ? tr('Iniciando túnel…') : active ? tr('Parar túnel') : tr('Iniciar túnel'));
    this.actionBtn.classList.toggle('ui-btn--danger', active);
    setText(this.configureBtn, this.busy === 'configure' ? tr('Criando túnel…') : tr('Criar acesso e gerar link'));
    setText(this.refreshBtn, this.busy === 'status' ? tr('Consultando estado…') : tr('Atualizar estado'));
    setHidden(this.codePanel, !active || !this.localControl);
    this.codeButton.disabled = !active || !this.localControl || !!this.busy;
    this.copyCodeButton.disabled = !this.loginCode || !this.localControl;
    setText(this.codeButton, this.busy === 'code' ? tr('Gerando código…') : this.loginCode ? tr('Gerar novo código') : tr('Gerar código de acesso'));
    setHidden(this.codeOutput, !this.loginCode);
    setText(this.codeOutput, this.loginCode);
    this.copyBtn.disabled = !this.localControl || !active || !publicTunnelUrl(remote?.url);
    setHidden(this.confirmation, !this.pending);
    this.confirmBtn.disabled = blocked;
    this.cancelBtn.disabled = !!this.busy;
    if (this.pending) {
      setText(this.confirmationText, this.pending === 'stop'
        ? tr('Parar o túnel? O link deixará de funcionar até você iniciá-lo novamente.')
        : tr('Criar ou iniciar um link público temporário do Cloudflare? Qualquer pessoa com o endereço pode abrir a tela de login. O tráfego passa pela infraestrutura do Cloudflare, que pode processá-lo.'));
      setText(this.confirmBtn, this.pending === 'stop' ? tr('Confirmar parada') : tr('Confirmar e continuar'));
    }
    const error = this.requestError || (remote?.error ? remoteAccessError(remote.error) : '');
    setText(this.failure, error);
    setHidden(this.failure, !error);
    if (!remote) {
      setText(this.status, tr('O servidor não informa o estado do túnel. Reinicie com npm run start:office para carregar a integração.'));
      setVariant(this.status, 'is-', 'warn');
      return;
    }
    if (unavailable) {
      setText(this.status, remote.unavailableReason === 'docker'
        ? tr('O acesso pelo celular não está disponível quando o AIOffice roda em Docker.')
        : remote.unavailableReason === 'development_mode'
          ? tr('Para acessar pelo celular, feche o servidor de desenvolvimento e inicie o AIOffice pelo arquivo start-aioffice.bat.')
          : tr('cloudflared indisponível neste computador.'));
      setVariant(this.status, 'is-', 'warn');
      return;
    }
    if (remote.state === 'disabled') {
      setText(this.status, configured ? tr('Túnel parado. O acesso está configurado.') : tr('Acesso desativado. Crie o acesso para gerar o link.'));
      setVariant(this.status, 'is-', 'off');
      return;
    }
    if (remote.state === 'starting') {
      setText(this.status, tr('Iniciando o túnel do Cloudflare…'));
      setVariant(this.status, 'is-', 'pending');
      return;
    }
    if (remote.state === 'error') {
      setText(this.status, tr('Não foi possível iniciar o túnel. Corrija o problema indicado e tente novamente.'));
      setVariant(this.status, 'is-', 'warn');
      return;
    }

    const url = publicTunnelUrl(remote.url);
    if (!url) {
      this.linksKey = '';
      this.clearQr();
      setText(this.status, tr('Túnel ativo, mas o link público ainda não está disponível. Atualize o estado.'));
      setVariant(this.status, 'is-', 'warn');
      this.address.removeAttribute('href');
      this.address.textContent = '';
      return;
    }
    setText(this.status, tr('Túnel Cloudflare ativo.'));
    setVariant(this.status, 'is-', 'ok');
    if (this.linksKey !== url.href) {
      this.linksKey = url.href;
      this.address.href = url.href;
      this.address.textContent = url.href;
    }
    if (this.qrKey !== url.href) {
      this.qrKey = url.href;
      void this.renderQr(url.href);
    }
  }

  private async renderQr(url: string): Promise<void> {
    const generation = ++this.qrGeneration;
    setHidden(this.qrPanel, false);
    setText(this.qrStatus, tr('Gerando QR code…'));
    try {
      const QRCode = await import('qrcode');
      const dataUrl = await QRCode.toDataURL(url, {
        errorCorrectionLevel: 'M',
        margin: 2,
        width: 192,
        color: { dark: '#101820ff', light: '#ffffffff' },
      });
      if (generation !== this.qrGeneration || this.qrKey !== url) return;
      this.qrImage.src = dataUrl;
      setText(this.qrStatus, tr('QR code pronto. Aponte a câmera do celular.'));
    } catch {
      if (generation !== this.qrGeneration || this.qrKey !== url) return;
      this.qrImage.removeAttribute('src');
      setText(this.qrStatus, tr('Não foi possível gerar o QR code. Use o link copiado.'));
    }
  }

  private clearQr(): void {
    this.qrGeneration += 1;
    this.qrKey = '';
    this.qrImage.removeAttribute('src');
    setText(this.qrStatus, '');
    setHidden(this.qrPanel, true);
  }

  private ask(action: MobileAccessAction): void {
    const remote = this.remote;
    if (!this.localControl || this.busy || !remote || remote.available === false || remote.state === 'starting' || this.stateUnconfirmed) return;
    if (action !== (remote.state === 'active' ? 'stop' : remote.configured ? 'start' : 'configure')) return;
    this.requestError = '';
    this.pending = action;
    this.render();
    this.confirmBtn.focus();
  }

  private accept(remote: CloudflareAccessStatus): void {
    this.snapshotRemote = this.ctx.store.liveSnapshot?.meta.remoteAccess;
    this.responseRemote = remote;
    this.stateUnconfirmed = false;
  }

  private async loadStatus(): Promise<void> {
    const response = await fetch('/api/remote-access/status', { cache: 'no-store', signal: AbortSignal.timeout(8_000) });
    if (!response.ok) throw new Error('status unavailable');
    const body = await response.json() as Record<string, unknown>;
    const remote = readRemoteAccess(body.remoteAccess ?? body);
    if (!remote) throw new Error('invalid status');
    this.accept(remote);
  }

  private async refresh(): Promise<void> {
    if (!this.localControl || this.busy || !this.remote) return;
    this.busy = 'status';
    this.pending = null;
    this.requestError = '';
    this.render();
    try {
      await this.loadStatus();
      this.render();
      await this.sessions.refresh();
    } catch {
      this.requestError = tr('Não foi possível consultar o estado. Confira o servidor e tente atualizar novamente.');
    } finally {
      this.busy = null;
      this.render();
      this.ctx.invalidate();
    }
  }

  private async copyUrl(): Promise<void> {
    const url = publicTunnelUrl(this.remote?.url);
    if (!url || !this.localControl) return;
    try {
      await navigator.clipboard.writeText(url.href);
      setText(this.copyStatus, tr('Link copiado.'));
      this.ctx.announce(tr('Link copiado.'));
    } catch {
      setText(this.copyStatus, tr('Não foi possível copiar o link. Selecione o endereço e copie.'));
    }
  }

  private async refreshAccessCode(fromTunnelAction = false): Promise<void> {
    if (!this.localControl || (this.busy && !fromTunnelAction) || this.remote?.state !== 'active') return;
    const previousBusy = this.busy;
    this.busy = 'code';
    this.requestError = '';
    this.codeStatus.textContent = '';
    this.render();
    try {
      const response = await fetch('/api/remote-access/code', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}', signal: AbortSignal.timeout(8_000),
      });
      const body = await response.json() as Record<string, unknown>;
      const issued = body.loginCode && typeof body.loginCode === 'object' ? body.loginCode as Record<string, unknown> : undefined;
      if (!response.ok || typeof issued?.code !== 'string' || !/^[A-HJ-NP-Z2-9]{6}$/.test(issued.code) ||
          typeof issued.expiresAt !== 'number' || issued.expiresAt <= Date.now()) {
        throw new Error(typeof body.error === 'string' ? body.error : 'tunnel_not_active');
      }
      this.clearAccessCode();
      this.loginCode = issued.code;
      this.codeExpiryTimer = window.setTimeout(() => {
        if (this.loginCode !== issued.code) return;
        this.clearAccessCode();
        setText(this.codeStatus, tr('O código expirou. Gere um novo código.'));
        this.render();
      }, issued.expiresAt - Date.now());
      setText(this.codeStatus, tr('Código de seis caracteres gerado. Digite-o no celular em até cinco minutos; ele só pode ser usado uma vez.'));
      if (!fromTunnelAction) this.ctx.announce(tr('Código de acesso gerado.'));
    } catch (error) {
      this.requestError = remoteAccessError(error instanceof Error ? error.message : undefined);
    } finally {
      this.busy = previousBusy;
      this.render();
      this.ctx.invalidate();
    }
  }

  private async copyAccessCode(): Promise<void> {
    if (!this.loginCode || !this.localControl) return;
    try {
      await navigator.clipboard.writeText(this.loginCode);
      setText(this.codeStatus, tr('Código copiado.'));
      this.ctx.announce(tr('Código copiado.'));
    } catch {
      setText(this.codeStatus, tr('Não foi possível copiar o código. Selecione e copie manualmente.'));
    }
  }

  private clearAccessCode(): void {
    if (this.codeExpiryTimer !== undefined) window.clearTimeout(this.codeExpiryTimer);
    this.codeExpiryTimer = undefined;
    this.loginCode = '';
    setText(this.codeStatus, '');
  }

  private async perform(): Promise<void> {
    const action = this.pending;
    const remote = this.remote;
    if (!action || !remote || !this.localControl || this.busy || remote.available === false || remote.state === 'starting' || this.stateUnconfirmed) return;
    if (action !== (remote.state === 'active' ? 'stop' : remote.configured ? 'start' : 'configure')) { this.pending = null; this.render(); return; }
    this.busy = action;
    this.pending = null;
    this.requestError = '';
    this.render();
    try {
      const response = await fetch(`/api/remote-access/${action}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}', signal: AbortSignal.timeout(60_000),
      });
      const body = await response.json() as Record<string, unknown>;
      const result = readRemoteAccess(body.remoteAccess ?? body);
      if (result) this.accept(result);
      if (!response.ok || !result) this.requestError = remoteAccessError(body.error ?? result?.error);
      else {
        if (action === 'stop') this.clearAccessCode();
        if (result.state === 'active' && action !== 'stop') await this.refreshAccessCode(true);
        this.ctx.announce(action === 'stop' ? tr('Túnel parado.') : result.state === 'active' ? tr('Túnel Cloudflare ativo.') : tr('A solicitação foi recebida. Aguarde a confirmação do estado.'));
      }
    } catch {
      try {
        await this.loadStatus();
        const state = this.remote;
        if (action === 'stop' ? state?.state !== 'disabled' : state?.state !== 'active') this.requestError = tr('A resposta da operação se perdeu. O estado foi consultado; confira-o antes de tentar novamente.');
      } catch {
        this.stateUnconfirmed = true;
        this.requestError = tr('A resposta da operação se perdeu e o estado não pôde ser confirmado. Atualize o estado antes de tentar novamente.');
      }
    } finally {
      this.busy = null;
      this.render();
      this.ctx.invalidate();
    }
  }
}
