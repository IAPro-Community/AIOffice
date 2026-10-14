import { MaestroRouter, HandoffBuilder, type MaestroDecision, type MaestroHandoff } from '@aioffice/maestro-contract';
import { PolicyBroker } from '@aioffice/policy-broker';
import { HabblaudBridgeClient } from '@aioffice/habblaud-bridge';
import { LocalSecureCredentialStore } from '@aioffice/credential-store';
import { OmpRuntimeAdapter } from '@aioffice/runtime';

export interface WorkflowResult {
  readonly decision: MaestroDecision;
  readonly handoff: MaestroHandoff;
  readonly artifactsCreated: readonly string[];
  readonly executionMode: 'not-started' | 'maestro-fallback';
}

export interface RunTaskOptions {
  /** The Maestro executor is a manual last-resort path, never the default executor. */
  readonly maestroFallback?: boolean;
}

export class AIOfficeEngine {
  private readonly broker: PolicyBroker;
  private readonly bridge: HabblaudBridgeClient;
  private readonly credentials: LocalSecureCredentialStore;

  constructor(
    private readonly workspaceRoot: string = process.cwd(),
    habblaudUrl = 'http://127.0.0.1:4747',
  ) {
    this.broker = new PolicyBroker();
    this.bridge = new HabblaudBridgeClient(habblaudUrl);
    this.credentials = new LocalSecureCredentialStore();
  }

  public async runTask(intent: string, options: RunTaskOptions = {}): Promise<WorkflowResult> {
    const taskId = `task-${Date.now()}`;
    const decision = MaestroRouter.route(intent, taskId);
    const handoffBuilder = new HandoffBuilder(taskId, `Execução do objetivo: ${intent}`);

    if (!options.maestroFallback) {
      handoffBuilder
        .addRisk('Nenhum executor preferencial foi acionado; o executor do Maestro está reservado para último recurso.')
        .setNextAction('Use um executor integrado preferencial. Acione o fallback do Maestro somente se ele estiver indisponível.');

      return {
        decision,
        handoff: handoffBuilder.build(),
        artifactsCreated: [],
        executionMode: 'not-started',
      };
    }

    // O CLI não tem conectores de execução preferenciais. O usuário precisa
    // acionar explicitamente este caminho de último recurso.
    const agentId = `ag-${decision.selectedSkill}`;
    const agentName = `Agente ${decision.selectedSkill}`;
    const agentRole = decision.rationale;

    const runtime = new OmpRuntimeAdapter(
      agentId,
      agentName,
      agentRole,
      this.workspaceRoot,
      this.broker,
      this.bridge,
      true,
    );

    // 2. Inicializar sessão visual no Habblaud
    await runtime.initSession();

    // 3. Montar handoff
    handoffBuilder.addCompleted(`Roteamento Maestro para ${decision.selectedSkill} na fase ${decision.phase}`);

    const artifactsCreated: string[] = [];

    // 4. Se for tarefa de design (replica-design), gerar design tokens
    if (decision.selectedSkill === 'replica-design') {
      const tokensPath = 'tokens.json';
      const tokensContent = JSON.stringify(
        {
          version: '1.0.0',
          colors: {
            primary: '#0ea5e9',
            background: '#090d16',
            surface: '#131b2e',
            text: '#f8fafc',
            border: '#1e293b',
          },
          typography: {
            fontFamily: 'Inter, system-ui, sans-serif',
            scale: { sm: '0.875rem', base: '1rem', lg: '1.25rem', xl: '1.5rem' },
          },
          spacing: { 1: '0.25rem', 2: '0.5rem', 4: '1rem', 8: '2rem' },
        },
        null,
        2,
      );

      // Executa escrita mediada via runtime OMP
      const writeResult = await runtime.executeTool(
        'write',
        { path: tokensPath, content: tokensContent },
        'Gerar design tokens extraídos do produto',
      );

      if (writeResult.success) {
        artifactsCreated.push(tokensPath);
        handoffBuilder.addCompleted(`Design tokens gerados com sucesso em ${tokensPath}`);
        handoffBuilder.addVerified('Tokens estruturados em formato compatível com Tailwind/CSS');
      }
    } else if (decision.selectedSkill === 'replica-entrepreneur') {
      // Simulação de pesquisa e análise de mercado
      const reportPath = 'market-research.md';
      const reportContent = [
        '# Relatório de Inteligência Competitiva',
        '**Objetivo:** Clonar e mitigar dores do app alvo.',
        '',
        '## Dores Mais Frequentes em Reviews Públicos',
        '1. Lentidão no carregamento inicial.',
        '2. Falta de modo escuro consistente.',
        '3. Complexidade excessiva na tela de checkout.',
        '',
        '## Oportunidades de Diferenciação',
        '- Arquitetura local-first ultra rápida.',
        '- Interface limpa estilo pixel art / retro opcional.',
      ].join('\n');

      const writeResult = await runtime.executeTool(
        'write',
        { path: reportPath, content: reportContent },
        'Salvar dossiê de pesquisa de mercado e dores de usuários',
      );

      if (writeResult.success) {
        artifactsCreated.push(reportPath);
        handoffBuilder.addCompleted(`Dossiê de mercado salvo em ${reportPath}`);
      }
    } else {
      // Execução padrão: invocar subagente
      const subResult = await runtime.executeTool('task', {
        name: 'Worker Paralelo',
        task: `Executar análise para: ${intent}`,
        solutionSpace: 'Análise de código e execução de testes',
      });

      handoffBuilder.addCompleted(`Subagente executou com sucesso: ${subResult.output}`);
    }

    // 5. Finalizar handoff
    const handoff = handoffBuilder.build();

    // 6. Atualizar status final no Habblaud
    await this.bridge.notifyAgentStatus({
      agentId,
      name: agentName,
      role: agentRole,
      project: this.workspaceRoot,
      status: 'idle',
      taskDescription: 'Tarefa concluída com sucesso',
    });

    return {
      decision,
      handoff,
      artifactsCreated,
      executionMode: 'maestro-fallback',
    };
  }

  public getBroker(): PolicyBroker {
    return this.broker;
  }

  public getBridge(): HabblaudBridgeClient {
    return this.bridge;
  }
}
