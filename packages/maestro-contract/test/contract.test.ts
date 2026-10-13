import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { MaestroRouter, HandoffBuilder } from '../dist/index.js';

describe('MaestroContract', () => {
  it('should route design intent to replica-design skill', () => {
    const decision = MaestroRouter.route('Extrair cores e design tokens do app', 'task-1');
    assert.equal(decision.selectedSkill, 'replica-design');
    assert.equal(decision.phase, 'design');
    assert.equal(decision.state, 'working');
  });

  it('should route market research intent to replica-entrepreneur', () => {
    const decision = MaestroRouter.route('Analisar reviews e concorrentes do mercado', 'task-2');
    assert.equal(decision.selectedSkill, 'replica-entrepreneur');
    assert.equal(decision.phase, 'research');
  });

  it('should route planning intent to ralplan', () => {
    const decision = MaestroRouter.route('Criar o plano de arquitetura do sistema', 'task-3');
    assert.equal(decision.selectedSkill, 'ralplan');
    assert.equal(decision.phase, 'planning');
  });

  it('should format a valid markdown handoff', () => {
    const builder = new HandoffBuilder('task-4', 'Implementação do módulo auth');
    builder
      .addCompleted('Login com JWT')
      .addVerified('10 testes unitários passando')
      .addRisk('Taxa de expiração do refresh token');

    const md = builder.toMarkdown();
    assert.ok(md.includes('# HANDOFF — task-4'));
    assert.ok(md.includes('Login com JWT'));
    assert.ok(md.includes('10 testes unitários passando'));
    assert.ok(md.includes('Taxa de expiração do refresh token'));
  });
});
