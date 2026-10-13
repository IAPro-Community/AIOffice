export type OfficeAgentStatus = 'working' | 'waiting' | 'idle' | 'shell' | 'done' | 'offline';

export interface OfficeAgentEvent {
  readonly agentId: string;
  readonly name: string;
  readonly role: string;
  readonly project: string;
  readonly status: OfficeAgentStatus;
  readonly taskDescription?: string;
  readonly currentTool?: string;
}

export interface OfficeSubagentEvent {
  readonly parentId: string;
  readonly subagentId: string;
  readonly name: string;
  readonly task: string;
  readonly status: 'arriving' | 'working' | 'done';
}

export interface OfficeApprovalEvent {
  readonly id: string;
  readonly agentId: string;
  readonly action: string;
  readonly target: string;
  readonly diffPreview?: string;
  readonly rationale: string;
}

export interface OfficeApprovalResolution {
  readonly id: string;
  readonly approved: boolean;
  readonly reason?: string;
}
