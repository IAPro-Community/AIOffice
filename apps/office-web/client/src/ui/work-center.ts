// Central de trabalho: visão de projeto e atalhos para atenção, integrações, histórico e modelos.
import type { Activity, AgentInfo, RoomInfo } from '../../../shared/types';
import type { UiComponent, UiContext } from './context';
import { h, iconButton, KeyedList, setHidden, setText } from './dom';
import { formatClock, formatDuration } from './format';
import { ICONS } from './icons';
import { aggregateTasks, shellDoneKind } from './model';
import { PROVIDER_NAME } from './provider';
import { tr } from '../../../shared/i18n';
import './work-center.css';

export interface WorkCenterActions {
  attentionCount(): number;
  openAttention(opener: HTMLElement): void;
  openIntegrations(opener: HTMLElement): void;
  openTemplates(opener: HTMLElement): void;
  openHistory(): void;
}

type Signal = { activity: Activity; agent: AgentInfo };

interface AgentRowRefs {
  button: HTMLButtonElement;
  status: HTMLElement;
  name: HTMLElement;
  role: HTMLElement;
  activity: HTMLElement;
  age: HTMLElement;
}

function providerName(agent: AgentInfo): string {
  return PROVIDER_NAME[agent.provider ?? 'claude'];
}

function allSignals(agents: readonly AgentInfo[]): Signal[] {
  return agents.flatMap((agent) => (agent.recent ?? []).map((activity) => ({ agent, activity })));
}

function latestSignal(agents: readonly AgentInfo[], test: (signal: Signal) => boolean): Signal | undefined {
  return allSignals(agents).filter(test).sort((a, b) => b.activity.at - a.activity.at)[0];
}

function actionLabel(signal: Signal | undefined): string {
  if (!signal) return tr('Sem sinal registrado');
  const result = shellDoneKind(signal.activity);
  if (result === 'fail' || signal.activity.error || signal.activity.kind === 'error') return tr('Falhou');
  if (result === 'ok' || signal.activity.kind === 'done') return tr('Concluído');
  return tr('Execução registrada');
}

function relative(at: number, now: number): string {
  return formatDuration(Math.max(0, now - at));
}

export class WorkCenter implements UiComponent {
  readonly button: HTMLButtonElement;
  readonly el: HTMLDialogElement;
  private title: HTMLElement;
  private subhead: HTMLElement;
  private roomSelect: HTMLSelectElement;
  private summary: HTMLElement;
  private currentTask: HTMLElement;
  private signals: HTMLElement;
  private agentList: HTMLElement;
  private emptyAgentItem: HTMLLIElement;
  private agentRows: KeyedList<AgentInfo, HTMLLIElement>;
  private readonly agentRowRefs = new WeakMap<HTMLLIElement, AgentRowRefs>();
  private attentionButton: HTMLButtonElement;
  private sourceButton: HTMLButtonElement;
  private templatesButton: HTMLButtonElement;
  private historyButton: HTMLButtonElement;
  private closeButton: HTMLButtonElement;
  private opener: HTMLElement | null = null;
  private roomId: string | null = null;

  constructor(private readonly ctx: UiContext, private readonly actions: WorkCenterActions) {
    const icon = '<svg class="ui-px-icon" width="20" height="20" viewBox="0 0 10 10" shape-rendering="crispEdges" aria-hidden="true" focusable="false"><path fill="currentColor" d="M1 1h8v2H1zM1 4h3v2H1zM5 4h4v2H5zM1 7h8v2H1z"/></svg>';
    this.button = iconButton(icon, tr('Central de trabalho'), () => this.openDialog(), 'ui-btn-work-center');
    this.button.setAttribute('aria-haspopup', 'dialog');
    this.button.setAttribute('aria-expanded', 'false');

    this.title = h('h2', { text: tr('Central de trabalho'), attrs: { id: 'ui-work-center-title' } });
    this.subhead = h('p', { class: 'ui-work-center__subhead' });
    this.closeButton = iconButton(ICONS.close, tr('Fechar central de trabalho'), () => this.close(), 'ui-icon-btn--sm');
    this.roomSelect = h('select', { class: 'ui-work-center__select', attrs: { id: 'ui-work-center-project', 'aria-label': tr('Projeto em foco') } });
    this.roomSelect.addEventListener('change', () => {
      this.roomId = this.roomSelect.value || null;
      this.renderProject();
    });
    this.summary = h('div', { class: 'ui-work-center__summary', attrs: { 'aria-live': 'polite' } });
    this.currentTask = h('div', { class: 'ui-work-center__next' });
    this.signals = h('div', { class: 'ui-work-center__signals' });
    this.agentList = h('ul', { class: 'ui-work-center__agents', attrs: { 'aria-label': tr('Agentes neste projeto') } });
    this.emptyAgentItem = h('li', { class: 'ui-work-center__empty' });
    this.agentList.append(this.emptyAgentItem);
    this.agentRows = new KeyedList(this.agentList, {
      key: (agent) => agent.id,
      create: (agent) => this.createAgentRow(agent),
      update: (row, agent) => this.updateAgentRow(row, agent),
      animate: false,
    });

    this.attentionButton = this.actionButton('✋', tr('Precisa de você'), () => this.openAction(actions.openAttention), 'ui-work-center__action--attention');
    this.sourceButton = this.actionButton('⌘', tr('Integrações e fontes'), () => this.openAction(actions.openIntegrations));
    this.templatesButton = this.actionButton('▤', tr('Modelos de tarefa'), () => this.openAction(actions.openTemplates));
    this.historyButton = this.actionButton('◷', tr('Histórico de sessões'), () => {
      this.close();
      actions.openHistory();
    });

    const header = h('header', { class: 'ui-work-center__head' }, h('div', {}, this.title, this.subhead), this.closeButton);
    const projectHead = h('div', { class: 'ui-work-center__project-head' }, h('label', { class: 'ui-work-center__label', text: tr('Projeto'), attrs: { for: 'ui-work-center-project' } }), this.roomSelect);
    const project = h('section', { class: 'ui-work-center__project', attrs: { 'aria-label': tr('Resumo do projeto') } }, projectHead, this.summary, this.currentTask, this.signals, this.agentList);
    const actionsEl = h('nav', { class: 'ui-work-center__nav', attrs: { 'aria-label': tr('Atalhos de trabalho') } }, this.attentionButton, this.sourceButton, this.templatesButton, this.historyButton);
    const card = h('section', { class: 'ui-work-center__card ui-panel', attrs: { 'aria-labelledby': 'ui-work-center-title' } }, header, project, actionsEl);
    this.el = h('dialog', {
      class: 'ui-work-center',
      attrs: { 'aria-labelledby': 'ui-work-center-title' },
      on: {
        cancel: (event) => { event.preventDefault(); event.stopPropagation(); this.close(); },
        close: () => this.restoreFocus(),
      },
    }, card);
    this.el.addEventListener('click', (event) => {
      if (event.target === this.el) this.close();
    });
  }

  get isOpen(): boolean {
    return this.el.open;
  }

  openDialog(opener: HTMLElement = this.button): void {
    if (this.isOpen) return;
    this.opener = opener;
    this.button.setAttribute('aria-expanded', 'true');
    this.button.classList.add('is-on');
    this.el.showModal();
    this.render();
    requestAnimationFrame(() => (this.roomSelect.disabled ? this.closeButton : this.roomSelect).focus());
  }

  close(): void {
    if (!this.isOpen) return;
    this.button.setAttribute('aria-expanded', 'false');
    this.button.classList.remove('is-on');
    this.el.close();
  }

  render(): void {
    const count = this.actions.attentionCount();
    const countEl = this.attentionButton?.querySelector?.('.ui-work-center__action-count');
    if (countEl) setText(countEl as HTMLElement, String(count));
    this.attentionButton?.classList?.toggle('has-items', count > 0);
    if (!this.isOpen) return;
    this.renderProject();
  }

  private actionButton(icon: string, label: string, onClick: () => void, extra = ''): HTMLButtonElement {
    return h('button', { class: `ui-work-center__action ${extra}`.trim(), type: 'button', on: { click: onClick } }, h('span', { class: 'ui-work-center__action-icon', attrs: { 'aria-hidden': 'true' }, text: icon }), h('span', { class: 'ui-work-center__action-text', text: label }), h('span', { class: 'ui-work-center__action-count', text: '0', attrs: { 'aria-hidden': 'true' } }));
  }

  private openAction(open: (opener: HTMLElement) => void): void {
    this.close();
    open(this.button);
  }

  private renderProject(): void {
    const snapshot = this.ctx.store.snapshot;
    const rooms = snapshot?.rooms ?? [];
    this.syncRooms(rooms);
    const room = rooms.find((candidate) => candidate.id === this.roomId);
    const agents = snapshot?.agents.filter((agent) => agent.roomId === room?.id) ?? [];
    const now = this.ctx.now();
    const working = agents.filter((agent) => agent.status === 'working' || agent.status === 'shell').length;
    const waiting = agents.filter((agent) => agent.status === 'waiting').length;
    const errors = agents.filter((agent) => agent.recent.some((activity) => activity.error && now - activity.at < 10 * 60_000)).length;
    const progress = aggregateTasks(agents);
    const connection = this.ctx.store.connection === 'open' ? tr('Fluxo do servidor ativo') : this.ctx.store.connection === 'mock' ? tr('Dados simulados') : tr('Fluxo do servidor indisponível');
    const mode = this.ctx.store.replaying ? tr('Reprodução histórica: os dados refletem o instante selecionado.') : snapshot?.meta.demo ? tr('Ambiente de demonstração.') : connection;
    setText(this.subhead, room ? `${room.path} · ${mode}` : mode);
    this.summary.replaceChildren(
      this.metric(tr('Sessões'), String(agents.filter((agent) => agent.kind === 'main').length)),
      this.metric(tr('Em atividade'), String(working)),
      this.metric(tr('Esperando você'), String(waiting), waiting > 0 ? 'is-waiting' : ''),
      this.metric(tr('Tarefas'), progress.total ? `${progress.completed}/${progress.total}` : tr('Sem tarefas')),
    );

    const nextWaiting = agents.find((agent) => agent.status === 'waiting');
    const pendingTask = agents.flatMap((agent) => agent.tasks.filter((task) => task.status !== 'completed').map((task) => ({ agent, task })))[0];
    let nextText = tr('Próximo passo sugerido');
    let nextDetail = tr('Não há bloqueio ou tarefa pendente registrado neste projeto.');
    if (nextWaiting) {
      nextText = tr('Desbloqueio necessário');
      nextDetail = `${nextWaiting.name}: ${nextWaiting.waitingFor ?? tr('precisa de uma resposta sua')}`;
    } else if (pendingTask) {
      nextText = tr('Próximo passo registrado');
      nextDetail = `${pendingTask.task.activeForm ?? pendingTask.task.title} · ${pendingTask.agent.name}`;
    } else if (errors) {
      nextDetail = tr('{0} agente(s) teve/ tiveram um erro recente; abra a fila de atenção para revisar.', [errors]);
    }
    this.currentTask.replaceChildren(h('strong', { text: nextText }), h('span', { text: nextDetail }));

    const buildSignal = latestSignal(agents, ({ activity }) => /\b(build|compile|compila|tsc)\b/i.test(`${activity.text} ${activity.detail ?? ''}`));
    const testSignal = latestSignal(agents, ({ activity }) => activity.kind === 'test' || /\b(test|tests|vitest|jest|playwright|pytest)\b/i.test(`${activity.text} ${activity.detail ?? ''}`));
    this.signals.replaceChildren(
      this.signalCard(tr('Build'), buildSignal, now),
      this.signalCard(tr('Testes'), testSignal, now),
      this.metric(tr('Erros recentes'), String(errors), errors ? 'is-error' : ''),
    );

    if (!room) {
      setText(this.emptyAgentItem, rooms.length ? tr('Escolha um projeto para ver sessões e tarefas.') : tr('Nenhum projeto com sessão ativa foi observado.'));
      setHidden(this.emptyAgentItem, false);
      this.syncAgentRows([]);
      return;
    }
    if (!agents.length) {
      setText(this.emptyAgentItem, tr('Nenhuma sessão ativa neste projeto.'));
      setHidden(this.emptyAgentItem, false);
      this.syncAgentRows([]);
      return;
    }
    const sorted = agents.slice().sort((a, b) => (a.status === 'waiting' ? 0 : 1) - (b.status === 'waiting' ? 0 : 1) || b.lastEventAt - a.lastEventAt);
    setHidden(this.emptyAgentItem, true);
    this.syncAgentRows(sorted);
  }

  private syncRooms(rooms: readonly RoomInfo[]): void {
    if (!this.roomId || !rooms.some((room) => room.id === this.roomId)) {
      const selection = this.ctx.selection();
      const selectedAgent = selection?.type === 'agent' ? this.ctx.agent(selection.id) : undefined;
      const selectedRoom = selection?.type === 'room' ? selection.id : undefined;
      this.roomId = rooms.some((room) => room.id === selectedRoom)
        ? selectedRoom!
        : selectedAgent?.roomId ?? rooms.slice().sort((a, b) => b.createdAt - a.createdAt)[0]?.id ?? null;
    }
    const selected = this.roomId ?? '';
    this.roomSelect.replaceChildren(...rooms.slice().sort((a, b) => a.slot - b.slot).map((room) => h('option', { text: room.name, attrs: { value: room.id } })));
    this.roomSelect.value = selected;
    this.roomSelect.disabled = rooms.length === 0;
    setHidden(this.roomSelect, rooms.length === 0);
  }

  private syncAgentRows(agents: readonly AgentInfo[]): void {
    const focused = document.activeElement instanceof HTMLElement && this.agentList.contains(document.activeElement)
      ? document.activeElement
      : null;
    const focusedId = focused?.closest('li')?.dataset.key;
    this.agentRows.sync(agents);
    if (!focused) return;
    const next = focusedId ? this.agentRows.get(focusedId)?.querySelector<HTMLButtonElement>('button') : undefined;
    if (next?.isConnected) {
      if (document.activeElement !== next) next.focus({ preventScroll: true });
    } else {
      this.closeButton.focus({ preventScroll: true });
    }
  }

  private metric(label: string, value: string, state = ''): HTMLElement {
    return h('div', { class: `ui-work-center__metric ${state}`.trim() }, h('span', { class: 'ui-work-center__metric-label', text: label }), h('strong', { class: 'ui-work-center__metric-value', text: value }));
  }

  private signalCard(label: string, signal: Signal | undefined, now: number): HTMLElement {
    const detail = signal ? `${actionLabel(signal)} · ${signal.agent.name} · ${relative(signal.activity.at, now)}` : tr('Sem sinal registrado');
    return h('div', { class: 'ui-work-center__signal' }, h('span', { class: 'ui-work-center__signal-label', text: label }), h('strong', { class: 'ui-work-center__signal-status', text: signal ? actionLabel(signal) : tr('Sem registro') }), h('span', { class: 'ui-work-center__signal-detail', text: detail }));
  }

  private createAgentRow(agent: AgentInfo): HTMLLIElement {
    const status = h('span', { class: 'ui-work-center__status', attrs: { 'aria-hidden': 'true' } });
    const name = h('strong');
    const role = h('span');
    const activity = h('span', { class: 'ui-work-center__agent-activity' });
    const age = h('span', { class: 'ui-work-center__agent-age' });
    const button = h('button', { class: 'ui-work-center__agent', type: 'button', on: { click: () => {
      this.close();
      this.ctx.select({ type: 'agent', id: agent.id }, { focus: true });
    } } },
    status,
    h('span', { class: 'ui-work-center__agent-main' }, name, role, activity),
    age,
    );
    const row = h('li', { class: 'ui-work-center__agent-item' }, button);
    this.agentRowRefs.set(row, { button, status, name, role, activity, age });
    this.updateAgentRow(row, agent);
    return row;
  }

  private updateAgentRow(row: HTMLLIElement, agent: AgentInfo): void {
    const refs = this.agentRowRefs.get(row)!;
    const recent = agent.activity;
    const line = recent ? `${recent.icon} ${recent.text} · ${formatClock(recent.at, false)}` : agent.waitingFor ?? agent.title ?? tr('Sem atividade detalhada');
    refs.status.className = `ui-work-center__status is-${agent.status}`;
    setText(refs.name, agent.name);
    setText(refs.role, `${providerName(agent)} · ${agent.role}`);
    setText(refs.activity, line);
    setText(refs.age, relative(agent.lastEventAt, this.ctx.now()));
    refs.button.title = tr('Abrir detalhes de {0}', [agent.name]);
  }

  private restoreFocus(): void {
    this.button.setAttribute('aria-expanded', 'false');
    this.button.classList.remove('is-on');
    const opener = this.opener;
    this.opener = null;
    if (opener?.isConnected) opener.focus({ preventScroll: true });
  }
}
