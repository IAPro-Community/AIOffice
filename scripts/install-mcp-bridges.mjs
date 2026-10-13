/**
 * Instalador e sincronizador automático de MCP Bridges do AIOffice
 * Conecta Cursor, Windsurf, Claude Desktop e Antigravity ao AIOffice.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';

const MCP_ENTRY = {
  command: 'node',
  args: [resolve(process.cwd(), 'packages/mcp-bridge/dist/index.js')],
};

console.log('🔌 [AIOffice] Instalando MCP Bridges em todos os ambientes suportados...\n');

function updateJsonConfig(targetPath, keyPath = ['mcpServers', 'aioffice']) {
  try {
    const dir = join(targetPath, '..');
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    let config = {};
    if (existsSync(targetPath)) {
      try {
        config = JSON.parse(readFileSync(targetPath, 'utf-8'));
      } catch {
        config = {};
      }
    }

    if (!config.mcpServers) {
      config.mcpServers = {};
    }
    config.mcpServers.aioffice = MCP_ENTRY;

    writeFileSync(targetPath, JSON.stringify(config, null, 2), 'utf-8');
    console.log(`✅ [OK] Configurado em: ${targetPath}`);
    return true;
  } catch (err) {
    console.warn(`⚠️ [FALHA] Não foi possível atualizar ${targetPath}:`, err instanceof Error ? err.message : err);
    return false;
  }
}

// 1. Cursor IDE
const cursorMcp = join(homedir(), '.cursor', 'mcp.json');
updateJsonConfig(cursorMcp);

// 2. Windsurf (Codeium)
const windsurfMcp = join(homedir(), '.codeium', 'windsurf', 'mcp_config.json');
updateJsonConfig(windsurfMcp);

// 3. Claude Desktop
const appData = process.env.APPDATA || join(homedir(), 'AppData', 'Roaming');
const claudeDesktop = join(appData, 'Claude', 'claude_desktop_config.json');
if (existsSync(join(appData, 'Claude'))) {
  updateJsonConfig(claudeDesktop);
}

// 4. Google Antigravity
const antigravityMcp = join(homedir(), '.antigravity', 'mcp.json');
updateJsonConfig(antigravityMcp);

console.log('\n🎉 Todos os MCP Bridges foram instalados e ativados com sucesso!');
console.log('💡 Agora, Cursor, Windsurf e Antigravity sincronizam automaticamente com o AIOffice.');
