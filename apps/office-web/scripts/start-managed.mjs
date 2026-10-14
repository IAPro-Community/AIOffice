// A entrada gerenciada habilita o atualizador do AIOffice e mantém o PID apontando para o servidor real.
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const server = resolve(fileURLToPath(new URL('../dist/server/index.js', import.meta.url)));
const envFile = resolve(fileURLToPath(new URL('../.env', import.meta.url)));
try {
  process.loadEnvFile(envFile);
} catch (error) {
  if (error?.code !== 'ENOENT') throw error;
}
process.env.AIOFFICE_MANAGED_INSTALL = '1';
process.argv[1] = server;
await import(pathToFileURL(server).href);
