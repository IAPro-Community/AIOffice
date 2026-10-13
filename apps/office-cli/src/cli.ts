#!/usr/bin/env node
import { AIOfficeEngine } from './engine.js';

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const prompt = args.join(' ') || 'Extrair design tokens e cores do aplicativo';

  console.log('🏢 [AIOffice] Inicializando escritório virtual e motor Maestro...');
  console.log(`🎯 Prompt do usuário: "${prompt}"\n`);

  const engine = new AIOfficeEngine();
  try {
    const result = await engine.runTask(prompt);

    console.log('✅ [Maestro Router] Decisão tomada:');
    console.log(`   - Fase: ${result.decision.phase}`);
    console.log(`   - Skill selecionada: ${result.decision.selectedSkill}`);
    console.log(`   - Orçamento: ${result.decision.budgetTokens} tokens`);
    console.log(`   - Rationale: ${result.decision.rationale}\n`);

    console.log('📦 [Artefatos Criados]:');
    for (const art of result.artifactsCreated) {
      console.log(`   - ${art}`);
    }

    console.log('\n📋 [Resumo do Handoff]:');
    for (const item of result.handoff.completedDeliverables) {
      console.log(`   - [x] ${item}`);
    }

    console.log('\n🎉 Tarefa concluída com sucesso no AIOffice!');
    console.log('🌐 Visite o escritório pixel-art ao vivo em: http://localhost:4747');
  } catch (err) {
    console.error('❌ Erro na execução:', err);
    process.exit(1);
  }
}

main();
