import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PolicyBroker } from '@aioffice/policy-broker';
import { HabblaudBridgeClient } from '@aioffice/habblaud-bridge';
import { HashlineEngine, OmpRuntimeAdapter } from '../dist/index.js';

describe('RuntimeEngine', () => {
  it('should parse and apply hashline PUT and CUT operations accurately', () => {
    const original = ['line 1', 'line 2', 'line 3', 'line 4'].join('\n');
    const patch = `
PUT 2.=3:
+line 2 modified
+line 2.5 inserted
CUT 4
    `.trim();

    const ops = HashlineEngine.parseOps(patch);
    assert.equal(ops.length, 2);

    const patched = HashlineEngine.apply(original, ops);
    const expected = ['line 1', 'line 2 modified', 'line 2.5 inserted'].join('\n');
    assert.equal(patched, expected);
  });

  it('should execute write tool through policy broker and notify bridge', async () => {
    const tmp = mkdtempSync(join(tmpdir(), 'aioffice-runtime-test-'));
    try {
      const broker = new PolicyBroker();
      const bridge = new HabblaudBridgeClient('http://127.0.0.1:4747');
      const adapter = new OmpRuntimeAdapter(
        'ag-test',
        'Arthur Lead',
        'Engenheiro',
        tmp,
        broker,
        bridge,
      );

      const targetFile = 'hello.txt';
      const result = await adapter.executeTool(
        'write',
        { path: targetFile, content: 'Hello AIOffice!' },
        'Criar arquivo de boas-vindas',
      );

      assert.equal(result.success, true);
      const onDisk = readFileSync(join(tmp, targetFile), 'utf-8');
      assert.equal(onDisk, 'Hello AIOffice!');
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('should block dangerous commands in bash tool', async () => {
    const tmp = mkdtempSync(join(tmpdir(), 'aioffice-runtime-test-'));
    try {
      const broker = new PolicyBroker();
      const bridge = new HabblaudBridgeClient('http://127.0.0.1:4747');
      const adapter = new OmpRuntimeAdapter(
        'ag-test',
        'Arthur Lead',
        'Engenheiro',
        tmp,
        broker,
        bridge,
      );

      const result = await adapter.executeTool('bash', { command: 'rm -rf /workspace' });
      assert.equal(result.success, false);
      assert.ok(result.error?.includes('RPC Gate B1: Comando bloqueado'));
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});
