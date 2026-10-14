import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { AIOfficeMcpServer, type McpRequest } from '../dist/index.js';

describe('AIOfficeMcpServer', () => {
  it('should respond to initialize with MCP protocol 2024-11-05', async () => {
    const server = new AIOfficeMcpServer('http://127.0.0.1:4747');
    const req: McpRequest = {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
    };

    const res = await server.handleRequest(req);
    assert.equal(res.id, 1);
    assert.equal(res.result?.['protocolVersion'], '2024-11-05');
  });

  it('should list AIOffice tools in tools/list', async () => {
    const server = new AIOfficeMcpServer('http://127.0.0.1:4747');
    const req: McpRequest = {
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/list',
    };

    const res = await server.handleRequest(req);
    assert.equal(res.id, 2);
    const tools = res.result?.['tools'] as unknown[];
    assert.ok(Array.isArray(tools));
    assert.ok(tools.length >= 4);
  });

  it('should handle aioffice_heartbeat call and register agent', async () => {
    const office = createServer((req, res) => {
      assert.equal(req.method, 'POST');
      assert.equal(req.url, '/api/aioffice/agent/status');
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end('{}');
    });
    await new Promise<void>((resolve) => office.listen(0, '127.0.0.1', resolve));
    const address = office.address();
    assert.ok(address && typeof address !== 'string');
    const server = new AIOfficeMcpServer(`http://127.0.0.1:${address.port}`);
    const req: McpRequest = {
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: {
        name: 'aioffice_heartbeat',
        arguments: {
          agentId: 'cursor-comp-1',
          name: 'Cursor Composer',
          role: 'Fullstack Dev',
          workspacePath: 'C:/Users/fbolz/Documents/Code/AIOfficeBeta',
          status: 'working',
          taskDescription: 'Adicionando MCP bridge',
        },
      },
    };

    try {
      const res = await server.handleRequest(req);
      assert.equal(res.id, 3);
      assert.ok(res.result?.['content']);
    } finally {
      await new Promise<void>((resolve, reject) => office.close((error) => error ? reject(error) : resolve()));
    }
  });
});
