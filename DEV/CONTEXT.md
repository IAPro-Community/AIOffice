# CONTEXTO — AIOffice

## 1. Visão Geral
O **AIOffice** é uma plataforma integrada de engenharia de software assistida por IA local-first. Ele une cinco iniciativas complementares:
1. **Orquestrador-Maestro** (`IAPro-Community/Orquestrador-Maestro`): protocolo de governança, constituição (`rules.md`, `maestro.md`, `PERSISTENCE.md`), roteamento de skills e ciclo de evidência/handoff.
2. **OpenOrq**: implementação em código TypeScript com broker de escrita (`policy-broker`), proxy de controle RPC B1 (`rpc-proxy`), cofre seguro DPAPI (`credential-store`) e interface Maestro.
3. **Habblaud** (`marmottajr/habblaud`): interface visual de escritório virtual em pixel art retro (web em `localhost:4747`) com salas por projeto, mesas de agentes, animações de status em tempo real, elevador de subagentes e aprovação de permissões com 1 clique. A ingestão de sessões cobre Claude Code CLI, Codex e OMP. Claude Desktop Chat/Cowork só pode reportar presença/atividade por chamadas MCP explícitas; não transmite automaticamente a conversa. Claude.ai e Desktop Code não são fontes diretas integradas.
4. **oh-my-pi (omp)** (`can1357/oh-my-pi`): runtime de execução em terminal de alta velocidade com edições hashline seguras, ferramentas LSP e AST, e subagentes isolados em worktrees git via `task`.
5. **replica-skill** (`Jakeschincariol/replica-skill`): suíte de 11 skills especializadas para engenharia reversa, clonagem e reconstrução de produtos (pesquisa, design system, código, testes, correções e deploy).

## 2. Decisões Arquiteturais Vigentes
- **Topologia de Repositório**: Monorepo unindo aplicações (`apps/`) e pacotes compartilhados (`packages/`).
- **Segurança BYOK**: Chaves mantidas no cofre do SO (DPAPI no Windows) via `credential-store`. Zero proxy de inferência terceiro.
- **Isolamento de Efeitos**: Nenhuma ferramenta escreve no disco sem mediação do `policy-broker` e aprovação humana explícita.
- **Ponte Visual Habblaud**: Desacoplamento da leitura de arquivos do Claude Code; o Habblaud passa a consumir eventos diretos do OpenOrq via API/WebSocket local.
- **Workflow de Clonagem**: Mapeamento das 11 skills do `replica-skill` para papéis de agentes nas mesas do Habblaud.
- **Versões do produto**: no monorepo, o selo consulta apenas releases AIOffice. Atualização pelo botão exige a entrada Node gerenciada, checkout Git oficial limpo e zero PTYs ativos; prepara fora do checkout, reinicia de forma cooperativa e confirma a versão antes de limpar o aviso. Docker/dev seguem no fluxo manual.
- **Acesso remoto**: porta HTTPS separada, desligada por padrão, login por senha hash e capacidade remota em allowlist; somente LAN/VPN privada documentada. O painel local continua no loopback; na UI local, o operador configura uma vez e inicia/para o listener sem reiniciar. Docker segue sem acesso remoto.

## 3. Melhorias de produto — 2026-10-13
- A interface inclui Central de trabalho por projeto, fila de atenção, catálogo por capacidade, filtro por ferramenta e biblioteca de seis modelos de workflow.
- Os modelos geram texto para revisão e cópia; não enviam prompts nem iniciam agentes. A fila de atenção seleciona o agente; não aprova pedidos.
- Claude Code, Codex e OMP são as fontes de sessão ativas. Claude Desktop Chat/Cowork reporta apenas atividade MCP explícita. OpenCode, Antigravity, Devin e Freebuf seguem marcados como incompletos, sem suporte anunciado.
- O CLI não inicia o executor Maestro por padrão. `--maestro-fallback` é uma ativação explícita de último recurso; o runtime, o policy-broker e o RPC não foram alterados. Esse caminho do CLI mantém o comportamento de demonstração anterior e aprova automaticamente as escritas de artefatos.

## 4. Temas automáticos do Habblaud — 2026-10-13
- O cenário Automático combina um calendário brasileiro/internacional com quatro faixas de hora local configuráveis; eventos comemorativos têm prioridade.
- A agenda e a opção de eventos ficam salvas nas preferências locais do navegador. O cenário fixo continua independente da agenda automática.
- Os doze cenários fixos, inclusive os seis comemorativos, ficam disponíveis no seletor principal.
- Datas móveis de Carnaval e Páscoa são calculadas para cada ano; o horário é reavaliado pelo relógio local e pelo relógio reproduzido no timelapse.

## 5. Diagnóstico do updater e conexão móvel — 2026-10-13
- A interface compara releases exclusivamente com `IAPro-Community/AIOffice`; versões de `marmottajr/habblaud` não são versões do produto AIOffice.
- O serviço observado em `127.0.0.1:4747` ainda responde como Habblaud `0.10.0`, consulta o upstream Habblaud e não informa a nova capacidade `meta.remoteAccess`. O backend gerenciado precisa assumir a porta para atualizar esses dados.
- Configurações → **Acesso pelo celular** oferece configuração inicial, iniciar/parar, URLs privadas, download da CA pública e impressão SHA-256. A ativação continua opt-in; o estado nunca revela senha/hash/chave privada e não cria regras de rede.
