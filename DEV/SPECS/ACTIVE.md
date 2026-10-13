# ESPECIFICAÇÃO ATIVA — AIOffice

## 1. Identificação do Projeto
- **Nome**: AIOffice
- **Status**: Fase 5 Concluída (Entregue e Verificado)
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
