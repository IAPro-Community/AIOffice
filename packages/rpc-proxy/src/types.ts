export interface RpcCall {
  readonly id: string;
  readonly method: string;
  readonly params: Record<string, unknown>;
}

export interface RpcResponse<T = unknown> {
  readonly id: string;
  readonly result?: T;
  readonly error?: {
    readonly code: number;
    readonly message: string;
    readonly data?: unknown;
  };
}

export interface ProxyFilterResult {
  readonly allowed: boolean;
  readonly reason?: string;
}
