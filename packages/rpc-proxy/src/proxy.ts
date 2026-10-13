import type { RpcCall, RpcResponse, ProxyFilterResult } from './types.js';

const ALLOWED_RPC_METHODS: Record<string, true> = {
  'session.init': true,
  'session.status': true,
  'tools.list': true,
  'tools.call': true,
  'workspace.read': true,
  'workspace.glob': true,
  'workspace.grep': true,
  'agent.yield': true,
};

const DISALLOWED_COMMAND_PATTERNS: readonly RegExp[] = [
  /\brm\s+-rf\b/i,
  /\bformat\s+[a-z]:/i,
  /\bdel\s+\/f\s+\/s\s+\/q\b/i,
  /\bdrop\s+database\b/i,
  /\bshutdown\b/i,
];

export class RpcProxyGate {
  public static evaluate(call: RpcCall): ProxyFilterResult {
    // 1. Validar método contra allowlist
    if (!ALLOWED_RPC_METHODS[call.method]) {
      return {
        allowed: false,
        reason: `RPC Gate B1: Método '${call.method}' não está na allowlist permitida.`,
      };
    }

    // 2. Se for tools.call com bash, verificar padrões perigosos
    if (call.method === 'tools.call') {
      const toolName = String(call.params['tool'] ?? '');
      if (toolName === 'bash') {
        const command = String(call.params['command'] ?? '');
        for (const pattern of DISALLOWED_COMMAND_PATTERNS) {
          if (pattern.test(command)) {
            return {
              allowed: false,
              reason: `RPC Gate B1: Comando bloqueado por violar política de segurança: '${command}'.`,
            };
          }
        }
      }
    }

    return { allowed: true };
  }

  public static async execute<T>(
    call: RpcCall,
    handler: (call: RpcCall) => Promise<T>,
  ): Promise<RpcResponse<T>> {
    const verdict = this.evaluate(call);
    if (!verdict.allowed) {
      return {
        id: call.id,
        error: {
          code: 403,
          message: verdict.reason ?? 'Acesso negado pelo RPC Proxy',
        },
      };
    }

    try {
      const result = await handler(call);
      return { id: call.id, result };
    } catch (err) {
      return {
        id: call.id,
        error: {
          code: 500,
          message: err instanceof Error ? err.message : String(err),
        },
      };
    }
  }
}
