import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AIOfficeEngine } from '../dist/engine.js';

describe('AIOfficeEngine', () => {
  it('keeps the Maestro executor inactive unless the last-resort path is explicitly requested', async () => {
    const tmp = mkdtempSync(join(tmpdir(), 'aioffice-cli-test-'));
    try {
      const engine = new AIOfficeEngine(tmp, 'http://127.0.0.1:4747');
      const result = await engine.runTask('Extrair cores e design tokens do aplicativo');

      assert.equal(result.decision.selectedSkill, 'replica-design');
      assert.equal(result.executionMode, 'not-started');
      assert.deepEqual(result.artifactsCreated, []);
      assert.equal(existsSync(join(tmp, 'tokens.json')), false);
      assert.match(result.handoff.openRisks[0] ?? '', /reservado para último recurso/);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('should run end-to-end task routing to replica-design and producing tokens', async () => {
    const tmp = mkdtempSync(join(tmpdir(), 'aioffice-cli-test-'));
    try {
      const engine = new AIOfficeEngine(tmp, 'http://127.0.0.1:4747');
      const result = await engine.runTask('Extrair cores e design tokens do aplicativo', { maestroFallback: true });

      assert.equal(result.decision.selectedSkill, 'replica-design');
      assert.equal(result.decision.phase, 'design');
      assert.ok(result.artifactsCreated.includes('tokens.json'));
      assert.equal(result.executionMode, 'maestro-fallback');
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
      const result = await engine.runTask('Analisar reviews e concorrentes do mercado', { maestroFallback: true });

      assert.equal(result.decision.selectedSkill, 'replica-entrepreneur');
      assert.equal(result.decision.phase, 'research');
      assert.ok(result.artifactsCreated.includes('market-research.md'));
      assert.equal(result.executionMode, 'maestro-fallback');
      assert.ok(existsSync(join(tmp, 'market-research.md')));
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});
