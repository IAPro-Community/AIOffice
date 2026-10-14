// Biblioteca local de prompts: editar e copiar não inicia sessões nem envia mensagens.
import type { UiContext } from './context';
import { h, iconButton, setAttr } from './dom';
import { ICONS } from './icons';
import { tr } from '../../../shared/i18n';
import './workflow-templates.css';

export type WorkflowTemplateId = 'investigate' | 'feature' | 'review' | 'test-fix' | 'release' | 'research';

export interface WorkflowTemplate {
  readonly id: WorkflowTemplateId;
  readonly title: string;
  readonly description: string;
  readonly taskHint: string;
  readonly steps: readonly string[];
  readonly deliverable: string;
}

/** Prompts em português; os rótulos seguem o fallback de tradução da interface. */
export const WORKFLOW_TEMPLATES: readonly WorkflowTemplate[] = [
  {
    id: 'investigate',
    title: tr('Investigar um bug'),
    description: tr('Reproduzir o problema, encontrar a causa e propor a correção.'),
    taskHint: tr('Ex.: o painel não atualiza após reconectar.'),
    steps: [
      'Leia as instruções do projeto e identifique o fluxo afetado.',
      'Reproduza o problema usando os passos e as evidências disponíveis. Registre o comportamento esperado e o observado.',
      'Rastreie a causa raiz, distinguindo fatos, hipóteses e informações ainda ausentes.',
      'Proponha a menor correção que resolva a causa. Implemente apenas se a tarefa autorizar a correção.',
      'Valide o comportamento afetado e explique qualquer limitação de reprodução ou verificação.',
    ],
    deliverable: 'Causa raiz com evidências, arquivos envolvidos, correção proposta ou aplicada e resultado da verificação.',
  },
  {
    id: 'feature',
    title: tr('Implementar uma funcionalidade'),
    description: tr('Definir critérios de aceite e entregar uma mudança focada.'),
    taskHint: tr('Ex.: adicionar um filtro por provedor à busca.'),
    steps: [
      'Leia as instruções e a documentação do projeto. Inspecione padrões existentes antes de criar abstrações.',
      'Transforme o pedido em critérios de aceite claros e identifique dependências e estados de erro.',
      'Apresente um plano curto e implemente a menor mudança que atenda aos critérios.',
      'Preserve o sistema visual, a acessibilidade e o comportamento responsivo quando houver interface.',
      'Execute as verificações relevantes disponíveis e confira cada critério de aceite.',
    ],
    deliverable: 'Funcionalidade implementada, arquivos alterados, critérios atendidos, verificações e limitações.',
  },
  {
    id: 'review',
    title: tr('Revisar código'),
    description: tr('Priorizar bugs, regressões e riscos com evidências.'),
    taskHint: tr('Ex.: revisar o diff da integração de mensagens.'),
    steps: [
      'Identifique o diff, os arquivos ou a referência indicados na tarefa e leia as instruções do projeto.',
      'Inspecione o comportamento alterado e seus chamadores, com foco em bugs, regressões, segurança e perda de dados.',
      'Confirme cada achado com evidências do código, indicando arquivo e linha e um cenário concreto de falha.',
      'Classifique os achados por prioridade e proponha uma correção objetiva. Evite sugestões apenas de preferência pessoal.',
      'Não altere arquivos durante a revisão. Se não houver achados, diga isso e explicite a cobertura e os riscos restantes.',
    ],
    deliverable: 'Achados priorizados com localização, impacto, evidência e sugestão; cobertura e riscos restantes.',
  },
  {
    id: 'test-fix',
    title: tr('Testar e corrigir'),
    description: tr('Validar um fluxo e corrigir falhas reproduzidas.'),
    taskHint: tr('Ex.: validar reconexão e recuperação de mensagens.'),
    steps: [
      'Leia as instruções do projeto, descubra os comandos existentes e defina os fluxos críticos da tarefa.',
      'Execute uma verificação inicial e registre falhas com passos de reprodução e evidências.',
      'Investigue a causa de cada falha reproduzida e aplique correções pequenas, preservando alterações de outras pessoas.',
      'Adicione cobertura de regressão apenas quando ela proteger comportamento relevante e não repetir a implementação.',
      'Repita as verificações afetadas. Para interface, confira estados de erro, acessibilidade e tamanhos de tela relevantes.',
    ],
    deliverable: 'Cenários verificados, falhas encontradas, correções aplicadas, resultados e pendências.',
  },
  {
    id: 'release',
    title: tr('Preparar uma release'),
    description: tr('Reunir evidências, notas e um plano de publicação.'),
    taskHint: tr('Ex.: preparar a próxima versão com a nova biblioteca.'),
    steps: [
      'Leia as instruções e o processo de release do projeto. Identifique o escopo e as mudanças incluídas.',
      'Execute build, lint, typecheck e verificações relevantes quando os comandos estiverem disponíveis.',
      'Prepare notas de versão claras, incluindo mudanças de comportamento, migrações e incompatibilidades.',
      'Documente pré-requisitos, passos de publicação, verificação após publicação e plano de rollback.',
      'Entregue a preparação para revisão humana. Não crie commits, tags, pushes, deploys nem publique a release automaticamente.',
    ],
    deliverable: 'Notas de versão, evidências de validação, pendências e plano de publicação e rollback.',
  },
  {
    id: 'research',
    title: tr('Pesquisar uma solução'),
    description: tr('Comparar alternativas e recomendar com fontes.'),
    taskHint: tr('Ex.: comparar opções de captura de sessões locais.'),
    steps: [
      'Defina a pergunta, os critérios de comparação e as restrições a partir da tarefa e do contexto.',
      'Pesquise fontes primárias e atuais quando a informação puder ter mudado. Registre links e datas.',
      'Compare alternativas por capacidade, custo, compatibilidade, manutenção e limitações relevantes.',
      'Separe fatos confirmados de inferências e explicite lacunas de informação.',
      'Recomende uma opção com justificativa e um próximo passo verificável, sem instalar ou ativar serviços.',
    ],
    deliverable: 'Comparação das alternativas, fontes, recomendação fundamentada, incertezas e próximo passo.',
  },
];

export interface WorkflowDraft {
  readonly task: string;
  readonly context: string;
}

/** Texto completo para revisar e colar manualmente no agente escolhido. */
export function buildWorkflowPrompt(template: WorkflowTemplate, draft: WorkflowDraft): string {
  return [
    `Workflow: ${template.title}`,
    '',
    'Tarefa',
    draft.task.trim() || '[Descreva a tarefa antes de copiar.]',
    '',
    'Contexto e restrições',
    draft.context.trim() || 'Nenhum contexto adicional informado. Use as instruções e os padrões do projeto.',
    '',
    'Etapas',
    ...template.steps.map((step, index) => `${index + 1}. ${step}`),
    '',
    'Regras de trabalho',
    '- Siga as instruções do projeto e preserve alterações existentes de outras pessoas.',
    '- Trabalhe apenas no escopo da tarefa. Peça esclarecimentos quando faltar uma decisão indispensável.',
    '- Não exponha segredos nem inclua credenciais em arquivos, logs ou respostas.',
    '- Não crie commits, pushes, publicações nem ações externas sem autorização explícita.',
    '- Relate apenas ações e verificações que realmente executou; explique bloqueios e limitações.',
    '',
    'Entrega esperada',
    template.deliverable,
  ].join('\n');
}

let nextDialogId = 0;

/** O chamador monta .el em ctx.root. Os rascunhos duram apenas enquanto esta instância existir. */
export class WorkflowTemplates {
  readonly el: HTMLDialogElement;
  private readonly task: HTMLTextAreaElement;
  private readonly context: HTMLTextAreaElement;
  private readonly preview: HTMLTextAreaElement;
  private readonly copyButton: HTMLButtonElement;
  private readonly feedback: HTMLElement;
  private readonly heading: HTMLElement;
  private readonly description: HTMLElement;
  private readonly choices = new Map<WorkflowTemplateId, HTMLButtonElement>();
  private readonly drafts = new Map<WorkflowTemplateId, WorkflowDraft>();
  private selected = WORKFLOW_TEMPLATES[0];
  private opener: HTMLElement | null = null;
  private revision = 0;
  private copying = false;
  private disposed = false;

  constructor(private readonly ctx: Pick<UiContext, 'root'>) {
    const id = `ui-workflows-${++nextDialogId}`;
    const input = (field: string, rows: number): HTMLTextAreaElement => h('textarea', {
      class: 'ui-workflows__input',
      attrs: { id: `${id}-${field}`, rows, spellcheck: 'true' },
      on: { input: () => this.updateDraft() },
    });
    this.task = input('task', 3);
    this.context = input('context', 4);
    this.context.placeholder = tr('Projeto, arquivos, passos para reproduzir, critérios de aceite e limites. Não inclua credenciais.');
    this.heading = h('h3', { class: 'ui-workflows__editor-title', attrs: { id: `${id}-selected` } });
    this.description = h('p', { class: 'ui-workflows__muted' });
    this.preview = h('textarea', {
      class: 'ui-workflows__preview',
      attrs: { id: `${id}-preview`, readonly: true, rows: 11, spellcheck: 'false' },
    });
    this.feedback = h('p', {
      class: 'ui-workflows__feedback',
      role: 'status',
      attrs: { 'aria-live': 'polite', 'aria-atomic': 'true' },
    });
    this.copyButton = h('button', {
      class: 'ui-btn ui-btn--primary ui-workflows__copy',
      type: 'button',
      text: tr('Copiar prompt completo'),
      on: { click: () => void this.copy() },
    });
    const cards = WORKFLOW_TEMPLATES.map((template, index) => {
      const button = h('button', {
        class: 'ui-workflows__card',
        type: 'button',
        attrs: { 'aria-pressed': 'false', 'aria-controls': `${id}-editor` },
        on: { click: () => this.select(template, true) },
      },
      h('span', { class: 'ui-workflows__number', text: String(index + 1).padStart(2, '0'), attrs: { 'aria-hidden': 'true' } }),
      h('span', { class: 'ui-workflows__card-text' },
        h('strong', { text: template.title }),
        h('span', { class: 'ui-workflows__muted', text: template.description }),
      ));
      this.choices.set(template.id, button);
      return button;
    });
    const close = iconButton(ICONS.close, tr('Fechar biblioteca de workflows'), () => this.close());
    this.el = h('dialog', {
      class: 'ui-dialog ui-workflows',
      attrs: { 'aria-labelledby': `${id}-title`, 'aria-describedby': `${id}-intro`, 'aria-modal': 'true' },
      on: {
        cancel: (event) => { event.preventDefault(); event.stopPropagation(); this.close(); },
        close: () => { if (!this.el.open) this.restoreFocus(); },
        keydown: (event) => event.stopPropagation(),
        click: (event) => {
          if (event.target !== this.el) return;
          const bounds = this.el.getBoundingClientRect();
          if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) this.close();
        },
      },
    },
    h('header', { class: 'ui-dialog__head' }, h('h2', { text: tr('Biblioteca de workflows'), attrs: { id: `${id}-title` } }), close),
    h('div', { class: 'ui-workflows__body' },
      h('p', { class: 'ui-workflows__intro', attrs: { id: `${id}-intro` }, text: tr('Escolha um modelo, descreva a tarefa e copie o prompt. Depois, revise e cole no agente escolhido. Nada é enviado automaticamente.') }),
      h('div', { class: 'ui-workflows__layout' },
        h('div', { class: 'ui-workflows__library', role: 'group', attrs: { 'aria-label': tr('Modelos disponíveis') } }, ...cards),
        h('section', { class: 'ui-workflows__editor', attrs: { id: `${id}-editor`, 'aria-labelledby': `${id}-selected` } },
          this.heading, this.description,
          h('div', { class: 'ui-workflows__field' }, h('label', { text: tr('Tarefa'), attrs: { for: `${id}-task` } }), this.task,
            h('span', { class: 'ui-workflows__muted', text: tr('Descreva a tarefa para habilitar a cópia.') })),
          h('div', { class: 'ui-workflows__field' }, h('label', { text: tr('Contexto e restrições (opcional)'), attrs: { for: `${id}-context` } }), this.context),
          h('div', { class: 'ui-workflows__field' }, h('label', { text: tr('Prompt completo para revisar'), attrs: { for: `${id}-preview` } }), this.preview),
          h('div', { class: 'ui-workflows__actions' }, this.copyButton),
          this.feedback,
        ),
      ),
    ));
    this.select(this.selected);
  }

  get isOpen(): boolean { return this.el.open; }

  open(opener?: HTMLElement): void {
    if (this.disposed || this.isOpen) return;
    if (!this.el.isConnected) this.ctx.root.append(this.el);
    this.opener = opener ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    this.feedback.textContent = '';
    this.el.showModal();
    this.choices.get(this.selected.id)?.focus();
  }

  close(): void {
    if (!this.isOpen) return;
    this.revision++;
    this.refreshPrompt();
    this.el.close();
    this.restoreFocus();
  }

  toggle(opener?: HTMLElement): void { if (this.isOpen) this.close(); else this.open(opener); }

  /** Sem dados do servidor: a atualização é dirigida pelos eventos dos campos. */
  render(): void {}

  dispose(): void { this.close(); this.disposed = true; this.revision++; this.el.remove(); }

  private restoreFocus(): void {
    const opener = this.opener;
    this.opener = null;
    if (opener?.isConnected) opener.focus();
  }

  private select(template: WorkflowTemplate, focusTask = false): void {
    this.selected = template;
    const draft = this.drafts.get(template.id) ?? { task: '', context: '' };
    this.task.value = draft.task;
    this.context.value = draft.context;
    this.task.placeholder = template.taskHint;
    this.heading.textContent = template.title;
    this.description.textContent = template.description;
    for (const [id, button] of this.choices) button.setAttribute('aria-pressed', String(id === template.id));
    this.updateDraft();
    if (focusTask) this.task.focus();
  }

  private updateDraft(): void {
    this.revision++;
    this.drafts.set(this.selected.id, { task: this.task.value, context: this.context.value });
    this.feedback.textContent = '';
    setAttr(this.feedback, 'data-state', '');
    this.refreshPrompt();
  }

  private refreshPrompt(): void {
    const prompt = buildWorkflowPrompt(this.selected, { task: this.task.value, context: this.context.value });
    // Preserva a seleção para a cópia manual quando a API do clipboard falha.
    if (this.preview.value !== prompt) this.preview.value = prompt;
    this.copyButton.disabled = this.copying || !this.task.value.trim();
    this.copyButton.textContent = this.copying ? tr('Copiando…') : tr('Copiar prompt completo');
  }

  private async copy(): Promise<void> {
    if (!this.task.value.trim() || this.copying) return;
    const revision = this.revision;
    const prompt = this.preview.value;
    this.copying = true;
    this.feedback.textContent = '';
    this.refreshPrompt();
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(prompt);
      if (this.revision !== revision || !this.isOpen || this.disposed) return;
      setAttr(this.feedback, 'data-state', 'success');
      this.feedback.textContent = tr('Prompt copiado. Revise e cole no agente escolhido.');
    } catch {
      if (this.revision !== revision || !this.isOpen || this.disposed) return;
      setAttr(this.feedback, 'data-state', 'error');
      this.feedback.textContent = tr('Não foi possível copiar. O prompt está selecionado: use Ctrl+C ou ⌘C para copiar manualmente.');
      this.preview.focus();
      this.preview.select();
    } finally {
      this.copying = false;
      if (!this.disposed) this.refreshPrompt();
    }
  }
}
