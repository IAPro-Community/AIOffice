// A entrada gerenciada habilita o atualizador do AIOffice e mantém o PID apontando para o servidor real.
import { randomBytes } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const server = resolve(fileURLToPath(new URL('../dist/server/index.js', import.meta.url)));
const envFile = resolve(process.env.HABBLAUD_ENV_FILE?.trim() || fileURLToPath(new URL('../.env', import.meta.url)));
process.env.HABBLAUD_ENV_FILE = envFile;
try {
  process.loadEnvFile(envFile);
} catch (error) {
  if (error?.code !== 'ENOENT') throw error;
}
process.env.AIOFFICE_MANAGED_INSTALL = '1';
// The local desktop can request a guarded shutdown when this server owns its configured port.
process.env.AIOFFICE_UPDATE_NONCE = randomBytes(32).toString('hex');
process.argv[1] = server;
await import(pathToFileURL(server).href);
