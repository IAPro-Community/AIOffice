import type { MaestroHandoff } from './types.js';

export class HandoffBuilder {
  private completed: string[] = [];
  private verified: string[] = [];
  private risks: string[] = [];
  private nextAction = 'Continuar execução das tarefas pendentes.';

  constructor(
    private readonly taskId: string,
    private readonly summary: string,
  ) {}

  public addCompleted(item: string): this {
    this.completed.push(item);
    return this;
  }

  public addVerified(evidence: string): this {
    this.verified.push(evidence);
    return this;
  }

  public addRisk(risk: string): this {
    this.risks.push(risk);
    return this;
  }

  public setNextAction(action: string): this {
    this.nextAction = action;
    return this;
  }

  public build(): MaestroHandoff {
    return {
      taskId: this.taskId,
      summary: this.summary,
      completedDeliverables: [...this.completed],
      verifiedEvidence: [...this.verified],
      openRisks: [...this.risks],
      nextAction: this.nextAction,
      generatedAt: new Date().toISOString(),
    };
  }

  public toMarkdown(): string {
    const handoff = this.build();
    return [
      `# HANDOFF — ${handoff.taskId}`,
      `**Data:** ${handoff.generatedAt}`,
      `**Resumo:** ${handoff.summary}`,
      '',
      '## Entregáveis Concluídos',
      ...handoff.completedDeliverables.map((d) => `- [x] ${d}`),
      '',
      '## Evidências Verificadas',
      ...handoff.verifiedEvidence.map((e) => `- ${e}`),
      '',
      '## Riscos Abertos',
      ...handoff.openRisks.map((r) => `- ⚠️ ${r}`),
      '',
      `## Próxima Ação Segura: ${handoff.nextAction}`,
    ].join('\n');
  }
}
