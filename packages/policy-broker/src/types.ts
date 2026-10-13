export type ActionType = 'write' | 'edit' | 'bash';
export type ApprovalState = 'pending' | 'approved' | 'rejected';

export interface PendingApproval {
  readonly id: string;
  readonly action: ActionType;
  readonly target: string;
  readonly content?: string;
  readonly diffPreview?: string;
  readonly rationale: string;
  readonly state: ApprovalState;
  readonly createdAt: string;
  readonly resolvedAt?: string;
  readonly rejectionReason?: string;
}

export type BrokerEventListener = (approval: PendingApproval) => void;

export interface EffectExecutor {
  executeWrite(path: string, content: string): Promise<void>;
  executeEdit(path: string, patch: string): Promise<void>;
  executeBash(command: string): Promise<{ stdout: string; exitCode: number }>;
}
