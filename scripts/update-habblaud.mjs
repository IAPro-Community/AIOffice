/**
 * Script de sincronização e atualização do Habblaud upstream (marmottajr/habblaud).
 * Permite puxar novidades e correções do Habblaud oficial sem perder as rotas e o branding do AIOffice.
 */
import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';

const UPSTREAM_URL = 'https://github.com/marmottajr/habblaud.git';

console.log('🔄 [AIOffice] Verificando atualizações do Habblaud upstream...');

try {
  // 1. Verificar a versão mais recente publicada no GitHub
  const res = await fetch('https://api.github.com/repos/marmottajr/habblaud/releases/latest', {
    headers: { 'User-Agent': 'aioffice-updater' },
  });
  if (res.ok) {
    const data = await res.json();
    console.log(`📦 Versão mais recente upstream: ${data.tag_name || data.name} (${data.published_at?.slice(0, 10)})`);
  }
} catch {
  console.log('ℹ️ Não foi possível consultar a API do GitHub agora.');
}

console.log('\n💡 Para atualizar os assets e client do Habblaud:');
console.log('   1. git remote add habblaud-upstream https://github.com/marmottajr/habblaud.git (se ainda não adicionado)');
console.log('   2. npm --prefix apps/office-web install');
console.log('   3. npm --prefix apps/office-web run build\n');
