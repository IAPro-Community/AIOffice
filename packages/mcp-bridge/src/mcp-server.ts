import { createInterface } from 'node:readline';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { HabblaudBridgeClient, type OfficeAgentStatus } from '@aioffice/habblaud-bridge';
import type { McpRequest, McpResponse, McpToolDefinition } from './types.js';

export const AIOFFICE_MCP_TOOLS: readonly McpToolDefinition[] = [
  {
    name: 'aioffice_heartbeat',
    description: 'Registra a presença do agente (Cursor, Windsurf, Antigravity, etc.) no escritório virtual do AIOffice.',
    inputSchema: {
      type: 'object',
      properties: {
        agentId: { type: 'string', description: 'ID único do agente na IDE' },
        name: { type: 'string', description: 'Nome do agente exibido no escritório' },
        role: { type: 'string', description: 'Papel do agente (ex: Cursor Composer, Windsurf Cascade)' },
        workspacePath: { type: 'string', description: 'Caminho absoluto do workspace atual' },
        status: { type: 'string', enum: ['working', 'waiting', 'idle'], description: 'Estado atual do agente' },
        taskDescription: { type: 'string', description: 'Descrição da tarefa sendo realizada' },
      },
      required: ['agentId', 'workspacePath'],
    },
  },
  {
    name: 'aioffice_report_activity',
    description: 'Envia um balão de atividade para o avatar no escritório (ex: Pensando..., Rodando testes, etc.).',
    inputSchema: {
      type: 'object',
      properties: {
        agentId: { type: 'string', description: 'ID do agente registrado' },
        activityText: { type: 'string', description: 'Texto da atividade exibido no balão de fala' },
        kind: { type: 'string', enum: ['think', 'run', 'respond'], description: 'Tipo de atividade' },
      },
      required: ['agentId', 'activityText'],
    },
  },
  {
    name: 'aioffice_request_approval',
    description: 'Solicita aprovação do humano no escritório virtual antes de aplicar uma alteração crítica ou comando.',
    inputSchema: {
      type: 'object',
      properties: {
        approvalId: { type: 'string', description: 'ID único da solicitação de aprovação' },
        agentId: { type: 'string', description: 'ID do agente solicitante' },
        target: { type: 'string', description: 'Arquivo ou comando a ser executado' },
        rationale: { type: 'string', description: 'Motivo da alteração' },
        diffPreview: { type: 'string', description: 'Prévia do diff para inspeção humana' },
      },
      required: ['approvalId', 'agentId', 'target', 'rationale'],
    },
  },
  {
    name: 'aioffice_get_context',
    description: 'Obtém as regras do Orquestrador-Maestro, handoff ativo e contexto de desenvolvimento do projeto.',
    inputSchema: {
      type: 'object',
      properties: {
        workspacePath: { type: 'string', description: 'Caminho absoluto do workspace' },
      },
      required: ['workspacePath'],
    },
  },
];

export class AIOfficeMcpServer {
  private readonly bridge: HabblaudBridgeClient;

  constructor(habblaudUrl = 'http://127.0.0.1:4747') {
    this.bridge = new HabblaudBridgeClient(habblaudUrl);
  }

  public async handleRequest(req: McpRequest): Promise<McpResponse> {
    if (req.method === 'initialize') {
      return {
        jsonrpc: '2.0',
        id: req.id,
        result: {
          protocolVersion: '2024-11-05',
          capabilities: { tools: {} },
          serverInfo: { name: 'aioffice-mcp-bridge', version: '0.1.0' },
        },
      };
    }

    if (req.method === 'tools/list') {
      return {
        jsonrpc: '2.0',
        id: req.id,
        result: { tools: AIOFFICE_MCP_TOOLS },
      };
    }

    if (req.method === 'tools/call') {
      const toolName = String(req.params?.['name'] || '');
      const args = (req.params?.['arguments'] as Record<string, unknown>) || {};

      try {
        if (toolName === 'aioffice_heartbeat') {
          const agentId = String(args['agentId'] || 'cursor-agent');
          const name = String(args['name'] || 'Cursor Composer');
          const role = String(args['role'] || 'Engenheiro IDE');
          const project = String(args['workspacePath'] || process.cwd());
          const status: OfficeAgentStatus = typeof args['status'] === 'string' && (args['status'] === 'waiting' || args['status'] === 'idle') ? args['status'] : 'working';
          const taskDescription = args['taskDescription'] ? String(args['taskDescription']) : undefined;

          await this.bridge.notifyAgentStatus({
            agentId,
            name,
            role,
            project,
            status,
            taskDescription,
          });

          return {
            jsonrpc: '2.0',
            id: req.id,
            result: { content: [{ type: 'text', text: `Agente ${name} sincronizado com AIOffice na sala ${project}.` }] },
          };
        }

        if (toolName === 'aioffice_report_activity') {
          const agentId = String(args['agentId'] || '');
          const activityText = String(args['activityText'] || '');
          await this.bridge.notifyAgentStatus({
            agentId,
            name: 'Agente IDE',
            role: 'Assistente',
            project: process.cwd(),
            status: 'working',
            taskDescription: activityText,
          });

          return {
            jsonrpc: '2.0',
            id: req.id,
            result: { content: [{ type: 'text', text: `Atividade registrada no escritório: "${activityText}".` }] },
          };
        }

        if (toolName === 'aioffice_request_approval') {
          const approvalId = String(args['approvalId'] || `appr-${Date.now()}`);
          const agentId = String(args['agentId'] || '');
          const target = String(args['target'] || '');
          const rationale = String(args['rationale'] || '');
          const diffPreview = args['diffPreview'] ? String(args['diffPreview']) : undefined;

          await this.bridge.requestOfficeApproval({
            id: approvalId,
            agentId,
            action: 'write',
            target,
            diffPreview,
            rationale,
          });

          return {
            jsonrpc: '2.0',
            id: req.id,
            result: { content: [{ type: 'text', text: `Solicitação de aprovação enviada ao humano no escritório virtual para ${target}.` }] },
          };
        }

        if (toolName === 'aioffice_get_context') {
          const ws = String(args['workspacePath'] || process.cwd());
          const handoffPath = join(ws, 'DEV', 'HANDOFF.md');
          const specsPath = join(ws, 'DEV', 'SPECS', 'ACTIVE.md');
          let summary = 'Contexto AIOffice carregado.\n';
          if (existsSync(handoffPath)) {
            summary += '\n--- HANDOFF ATIVO ---\n' + readFileSync(handoffPath, 'utf-8');
          }
          if (existsSync(specsPath)) {
            summary += '\n--- ESPECIFICAÇÃO ATIVA ---\n' + readFileSync(specsPath, 'utf-8');
          }

          return {
            jsonrpc: '2.0',
            id: req.id,
            result: { content: [{ type: 'text', text: summary }] },
          };
        }

        return {
          jsonrpc: '2.0',
          id: req.id,
          error: { code: -32601, message: `Ferramenta MCP desconhecida: ${toolName}` },
        };
      } catch (err) {
        return {
          jsonrpc: '2.0',
          id: req.id,
          error: { code: -32000, message: err instanceof Error ? err.message : String(err) },
        };
      }
    }

    return {
      jsonrpc: '2.0',
      id: req.id,
      error: { code: -32601, message: `Método MCP não suportado: ${req.method}` },
    };
  }

  public startStdio(): void {
    const rl = createInterface({ input: process.stdin, terminal: false });
    rl.on('line', async (line) => {
      const trimmed = line.trim();
      if (!trimmed) return;
      try {
        const req = JSON.parse(trimmed) as McpRequest;
        const res = await this.handleRequest(req);
        process.stdout.write(JSON.stringify(res) + '\n');
      } catch {
        // Ignorar JSON inválido
      }
    });
  }
}
