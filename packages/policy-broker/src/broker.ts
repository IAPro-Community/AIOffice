import type {
  PendingApproval,
  ActionType,
  BrokerEventListener,
  EffectExecutor,
} from './types.js';

export class PolicyBroker {
  private approvals: Map<string, PendingApproval> = new Map();
  private listeners: Set<BrokerEventListener> = new Set();
  private counter = 0;

  constructor(private readonly executor?: EffectExecutor) {}

  public onApprovalChange(listener: BrokerEventListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(approval: PendingApproval): void {
    for (const listener of this.listeners) {
      listener(approval);
    }
  }

  public requestAction(params: {
    action: ActionType;
    target: string;
    content?: string;
    diffPreview?: string;
    rationale: string;
  }): PendingApproval {
    this.counter += 1;
    const id = `appr-${Date.now()}-${this.counter}`;
    const approval: PendingApproval = {
      id,
      action: params.action,
      target: params.target,
      content: params.content,
      diffPreview: params.diffPreview,
      rationale: params.rationale,
      state: 'pending',
      createdAt: new Date().toISOString(),
    };

    this.approvals.set(id, approval);
    this.notify(approval);
    return approval;
  }

  public async approve(id: string): Promise<PendingApproval> {
    const existing = this.approvals.get(id);
    if (!existing) {
      throw new Error(`Aprovação não encontrada para id: ${id}`);
    }
    if (existing.state !== 'pending') {
      throw new Error(`Aprovação já resolvida: estado atual é ${existing.state}`);
    }

    const resolved: PendingApproval = {
      ...existing,
      state: 'approved',
      resolvedAt: new Date().toISOString(),
    };
    this.approvals.set(id, resolved);

    // Efeito real se o executor foi fornecido
    if (this.executor) {
      if (resolved.action === 'write' && resolved.content !== undefined) {
        await this.executor.executeWrite(resolved.target, resolved.content);
      } else if (resolved.action === 'edit' && resolved.content !== undefined) {
        await this.executor.executeEdit(resolved.target, resolved.content);
      } else if (resolved.action === 'bash') {
        await this.executor.executeBash(resolved.target);
      }
    }

    this.notify(resolved);
    return resolved;
  }

  public reject(id: string, reason = 'Rejeitado pelo usuário'): PendingApproval {
    const existing = this.approvals.get(id);
    if (!existing) {
      throw new Error(`Aprovação não encontrada para id: ${id}`);
    }
    if (existing.state !== 'pending') {
      throw new Error(`Aprovação já resolvida: estado atual é ${existing.state}`);
    }

    const resolved: PendingApproval = {
      ...existing,
      state: 'rejected',
      rejectionReason: reason,
      resolvedAt: new Date().toISOString(),
    };
    this.approvals.set(id, resolved);
    this.notify(resolved);
    return resolved;
  }

  public getPending(): readonly PendingApproval[] {
    return Array.from(this.approvals.values()).filter((a) => a.state === 'pending');
  }

  public getById(id: string): PendingApproval | undefined {
    return this.approvals.get(id);
  }
}
