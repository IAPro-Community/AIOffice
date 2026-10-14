import type { MaestroUpdateStatus } from '../../../shared/types';
import { tr } from '../../../shared/i18n';
import type { UiContext } from './context';
import { h, setAttr, setHidden, setText, setVariant } from './dom';

function readStatus(value: unknown): MaestroUpdateStatus | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const status = value as Partial<MaestroUpdateStatus>;
  if (
    !['checking', 'ok', 'missing', 'updating', 'blocked', 'error'].includes(status.state ?? '') ||
    typeof status.installed !== 'boolean' ||
    typeof status.available !== 'boolean'
  ) return undefined;
  return status as MaestroUpdateStatus;
}

/** Instalação e atualização NPM do Orquestrador-Maestro, separadas das releases do AIOffice. */
export class MaestroUpdateGroup {
  readonly el: HTMLElement;
  private status: HTMLElement;
  private versions: HTMLElement;
  private checkBtn: HTMLButtonElement;
  private actionBtn: HTMLButtonElement;
  private actionBox: HTMLElement;
  private failure: string | undefined;
  private checking = false;
  private requesting = false;
  private responseStatus: MaestroUpdateStatus | undefined;
  private responseTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(private readonly ctx: UiContext) {
    this.status = h('p', { class: 'ui-about__status', role: 'status', attrs: { 'aria-live': 'polite' } });
    this.versions = h('p', { class: 'ui-set__hint ui-maestro__versions' });
    this.checkBtn = h('button', {
      class: 'ui-btn ui-btn--sm',
      type: 'button',
      text: tr('Verificar no NPM'),
      on: { click: () => void this.check() },
    });
    this.actionBtn = h('button', {
      class: 'ui-btn ui-btn--sm',
      type: 'button',
      on: { click: () => void this.installOrUpdate() },
    });
    this.actionBox = h('div', { class: 'ui-about__actions' }, this.actionBtn);
    this.el = h(
      'div',
      { class: 'ui-set-group ui-about ui-maestro', attrs: { id: 'ui-maestro' } },
      h('h3', { text: tr('Orquestrador-Maestro') }),
      h('div', { class: 'ui-about__head' }, h('span', { class: 'ui-about__name', text: tr('Camada compartilhada') }), this.checkBtn),
      this.status,
      this.versions,
      this.actionBox,
    );
  }

  render(): void {
    const live = this.ctx.store.liveSnapshot?.meta.maestro;
    if (this.responseStatus && live && this.matches(live, this.responseStatus)) this.clearResponseStatus();
    const status = this.responseStatus ?? live;
    setHidden(this.el, !status);
    if (!status) return;

    const busy = this.checking || this.requesting || status.state === 'updating';
    const line = this.failure
      ? { tone: 'warn', text: this.failure }
      : this.statusLine(status);
    setText(this.status, line.text);
    setVariant(this.status, 'is-', line.tone);
    const installedText = status.installedVersion
      ? tr('Instalada: v{0}', [status.installedVersion])
      : tr('Pacote não instalado');
    const latestText = status.latestVersion
      ? tr('Mais recente no NPM: v{0}', [status.latestVersion])
      : tr('Versão do NPM ainda não consultada');
    setText(this.versions, `${installedText} · ${latestText}`);

    this.checkBtn.disabled = busy || this.ctx.store.connection !== 'open' || this.ctx.store.replaying;
    setText(this.checkBtn, this.checking ? tr('Consultando…') : tr('Verificar no NPM'));
    const canInstall = status.state === 'missing';
    const canUpdate = status.installed && status.available && !!status.latestVersion;
    setHidden(this.actionBox, !canInstall && !canUpdate);
    setText(this.actionBtn, this.requesting || status.state === 'updating'
      ? tr('Atualizando…')
      : canInstall
        ? tr('Instalar Orquestrador-Maestro')
        : tr('Atualizar Orquestrador-Maestro'));
    this.actionBtn.disabled = busy || status.canUpdate === false || this.ctx.store.connection !== 'open' || this.ctx.store.replaying;
    setAttr(this.actionBtn, 'aria-busy', String(busy));
  }

  private statusLine(status: MaestroUpdateStatus): { tone: string; text: string } {
    if (this.checking) return { tone: 'pending', text: tr('Consultando atualizações do Orquestrador-Maestro no NPM…') };
    if (status.state === 'checking') return { tone: 'pending', text: tr('Consultando atualizações do Orquestrador-Maestro no NPM…') };
    if (status.state === 'updating') return { tone: 'pending', text: status.message ?? tr('Instalando e verificando o Orquestrador-Maestro…') };
    if (status.state === 'missing') return { tone: 'warn', text: tr('O Orquestrador-Maestro não está instalado; instale-o para habilitar o AIOffice.') };
    if (status.state === 'blocked') return { tone: 'warn', text: status.message ?? tr('A ação do Orquestrador-Maestro foi bloqueada.') };
    if (status.state === 'error') return { tone: 'warn', text: tr('Não foi possível consultar ou atualizar o Orquestrador-Maestro: {0}', [status.error ?? tr('erro desconhecido')]) };
    if (status.available && status.latestVersion) {
      return { tone: 'new', text: tr('Há uma atualização do NPM: v{0}. Clique para aplicar.', [status.latestVersion]) };
    }
    return { tone: 'ok', text: tr('Orquestrador-Maestro instalado e verificado.') };
  }

  private matches(live: MaestroUpdateStatus, response: MaestroUpdateStatus): boolean {
    if (response.state === 'checking') return live.checkedAt === response.checkedAt;
    return live.state === response.state &&
      live.installed === response.installed &&
      live.installedVersion === response.installedVersion &&
      live.latestVersion === response.latestVersion;
  }

  private clearResponseStatus(): void {
    this.responseStatus = undefined;
    if (this.responseTimer) clearTimeout(this.responseTimer);
    this.responseTimer = undefined;
  }

  private async check(): Promise<void> {
    if (this.checking || this.requesting || this.ctx.store.connection !== 'open' || this.ctx.store.replaying) return;
    this.checking = true;
    this.failure = undefined;
    this.render();
    try {
      await this.request('/api/maestro/check', {});
    } catch (error) {
      this.failure = this.message(error, tr('Não foi possível verificar o NPM.'));
    } finally {
      this.checking = false;
      this.render();
      this.ctx.invalidate();
    }
  }

  private async installOrUpdate(): Promise<void> {
    const status = this.responseStatus ?? this.ctx.store.liveSnapshot?.meta.maestro;
    if (!status || this.requesting || status.state === 'updating' || status.canUpdate === false || this.ctx.store.connection !== 'open' || this.ctx.store.replaying) return;
    const canInstall = status.state === 'missing';
    const canUpdate = status.installed && status.available && !!status.latestVersion;
    if (!canInstall && !canUpdate) return;
    this.requesting = true;
    this.failure = undefined;
    this.render();
    try {
      if (canInstall) await this.request('/api/maestro/install', {});
      else {
        const version = status.latestVersion;
        if (!version || !status.installed || !status.available) return;
        await this.request('/api/maestro/update', { version });
      }
    } catch (error) {
      this.failure = this.message(error, tr('Não foi possível iniciar a operação do Orquestrador-Maestro.'));
    } finally {
      this.requesting = false;
      this.render();
      this.ctx.invalidate();
    }
  }

  private async request(path: string, body: Record<string, string>): Promise<void> {
    const response = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(path.endsWith('/check') ? 35_000 : 20_000),
    });
    const payload = await response.json() as unknown;
    const status = readStatus(payload);
    if (status) {
      this.responseStatus = status;
      if (this.responseTimer) clearTimeout(this.responseTimer);
      this.responseTimer = setTimeout(() => {
        this.clearResponseStatus();
        this.ctx.invalidate();
      }, 3_000);
      if (status.state === 'blocked') throw new Error(status.message ?? tr('A ação do Orquestrador-Maestro foi bloqueada.'));
      return;
    }
    const error = payload && typeof payload === 'object' && 'error' in payload && typeof payload.error === 'string'
      ? payload.error
      : undefined;
    if (!response.ok || !status) throw new Error(error ?? tr('O servidor devolveu uma resposta inválida.'));
  }

  private message(error: unknown, fallback: string): string {
    return error instanceof Error && error.message ? error.message.slice(0, 500) : fallback;
  }
}
