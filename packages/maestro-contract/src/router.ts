import type { MaestroDecision, MaestroPhase, SkillDefinition } from './types.js';

export const REPLICA_SKILLS: readonly SkillDefinition[] = [
  {
    name: 'replica-entrepreneur',
    description: 'Pesquisa de mercado, sentiment mining e extração de dores de usuários.',
    triggers: ['mercado', 'pesquisa', 'concorrente', 'reviews', 'dores', 'clone market'],
    officeRole: 'Especialista em Produto & Mercado',
    officeRoom: 'Sala de Estratégia',
  },
  {
    name: 'replica-brand',
    description: 'Estratégia de marca, naming, voz e diretrizes de design.',
    triggers: ['marca', 'brand', 'naming', 'tom de voz', 'identidade'],
    officeRole: 'Estrategista de Marca',
    officeRoom: 'Estúdio Criativo',
  },
  {
    name: 'replica-design',
    description: 'Engenharia reversa de design system, extração de tokens e specs de componentes.',
    triggers: ['design', 'tokens', 'cores', 'layout', 'ui design', 'figma', 'estilos', 'componentes'],
    officeRole: 'Designer UI/UX',
    officeRoom: 'Estúdio Criativo',
  },
  {
    name: 'replica-build',
    description: 'Arquitetura, scaffolding e codificação da aplicação.',
    triggers: ['construir', 'build', 'codificar', 'programar', 'implementar', 'backend', 'frontend'],
    officeRole: 'Engenheiro Fullstack Lead',
    officeRoom: 'Baia de Engenharia',
  },
  {
    name: 'replica-test',
    description: 'QA automatizado, reprodução de bugs e testes ponta a ponta.',
    triggers: ['testar', 'teste', 'qa', 'validar', 'bugs', 'cobertura'],
    officeRole: 'Engenheiro de QA',
    officeRoom: 'Laboratório de Testes',
  },
  {
    name: 'replica-fix',
    description: 'Correção sistemática de falhas e refatoração de código com queixas.',
    triggers: ['corrigir', 'fix', 'refatorar', 'melhorar', 'consertar'],
    officeRole: 'Especialista em Resolução',
    officeRoom: 'Baia de Engenharia',
  },
  {
    name: 'replica-deploy',
    description: 'Preflight gate, configuração de infraestrutura, envs e deploy.',
    triggers: ['deploy', 'publicar', 'subir', 'producao', 'release', 'infra'],
    officeRole: 'Engenheiro de DevOps',
    officeRoom: 'Sala de Operações',
  },
];

export class MaestroRouter {
  public static route(intent: string, taskId: string = `task-${Date.now()}`): MaestroDecision {
    const normalized = intent.toLowerCase();

    // 1. Planning match first when explicit plan keywords are present
    if (normalized.includes('plano') || normalized.includes('plan') || normalized.includes('arquitetura')) {
      return {
        taskId,
        intent,
        phase: 'planning',
        selectedSkill: 'ralplan',
        rationale: 'Tarefa de escopo abrangente ou estrutural; requer deliberação RALPLAN-DR.',
        budgetTokens: 30_000,
        state: 'thinking',
        timestamp: new Date().toISOString(),
      };
    }

    // 2. Replica Skills match
    for (const skill of REPLICA_SKILLS) {
      const matched = skill.triggers.some((trigger) => {
        const regex = new RegExp(`(^|\\s|[.,!?;])${trigger}($|\\s|[.,!?;])`, 'i');
        return regex.test(normalized);
      });
      if (matched) {
        let phase: MaestroPhase = 'execution';
        if (skill.name.includes('entrepreneur')) phase = 'research';
        else if (skill.name.includes('design') || skill.name.includes('brand')) phase = 'design';
        else if (skill.name.includes('test')) phase = 'verification';
        else if (skill.name.includes('deploy')) phase = 'handoff';

        return {
          taskId,
          intent,
          phase,
          selectedSkill: skill.name,
          rationale: `Intenção mapeada para a skill especialista ${skill.name} na ${skill.officeRoom}.`,
          budgetTokens: 50_000,
          state: 'working',
          timestamp: new Date().toISOString(),
        };
      }
    }

    // 3. Fallback: Autopilot / Ralph
    return {
      taskId,
      intent,
      phase: 'execution',
      selectedSkill: 'ralph',
      rationale: 'Execução iterativa padrão com verificação pelo Orquestrador Maestro.',
      budgetTokens: 40_000,
      state: 'working',
      timestamp: new Date().toISOString(),
    };
  }
}
