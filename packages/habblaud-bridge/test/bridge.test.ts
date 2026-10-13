import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { HabblaudBridgeClient } from '../dist/index.js';

describe('HabblaudBridgeClient', () => {
  it('should handle offline server gracefully without throwing errors', async () => {
    // Porta que não está ouvindo
    const client = new HabblaudBridgeClient('http://127.0.0.1:59999');

    const okStatus = await client.notifyAgentStatus({
      agentId: 'ag-1',
      name: 'Isabela',
      role: 'Designer UI/UX',
      project: 'AIOfficeBeta',
      status: 'working',
    });
    assert.equal(okStatus, false);

    const okSub = await client.spawnSubagent({
      parentId: 'ag-1',
      subagentId: 'sub-1',
      name: 'Auxiliar QA',
      task: 'Executar testes de regressão',
      status: 'arriving',
    });
    assert.equal(okSub, false);
  });

  it('should register and resolve approvals correctly', async () => {
    const client = new HabblaudBridgeClient('http://127.0.0.1:59999');
    let resolvedApproved = false;

    await client.requestOfficeApproval(
      {
        id: 'appr-100',
        agentId: 'ag-1',
        action: 'write',
        target: 'src/index.ts',
        rationale: 'Criar componente Button',
      },
      (res) => {
        resolvedApproved = res.approved;
      },
    );

    assert.equal(client.getPendingApprovalCount(), 1);

    client.resolveApprovalLocally({
      id: 'appr-100',
      approved: true,
    });

    assert.equal(resolvedApproved, true);
    assert.equal(client.getPendingApprovalCount(), 0);
  });
});
