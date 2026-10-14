// Fila de atenção: navega até o agente; decisões e respostas ficam na gaveta existente.
import { getLocale, type Locale } from '../../../shared/i18n';
import type { Activity, AgentInfo } from '../../../shared/types';
import type { UiComponent, UiContext } from './context';
import { h, KeyedList, setHidden, setText } from './dom';
import { formatDuration } from './format';
import { PROVIDER_NAME, providerOf } from './provider';
import './attention.css';

/** Erros são sinais recentes, não uma lista permanente de incidentes. */
export const ATTENTION_ERROR_WINDOW_MS = 10 * 60_000;
export type AttentionKind = 'permission' | 'question' | 'waiting' | 'error';

export interface AttentionItem {
  agent: AgentInfo;
  kind: AttentionKind;
  reason: string;
  detail?: string;
  since: number;
  /** Só pedidos ainda válidos têm prazo para responder pelo escritório. */
  expiresAt?: number;
}

const PRIORITY: Record<AttentionKind, number> = { permission: 0, question: 1, waiting: 2, error: 3 };

interface AttentionCopy {
  title: string;
  description: string;
  close: string;
  loading: string;
  empty: string;
  emptyDetail: string;
  replay: string;
  kinds: Record<AttentionKind, string>;
  waitingReason: string;
  errorReason: string;
  focus: string;
  selected: string;
  age: string;
  expires: string;
  countOne: string;
  countMany: string;
  queued: string;
}

// Mantido local para o módulo poder ser integrado sem alterar os dicionários compartilhados.
const COPY: Record<Locale, AttentionCopy> = {
  'pt-BR': {
    title: 'Fila de atenção', description: 'Permissões, perguntas e esperas primeiro; erros dos últimos 10 minutos depois. Os mais antigos vêm primeiro em cada grupo.',
    close: 'Fechar fila de atenção', loading: 'Aguardando dados do escritório…', empty: 'Nenhum agente precisa de atenção agora',
    emptyDetail: 'As esperas e os erros recentes aparecem aqui quando chegam ao escritório.', replay: 'Timelapse: atenção no instante reproduzido',
    kinds: { permission: 'Permissão', question: 'Pergunta', waiting: 'Espera', error: 'Erro recente' },
    waitingReason: 'Aguardando sua resposta', errorReason: 'Uma atividade falhou', focus: 'Ver agente', selected: 'Agente selecionado',
    age: 'há', expires: 'Prazo no escritório:', countOne: 'agente na fila', countMany: 'agentes na fila', queued: 'pedidos na sequência',
  },
  en: {
    title: 'Attention queue', description: 'Permissions, questions and waits first; errors from the last 10 minutes next. Oldest first within each group.',
    close: 'Close attention queue', loading: 'Waiting for office data…', empty: 'No agents need attention right now',
    emptyDetail: 'Waiting agents and recent errors appear here as they reach the office.', replay: 'Timelapse: attention at the replayed moment',
    kinds: { permission: 'Permission', question: 'Question', waiting: 'Waiting', error: 'Recent error' },
    waitingReason: 'Waiting for your response', errorReason: 'An activity failed', focus: 'View agent', selected: 'Agent selected',
    age: 'ago', expires: 'Office deadline:', countOne: 'agent in the queue', countMany: 'agents in the queue', queued: 'requests queued next',
  },
  es: {
    title: 'Cola de atención', description: 'Permisos, preguntas y esperas primero; después, errores de los últimos 10 minutos. Los más antiguos van primero en cada grupo.',
    close: 'Cerrar cola de atención', loading: 'Esperando datos de la oficina…', empty: 'Ningún agente necesita atención ahora',
    emptyDetail: 'Las esperas y los errores recientes aparecen aquí cuando llegan a la oficina.', replay: 'Timelapse: atención en el instante reproducido',
    kinds: { permission: 'Permiso', question: 'Pregunta', waiting: 'Espera', error: 'Error reciente' },
    waitingReason: 'Esperando tu respuesta', errorReason: 'Una actividad falló', focus: 'Ver agente', selected: 'Agente seleccionado',
    age: 'hace', expires: 'Plazo en la oficina:', countOne: 'agente en la cola', countMany: 'agentes en la cola', queued: 'solicitudes en espera',
  },
  fr: {
    title: 'File d’attention', description: 'Autorisations, questions et attentes d’abord ; erreurs des 10 dernières minutes ensuite. Les plus anciennes en premier dans chaque groupe.',
    close: 'Fermer la file d’attention', loading: 'En attente des données du bureau…', empty: 'Aucun agent ne demande votre attention',
    emptyDetail: 'Les attentes et les erreurs récentes apparaissent ici dès leur arrivée au bureau.', replay: 'Timelapse : attention au moment reproduit',
    kinds: { permission: 'Autorisation', question: 'Question', waiting: 'Attente', error: 'Erreur récente' },
    waitingReason: 'En attente de votre réponse', errorReason: 'Une activité a échoué', focus: 'Voir l’agent', selected: 'Agent sélectionné',
    age: 'depuis', expires: 'Délai dans le bureau :', countOne: 'agent dans la file', countMany: 'agents dans la file', queued: 'demandes suivantes',
  },
};

function copy(): AttentionCopy {
  return COPY[getLocale()];
}

function validTime(value: number | undefined, fallback: number): number {
  return value !== undefined && Number.isFinite(value) && value > 0 ? value : fallback;
}

function lastError(agent: AgentInfo, now: number): Activity | undefined {
  return [...agent.recent, ...(agent.activity ? [agent.activity] : [])]
    .filter((activity) => (activity.kind === 'error' || activity.error === true) && Number.isFinite(activity.at) && activity.at <= now && now - activity.at <= ATTENTION_ERROR_WINDOW_MS)
    .sort((a, b) => b.at - a.at)[0];
}

/** Uma entrada por agente, sem inferir permissões ou falhas a partir de palavras no transcript. */
export function collectAttentionItems(agents: readonly AgentInfo[], now: number): AttentionItem[] {
  const items: AttentionItem[] = [];
  for (const agent of agents) {
    if (agent.status === 'waiting') {
      const permission = agent.permission;
      const questions = permission ? permission.questions : agent.activity?.questions;
      const kind: AttentionKind = questions?.length || (!permission && agent.activity?.kind === 'ask') ? 'question' : permission ? 'permission' : 'waiting';
      const questionText = questions?.map((question) => question.question).filter(Boolean).join('\n');
      items.push({
        agent, kind,
        reason: questionText || permission?.text || agent.waitingFor || agent.activity?.text || copy().waitingReason,
        detail: permission?.title || agent.activity?.detail,
        since: validTime(permission?.createdAt, validTime(agent.statusSince, validTime(agent.lastEventAt, now))),
        expiresAt: permission && permission.expiresAt > now ? permission.expiresAt : undefined,
      });
      continue;
    }
    const error = lastError(agent, now);
    if (error) items.push({ agent, kind: 'error', reason: error.text || copy().errorReason, detail: error.detail, since: error.at });
  }
  return items.sort((a, b) => PRIORITY[a.kind] - PRIORITY[b.kind] || a.since - b.since || a.agent.id.localeCompare(b.agent.id));
}

interface RowRefs {
  name: HTMLElement;
  kind: HTMLElement;
  context: HTMLElement;
  session: HTMLElement;
  reason: HTMLElement;
  detail: HTMLElement;
  age: HTMLElement;
  deadline: HTMLElement;
  queued: HTMLElement;
  action: HTMLButtonElement;
}

let nextDialogId = 0;

/** Mount `.el` in the UI root and call `render()` in the existing UI render loop. */
export class AttentionQueue implements UiComponent {
  readonly el: HTMLDialogElement;
  private readonly heading: HTMLElement;
  private readonly description: HTMLElement;
  private readonly summary: HTMLElement;
  private readonly replay: HTMLElement;
  private readonly empty: HTMLElement;
  private readonly emptyTitle: HTMLElement;
  private readonly emptyDetail: HTMLElement;
  private readonly closeButton: HTMLButtonElement;
  private readonly list: KeyedList<AttentionItem, HTMLLIElement>;
  private readonly rows = new WeakMap<HTMLLIElement, RowRefs>();
  private opener: HTMLElement | null = null;

  constructor(private readonly ctx: UiContext) {
    const id = `ui-attention-${++nextDialogId}`;
    this.heading = h('h2', { attrs: { id: `${id}-title` } });
    this.description = h('p', { class: 'ui-attention__description', attrs: { id: `${id}-description` } });
    this.summary = h('p', { class: 'ui-attention__summary', role: 'status', attrs: { 'aria-live': 'polite', 'aria-atomic': 'true' } });
    this.replay = h('p', { class: 'ui-attention__replay', hidden: true });
    this.closeButton = h('button', { class: 'ui-attention__close', type: 'button', text: '×', on: { click: () => this.close() } });
    this.emptyTitle = h('strong');
    this.emptyDetail = h('p');
    this.empty = h('div', { class: 'ui-attention__empty' }, this.emptyTitle, this.emptyDetail);
    const list = h('ol', { class: 'ui-attention__list' });
    this.list = new KeyedList(list, {
      key: (item) => item.agent.id,
      create: (item) => this.createRow(item),
      update: (row, item) => this.updateRow(row, item),
      animate: false,
    });
    this.el = h('dialog', {
      class: 'ui-attention',
      attrs: { 'aria-labelledby': `${id}-title`, 'aria-describedby': `${id}-description` },
      on: {
        cancel: (event) => { event.preventDefault(); this.close(); },
        close: () => { if (!this.isOpen) this.restoreFocus(); },
        click: (event) => {
          if (event.target !== this.el) return;
          const rect = this.el.getBoundingClientRect();
          if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) this.close();
        },
      },
    },
    h('header', { class: 'ui-attention__head' }, this.heading, this.closeButton),
    h('div', { class: 'ui-attention__intro' }, this.description, this.replay, this.summary),
    h('div', { class: 'ui-attention__body' }, this.empty, list));
    this.render();
  }

  get isOpen(): boolean { return this.el.open; }

  get count(): number {
    return collectAttentionItems(this.ctx.store.snapshot?.agents ?? [], this.ctx.now()).length;
  }

  open(opener?: HTMLElement): void {
    if (this.isOpen) return;
    this.opener = opener ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    if (!this.el.isConnected) this.ctx.root.append(this.el);
    this.renderContent();
    this.el.showModal();
    this.closeButton.focus();
  }

  close(): void {
    if (!this.isOpen) return;
    this.el.close();
    this.restoreFocus();
  }

  destroy(): void {
    this.close();
    this.list.clear();
    this.el.remove();
  }

  render(): void {
    const text = copy();
    setText(this.heading, text.title);
    setText(this.description, text.description);
    this.closeButton.setAttribute('aria-label', text.close);
    this.closeButton.title = text.close;
    if (this.isOpen) this.renderContent();
  }

  private restoreFocus(): void {
    const opener = this.opener;
    this.opener = null;
    if (opener?.isConnected) opener.focus({ preventScroll: true });
  }

  private renderContent(): void {
    const text = copy();
    const snapshot = this.ctx.store.snapshot;
    const items = collectAttentionItems(snapshot?.agents ?? [], this.ctx.now());
    const focused = document.activeElement;
    setText(this.summary, snapshot ? `${items.length} ${items.length === 1 ? text.countOne : text.countMany}` : text.loading);
    setText(this.replay, text.replay);
    setHidden(this.replay, !this.ctx.store.replaying);
    setText(this.emptyTitle, snapshot ? text.empty : text.loading);
    setText(this.emptyDetail, text.emptyDetail);
    setHidden(this.emptyDetail, !snapshot);
    setHidden(this.empty, items.length > 0);
    this.list.sync(items);
    // Se a espera termina enquanto o botão tem foco, mantenha o teclado dentro do diálogo.
    if (this.isOpen && focused instanceof HTMLElement) {
      if (!focused.isConnected) this.closeButton.focus();
      else if (this.el.contains(focused) && document.activeElement !== focused) focused.focus({ preventScroll: true });
    }
  }

  private createRow(item: AttentionItem): HTMLLIElement {
    const name = h('strong', { class: 'ui-attention__name' });
    const kind = h('span', { class: 'ui-attention__kind' });
    const context = h('p', { class: 'ui-attention__context' });
    const session = h('p', { class: 'ui-attention__session' });
    const reason = h('p', { class: 'ui-attention__reason' });
    const detail = h('p', { class: 'ui-attention__detail' });
    const age = h('span', { class: 'ui-attention__age' });
    const deadline = h('span', { class: 'ui-attention__deadline' });
    const queued = h('span', { class: 'ui-attention__queued' });
    const action = h('button', { class: 'ui-attention__action', type: 'button', on: { click: () => this.focusAgent(item.agent.id) } });
    const row = h('li', { class: 'ui-attention__item' },
      h('div', { class: 'ui-attention__row-head' }, name, kind), context, session, reason, detail,
      h('div', { class: 'ui-attention__meta' }, age, deadline, queued), action);
    this.rows.set(row, { name, kind, context, session, reason, detail, age, deadline, queued, action });
    return row;
  }

  private updateRow(row: HTMLLIElement, item: AttentionItem): void {
    const refs = this.rows.get(row)!;
    const text = copy();
    const now = this.ctx.now();
    const { agent } = item;
    const room = this.ctx.store.room(agent.roomId);
    const duration = formatDuration(Math.max(0, now - item.since));
    const age = getLocale() === 'en' ? `${duration} ${text.age}` : `${text.age} ${duration}`;
    row.dataset.kind = item.kind;
    setText(refs.name, agent.name);
    setText(refs.kind, text.kinds[item.kind]);
    setText(refs.context, `${PROVIDER_NAME[providerOf(agent)]} · ${room?.name || agent.roomId}`);
    refs.context.title = room?.path || agent.roomId;
    setText(refs.session, agent.title || agent.role);
    setText(refs.reason, item.reason);
    const detail = item.detail && item.detail !== item.reason ? item.detail : '';
    setText(refs.detail, detail);
    setHidden(refs.detail, !detail);
    setText(refs.age, age);
    setText(refs.deadline, item.expiresAt ? `${text.expires} ${formatDuration(Math.max(0, item.expiresAt - now))}` : '');
    setHidden(refs.deadline, !item.expiresAt);
    const queued = agent.permission?.queued ?? 0;
    setText(refs.queued, queued > 0 ? `${queued} ${text.queued}` : '');
    setHidden(refs.queued, queued <= 0);
    setText(refs.action, text.focus);
    refs.action.setAttribute('aria-label', `${text.focus}: ${agent.name} · ${room?.name || agent.roomId}`);
  }

  private focusAgent(id: string): void {
    const agent = this.ctx.agent(id);
    if (!agent) { this.renderContent(); return; }
    this.close();
    this.ctx.select({ type: 'agent', id }, { focus: true });
    this.ctx.announce(`${copy().selected}: ${agent.name}`);
  }
}
