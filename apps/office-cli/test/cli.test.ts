import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AIOfficeEngine } from '../dist/engine.js';

describe('AIOfficeEngine', () => {
  it('should run end-to-end task routing to replica-design and producing tokens', async () => {
    const tmp = mkdtempSync(join(tmpdir(), 'aioffice-cli-test-'));
    try {
      const engine = new AIOfficeEngine(tmp, 'http://127.0.0.1:4747');
      const result = await engine.runTask('Extrair cores e design tokens do aplicativo');

      assert.equal(result.decision.selectedSkill, 'replica-design');
      assert.equal(result.decision.phase, 'design');
      assert.ok(result.artifactsCreated.includes('tokens.json'));
      assert.ok(existsSync(join(tmp, 'tokens.json')));
      assert.ok(result.handoff.completedDeliverables.length > 0);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('should run end-to-end task routing to replica-entrepreneur', async () => {
    const tmp = mkdtempSync(join(tmpdir(), 'aioffice-cli-test-'));
    try {
      const engine = new AIOfficeEngine(tmp, 'http://127.0.0.1:4747');
      const result = await engine.runTask('Analisar reviews e concorrentes do mercado');

      assert.equal(result.decision.selectedSkill, 'replica-entrepreneur');
      assert.equal(result.decision.phase, 'research');
      assert.ok(result.artifactsCreated.includes('market-research.md'));
      assert.ok(existsSync(join(tmp, 'market-research.md')));
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});
