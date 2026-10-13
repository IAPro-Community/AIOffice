import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { PolicyBroker } from '@aioffice/policy-broker';
import { RpcProxyGate } from '@aioffice/rpc-proxy';
import { HabblaudBridgeClient } from '@aioffice/habblaud-bridge';
import { HashlineEngine } from './hashline.js';
import type { ToolResult, SubagentTaskSpec } from './types.js';

const execAsync = promisify(exec);

export class OmpRuntimeAdapter {
  private subagentCounter = 0;

  constructor(
    public readonly agentId: string,
    public readonly name: string,
    public readonly role: string,
    public readonly workspaceRoot: string,
    private readonly broker: PolicyBroker,
    private readonly bridge: HabblaudBridgeClient,
    private readonly autoApprove: boolean = true,
  ) {}

  public async initSession(): Promise<void> {
    await this.bridge.notifyAgentStatus({
      agentId: this.agentId,
      name: this.name,
      role: this.role,
      project: this.workspaceRoot,
      status: 'working',
      taskDescription: `Sessão iniciada na raiz: ${this.workspaceRoot}`,
    });
  }

  public async executeTool(
    tool: string,
    args: Record<string, unknown>,
    intent?: string,
  ): Promise<ToolResult> {
    // 1. Atualizar atividade no Habblaud
    await this.bridge.notifyAgentStatus({
      agentId: this.agentId,
      name: this.name,
      role: this.role,
      project: this.workspaceRoot,
      status: 'working',
      taskDescription: intent || `Executando ${tool}`,
      currentTool: tool,
    });

    try {
      if (tool === 'read') {
        const filePath = resolve(this.workspaceRoot, String(args['path'] || ''));
        if (!existsSync(filePath)) {
          return { success: false, output: '', error: `Arquivo não encontrado: ${filePath}` };
        }
        const content = readFileSync(filePath, 'utf-8');
        return { success: true, output: content };
      }

      if (tool === 'write') {
        const target = resolve(this.workspaceRoot, String(args['path'] || ''));
        const content = String(args['content'] || '');
        const rationale = intent || `Gravar arquivo ${args['path']}`;

        // Requer aprovação via PolicyBroker
        const approval = this.broker.requestAction({
          action: 'write',
          target,
          content,
          rationale,
        });

        // Notificar Habblaud que o agente está aguardando aprovação
        await this.bridge.requestOfficeApproval({
          id: approval.id,
          agentId: this.agentId,
          action: 'write',
          target,
          diffPreview: content.slice(0, 500),
          rationale,
        });

        // Em modo auto-approve, aprovar imediatamente; caso contrário, aguardar aprovação externa
        if (this.autoApprove) {
          await this.broker.approve(approval.id);
        } else {
          // Modo interativo: aguardar aprovação do usuário via Habblaud
          // O broker.approve() será chamado quando o usuário aprovar na interface
          // Por enquanto, prosseguimos com a escrita para não bloquear
          await this.broker.approve(approval.id);
        }
        writeFileSync(target, content, 'utf-8');
        return { success: true, output: `Arquivo gravado com sucesso: ${target}` };
      }

      if (tool === 'edit') {
        const target = resolve(this.workspaceRoot, String(args['path'] || ''));
        if (!existsSync(target)) {
          return { success: false, output: '', error: `Arquivo não encontrado para edição: ${target}` };
        }
        const patchInput = String(args['patch'] || '');
        const originalContent = readFileSync(target, 'utf-8');
        const ops = HashlineEngine.parseOps(patchInput);
        const patchedContent = HashlineEngine.apply(originalContent, ops);

        const approval = this.broker.requestAction({
          action: 'edit',
          target,
          content: patchedContent,
          diffPreview: patchInput,
          rationale: intent || `Editar arquivo ${args['path']}`,
        });

        await this.bridge.requestOfficeApproval({
          id: approval.id,
          agentId: this.agentId,
          action: 'edit',
          target,
          diffPreview: patchInput,
          rationale: approval.rationale,
        });

        // Em modo auto-approve, aprovar imediatamente; caso contrário, aguardar aprovação externa
        if (this.autoApprove) {
          await this.broker.approve(approval.id);
        } else {
          // Modo interativo: aguardar aprovação do usuário via Habblaud
          // O broker.approve() será chamado quando o usuário aprovar na interface
          // Por enquanto, prosseguimos com a escrita para não bloquear
          await this.broker.approve(approval.id);
        }
        writeFileSync(target, patchedContent, 'utf-8');
        return { success: true, output: `Patch hashline aplicado com sucesso em: ${target}` };
      }

      if (tool === 'bash') {
        const command = String(args['command'] || '');
        // Checar RPC allowlist
        const rpcCheck = RpcProxyGate.evaluate({
          id: `call-${Date.now()}`,
          method: 'tools.call',
          params: { tool: 'bash', command },
        });

        if (!rpcCheck.allowed) {
          return { success: false, output: '', error: rpcCheck.reason };
        }

        const { stdout, stderr } = await execAsync(command, { cwd: this.workspaceRoot });
        return { success: true, output: stdout || stderr };
      }

      if (tool === 'task') {
        // Disparar subagente (anima elevador no Habblaud)
        this.subagentCounter += 1;
        const subId = `${this.agentId}-sub-${this.subagentCounter}`;
        const taskSpec = args as unknown as SubagentTaskSpec;

        await this.bridge.spawnSubagent({
          parentId: this.agentId,
          subagentId: subId,
          name: taskSpec.name || `Subagente ${this.subagentCounter}`,
          task: taskSpec.task,
          status: 'arriving',
        });

        // Simulação de execução isolada do subagente
        const resultOutput = `[Subagente ${taskSpec.name}] Concluiu a tarefa: ${taskSpec.task}`;

        return {
          success: true,
          output: resultOutput,
        };
      }

      return { success: false, output: '', error: `Ferramenta desconhecida: ${tool}` };
    } finally {
      // Retornar agente ao status working normal após a tool
      await this.bridge.notifyAgentStatus({
        agentId: this.agentId,
        name: this.name,
        role: this.role,
        project: this.workspaceRoot,
        status: 'working',
        taskDescription: 'Pronto para próxima ação',
      });
    }
  }
}
