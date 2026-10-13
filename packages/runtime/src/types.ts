export interface ToolCallPayload {
  readonly tool: string;
  readonly args: Record<string, unknown>;
  readonly intent?: string;
}

export interface ToolResult {
  readonly success: boolean;
  readonly output: string;
  readonly error?: string;
}

export interface SubagentTaskSpec {
  readonly name: string;
  readonly task: string;
  readonly solutionSpace: string;
  readonly tools?: readonly string[];
}

export interface HashlinePatchOp {
  readonly type: 'PUT' | 'CUT';
  readonly startLine: number;
  readonly endLine?: number;
  readonly body?: readonly string[];
}
