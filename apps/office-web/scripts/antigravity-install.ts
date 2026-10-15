import { homedir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { installAntigravityHooks } from '../server/sources/antigravity/install.js';
const [action, ...args] = process.argv.slice(2);
if (!['install', 'uninstall', 'status'].includes(action ?? '') || args.some((arg, i) => arg !== '--dry-run' && arg !== '--port' && args[i - 1] !== '--port')) {
  console.log('Uso: antigravity-install.ts install|uninstall|status [--dry-run] [--port 4747]');
  process.exitCode = action ? 1 : 0;
} else {
  try {
    const portIndex = args.indexOf('--port');
    const result = installAntigravityHooks({ home: homedir(), sourceHook: resolve(dirname(fileURLToPath(import.meta.url)), '../mod/antigravity/hook.mjs'), runtime: process.execPath, port: Number(portIndex >= 0 ? args[portIndex + 1] : process.env.HABBLAUD_PORT ?? 4747), action: action as 'install' | 'uninstall' | 'status', dryRun: args.includes('--dry-run') });
    console.log(`${result.installed ? 'Hooks instalados' : 'Hooks ausentes'} em ${result.configFile}${result.changed ? ' (atualização preparada)' : ''}.`);
    if (action === 'install') console.log('Reabra a sessão Antigravity para carregar os hooks. Mensagens entram na próxima invocação; permissões permanecem no Antigravity.');
  } catch (error) { console.error(`[Antigravity] ${error instanceof Error ? error.message : String(error)}`); process.exitCode = 1; }
}
