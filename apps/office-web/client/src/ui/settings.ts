// Configurações (popover): opções do escritório, avisos, modo demonstração e Sobre (versão).
import type { UiComponent, UiContext } from './context';
import { h, iconButton, setAttr, setHidden, setText, setVariant } from './dom';
import { ICONS } from './icons';
import { notificationState, type Notifier } from './notify';
import { isValidThemeSchedule, type UiPrefs } from './prefs';
import { SoundSettingsGroup } from './settings-sound';
import type { SoundControl } from './sound';
import { AboutGroup } from './version';
import { LOCALE_STORAGE_KEY, LOCALES, normalizeLocale, tr, type Locale } from '../../../shared/i18n';
import { DEFAULT_THEME_SCHEDULE, type SeasonalTheme, type ThemeSchedule } from '../world/api';
import type { RemoteAccessStatus } from '../../../shared/types';

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
    this.mobileAccess.render();
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

type MobileAccessAction = 'configure' | 'start' | 'stop';

// Somente mensagens sanitizadas conhecidas são apresentadas; erros inesperados usam uma orientação segura.
const REMOTE_ACCESS_ERRORS = new Map<string, string>([
  ["Use um usuário de 1 a 64 caracteres: letras, números, ponto, hífen, sublinhado ou @.", tr("Use um usuário de 1 a 64 caracteres: letras, números, ponto, hífen, sublinhado ou @.")],
  ["Use uma senha com pelo menos 12 caracteres Unicode válidos.", tr("Use uma senha com pelo menos 12 caracteres Unicode válidos.")],
  ["A senha excede 1024 bytes.", tr("A senha excede 1024 bytes.")],
  ["Evite espaços no começo ou no fim da senha.", tr("Evite espaços no começo ou no fim da senha.")],
  ["A senha deve ser diferente do usuário.", tr("A senha deve ser diferente do usuário.")],
  ["A porta HTTPS já está em uso. Libere a porta e tente iniciar novamente.", tr("A porta HTTPS já está em uso. Libere a porta e tente iniciar novamente.")],
  ["O sistema negou permissão para abrir a porta HTTPS ou gravar a configuração.", tr("O sistema negou permissão para abrir a porta HTTPS ou gravar a configuração.")],
  ["O servidor está encerrando.", tr("O servidor está encerrando.")],
  ["Não foi possível gerar o hash da senha. Tente novamente.", tr("Não foi possível gerar o hash da senha. Tente novamente.")],
  ["Não foi possível preparar os certificados HTTPS. Confira o OpenSSL e as permissões da pasta de dados.", tr("Não foi possível preparar os certificados HTTPS. Confira o OpenSSL e as permissões da pasta de dados.")],
  ["Não foi possível salvar a configuração do acesso remoto. Confira as permissões do arquivo .env.", tr("Não foi possível salvar a configuração do acesso remoto. Confira as permissões do arquivo .env.")],
  ["Não foi possível validar a configuração HTTPS gerada.", tr("Não foi possível validar a configuração HTTPS gerada.")],
  ["Configure o usuário e a senha antes de iniciar o acesso remoto.", tr("Configure o usuário e a senha antes de iniciar o acesso remoto.")],
  ["Não foi possível salvar ou iniciar o acesso HTTPS. Confira a porta e as permissões do arquivo .env.", tr("Não foi possível salvar ou iniciar o acesso HTTPS. Confira a porta e as permissões do arquivo .env.")],
  ["A porta HTTPS foi fechada, mas não foi possível salvar a desativação no arquivo .env.", tr("A porta HTTPS foi fechada, mas não foi possível salvar a desativação no arquivo .env.")],
  ["O acesso pelo celular exige o servidor Node no computador; o controle HTTPS não está disponível no Docker.", tr("O acesso pelo celular exige o servidor Node no computador; o controle HTTPS não está disponível no Docker.")],
  ["Não foi possível renovar o certificado para a rede atual. Confira o OpenSSL e as permissões; se a CA não cobrir o endereço, use npm run remote:setup -- --new-ca e reinstale a CA no celular.", tr("Não foi possível renovar o certificado para a rede atual. Confira o OpenSSL e as permissões; se a CA não cobrir o endereço, use npm run remote:setup -- --new-ca e reinstale a CA no celular.")],
  ["A porta HTTPS encontrou um erro. Tente iniciar novamente.", tr("A porta HTTPS encontrou um erro. Tente iniciar novamente.")],
  ["Não foi possível iniciar a porta HTTPS. Confira o certificado e o endereço de escuta.", tr("Não foi possível iniciar a porta HTTPS. Confira o certificado e o endereço de escuta.")],
  ["Gerencie o acesso remoto pelo próprio computador (http://localhost).", tr("Gerencie o acesso remoto pelo próprio computador (http://localhost).")],
  ["Gerenciamento de acesso remoto indisponível.", tr("Gerenciamento de acesso remoto indisponível.")],
  ["A CA pública ainda não está disponível. Configure o acesso primeiro.", tr("A CA pública ainda não está disponível. Configure o acesso primeiro.")],
  ["Origem não permitida. Abra o AIOffice pelo navegador neste computador.", tr("Origem não permitida. Abra o AIOffice pelo navegador neste computador.")],
  ["Envie um objeto JSON.", tr("Envie um objeto JSON.")],
  ["O servidor está encerrando para aplicar uma atualização.", tr("O servidor está encerrando para aplicar uma atualização.")],
]);

function remoteAccessError(value: unknown): string {
  return typeof value === 'string' ? REMOTE_ACCESS_ERRORS.get(value) ?? tr('Não foi possível mudar o acesso. Atualize o estado e tente novamente.') : tr('Não foi possível mudar o acesso. Atualize o estado e tente novamente.');
}

/** Valida a resposta antes de apresentar um listener como ativo. Nunca aceita credenciais da resposta. */
function readRemoteAccess(value: unknown): RemoteAccessStatus | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const data = value as Record<string, unknown>;
  if (typeof data.configured !== 'boolean' || !['disabled', 'starting', 'active', 'error'].includes(String(data.state))) return undefined;
  return {
    available: typeof data.available === 'boolean' ? data.available : undefined,
    configured: data.configured,
    state: data.state as RemoteAccessStatus['state'],
    port: typeof data.port === 'number' ? data.port : undefined,
    user: typeof data.user === 'string' ? data.user : undefined,
    urls: Array.isArray(data.urls) ? data.urls.filter((url): url is string => typeof url === 'string') : undefined,
    caFingerprint: typeof data.caFingerprint === 'string' ? data.caFingerprint : undefined,
    error: typeof data.error === 'string' ? data.error : undefined,
  };
}

/** Configuração e controle HTTPS somente no computador servidor; snapshots continuam sendo a fonte ao vivo. */
class MobileAccessGroup implements UiComponent {
  readonly el: HTMLElement;
  private status: HTMLElement;
  private detail: HTMLElement;
  private addresses: HTMLElement;
  private setup: HTMLFormElement;
  private user: HTMLInputElement;
  private password: HTMLInputElement;
  private passwordConfirm: HTMLInputElement;
  private configureBtn: HTMLButtonElement;
  private actionBtn: HTMLButtonElement;
  private refreshBtn: HTMLButtonElement;
  private confirmation: HTMLElement;
  private confirmationText: HTMLElement;
  private confirmBtn: HTMLButtonElement;
  private cancelBtn: HTMLButtonElement;
  private failure: HTMLElement;
  private identity: HTMLElement;
  private certificate: HTMLElement;
  private fingerprint: HTMLElement;
  private caLink: HTMLAnchorElement;
  private localHint: HTMLElement;
  private pending: MobileAccessAction | null = null;
  private busy: MobileAccessAction | 'status' | null = null;
  private requestError = '';
  private stateUnconfirmed = false;
  private responseRemote: RemoteAccessStatus | undefined;
  private snapshotRemote: RemoteAccessStatus | undefined;
  private linksKey = '';

  constructor(private ctx: UiContext) {
    this.status = h('p', { class: 'ui-about__status', role: 'status', attrs: { 'aria-live': 'polite' } });
    this.detail = h('p', { class: 'ui-set__hint', text: tr('No celular, conecte-se à mesma rede Wi-Fi do computador ou à mesma VPN privada.') });
    this.addresses = h('div', { class: 'ui-mobile-access__links' });
    const field = (id: string, label: string, type: string, autocomplete: string) => {
      const input = h('input', {
        class: 'ui-mobile-access__input', type,
        attrs: { id, name: id, required: true, autocomplete, maxlength: type === 'password' ? 1024 : 64, autocapitalize: 'none', spellcheck: 'false', 'aria-describedby': 'ui-mobile-access-password-hint' },
      });
      return { input, el: h('label', { class: 'ui-mobile-access__field', attrs: { for: id } }, h('span', { class: 'ui-set__label', text: label }), input) };
    };
    const user = field('ui-mobile-access-user', tr('Usuário'), 'text', 'username');
    const password = field('ui-mobile-access-password', tr('Senha'), 'password', 'new-password');
    const passwordConfirm = field('ui-mobile-access-password-confirm', tr('Confirmar senha'), 'password', 'new-password');
    this.user = user.input;
    this.password = password.input;
    this.passwordConfirm = passwordConfirm.input;
    this.configureBtn = h('button', { class: 'ui-btn ui-btn--sm ui-btn--primary', type: 'submit', text: tr('Ativar acesso') });
    this.setup = h(
      'form',
      { class: 'ui-mobile-access__setup', on: { submit: (event) => { event.preventDefault(); this.ask('configure'); } } },
      user.el, password.el, passwordConfirm.el,
      h('p', { class: 'ui-set__hint', text: tr('Usuário: até 64 letras, números ou _.@-. Senha: pelo menos 12 caracteres, diferente do usuário e sem espaços no início ou no fim.'), attrs: { id: 'ui-mobile-access-password-hint' } }),
      this.configureBtn,
    );
    for (const input of [this.user, this.password, this.passwordConfirm]) {
      input.addEventListener('input', () => {
        this.pending = null;
        this.requestError = '';
        for (const field of [this.user, this.password, this.passwordConfirm]) field.setCustomValidity('');
        this.render();
      });
    }
    this.actionBtn = h('button', { class: 'ui-btn ui-btn--sm', type: 'button', on: { click: () => this.ask(this.remote?.state === 'active' ? 'stop' : 'start') } });
    this.refreshBtn = h('button', { class: 'ui-btn ui-btn--sm', type: 'button', text: tr('Atualizar estado'), on: { click: () => void this.refresh() } });
    this.confirmationText = h('p', { class: 'ui-set__hint', attrs: { id: 'ui-mobile-access-confirmation' } });
    this.confirmBtn = h('button', { class: 'ui-btn ui-btn--sm is-confirm', type: 'button', attrs: { 'aria-describedby': 'ui-mobile-access-confirmation' }, on: { click: () => void this.perform() } });
    this.cancelBtn = h('button', { class: 'ui-btn ui-btn--sm', type: 'button', text: tr('Cancelar'), on: { click: () => { this.pending = null; this.render(); (this.remote?.configured ? this.actionBtn : this.configureBtn).focus(); } } });
    this.confirmation = h('div', { class: 'ui-mobile-access__confirmation', hidden: true }, this.confirmationText, h('div', { class: 'ui-mobile-access__actions' }, this.confirmBtn, this.cancelBtn));
    this.failure = h('p', { class: 'ui-mobile-access__error', role: 'alert', hidden: true });
    this.identity = h('p', { class: 'ui-mobile-access__identity' });
    this.fingerprint = h('code', { class: 'ui-mobile-access__fingerprint' });
    this.caLink = h('a', { class: 'ui-link-btn', text: tr('Baixar CA pública'), attrs: { href: '/api/remote-access/ca', download: 'aioffice-ca.crt' } });
    this.certificate = h('div', { class: 'ui-mobile-access__certificate' },
      h('p', { class: 'ui-set__hint', text: tr('Primeira conexão: baixe a CA pública, transfira-a para o celular e confira a impressão digital SHA-256 abaixo antes de instalá-la e habilitar a confiança no certificado. Depois, abra um endereço HTTPS e entre com seu usuário e senha.') }),
      h('span', { class: 'ui-set__label', text: tr('Impressão digital SHA-256 da CA') }), this.fingerprint, this.caLink,
    );
    this.localHint = h('p', { class: 'ui-set__hint', text: tr('Configure, inicie ou pare o acesso no navegador do computador que executa o AIOffice, pelo endereço localhost ou 127.0.0.1.') });
    this.el = h(
      'div',
      { class: 'ui-set-group ui-mobile-access' },
      h('h3', { text: tr('Acesso pelo celular') }),
      this.status,
      this.detail,
      this.addresses,
      this.identity,
      this.certificate,
      this.setup,
      h('div', { class: 'ui-mobile-access__actions' }, this.actionBtn, this.refreshBtn),
      this.confirmation,
      this.failure,
      this.localHint,
      h('p', { class: 'ui-set__hint', text: tr('O acesso é somente para leitura por padrão. Esta opção não configura VPN nem libera o firewall. Nenhuma senha será exibida depois da configuração.') }),
    );
  }

  private get remote(): RemoteAccessStatus | undefined {
    const snapshot = this.ctx.store.liveSnapshot?.meta.remoteAccess;
    if (snapshot !== this.snapshotRemote) {
      this.snapshotRemote = snapshot;
      this.responseRemote = undefined;
      if (snapshot) this.stateUnconfirmed = false;
    }
    return this.responseRemote ?? snapshot;
  }

  private get localControl(): boolean {
    const hostname = location.hostname;
    const ipv4 = hostname.split('.');
    const loopback = ['localhost', '[::1]', '::1'].includes(hostname)
      || (ipv4.length === 4 && ipv4[0] === '127' && ipv4.every((part) => /^\d{1,3}$/.test(part) && Number(part) <= 255));
    return loopback && !this.ctx.store.mock && !this.ctx.store.replaying;
  }

  render(): void {
    const remote = this.remote;
    const configured = !!remote?.configured;
    const active = remote?.state === 'active';
    const starting = remote?.state === 'starting';
    const unavailable = remote?.available === false;
    const blocked = !this.localControl || !!this.busy || !remote || unavailable || starting || this.stateUnconfirmed;
    if (configured) { this.password.value = ''; this.passwordConfirm.value = ''; }
    if (this.pending && (blocked || this.pending !== (active ? 'stop' : configured ? 'start' : 'configure'))) this.pending = null;
    setAttr(this.el, 'aria-busy', String(!!this.busy || starting));
    setHidden(this.setup, !remote || unavailable || configured || active || starting);
    setHidden(this.actionBtn, unavailable || !configured || starting);
    setHidden(this.refreshBtn, !remote || unavailable || !this.localControl);
    setHidden(this.localHint, unavailable || this.localControl);
    setHidden(this.addresses, unavailable || !active);
    setHidden(this.identity, !configured || !remote?.user);
    setHidden(this.certificate, unavailable || !configured);
    setText(this.detail, unavailable ? tr('Execute npm run start:office no computador, fora do Docker, para configurar o acesso pelo celular. Depois, conecte o celular à mesma rede Wi-Fi ou VPN privada.') : tr('No celular, conecte-se à mesma rede Wi-Fi do computador ou à mesma VPN privada.'));
    this.actionBtn.disabled = blocked;
    this.refreshBtn.disabled = !!this.busy;
    this.configureBtn.disabled = blocked;
    for (const input of [this.user, this.password, this.passwordConfirm]) input.disabled = blocked;
    setText(this.actionBtn, this.busy === 'stop' ? tr('Parando acesso…') : this.busy === 'start' ? tr('Iniciando acesso…') : active ? tr('Parar acesso') : tr('Iniciar acesso'));
    this.actionBtn.classList.toggle('ui-btn--danger', active);
    setText(this.configureBtn, this.busy === 'configure' ? tr('Ativando acesso…') : tr('Ativar acesso'));
    setText(this.refreshBtn, this.busy === 'status' ? tr('Consultando estado…') : tr('Atualizar estado'));
    setHidden(this.confirmation, !this.pending);
    this.confirmBtn.disabled = blocked;
    this.cancelBtn.disabled = !!this.busy;
    if (this.pending) {
      setText(this.confirmationText, this.pending === 'stop'
        ? tr('Parar o acesso HTTPS? O celular perderá a conexão. A conta e o certificado ficarão salvos para iniciar novamente.')
        : tr('Abrir o acesso HTTPS na rede privada? Dispositivos na mesma Wi-Fi ou VPN privada poderão acessar o login do AIOffice.'));
      setText(this.confirmBtn, this.pending === 'stop' ? tr('Confirmar parada') : tr('Confirmar ativação'));
    }
    const error = this.requestError || (remote?.error ? remoteAccessError(remote.error) : '');
    setText(this.failure, error);
    setHidden(this.failure, !error);
    setText(this.identity, tr('Usuário de acesso: {0}', [remote?.user ?? '']));
    setText(this.fingerprint, remote?.caFingerprint ?? tr('Impressão digital indisponível. Atualize o estado antes de confiar na CA.'));
    setHidden(this.caLink, !remote?.caFingerprint || !this.localControl);
    if (!remote) {
      setText(this.status, tr('Este backend é antigo e não oferece o controle de acesso pelo celular. Inicie o servidor gerenciado do AIOffice com npm run start:office.'));
      setVariant(this.status, 'is-', 'warn');
      return;
    }
    if (unavailable) {
      setText(this.status, tr('O acesso pelo celular exige o servidor Node no computador; o controle HTTPS não está disponível no Docker.'));
      setVariant(this.status, 'is-', 'warn');
      return;
    }
    if (remote.state === 'disabled') {
      setText(this.status, configured ? tr('Acesso parado. A conta está configurada; inicie quando precisar.') : tr('Acesso desativado. Crie um usuário e uma senha para ativar.'));
      setVariant(this.status, 'is-', 'off');
      return;
    }
    if (remote.state === 'starting') {
      setText(this.status, tr('Configurando a porta HTTPS {0}…', [remote.port ?? 4748]));
      setVariant(this.status, 'is-', 'pending');
      return;
    }
    if (remote.state === 'error') {
      setText(this.status, tr('Não foi possível abrir o acesso HTTPS. Corrija o problema indicado e tente novamente.'));
      setVariant(this.status, 'is-', 'warn');
      return;
    }

    setText(this.status, tr('HTTPS ativo na porta {0}.', [remote.port ?? 4748]));
    setVariant(this.status, 'is-', 'ok');
    const urls = (remote.urls ?? []).flatMap((raw) => {
      try {
        const url = new URL(raw);
        return url.protocol === 'https:' && !url.username && !url.password ? [url] : [];
      } catch {
        return [];
      }
    });
    if (!urls.length) {
      setText(this.status, tr('HTTPS aberto na porta {0}, mas sem endereço privado disponível para o celular.', [remote.port ?? 4748]));
      setVariant(this.status, 'is-', 'warn');
    }
    // Mantém os links estáveis durante os snapshots, para não perder o foco do teclado.
    const linksKey = urls.map((url) => url.href).join('\n');
    if (linksKey === this.linksKey && this.addresses.childNodes.length) return;
    this.linksKey = linksKey;
    this.addresses.replaceChildren();
    for (const url of urls) {
      this.addresses.append(h('a', {
        class: 'ui-link-btn',
        text: url.href,
        attrs: { href: url.href, target: '_blank', rel: 'noopener noreferrer' },
      }));
    }
    if (!urls.length) setText(this.addresses, tr('Conecte o computador ao Wi-Fi ou à VPN privada e atualize o estado. Se ainda não houver endereço, confira a rede e o terminal do AIOffice.'));
  }

  private validCredentials(): boolean {
    this.user.setCustomValidity(/^[\p{L}\p{N}_.@-]{1,64}$/u.test(this.user.value.trim()) ? '' : tr('Use até 64 letras, números ou _.@- no usuário.'));
    const password = this.password.value;
    const differentFromUser = password.normalize('NFC').toLowerCase() !== this.user.value.trim().normalize('NFC').toLowerCase();
    this.password.setCustomValidity([...password].length >= 12 && !/\p{Cs}/u.test(password) && new TextEncoder().encode(password).length <= 1024 && password === password.trim() && differentFromUser
      ? '' : tr('A senha precisa ter pelo menos 12 caracteres, até 1024 bytes, ser diferente do usuário e não ter espaços nas extremidades.'));
    this.passwordConfirm.setCustomValidity(password === this.passwordConfirm.value ? '' : tr('As senhas não coincidem.'));
    return this.setup.reportValidity();
  }

  private ask(action: MobileAccessAction): void {
    const remote = this.remote;
    if (!this.localControl || this.busy || !remote || remote.available === false || remote.state === 'starting' || this.stateUnconfirmed) return;
    if (action !== (remote.state === 'active' ? 'stop' : remote.configured ? 'start' : 'configure')) return;
    if (action === 'configure' && !this.validCredentials()) return;
    this.requestError = '';
    this.pending = action;
    this.render();
    this.confirmBtn.focus();
  }

  private accept(remote: RemoteAccessStatus): void {
    this.snapshotRemote = this.ctx.store.liveSnapshot?.meta.remoteAccess;
    this.responseRemote = remote;
    this.stateUnconfirmed = false;
  }

  private async loadStatus(): Promise<void> {
    const response = await fetch('/api/remote-access/status', { cache: 'no-store', signal: AbortSignal.timeout(8_000) });
    if (!response.ok) throw new Error('status unavailable');
    const body = await response.json() as { remoteAccess?: unknown };
    const remote = readRemoteAccess(body.remoteAccess);
    if (!remote) throw new Error('invalid status');
    this.accept(remote);
  }

  private async refresh(): Promise<void> {
    if (!this.localControl || this.busy || !this.remote || this.remote.available === false) return;
    this.busy = 'status';
    this.pending = null;
    this.requestError = '';
    this.render();
    try {
      await this.loadStatus();
    } catch {
      this.requestError = tr('Não foi possível consultar o estado. Confira o servidor e tente atualizar novamente.');
    } finally {
      this.busy = null;
      this.render();
      this.ctx.invalidate();
    }
  }

  private async perform(): Promise<void> {
    const action = this.pending;
    const remote = this.remote;
    if (!action || !remote || !this.localControl || this.busy || remote.available === false || remote.state === 'starting' || this.stateUnconfirmed) return;
    if (action !== (remote.state === 'active' ? 'stop' : remote.configured ? 'start' : 'configure')) { this.pending = null; this.render(); return; }
    if (action === 'configure' && !this.validCredentials()) return;
    const payload = action === 'configure' ? { user: this.user.value.trim(), password: this.password.value } : {};
    this.busy = action;
    this.pending = null;
    this.requestError = '';
    this.render();
    try {
      const response = await fetch(`/api/remote-access/${action}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), signal: AbortSignal.timeout(60_000),
      });
      const body = await response.json() as { remoteAccess?: unknown; error?: unknown };
      const result = readRemoteAccess(body.remoteAccess);
      if (result) this.accept(result);
      if (!response.ok || !result) this.requestError = remoteAccessError(body.error);
      else this.ctx.announce(action === 'stop' ? tr('Acesso pelo celular parado.') : result.state === 'active' ? tr('HTTPS ativo na porta {0}.', [result.port ?? 4748]) : tr('A solicitação foi recebida. Aguarde a confirmação do estado.'));
    } catch {
      // A operação pode ter terminado mesmo sem resposta; consulta antes de permitir uma repetição.
      try {
        await this.loadStatus();
        const state = this.remote;
        if (action === 'stop' ? state?.state !== 'disabled' : state?.state !== 'active') this.requestError = tr('A resposta da operação se perdeu. O estado foi consultado; confira-o antes de tentar novamente.');
      } catch {
        this.stateUnconfirmed = true;
        this.requestError = tr('A resposta da operação se perdeu e o estado não pôde ser confirmado. Atualize o estado antes de tentar novamente.');
      }
    } finally {
      this.password.value = '';
      this.passwordConfirm.value = '';
      this.busy = null;
      this.render();
      this.ctx.invalidate();
    }
  }
}
