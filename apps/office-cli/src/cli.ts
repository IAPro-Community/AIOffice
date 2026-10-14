#!/usr/bin/env node
import { AIOfficeEngine } from './engine.js';

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const maestroFallback = args.includes('--maestro-fallback');
  const prompt = args.filter((arg) => arg !== '--maestro-fallback').join(' ') || 'Extrair design tokens e cores do aplicativo';

  console.log('🏢 [AIOffice] Preparando o roteamento da tarefa...');
  console.log(`🎯 Prompt do usuário: "${prompt}"\n`);
  if (!maestroFallback) {
    console.log('ℹ️ Nenhum executor foi iniciado. O executor do Maestro fica reservado para último recurso.');
    console.log('   Use --maestro-fallback somente quando os executores preferenciais estiverem indisponíveis.\n');
  } else {
    console.warn('⚠️ O fallback do CLI grava artefatos de demonstração no workspace e aprova essas escritas automaticamente.');
  }

  const engine = new AIOfficeEngine();
  try {
    const result = await engine.runTask(prompt, { maestroFallback });

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

    if (result.executionMode === 'maestro-fallback') {
      console.log('\n🎉 Tarefa concluída com sucesso no AIOffice!');
    } else {
      console.log('\n📋 Roteamento preparado; a tarefa não foi executada.');
    }
    console.log('🌐 Visite o escritório pixel-art ao vivo em: http://localhost:4747');
  } catch (err) {
    console.error('❌ Erro na execução:', err);
    process.exit(1);
  }
}

main();
