import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { PolicyBroker, type EffectExecutor, type PendingApproval } from '../dist/index.js';

describe('PolicyBroker', () => {
  it('should intercept write requests and place them in pending queue', () => {
    const broker = new PolicyBroker();
    const approval = broker.requestAction({
      action: 'write',
      target: 'src/app.ts',
      content: 'console.log("hello");',
      diffPreview: '+ console.log("hello");',
      rationale: 'Criar ponto de entrada da aplicação',
    });

    assert.equal(approval.state, 'pending');
    assert.equal(approval.target, 'src/app.ts');
    assert.equal(broker.getPending().length, 1);
  });

  it('should notify subscribers and execute effect upon approval', async () => {
    let executedPath = '';
    let executedContent = '';
    const mockExecutor: EffectExecutor = {
      async executeWrite(path: string, content: string): Promise<void> {
        executedPath = path;
        executedContent = content;
      },
      async executeEdit(): Promise<void> {},
      async executeBash(): Promise<{ stdout: string; exitCode: number }> {
        return { stdout: '', exitCode: 0 };
      },
    };

    const broker = new PolicyBroker(mockExecutor);
    const events: PendingApproval[] = [];
    broker.onApprovalChange((appr) => {
      events.push(appr);
    });

    const appr = broker.requestAction({
      action: 'write',
      target: 'config.json',
      content: '{"port": 8080}',
      rationale: 'Salvar configuração',
    });

    assert.equal(events.length, 1);
    assert.equal(events[0]?.state, 'pending');

    const resolved = await broker.approve(appr.id);
    assert.equal(resolved.state, 'approved');
    assert.equal(executedPath, 'config.json');
    assert.equal(executedContent, '{"port": 8080}');
    assert.equal(broker.getPending().length, 0);
    assert.equal(events.length, 2);
  });

  it('should properly reject action with custom reason', () => {
    const broker = new PolicyBroker();
    const appr = broker.requestAction({
      action: 'bash',
      target: 'rm -rf /',
      rationale: 'Comando destrutivo',
    });

    const rejected = broker.reject(appr.id, 'Comando inseguro detectado pelo usuário');
    assert.equal(rejected.state, 'rejected');
    assert.equal(rejected.rejectionReason, 'Comando inseguro detectado pelo usuário');
    assert.equal(broker.getPending().length, 0);
  });
});
