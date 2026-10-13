import type {
  OfficeAgentEvent,
  OfficeSubagentEvent,
  OfficeApprovalEvent,
  OfficeApprovalResolution,
} from './types.js';

export interface OutboxMessage {
  readonly id: string;
  readonly agentId: string;
  readonly status: 'queued' | 'sent' | 'delivered' | 'failed';
  readonly createdAt: string;
  readonly updatedAt: string;
}

export class HabblaudBridgeClient {
  private activeApprovals: Map<string, OfficeApprovalEvent> = new Map();
  private approvalCallbacks: Map<string, (res: OfficeApprovalResolution) => void> = new Map();

  constructor(private readonly baseUrl = 'http://127.0.0.1:4747') {}

  private async postJson(endpoint: string, payload: unknown): Promise<{ ok: boolean; data?: unknown }> {
    try {
      const res = await fetch(`${this.baseUrl}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        return { ok: false };
      }
      const data = await res.json().catch(() => ({}));
      return { ok: true, data };
    } catch {
      // Falha silenciosa de transporte se o servidor web estiver offline
      return { ok: false };
    }
  }

  public async notifyAgentStatus(event: OfficeAgentEvent): Promise<boolean> {
    const res = await this.postJson('/api/aioffice/agent/status', event);
    return res.ok;
  }

  public async spawnSubagent(event: OfficeSubagentEvent): Promise<boolean> {
    const res = await this.postJson('/api/aioffice/subagent/spawn', event);
    return res.ok;
  }

  public async requestOfficeApproval(
    event: OfficeApprovalEvent,
    callback?: (res: OfficeApprovalResolution) => void,
  ): Promise<boolean> {
    this.activeApprovals.set(event.id, event);
    if (callback) {
      this.approvalCallbacks.set(event.id, callback);
    }
    const res = await this.postJson('/api/aioffice/approval/request', event);
    return res.ok;
  }

  public resolveApprovalLocally(resolution: OfficeApprovalResolution): void {
    const cb = this.approvalCallbacks.get(resolution.id);
    if (cb) {
      cb(resolution);
      this.approvalCallbacks.delete(resolution.id);
      this.activeApprovals.delete(resolution.id);
    }
  }

  public getPendingApprovalCount(): number {
    return this.activeApprovals.size;
  }

  public async sendMessage(agentId: string, text: string): Promise<{ ok: boolean; message?: OutboxMessage }> {
    const res = await this.postJson('/api/messages', { agentId, text });
    if (!res.ok) {
      return { ok: false };
    }
    const data = res.data as OutboxMessage | undefined;
    return { ok: true, message: data };
  }
}
