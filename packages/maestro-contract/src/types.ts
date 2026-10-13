export type MaestroPhase =
  | 'triage'
  | 'planning'
  | 'research'
  | 'design'
  | 'execution'
  | 'verification'
  | 'handoff';

export type AgentWorkState =
  | 'idle'
  | 'thinking'
  | 'working'
  | 'waiting_approval'
  | 'done'
  | 'error';

export interface MaestroDecision {
  readonly taskId: string;
  readonly intent: string;
  readonly phase: MaestroPhase;
  readonly selectedSkill: string;
  readonly rationale: string;
  readonly budgetTokens: number;
  readonly state: AgentWorkState;
  readonly timestamp: string;
}

export interface MaestroHandoff {
  readonly taskId: string;
  readonly summary: string;
  readonly completedDeliverables: readonly string[];
  readonly verifiedEvidence: readonly string[];
  readonly openRisks: readonly string[];
  readonly nextAction: string;
  readonly generatedAt: string;
}

export interface SkillDefinition {
  readonly name: string;
  readonly description: string;
  readonly triggers: readonly string[];
  readonly officeRole: string;
  readonly officeRoom: string;
}
