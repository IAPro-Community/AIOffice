/**
 * Configura MCP Bridges do AIOffice em clientes compatíveis
 * Conecta Cursor, Windsurf, Claude Desktop e Antigravity ao AIOffice.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';

const MCP_ENTRY = {
  command: 'node',
  args: [resolve(process.cwd(), 'packages/mcp-bridge/dist/index.js')],
};

console.log('🔌 [AIOffice] Configurando o servidor MCP do AIOffice nos clientes compatíveis...\n');

let configuredCount = 0;
let failedCount = 0;

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
      } catch (err) {
        throw new Error(`JSON inválido; arquivo preservado (${err instanceof Error ? err.message : String(err)})`);
      }
    }

    if (!config.mcpServers) {
      config.mcpServers = {};
    }
    config.mcpServers.aioffice = MCP_ENTRY;

    writeFileSync(targetPath, JSON.stringify(config, null, 2), 'utf-8');
    console.log(`✅ [OK] Configurado em: ${targetPath}`);
    configuredCount += 1;
    return true;
  } catch (err) {
    console.warn(`⚠️ [FALHA] Não foi possível atualizar ${targetPath}:`, err instanceof Error ? err.message : err);
    failedCount += 1;
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

console.log(`\n${failedCount ? '⚠️' : '✅'} Configuração MCP: ${configuredCount} cliente(s) atualizado(s), ${failedCount} falha(s).`);
console.log('ℹ️ O MCP disponibiliza ferramentas ao cliente; ele não captura sessões nem mensagens automaticamente.');
console.log('ℹ️ Para aparecer no Habblaud, o agente precisa chamar aioffice_heartbeat; use aioffice_report_activity para atualizar a tarefa.');
console.log('ℹ️ Reinicie o cliente MCP para carregar alterações de configuração ou de ferramentas.');
