import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { RpcProxyGate, type RpcCall } from '../dist/index.js';

describe('RpcProxyGate', () => {
  it('should allow whitelisted methods', async () => {
    const call: RpcCall = {
      id: 'c1',
      method: 'workspace.read',
      params: { path: 'package.json' },
    };

    const response = await RpcProxyGate.execute(call, async () => ({ content: '{}' }));
    assert.equal(response.id, 'c1');
    assert.deepEqual(response.result, { content: '{}' });
    assert.equal(response.error, undefined);
  });

  it('should reject unlisted methods with error 403', async () => {
    const call: RpcCall = {
      id: 'c2',
      method: 'unauthorized.eval',
      params: { code: 'process.exit(1)' },
    };

    const response = await RpcProxyGate.execute(call, async () => ({ ok: true }));
    assert.equal(response.id, 'c2');
    assert.equal(response.error?.code, 403);
    assert.ok(response.error?.message.includes('não está na allowlist'));
  });

  it('should block dangerous bash commands like rm -rf', async () => {
    const call: RpcCall = {
      id: 'c3',
      method: 'tools.call',
      params: {
        tool: 'bash',
        command: 'rm -rf /workspace',
      },
    };

    const response = await RpcProxyGate.execute(call, async () => ({ ok: true }));
    assert.equal(response.id, 'c3');
    assert.equal(response.error?.code, 403);
    assert.ok(response.error?.message.includes('bloqueado por violar política de segurança'));
  });
});
