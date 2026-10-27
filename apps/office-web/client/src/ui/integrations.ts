// Central de capacidades: a conexão SSE, as fontes e as sessões têm estados distintos.
import type { OfficeSnapshot, Provider, SourceInfo } from '../../../shared/types';
import type { UiComponent, UiContext } from './context';
import { h, iconButton, setText } from './dom';
import { ICONS } from './icons';
import { PROVIDER_NAME, providerOf } from './provider';
import { createProviderLogo } from './widgets';
import { tr } from '../../../shared/i18n';
import './integrations.css';

type Capability = 'discovery' | 'messages' | 'terminal' | 'history' | 'approvals' | 'usage';
const CAPABILITIES: ReadonlyArray<{ key: Capability; label: string }> = [
  { key: 'discovery', label: tr('Descoberta') },
  { key: 'messages', label: tr('Mensagens') },
  { key: 'terminal', label: tr('Terminal') },
  { key: 'history', label: tr('Histórico') },
  { key: 'approvals', label: tr('Aprovações') },
  { key: 'usage', label: tr('Uso') },
];

function countLabel(count: number, singular: string, plural: string): string {
  return count === 1 ? tr(singular, [count]) : tr(plural, [count]);
}
const ACTIVE_PROVIDERS: readonly Provider[] = ['claude', 'codex', 'omp'];
const INACTIVE_PROVIDERS: readonly Provider[] = ['opencode', 'antigravity', 'devin', 'freebuf'];

interface ProviderRefs {
  status: HTMLElement;
  sessions: HTMLElement;
  capabilities: Map<Capability, HTMLElement>;
  sources: HTMLElement;
  sourceKey: string;
}

/** Small mountable modal. The owner appends `el` to `ctx.root` and calls `render()` with its UI loop. */
export class IntegrationsCenter implements UiComponent {
  readonly el: HTMLDialogElement;
  private readonly connection: HTMLElement;
  private readonly snapshotState: HTMLElement;
  private readonly closeButton: HTMLButtonElement;
  private readonly providerRefs = new Map<Provider, ProviderRefs>();
  private opener: HTMLElement | null = null;
  private static nextId = 0;

  constructor(private readonly ctx: UiContext) {
    const id = `ui-integrations-${++IntegrationsCenter.nextId}`;
    this.connection = h('span', { class: 'ui-integrations__connection', role: 'status', attrs: { 'aria-live': 'polite', 'aria-atomic': 'true' } });
    this.snapshotState = h('p', { class: 'ui-integrations__hint' });
    this.closeButton = iconButton(ICONS.close, tr('Fechar integrações'), () => this.close());
    const inactive = h('ul', { class: 'ui-integrations__inactive' }, ...INACTIVE_PROVIDERS.map((provider) => {
      const name = h(
        'strong',
        { class: 'ui-integrations__inactive-name', text: PROVIDER_NAME[provider] },
        createProviderLogo(provider, 'ui-integrations__provider-logo'),
      );
      return h('li', {}, name, h('span', { text: tr('Adaptador inativo · cobertura incompleta') }));
    }));
    this.el = h('dialog', { class: 'ui-integrations', attrs: { 'aria-labelledby': `${id}-title`, 'aria-describedby': `${id}-intro` } },
      h('header', { class: 'ui-integrations__head' },
        h('div', {}, h('span', { class: 'ui-integrations__eyebrow', text: tr('Integrações') }), h('h2', { text: tr('O que cada fonte oferece'), attrs: { id: `${id}-title` } })),
        this.closeButton,
      ),
      h('div', { class: 'ui-integrations__body', tabIndex: 0, attrs: { 'aria-label': tr('Cobertura das integrações') } },
        h('p', { class: 'ui-integrations__intro', text: tr('Confira a descoberta de sessões e os recursos disponíveis por ferramenta. Uma fonte sem sessões observadas pode estar pronta para receber a próxima sessão.'), attrs: { id: `${id}-intro` } }),
        h('section', { class: 'ui-integrations__server', attrs: { 'aria-label': tr('Conexão com o servidor') } },
          h('div', { class: 'ui-integrations__server-line' }, h('strong', { text: tr('Servidor Habblaud · SSE') }), this.connection),
          h('p', { class: 'ui-integrations__hint', text: tr('Este estado é a conexão do navegador com o servidor. As fontes abaixo informam separadamente a descoberta de sessões.') }),
          this.snapshotState,
        ),
        h('section', { class: 'ui-integrations__section' },
          h('h3', { text: tr('Fontes de sessão integradas') }),
          h('p', { class: 'ui-integrations__hint', text: tr('Capacidades implementadas no Habblaud; a disponibilidade atual depende da configuração local e da sessão.') }),
          h('div', { class: 'ui-integrations__providers' }, ...ACTIVE_PROVIDERS.map((provider) => this.createProvider(provider))),
        ),
        h('section', { class: 'ui-integrations__mcp' },
          h('h3', { text: tr('Clientes MCP · atividade explícita') }),
          h('p', { text: tr('Claude Desktop Chat/Cowork e clientes MCP podem reportar presença e resumos quando o modelo chama aioffice_heartbeat ou aioffice_report_activity. Configurar o MCP disponibiliza essas ferramentas; não inicia um feed passivo de sessões ou conversas.') }),
          h('dl', { class: 'ui-integrations__coverage' }, ...CAPABILITIES.flatMap(({ key, label }) => [
            h('dt', { text: label }),
            h('dd', { text: key === 'discovery' ? tr('Presença por chamada explícita') : key === 'history' ? tr('Resumos reportados; sem transcript') : tr('Não disponível nesta bridge') }),
          ])),
          h('p', { class: 'ui-integrations__hint', text: tr('O snapshot não informa se um cliente MCP está configurado. Nenhum relatório observado não comprova desconexão.') }),
        ),
        h('section', { class: 'ui-integrations__section' },
          h('h3', { text: tr('Integrações ainda incompletas') }),
          inactive,
          h('p', { class: 'ui-integrations__hint', text: tr('Esses adaptadores não são iniciados pelo servidor atual. Descoberta, mensagens, terminal, histórico, aprovações e uso ainda não têm cobertura completa.') }),
        ),
      ),
    );
    this.el.addEventListener('cancel', (event) => {
      event.preventDefault();
      this.close();
    });
    this.el.addEventListener('close', () => this.restoreFocus());
    // Keep global office shortcuts from acting beneath the modal.
    this.el.addEventListener('keydown', (event) => {
      event.stopPropagation();
      if (event.key === 'Escape') {
        event.preventDefault();
        this.close();
      }
    });
    this.el.addEventListener('click', (event) => {
      if (event.target !== this.el) return;
      const bounds = this.el.getBoundingClientRect();
      if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) this.close();
    });
  }

  get isOpen(): boolean {
    return this.el.open;
  }

  open(opener?: HTMLElement): void {
    if (this.isOpen) return;
    this.opener = opener ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    if (!this.el.isConnected) this.ctx.root.append(this.el);
    this.render();
    this.el.showModal();
    this.closeButton.focus({ preventScroll: true });
  }

  close(): void {
    if (!this.isOpen) return;
    this.el.close();
  }

  toggle(opener?: HTMLElement): void {
    if (this.isOpen) this.close();
    else this.open(opener);
  }

  dispose(): void {
    this.close();
    this.restoreFocus();
    this.el.remove();
  }

  render(): void {
    const store = this.ctx.store;
    // Replay has a reconstructed snapshot. Source health must come from the live server.
    const snap = store.liveSnapshot;
    const connectionLabels = {
      open: tr('Conectado'), connecting: tr('Conectando'), closed: tr('Sem conexão SSE'), mock: tr('Demonstração local'),
    };
    setText(this.connection, connectionLabels[store.connection]);
    this.connection.dataset.state = store.connection;
    setText(this.snapshotState, !snap
      ? tr('Aguardando snapshot do servidor. O estado das fontes ainda não foi informado.')
      : store.mock
        ? tr('Dados simulados: este painel não comprova o estado das fontes locais.')
        : store.connection !== 'open'
          ? tr('Último snapshot recebido: os estados abaixo podem estar desatualizados.')
          : store.replaying
            ? tr('Timelapse aberto: os estados abaixo usam o último snapshot ao vivo, separado da reprodução.')
            : snap.meta.demo
              ? tr('Demonstração ligada: a descoberta abaixo usa as fontes reais; agentes simulados ficam fora das contagens de capacidade.')
              : tr('Estados das fontes informados pelo último snapshot ao vivo.'),
    );
    for (const provider of ACTIVE_PROVIDERS) this.renderProvider(provider, store.mock ? null : snap);
  }

  private createProvider(provider: Provider): HTMLElement {
    const status = h('span', { class: 'ui-integrations__source-status' });
    const sessions = h('p', { class: 'ui-integrations__sessions' });
    const sources = h('div', { class: 'ui-integrations__source-list' });
    const capabilities = new Map<Capability, HTMLElement>();
    const coverage = h('dl', { class: 'ui-integrations__coverage' });
    for (const { key, label } of CAPABILITIES) {
      const value = h('dd');
      capabilities.set(key, value);
      coverage.append(h('dt', { text: label }), value);
    }
    this.providerRefs.set(provider, { status, sessions, capabilities, sources, sourceKey: '' });
    const notes = provider === 'omp'
      ? tr('Mensagens exigem a extensão carregada e consultando a caixa de entrada. Reabra uma sessão iniciada antes da instalação. Uso e aprovações não são fornecidos pela integração OMP.')
      : provider === 'codex'
        ? tr('Mensagens exigem o entregador configurado. Aprovações exigem os hooks locais. Uso depende dos rate_limits gravados nas sessões; números antigos continuam identificados como antigos.')
        : tr('Mensagens exigem o plugin consultando a caixa de entrada. Aprovações exigem o hook de permissões. Uso depende do statusline ou cache local. Claude Desktop Chat/Cowork usa a bridge MCP descrita abaixo.');
    return h('article', { class: 'ui-integrations__provider', attrs: { 'data-provider': provider } },
      h('div', { class: 'ui-integrations__provider-head' }, h('h4', {}, createProviderLogo(provider, 'ui-integrations__provider-logo'), h('span', { text: PROVIDER_NAME[provider] })), status),
      sessions, coverage,
      h('details', { class: 'ui-integrations__details' }, h('summary', { text: tr('Fontes configuradas e requisitos') }), sources, h('p', { class: 'ui-integrations__hint', text: notes })),
    );
  }

  private renderProvider(provider: Provider, snap: OfficeSnapshot | null): void {
    const refs = this.providerRefs.get(provider)!;
    const sources = snap?.meta.sources.filter((source) => providerOf(source) === provider) ?? [];
    const agents = snap?.agents.filter((agent) => providerOf(agent) === provider && !agent.id.startsWith('demo:') && agent.status !== 'offline' && agent.status !== 'done') ?? [];
    const sessions = sources.reduce((count, source) => count + source.sessions, 0);
    const errors = sources.filter((source) => !source.ok).length;
    setText(refs.status, !snap ? tr('Aguardando dados') : !sources.length ? tr('Fonte não informada') : errors ? tr('Fonte requer atenção') : tr('Fonte pronta'));
    refs.status.dataset.state = errors ? 'error' : sources.length ? 'ready' : 'unknown';
    setText(refs.sessions, !snap ? tr('Sessões ainda não informadas') : !sources.length ? tr('Nenhuma fonte configurada informada pelo servidor') : sessions === 0 ? tr('Nenhuma sessão observada') : countLabel(sessions, '{0} sessão detectada', '{0} sessões detectadas'));
    const readySources = sources.length - errors;
    const messageAgents = agents.filter((agent) => agent.kind === 'main' && agent.canMessage).length;
    const permissionRequests = agents.filter((agent) => agent.permission).length;
    const values: Record<Capability, string> = {
      discovery: !snap ? tr('Aguardando snapshot') : !sources.length ? tr('Implementada; fonte não informada') : errors ? tr('{0} de {1} fontes prontas', [readySources, sources.length]) : countLabel(sources.length, '{0} fonte pronta', '{0} fontes prontas'),
      messages: !snap ? tr('Depende da configuração local') : !snap.meta.messages ? tr('Desligadas no servidor') : countLabel(messageAgents, '{0} agente apto agora', '{0} agentes aptos agora'),
      terminal: !snap ? tr('Leitura; exige acesso local') : snap.meta.terminal ? tr('Leitura disponível; exige transcript') : tr('Desligado no servidor'),
      history: !snap ? tr('Sessões locais; exige acesso local') : snap.meta.terminal ? tr('Sessões locais disponíveis') : tr('Desligado no servidor'),
      approvals: provider === 'omp' ? tr('Não disponível') : !snap ? tr('Depende dos hooks locais') : !snap.meta.terminal ? tr('Desligadas no servidor') : countLabel(permissionRequests, 'Hooks locais · {0} pedido pendente', 'Hooks locais · {0} pedidos pendentes'),
      usage: this.usageLabel(provider, snap),
    };
    for (const [key, el] of refs.capabilities) setText(el, values[key]);
    const sourceKey = JSON.stringify(sources);
    if (sourceKey !== refs.sourceKey) {
      refs.sourceKey = sourceKey;
      refs.sources.replaceChildren(...sources.map((source) => this.sourceEntry(source)));
      if (!sources.length) refs.sources.append(h('p', { class: 'ui-integrations__hint', text: tr('O servidor ainda não informou uma fonte configurada para esta ferramenta.') }));
    }
  }

  private usageLabel(provider: Provider, snap: OfficeSnapshot | null): string {
    if (provider === 'omp') return tr('Não disponível');
    if (!snap) return tr('Depende de dados da conta');
    const accounts = snap.accounts.filter((account) => providerOf(account) === provider);
    const quota = accounts.filter((account) => account.usage?.noQuota).length;
    const fresh = accounts.filter((account) => account.usage && account.usageStatus === 'ok' && !account.usage.noQuota).length;
    const stale = accounts.filter((account) => account.usage && account.usageStatus === 'stale' && !account.usage.noQuota).length;
    if (quota) return `${countLabel(fresh, '{0} conta com dados recentes', '{0} contas com dados recentes')} · ${countLabel(stale, '{0} conta com dados antigos', '{0} contas com dados antigos')} · ${countLabel(quota, '{0} conta sem cota', '{0} contas sem cota')}`;
    if (fresh || stale) return `${countLabel(fresh, '{0} conta com dados recentes', '{0} contas com dados recentes')} · ${countLabel(stale, '{0} conta com dados antigos', '{0} contas com dados antigos')}`;
    return tr('Sem dados de uso informados');
  }

  private sourceEntry(source: SourceInfo): HTMLElement {
    return h('div', { class: 'ui-integrations__source' },
      h('div', {}, h('strong', { text: source.label }), h('span', { text: source.ok ? countLabel(source.sessions, 'Pronta · {0} sessão', 'Pronta · {0} sessões') : tr('Requer atenção') })),
      h('code', { text: source.path }),
      source.error ? h('p', { class: 'ui-integrations__source-error', text: source.error }) : null,
    );
  }

  private restoreFocus(): void {
    const opener = this.opener;
    this.opener = null;
    if (opener?.isConnected) opener.focus({ preventScroll: true });
  }
}
