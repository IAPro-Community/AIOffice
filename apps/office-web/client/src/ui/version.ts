// Versão do AIOffice: o número na barra superior, o selo "Nova versão" quando o GitHub tem uma release mais
// nova (quem consulta é o servidor, server/updates/checker.ts), o aviso único por versão e a seção "Sobre"
// das configurações (estado da verificação, "Verificar agora", novidades e como atualizar).
import type { Notice, OfficeSnapshot, UpdateInstallationStatus, UpdateStatus } from '../../../shared/types';
import type { UiComponent, UiContext } from './context';
import { h, setAttr, setHidden, setText, setTitle, setVariant } from './dom';
import { formatDateTime, relativeTime } from './format';
import { pixelIcon } from './icons';
import { safeLocalStorage } from './prefs';
import { tr } from '../../../shared/i18n';

/** Última versão nova já avisada neste navegador (o aviso sai uma vez por versão). */
export const UPDATE_SEEN_KEY = 'aioffice:update-seen';
const AIOFFICE_RELEASE_REPOSITORY = 'IAPro-Community/AIOffice';

type DesktopUpdateState = {
  state: 'idle' | 'checking' | 'current' | 'ahead' | 'available' | 'downloading' | 'downloaded' | 'installing' | 'error' | 'disabled' | 'manual';
  latestVersion?: string;
  progress?: number;
  message?: string;
  releaseUrl?: string;
};

type DesktopUpdaterApi = {
  checkForUpdates: () => Promise<{ ok: boolean; available?: boolean; version?: string }>;
  getUpdateState: () => Promise<unknown>;
  onUpdateState: (listener: (state: unknown) => void) => () => void;
  getProviderTools?: () => Promise<unknown>;
  installProviderTool?: (id: string) => Promise<unknown>;
  cancelProviderInstall?: () => Promise<unknown>;
  openProviderLogin?: (id: string) => Promise<unknown>;
  restartAfterProviderInstall?: () => Promise<unknown>;
  onProviderToolsState?: (listener: (state: unknown) => void) => () => void;
};

type ProviderToolId = 'codex' | 'claude' | 'omp';
type ProviderToolState = {
  id: ProviderToolId;
  name: string;
  supported: boolean;
  canInstall: boolean;
  installed: boolean;
  version?: string;
  state: string;
  phase?: string;
  progress?: number;
  error?: string;
};

const PROVIDER_TOOL_NAMES: Record<ProviderToolId, string> = { codex: 'Codex CLI', claude: 'Claude Code', omp: 'oh-my-pi (OMP)' };
const PROVIDER_TOOL_IDS: readonly ProviderToolId[] = ['codex', 'claude', 'omp'];

function desktopUpdaterApi(): DesktopUpdaterApi | undefined {
  if (typeof window === 'undefined') return undefined;
  const api = (window as Window & { aiofficeDesktop?: DesktopUpdaterApi }).aiofficeDesktop;
  return api && typeof api.checkForUpdates === 'function' && typeof api.getUpdateState === 'function' && typeof api.onUpdateState === 'function' ? api : undefined;
}

function readDesktopUpdateState(value: unknown): DesktopUpdateState | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const state = value as Record<string, unknown>;
  const allowed = ['idle', 'checking', 'current', 'ahead', 'available', 'downloading', 'downloaded', 'installing', 'error', 'disabled', 'manual'];
  if (!allowed.includes(String(state.state))) return undefined;
  return {
    state: state.state as DesktopUpdateState['state'],
    latestVersion: typeof state.latestVersion === 'string' ? state.latestVersion : undefined,
    progress: typeof state.progress === 'number' && Number.isFinite(state.progress) ? state.progress : undefined,
    message: typeof state.message === 'string' ? state.message : undefined,
    releaseUrl: typeof state.releaseUrl === 'string' ? safeGithubUrl(state.releaseUrl) : undefined,
  };
}

function desktopUpdateText(state: DesktopUpdateState): { tone: UpdateTone; text: string } {
  switch (state.state) {
    case 'idle': return { tone: 'pending', text: tr('A verificação automática consulta o GitHub em segundo plano.') };
    case 'checking': return { tone: 'pending', text: tr('Verificando se há versão nova…') };
    case 'current': return { tone: 'ok', text: state.latestVersion ? tr('Você está na versão mais recente (v{0}).', [state.latestVersion]) : tr('Você está na versão mais recente{0}.', ['']) };
    case 'ahead': return { tone: 'ok', text: tr('Você está à frente da última versão publicada (v{0}){1}.', [state.latestVersion ?? '', '']) };
    case 'available': return { tone: 'new', text: tr('Nova versão disponível: v{0}.', [state.latestVersion ?? '']) };
    case 'downloading': return { tone: 'pending', text: state.progress === undefined ? tr('Baixando a atualização do AIOffice…') : tr('Baixando a atualização do AIOffice… {0}%', [Math.round(state.progress)]) };
    case 'downloaded': return { tone: 'ok', text: tr('Instalador baixado e validado. Confirme na janela do AIOffice para instalar.') };
    case 'installing': return { tone: 'pending', text: tr('O AIOffice está fechando para abrir o instalador.') };
    case 'disabled': return { tone: 'off', text: tr('Verificação automática desativada.') };
    case 'manual': return { tone: 'off', text: tr('Instalações DEB são atualizadas pelo gerenciador de pacotes do sistema.') };
    case 'error': return { tone: 'warn', text: tr('Não deu para verificar agora: erro desconhecido.') };
  }
}

export const VERSION_ICONS = {
  up: pixelIcon(['...##...', '..####..', '.######.', '########', '..####..', '..####..', '..####..', '..####..']),
};

/** Versão em uso e o resultado da verificação, do snapshot ao vivo (no timelapse e no ?mock=1 não há versão real). */
export function versionInfo(snap: OfficeSnapshot | null | undefined): { version: string; updates?: UpdateStatus; releaseChannel: 'aioffice' | 'other' | 'unknown'; reportedRepo?: string } | null {
  const v = snap?.meta.version;
  if (!v || !/^\d+\.\d+\.\d+/.test(v)) return null;
  const updates = snap.meta.updates;
  if (updates?.repo === AIOFFICE_RELEASE_REPOSITORY) return { version: v, updates, releaseChannel: 'aioffice', reportedRepo: updates.repo };
  if (updates?.repo) return { version: v, releaseChannel: 'other', reportedRepo: updates.repo };
  return { version: v, releaseChannel: 'unknown' };
}

/** Só links do próprio GitHub viram link na página. */
export function safeGithubUrl(url: string | undefined): string | undefined {
  return url && /^https:\/\/github\.com\/[^\s"'<>]+$/.test(url) ? url : undefined;
}

export type UpdateTone = 'new' | 'ok' | 'pending' | 'warn' | 'off';

function installationBusy(s: UpdateInstallationStatus | undefined): boolean {
  return s?.state === 'downloading' || s?.state === 'applying' || s?.state === 'restarting';
}

function readInstallation(value: unknown): UpdateInstallationStatus | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const s = value as Record<string, unknown>;
  if (!['ready', 'blocked', 'downloading', 'applying', 'restarting', 'error'].includes(String(s.state))) return undefined;
  if (s.target !== undefined && typeof s.target !== 'string') return undefined;
  if (s.message !== undefined && typeof s.message !== 'string') return undefined;
  return s as unknown as UpdateInstallationStatus;
}

function installationText(s: UpdateInstallationStatus | undefined): string {
  if (s?.message) return s.message;
  switch (s?.state) {
    case 'ready': return tr('A atualização será baixada e aplicada; o escritório será reiniciado.');
    case 'downloading': return tr('Baixando a atualização do AIOffice…');
    case 'applying': return tr('Aplicando a atualização do AIOffice…');
    case 'restarting': return tr('Reiniciando o AIOffice e confirmando a versão instalada…');
    case 'blocked': return tr('A atualização está bloqueada. Resolva o motivo informado e tente novamente.');
    case 'error': return tr('Não foi possível confirmar a nova versão. Verifique o motivo e tente novamente.');
    default: return tr('Este servidor ainda não oferece instalação automática de releases do AIOffice.');
  }
}

/** Linha de estado da seção "Sobre". */
export function updateStatusLine(version: string, s: UpdateStatus | undefined, now: number): { tone: UpdateTone; text: string } {
  if (!s) return { tone: 'off', text: tr('Este servidor não verifica versões novas.') };
  const checked = s.checkedAt ? ` · verificado ${relativeTime(s.checkedAt, now)}` : '';
  switch (s.state) {
    case 'off':
      return {
        tone: 'off',
        text: s.repo
          ? tr('Verificação de novas versões desativada.')
          : tr('Verificação de versão nova desligada: o package.json não aponta um repositório no GitHub.'),
      };
    case 'pending':
      return { tone: 'pending', text: tr('Verificando se há versão nova…') };
    case 'error':
      if (s.available && s.latest) return { tone: 'new', text: tr('Nova versão disponível: v{0}. A última verificação falhou ({1}).', [s.latest, s.error ?? tr('erro')]) };
      return { tone: 'warn', text: tr('Não deu para verificar agora: {0}{1}.', [s.error ?? tr('erro desconhecido'), s.checkedAt ? tr(' · última verificação {0}', [relativeTime(s.checkedAt, now)]) : '']) };
    case 'ok':
      if (s.available && s.latest) return { tone: 'new', text: tr('Nova versão disponível: v{0}{1}.', [s.latest, s.publishedAt ? tr(', publicada em {0}', [formatDateTime(s.publishedAt)]) : '']) };
      if (!s.latest) return { tone: 'ok', text: tr('Nenhuma versão publicada no GitHub ainda{0}.', [checked]) };
      if (s.latest !== version) return { tone: 'ok', text: tr('Você está à frente da última versão publicada (v{0}){1}.', [s.latest, checked]) };
      return { tone: 'ok', text: tr('Você está na versão mais recente{0}.', [checked]) };
  }
}

/** Dica do número de versão na barra superior. */
export function versionChipTitle(version: string, s: UpdateStatus | undefined, now: number): string {
  if (s?.available && s.latest) return tr('Nova versão do AIOffice: v{0} (você usa a v{1}). Clique para ver as novidades e como atualizar.', [s.latest, version]);
  return tr('AIOffice v{0}. {1} Clique para ver detalhes.', [version, updateStatusLine(version, s, now).text]);
}

/** Número da versão na barra superior; vira o selo "Nova versão" quando há release mais nova. */
export class VersionChip implements UiComponent {
  readonly el: HTMLButtonElement;
  private text: HTMLElement;

  constructor(
    private ctx: UiContext,
    private settingsBtn: HTMLElement,
  ) {
    const icon = h('span', { class: 'ui-version__icon', attrs: { 'aria-hidden': 'true' } });
    icon.innerHTML = VERSION_ICONS.up;
    this.text = h('span', { class: 'ui-version__text' });
    this.el = h('button', { class: 'ui-version', type: 'button', hidden: true, on: { click: () => ctx.openAbout() } }, icon, this.text);
  }

  render(): void {
    const info = versionInfo(this.ctx.store.liveSnapshot);
    // O cabeçalho identifica somente versões do AIOffice; metadados do Habblaud não são releases do produto.
    setHidden(this.el, !info || info.releaseChannel !== 'aioffice');
    const fresh = !!info?.updates?.available && !!info.updates.latest;
    this.settingsBtn.classList.toggle('has-update', fresh);
    const label = fresh ? tr('Configurações (nova versão disponível)') : tr('Configurações');
    setAttr(this.settingsBtn, 'aria-label', label);
    setTitle(this.settingsBtn, label);
    if (!info) return;
    this.el.classList.toggle('is-new', fresh);
    setText(this.text, fresh ? tr('Nova versão') : `v${info.version}`);
    const title = versionChipTitle(info.version, info.updates, this.ctx.now());
    setTitle(this.el, title);
    setAttr(this.el, 'aria-label', title);
  }
}

/** Avisa (uma vez por versão, neste navegador) quando aparece uma versão nova. */
export class UpdateToaster implements UiComponent {
  constructor(
    private ctx: UiContext,
    private push: (n: Notice) => void,
  ) {}

  private shown: string | undefined;

  render(): void {
    if (this.ctx.store.connection !== 'open') return;
    const s = versionInfo(this.ctx.store.liveSnapshot)?.updates;
    if (!s?.available || !s.latest || this.shown === s.latest) return;
    this.shown = s.latest;
    const storage = safeLocalStorage();
    try {
      if (storage?.getItem(UPDATE_SEEN_KEY) === s.latest) return;
      storage?.setItem(UPDATE_SEEN_KEY, s.latest);
    } catch {
      // Sem armazenamento: avisa uma vez por página aberta.
    }
    this.push({ id: `update:${s.latest}`, level: 'success', text: tr('Nova versão do AIOffice: v{0}. Veja as novidades e como atualizar em Configurações › Sobre.', [s.latest]), at: this.ctx.now() });
  }
}

/** Seção "Sobre" das configurações. */
export class AboutGroup {
  readonly el: HTMLElement;
  private name: HTMLElement;
  private status: HTMLElement;
  private checkBtn: HTMLButtonElement;
  private installBtn: HTMLButtonElement;
  private installHint: HTMLElement;
  private fresh: HTMLElement;
  private notes: HTMLAnchorElement;
  private repo: HTMLAnchorElement;
  private checking = false;
  private failure: string | undefined;
  private requesting = false;
  private installation: UpdateInstallationStatus | undefined;
  private activeTarget: string | undefined;
  private pollTimer: ReturnType<typeof setTimeout> | undefined;
  private pollStartedAt = 0;
  private desktopApi: DesktopUpdaterApi | undefined;
  private desktopState: DesktopUpdateState | undefined;
  private providerToolsGroup: HTMLElement;
  private providerToolsHint: HTMLElement;
  private providerToolsList: HTMLElement;
  private providerRestartBtn: HTMLButtonElement;
  private providerRows = new Map<ProviderToolId, { status: HTMLElement; install: HTMLButtonElement; login: HTMLButtonElement; cancel: HTMLButtonElement }>();
  private providerTools = new Map<ProviderToolId, ProviderToolState>();
  private providerAction: ProviderToolId | undefined;
  private providerToolsError: string | undefined;
  private providerRestartRequired = false;

  constructor(private ctx: UiContext) {
    this.desktopApi = desktopUpdaterApi();
    if (this.desktopApi) {
      this.desktopState = { state: 'idle' };
      this.desktopApi.onUpdateState((value) => {
        const state = readDesktopUpdateState(value);
        if (!state) return;
        this.desktopState = state;
        this.render();
        this.ctx.invalidate();
      });
      void this.desktopApi.getUpdateState().then((value) => {
        const state = readDesktopUpdateState(value);
        if (state) {
          this.desktopState = state;
          this.render();
          this.ctx.invalidate();
        }
      }).catch(() => {});
      if (this.desktopApi.getProviderTools && this.desktopApi.onProviderToolsState) {
        this.desktopApi.onProviderToolsState((value) => {
          this.applyProviderToolEvent(value);
          this.renderProviderTools();
        });
        void this.loadProviderTools();
      }
    }
    this.name = h('strong', { class: 'ui-about__version' });
    this.checkBtn = h('button', { class: 'ui-btn ui-btn--sm', type: 'button', text: tr('Verificar agora'), on: { click: () => void this.check() } });
    this.status = h('p', { class: 'ui-about__status', role: 'status' });
    this.notes = h('a', { class: 'ui-link-btn', attrs: { target: '_blank', rel: 'noopener noreferrer' } });
    this.installBtn = h('button', { class: 'ui-btn ui-btn--sm', type: 'button', text: tr('Baixar e atualizar'), attrs: { 'aria-describedby': 'ui-update-install-status' }, on: { click: () => void this.install() } });
    this.installHint = h('p', { class: 'ui-set__hint', role: 'status', attrs: { id: 'ui-update-install-status' } });
    this.fresh = h(
      'div',
      { class: 'ui-about__new', hidden: true },
      this.notes,
      h('div', { class: 'ui-about__actions' }, this.installBtn),
      this.installHint,
    );
    this.repo = h('a', { class: 'ui-link-btn', text: tr('Código no GitHub'), attrs: { target: '_blank', rel: 'noopener noreferrer' } });
    this.providerToolsHint = h('p', { class: 'ui-set__hint', role: 'status' });
    this.providerToolsList = h('div', { class: 'ui-about__provider-list' });
    for (const id of PROVIDER_TOOL_IDS) {
      const status = h('span', { class: 'ui-about__provider-status', role: 'status' });
      const install = h('button', { class: 'ui-btn ui-btn--sm', type: 'button', text: tr('Instalar'), on: { click: () => void this.installProviderTool(id) } });
      const login = h('button', { class: 'ui-btn ui-btn--sm', type: 'button', text: tr('Abrir login'), on: { click: () => void this.openProviderLogin(id) } });
      const cancel = h('button', { class: 'ui-btn ui-btn--sm', type: 'button', text: tr('Cancelar'), on: { click: () => void this.cancelProviderInstall() } });
      this.providerRows.set(id, { status, install, login, cancel });
      this.providerToolsList.append(h('article', { class: 'ui-about__provider' },
        h('div', { class: 'ui-about__provider-copy' }, h('strong', { text: PROVIDER_TOOL_NAMES[id] }), status),
        h('div', { class: 'ui-about__provider-actions' }, install, login, cancel),
      ));
    }
    this.providerRestartBtn = h('button', { class: 'ui-btn ui-btn--sm', type: 'button', text: tr('Reiniciar para ativar'), on: { click: () => void this.restartAfterProviderInstall() } });
    this.providerToolsGroup = h('div', { class: 'ui-about__provider-tools', hidden: true },
      h('h4', { text: tr('Ferramentas de IA') }),
      h('p', { class: 'ui-set__hint', text: tr('Instale os CLIs oficiais em uma pasta privada do AIOffice. O login é feito por você no terminal do próprio CLI.') }),
      this.providerToolsList,
      this.providerToolsHint,
      this.providerRestartBtn,
    );
    this.el = h(
      'div',
      { class: 'ui-set-group ui-about', attrs: { id: 'ui-about' } },
      h('h3', { text: tr('Sobre'), tabIndex: -1 }),
      h('div', { class: 'ui-about__head' }, h('span', { class: 'ui-about__name' }, 'AIOffice ', this.name), this.checkBtn),
      this.status,
      this.fresh,
      this.providerToolsGroup,
      this.repo,
    );
  }

  render(): void {
    const info = versionInfo(this.ctx.store.liveSnapshot);
    setHidden(this.el, !info);
    this.renderProviderTools();
    if (!info) return;
    const s = info.updates;
    if (this.activeTarget && info.version === this.activeTarget) {
      this.activeTarget = undefined;
      this.installation = undefined;
      if (this.pollTimer) clearTimeout(this.pollTimer);
      this.pollTimer = undefined;
    }
    const installation = this.installation ?? s?.installation;
    const busy = this.requesting || installationBusy(installation);
    if (installationBusy(installation) && !this.activeTarget && installation?.target) {
      this.activeTarget = installation.target;
      this.pollStartedAt = Date.now();
      this.schedulePoll();
    }
    setText(this.name, info.releaseChannel === 'aioffice' ? `v${info.version}` : tr('Versão do AIOffice não identificada'));
    if (this.desktopApi && this.desktopState && info.releaseChannel === 'aioffice') {
      const desktopLine = this.failure
        ? { tone: 'warn' as const, text: this.failure }
        : desktopUpdateText(this.desktopState);
      setText(this.status, this.checking ? tr('Verificando se há versão nova…') : desktopLine.text);
      setVariant(this.status, 'is-', this.checking ? 'pending' : desktopLine.tone);
      const disabled = this.desktopState.state === 'disabled' || this.desktopState.state === 'manual';
      setHidden(this.checkBtn, disabled);
      this.checkBtn.disabled = this.checking || this.ctx.store.connection !== 'open' || ['checking', 'downloading', 'installing'].includes(this.desktopState.state);
      const releaseAvailable = !!this.desktopState.latestVersion && ['available', 'downloading', 'downloaded', 'installing'].includes(this.desktopState.state);
      setHidden(this.fresh, !releaseAvailable);
      setHidden(this.installBtn, true);
      if (releaseAvailable) {
        setText(this.notes, tr('Ver o que mudou na v{0}', [this.desktopState.latestVersion!]));
        setHidden(this.notes, !this.desktopState.releaseUrl);
        if (this.desktopState.releaseUrl) setAttr(this.notes, 'href', this.desktopState.releaseUrl);
        setText(this.installHint, this.desktopState.state === 'available'
          ? tr('O AIOffice oferecerá o download e a instalação em uma janela própria.')
          : desktopLine.text);
      }
      const desktopRepo = safeGithubUrl(`https://github.com/${AIOFFICE_RELEASE_REPOSITORY}`);
      setHidden(this.repo, !desktopRepo);
      if (desktopRepo) setAttr(this.repo, 'href', desktopRepo);
      return;
    }
    const line = this.failure
      ? { tone: 'warn' as const, text: this.failure }
      : info.releaseChannel === 'other'
        ? { tone: 'warn' as const, text: tr('Este servidor ainda não está no canal de releases do AIOffice. Reinicie com npm run start:office para verificar e instalar atualizações oficiais.') }
        : info.releaseChannel === 'unknown'
          ? { tone: 'warn' as const, text: tr('Este servidor não informa o canal oficial do AIOffice. Reinicie com npm run start:office para habilitar a verificação e a instalação corretas.') }
          : updateStatusLine(info.version, s, this.ctx.now());
    setText(this.status, this.checking ? tr('Consultando o GitHub…') : line.text);
    setVariant(this.status, 'is-', this.checking ? 'pending' : line.tone);
    setHidden(this.checkBtn, info.releaseChannel !== 'aioffice' || !s || s.state === 'off');
    this.checkBtn.disabled = this.checking || busy || this.ctx.store.connection !== 'open';

    const fresh = !!s?.available && !!s.latest;
    setHidden(this.fresh, !fresh);
    if (fresh) {
      setText(this.installBtn, busy ? tr('Atualizando…') : installation?.state === 'error' || installation?.state === 'blocked' ? tr('Tentar atualizar novamente') : tr('Baixar e atualizar'));
      this.installBtn.disabled = busy || this.checking || !installation || this.ctx.store.connection !== 'open' || s!.state !== 'ok' || this.ctx.store.replaying;
      setText(this.installHint, this.requesting ? tr('Preparando a atualização…') : installationText(installation));
      setAttr(this.installBtn, 'aria-busy', String(busy));
      setText(this.notes, tr('Ver o que mudou na v{0}', [s!.latest]));
      const url = safeGithubUrl(s!.url);
      setHidden(this.notes, !url);
      if (url) setAttr(this.notes, 'href', url);
    }
    const repoUrl = info.releaseChannel === 'aioffice' && s?.repo ? safeGithubUrl(`https://github.com/${s.repo}`) : undefined;
    setHidden(this.repo, !repoUrl);
    if (repoUrl) setAttr(this.repo, 'href', repoUrl);
  }

  /** Rola até a seção e a destaca por um instante (clique no número da versão). */
  highlight(): void {
    this.el.scrollIntoView({ block: 'nearest' });
    this.el.classList.remove('is-highlight');
    void this.el.offsetWidth;
    this.el.classList.add('is-highlight');
  }

  private async check(): Promise<void> {
    if (versionInfo(this.ctx.store.liveSnapshot)?.releaseChannel !== 'aioffice') return;
    if (this.checking || this.requesting || installationBusy(this.installation ?? versionInfo(this.ctx.store.liveSnapshot)?.updates?.installation)) return;
    this.checking = true;
    this.failure = undefined;
    this.installation = undefined;
    this.render();
    try {
      if (this.desktopApi) {
        const result = await this.desktopApi.checkForUpdates();
        if (!result.ok) this.failure = tr('Não deu para verificar agora: erro desconhecido.');
      } else if (!(await this.ctx.store.checkUpdates())) this.failure = tr('Não deu para falar com o servidor do AIOffice.');
    } catch {
      this.failure = tr('Não deu para falar com o servidor do AIOffice.');
    } finally {
      this.checking = false;
      this.render();
      this.ctx.invalidate();
    }
  }

  private async install(): Promise<void> {
    const info = versionInfo(this.ctx.store.liveSnapshot);
    const s = info?.updates;
    if (info?.releaseChannel !== 'aioffice' || this.requesting || installationBusy(this.installation ?? s?.installation) || !s?.available || !s.latest || !s.installation || this.ctx.store.replaying || this.ctx.store.connection !== 'open') return;
    this.requesting = true;
    this.failure = undefined;
    this.render();
    try {
      const res = await fetch('/api/updates/install', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ version: s.latest }),
        signal: AbortSignal.timeout(20_000),
      });
      const body = await res.json() as { installation?: unknown; error?: unknown };
      this.installation = readInstallation(body.installation);
      if (!this.installation) {
        this.failure = typeof body.error === 'string' ? body.error : tr('Não deu para iniciar a atualização do AIOffice.');
      } else if (installationBusy(this.installation)) {
        this.activeTarget = s.latest;
        this.pollStartedAt = Date.now();
        this.schedulePoll();
      }
    } catch {
      // A resposta pode se perder quando o servidor começa a reiniciar. Consulte o estado antes de repetir.
      this.activeTarget = s.latest;
      this.pollStartedAt = Date.now();
      this.installation = { state: 'restarting', target: s.latest, message: tr('Reconectando para verificar o resultado da atualização…') };
      this.schedulePoll();
    } finally {
      this.requesting = false;
      this.render();
      this.ctx.invalidate();
    }
  }

  private async loadProviderTools(): Promise<void> {
    if (!this.desktopApi?.getProviderTools) return;
    try {
      const value = await this.desktopApi.getProviderTools();
      if (!Array.isArray(value)) throw new Error(tr('Resposta inválida do gerenciador de CLIs.'));
      for (const item of value) {
        if (!item || typeof item !== 'object') continue;
        const raw = item as Record<string, unknown>;
        if (!PROVIDER_TOOL_IDS.includes(raw.id as ProviderToolId)) continue;
        const id = raw.id as ProviderToolId;
        this.providerTools.set(id, {
          id,
          name: PROVIDER_TOOL_NAMES[id],
          supported: raw.supported === true,
          canInstall: raw.canInstall === true,
          installed: raw.installed === true,
          ...(typeof raw.version === 'string' ? { version: raw.version } : {}),
          state: typeof raw.state === 'string' ? raw.state : 'missing',
          ...(typeof raw.progress === 'number' && Number.isFinite(raw.progress) ? { progress: raw.progress } : {}),
          ...(typeof raw.error === 'string' ? { error: raw.error } : {}),
        });
      }
      this.providerToolsError = undefined;
    } catch {
      this.providerToolsError = tr('Não foi possível consultar os CLIs. Feche e abra as configurações para tentar novamente.');
    }
    this.renderProviderTools();
    this.ctx.invalidate();
  }

  private applyProviderToolEvent(value: unknown): void {
    if (!value || typeof value !== 'object') return;
    const raw = value as Record<string, unknown>;
    if (!PROVIDER_TOOL_IDS.includes(raw.id as ProviderToolId)) return;
    const id = raw.id as ProviderToolId;
    const current = this.providerTools.get(id) ?? {
      id, name: PROVIDER_TOOL_NAMES[id], supported: true, canInstall: true, installed: false, state: 'missing',
    };
    if (raw.state === 'settled') {
      void this.loadProviderTools();
      return;
    }
    const phase = typeof raw.phase === 'string' ? raw.phase : undefined;
    const state = typeof raw.state === 'string' ? raw.state : current.state;
    const installed = state === 'installed' ? true : current.installed;
    this.providerTools.set(id, {
      ...current,
      state,
      installed,
      ...(typeof raw.version === 'string' ? { version: raw.version } : {}),
      ...(typeof raw.progress === 'number' && Number.isFinite(raw.progress) ? { progress: raw.progress } : {}),
      ...(typeof raw.error === 'string' ? { error: raw.error } : {}),
      ...(phase ? { phase } : {}),
    });
    if (raw.restartRequired === true) this.providerRestartRequired = true;
  }

  private renderProviderTools(): void {
    const available = !!this.desktopApi?.getProviderTools;
    setHidden(this.providerToolsGroup, !available);
    if (!available) return;
    for (const id of PROVIDER_TOOL_IDS) {
      const refs = this.providerRows.get(id)!;
      const tool = this.providerTools.get(id);
      const active = tool?.state === 'installing';
      const status = !tool
        ? tr('Consultando disponibilidade…')
        : !tool.supported
          ? tr('Não disponível nesta plataforma.')
          : tool.error ?? (active
            ? tool.phase === 'verifying' ? tr('Verificando o executável…')
              : tool.phase === 'activating' ? tr('Ativando a instalação…')
                : tool.phase === 'downloading' && tool.progress !== undefined ? tr('Baixando… {0}%', [Math.round(tool.progress)])
                  : tr('Instalando…')
            : tool.installed ? tr('Instalado · versão {0}', [tool.version ?? tr('desconhecida')])
              : tool.canInstall ? tr('Não instalado.') : tr('Instalação indisponível nesta execução.'));
      setText(refs.status, status);
      setHidden(refs.install, !tool?.supported || !tool.canInstall || !!active);
      setText(refs.install, tool?.installed ? tr('Atualizar') : tr('Instalar'));
      refs.install.disabled = this.providerAction !== undefined;
      setHidden(refs.login, !tool?.installed || !!active);
      refs.login.disabled = this.providerAction !== undefined;
      setHidden(refs.cancel, !active);
      refs.cancel.disabled = this.providerAction !== id;
    }
    setText(this.providerToolsHint, this.providerToolsError ?? (this.providerRestartRequired
      ? tr('CLI instalado. Reinicie o AIOffice para ativar a ferramenta nas sessões.')
      : tr('A autenticação é feita pelo CLI oficial no terminal e usa a conta que você escolher.')));
    setHidden(this.providerRestartBtn, !this.providerRestartRequired);
    this.providerRestartBtn.disabled = this.providerAction !== undefined;
  }

  private async installProviderTool(id: ProviderToolId): Promise<void> {
    if (!this.desktopApi?.installProviderTool || this.providerAction) return;
    this.providerAction = id;
    this.providerToolsError = undefined;
    this.renderProviderTools();
    try {
      const value = await this.desktopApi.installProviderTool(id);
      const result = value && typeof value === 'object' ? value as Record<string, unknown> : {};
      if (result.ok === true) {
        this.providerRestartRequired = result.restartRequired === true || this.providerRestartRequired;
        await this.loadProviderTools();
      } else if (result.cancelled !== true) {
        this.providerToolsError = typeof result.error === 'string' ? result.error : tr('Não foi possível instalar o CLI.');
      }
    } catch {
      this.providerToolsError = tr('Não foi possível instalar o CLI.');
    } finally {
      this.providerAction = undefined;
      this.renderProviderTools();
      this.ctx.invalidate();
    }
  }

  private async cancelProviderInstall(): Promise<void> {
    if (!this.desktopApi?.cancelProviderInstall) return;
    try { await this.desktopApi.cancelProviderInstall(); } catch { /* The progress event reports cancellation. */ }
  }

  private async openProviderLogin(id: ProviderToolId): Promise<void> {
    if (!this.desktopApi?.openProviderLogin || this.providerAction) return;
    this.providerAction = id;
    this.providerToolsError = undefined;
    this.renderProviderTools();
    try {
      const value = await this.desktopApi.openProviderLogin(id);
      const result = value && typeof value === 'object' ? value as Record<string, unknown> : {};
      if (result.ok !== true && result.cancelled !== true) this.providerToolsError = typeof result.error === 'string' ? result.error : tr('Não foi possível abrir o terminal.');
    } catch {
      this.providerToolsError = tr('Não foi possível abrir o terminal.');
    } finally {
      this.providerAction = undefined;
      this.renderProviderTools();
      this.ctx.invalidate();
    }
  }

  private async restartAfterProviderInstall(): Promise<void> {
    if (!this.desktopApi?.restartAfterProviderInstall || !this.providerRestartRequired || this.providerAction) return;
    this.providerAction = 'codex';
    this.renderProviderTools();
    try {
      const value = await this.desktopApi.restartAfterProviderInstall();
      const result = value && typeof value === 'object' ? value as Record<string, unknown> : {};
      if (result.ok !== true && result.cancelled !== true) this.providerToolsError = tr('Não foi possível reiniciar o AIOffice. Feche e abra o aplicativo quando puder.');
    } catch {
      this.providerToolsError = tr('Não foi possível reiniciar o AIOffice. Feche e abra o aplicativo quando puder.');
    } finally {
      this.providerAction = undefined;
      this.renderProviderTools();
      this.ctx.invalidate();
    }
  }

  private schedulePoll(): void {
    if (this.pollTimer || !this.activeTarget) return;
    this.pollTimer = setTimeout(() => {
      this.pollTimer = undefined;
      void this.pollInstallation();
    }, 2_000);
  }

  private async pollInstallation(): Promise<void> {
    if (!this.activeTarget) return;
    try {
      const res = await fetch('/api/updates', { cache: 'no-store', signal: AbortSignal.timeout(5_000) });
      if (!res.ok) throw new Error('updates unavailable');
      const body = await res.json() as { version?: unknown; installation?: unknown };
      if (body.version === this.activeTarget) {
        // A confirmação vem do servidor em background. O banner oferece recarga manual para trocar o bundle.
        this.activeTarget = undefined;
        this.installation = undefined;
        this.render();
        this.ctx.invalidate();
        return;
      }
      const installation = readInstallation(body.installation);
      if (installation) this.installation = installation;
      if (!installation || !installationBusy(installation)) this.activeTarget = undefined;
    } catch {
      this.installation = { state: 'restarting', target: this.activeTarget, message: tr('Reconectando para verificar o resultado da atualização…') };
    }
    if (this.activeTarget && Date.now() - this.pollStartedAt > 5 * 60_000) {
      this.installation = { state: 'error', target: this.activeTarget, message: tr('A confirmação demorou mais que o esperado. Verifique o servidor e recarregue a página; a nova versão ainda não foi confirmada.') };
      this.activeTarget = undefined;
    }
    this.render();
    this.ctx.invalidate();
    this.schedulePoll();
  }
}
