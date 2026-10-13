export * from './types.js';
export * from './mcp-server.js';

import { AIOfficeMcpServer } from './mcp-server.js';

// Se executado diretamente via linha de comando (stdio para Cursor/Windsurf/etc.)
if (process.argv[1]?.endsWith('index.js') || process.argv[1]?.endsWith('aioffice-mcp')) {
  const server = new AIOfficeMcpServer();
  server.startStdio();
}
