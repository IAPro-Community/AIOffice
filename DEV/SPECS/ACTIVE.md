# ESPECIFICAÇÃO ATIVA — AIOffice

## 1. Identificação do Projeto
- **Nome**: AIOffice
- **Status**: Fase 5 concluída; auditoria ampla da interface concluída; paridade de provedores aberta
- **Localização**: Repositório AIOffice

## 2. Pilares de Integração
1. **Governança & Raciocínio**: Orquestrador-Maestro (Protocolo e Regras)
2. **Mediação & Segurança**: OpenOrq (`policy-broker`, `rpc-proxy`, `credential-store`)
3. **Superfície Visual**: Habblaud (Web Pixel-Art Office)
4. **Harness de Ferramentas**: oh-my-pi / Pi (Runtime e Subagentes)
5. **Metodologia de Engenharia**: replica-skill (11 Skills Especializadas)

## 3. Arquitetura do Workspace
```
AIOffice/
├── apps/
│   ├── office-web/       # Habblaud Client (React/Vite) + Habblaud Server (Fastify/WS)
│   └── office-cli/       # Host TUI e CLI do OpenOrq
├── packages/
│   ├── maestro-contract/ # JSON Schemas de decisão do Maestro
│   ├── policy-broker/    # Interceptador e mediador canônico de escrita/diff
│   ├── rpc-proxy/        # Allowlist estrita RPC (Gate B1)
│   ├── credential-store/ # Cofre seguro local DPAPI para Windows
│   ├── runtime/          # RuntimeAdapter para subprocesso omp / Pi
│   └── habblaud-bridge/  # Emissor de eventos e receptor de aprovação do Habblaud
├── skills/
│   └── replica/          # 11 skills do replica-skill registradas no Maestro
└── DEV/                  # Documentação e persistência viva
```

## 4. Fases de Execução

### Fase 1: Setup do Workspace & Migração do Núcleo OpenOrq
- Configurar `package.json` raiz com workspaces (`apps/*`, `packages/*`).
- Configurar TypeScript com `tsconfig.base.json` e referências de projeto composite.
- Incorporar e validar os pacotes de governança do OpenOrq:
  - `packages/maestro-contract`
  - `packages/policy-broker`
  - `packages/rpc-proxy`
  - `packages/credential-store`
- Critério de Aceitação: `npm run build` e testes de unidade dos 4 pacotes passando com 100% de sucesso.

### Fase 2: Adaptação e Subida do Habblaud (`apps/office-web`)
- Clonar e integrar o código de `marmottajr/habblaud` em `apps/office-web`.
- Criar a camada `packages/habblaud-bridge`:
  - Endpoint REST / WebSocket no servidor Habblaud para receber eventos do OpenOrq (`session.start`, `turn.start`, `tool_call`, `subagent.spawn`, `waiting_approval`).
  - Endpoint de callback de aprovação (`/api/mod/approval`) consumido pelo `policy-broker`.
- Desacoplar o Habblaud da leitura exclusiva de arquivos `~/.claude`.
- Critério de Aceitação: Servidor e interface do Habblaud sobem em `http://localhost:4747`, exibindo salas e agentes criados programaticamente via `habblaud-bridge`.

### Fase 3: Conexão do Runtime OMP & Subagentes com Elevador
- Implementar o `packages/runtime` para invocar o binário/código do `oh-my-pi` em subprocesso via RPC.
- Integrar a allowlist do `packages/rpc-proxy` para filtrar chamadas de bash não autorizadas.
- Conectar o interceptador do `packages/policy-broker` às ações de escrita (`edit` hashline, `write`).
- Conectar o ciclo de subagentes (`task`) ao evento `subagent:spawn` no Habblaud, animando o elevador.
- Critério de Aceitação: Comando de escrita do agente entra em estado de espera, avatar no Habblaud levanta a mão, aprovação no navegador libera o diff no disco.

### Fase 4: Ingestão de `replica-skill` & Mapeamento de Mesas Especialistas
- Adicionar as 11 skills do `replica-skill` em `skills/replica/`:
  - `replica-entrepreneur`, `replica-brand`, `replica-design`, `replica-build`, `replica-test`, `replica-fix`, `replica-deploy`, `replica-launch`, etc.
- Atualizar o `SKILLS_ROUTER.json` do Maestro para reconhecer tarefas do ciclo Replica.
- Mapear cada skill ativa para um avatar e baia específica no Habblaud.
- Critério de Aceitação: Ao solicitar clonagem de um componente/app, o Maestro ativa a skill correspondente e o agente assume a mesa correta no escritório virtual.

### Fase 5: Validação Integrada Ponta a Ponta
- Executar cenário real de engenharia reversa de um app/componente web:
  1. Análise de requisitos (`replica-entrepreneur`).
  2. Extração de design tokens e spec de UI (`replica-design`).
  3. Geração de código com subagentes front/back (`replica-build` + `omp task`).
  4. Interceptação de escrita e aprovação pelo Habblaud.
  5. Testes e handoff final (`DEV/HANDOFF.md` e `DEV/VERIFY.md`).
- Critério de Aceitação: Aplicação clonada gerada no disco com testes verdes, zero bypass de segurança e log completo no Habblaud.

## 6. Revisão da cobertura de CLIs (2026-10-13)
- **Cobertura ativa confirmada**: Claude Code, Codex e oh-my-pi.
- **Gap**: Devin, Antigravity, OpenCode e Freebuf constam no tipo de provedor, mas suas fontes não são iniciadas. Cursor, Gemini CLI e Windsurf não têm fontes de sessão no Habblaud; a configuração de MCP para IDEs é uma integração diferente.
- **Correção local**: o terminal do OMP agora converte o formato de transcript próprio para as entradas do painel compartilhado. A build foi ativada no serviço local; o envio de mensagem ainda aguarda validação na sessão OMP.
- **Critério para declarar suporte de um provedor**: detecção de sessão e provedor, presença/busca/filtro no escritório, terminal e mensagens quando suportados, histórico e ajuda; métricas só se houver dados confiáveis.
- **Escopo ainda aberto**: confirmar quais CLIs locais fazem parte do alvo “todos” antes de criar ou ativar novos adaptadores.

## 7. Auditoria ampla da interface (2026-10-13)
- **Relatório**: `DEV/UI-AUDIT-2026-10-13.md` registra evidências, achados por prioridade, limites e sequência recomendada.
- **Critérios para a fase seguinte**: identidade e filtro por provedor sem depender de conta de uso; parser OMP compartilhado por escritório/feed/terminal; estado visível da conexão e entrega; cobertura por capacidade em busca, histórico, estatísticas e ajuda.
- **Organização**: canonizar caminhos no Windows e oferecer controle para salas temporárias, sem ocultar ou apagar dados por padrão.
- **UX**: preservar a linguagem pixel-art; confirmar a hierarquia da gaveta e o contexto ao vivo/replay; verificar tamanhos desktop, tablet e celular antes de mudanças visuais.
- **Pendente de decisão de escopo**: lista de CLIs locais a suportar. Cursor, Windsurf e Claude Desktop via MCP devem permanecer separados da ingestão de sessões de CLI.

## 8. Fechamento das correções de interface (2026-10-13)
- OMP agora publica uma identidade que alimenta filtros e busca; terminal, atividade e histórico entendem o formato próprio de conversa do OMP.
- Entrega de mensagem aguarda polling e confirmação da extensão. A extensão foi atualizada para usar a API interativa do OMP; sessão já iniciada precisa ser reaberta para carregar a atualização.
- A extensão agora usa o timer gerenciado, inicia uma rodada quando o OMP está ocioso e tenta novamente ACKs pendentes; validar a entrega real após reabrir a sessão.
- Caminhos de projeto são canonizados no Windows para evitar salas duplicadas por diferença de barras e caixa.
- Build, typecheck e checagem de traduções passaram; a operação real de envio ainda depende de validação do usuário.
- Fontes ativas continuam Claude Code, Codex e OMP. Os adaptadores Devin, Antigravity, OpenCode e Freebuf permanecem inativos; não anunciar suporte universal.

## 9. Diagnóstico de sessões Claude (2026-10-13)
- **Estado local**: o serviço ativo responde saudável em `127.0.0.1:4747`; descobre 8 sessões Codex, 10 OMP e 0 Claude Code. O perfil `.claude` tem somente dois registros de sessão e transcripts modificados em 22/09/2026, sem processo CLI correspondente ativo.
- **Distinção de produto**: o executável `claude` CLI está instalado na versão 2.1.170; os processos `claude.exe` ativos pertencem ao Claude Desktop 2.37337.1. Uma aba do Claude.ai também estava em fluxo de login. Esses produtos não devem ser tratados como a mesma fonte de sessão.
- **Superfície confirmada**: a atividade ausente veio do Claude Desktop Chat/Cowork.
- **MCP local**: `claude_desktop_config.json` contém `aioffice`; o processo local da bridge estava ativo. O snapshot não tinha agentes Claude porque não houve chamada a `aioffice_heartbeat` nem a `aioffice_report_activity`.
- **Limite**: MCP expõe ferramentas que o modelo pode chamar; não fornece ao Habblaud um feed automático com todas as mensagens, transcript, estado ou caixa de entrada do Chat/Cowork. A bridge MCP permite presença e atividades explicitamente reportadas, mas não paridade com as fontes de CLI.
- **Correção local**: descrições de ferramenta e mensagens do instalador deixam claro o acionamento explícito; respostas não afirmam sucesso quando a API Habblaud não confirma. Para carregar a versão compilada no Claude Desktop, reiniciar o cliente MCP.
- **Referências oficiais**: [MCP local no Claude Desktop](https://support.anthropic.com/en/articles/10949351-getting-started-with-local-mcp-servers-on-claude-desktop) descreve extensões/servidores locais; [exportação de dados do Claude](https://support.anthropic.com/en/articles/9450526-how-can-i-export-my-claude-data) descreve exportação manual do histórico.

## 10. Melhorias de produto e decisão sobre executor (2026-10-13)
- A Central de trabalho resume atividade observada, próximos bloqueios, tarefas e sinais de build/teste sem inventar status quando não há evento.
- A fila de atenção prioriza pedidos de ação e erros recentes; abrir um item só seleciona o agente.
- O catálogo mostra capacidades por fonte e separa SSE, estado de sessão e bridge MCP. Ferramentas não integradas continuam identificadas como incompletas.
- A biblioteca inicial tem seis modelos de tarefa, em português; montar/copiar não executa nem envia o prompt.
- **Decisão do usuário**: executor mediado pelo Orquestrador-Maestro é somente último recurso. O CLI não executa a tarefa por padrão e exige `--maestro-fallback` para ativá-lo; runtime, broker e proxy RPC não foram alterados. O caminho de demonstração explicitamente ativado mantém aprovação automática de escrita.
