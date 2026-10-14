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

## 5. Release atual — AIOffice v2.1.0
- A versão `2.1.0` está publicada na branch `main`; o changelog lista temas, calendário/horários automáticos e consulta de releases upstream.
- O canal dentro do escritório acompanha releases do AIOffice em modo somente leitura. Acesso remoto e instalação automática seguem adiados.
