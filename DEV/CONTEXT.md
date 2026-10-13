# CONTEXTO — AIOffice

## 1. Visão Geral
O **AIOffice** é uma plataforma integrada de engenharia de software assistida por IA local-first. Ele une cinco iniciativas complementares:
1. **Orquestrador-Maestro** (`IAPro-Community/Orquestrador-Maestro`): protocolo de governança, constituição (`rules.md`, `maestro.md`, `PERSISTENCE.md`), roteamento de skills e ciclo de evidência/handoff.
2. **OpenOrq**: implementação em código TypeScript com broker de escrita (`policy-broker`), proxy de controle RPC B1 (`rpc-proxy`), cofre seguro DPAPI (`credential-store`) e interface Maestro.
3. **Habblaud** (`marmottajr/habblaud`): interface visual de escritório virtual em pixel art retro (web em `localhost:4747`) com salas por projeto, mesas de agentes, animações de status em tempo real, elevador de subagentes e aprovação de permissões com 1 clique.
4. **oh-my-pi (omp)** (`can1357/oh-my-pi`): runtime de execução em terminal de alta velocidade com edições hashline seguras, ferramentas LSP e AST, e subagentes isolados em worktrees git via `task`.
5. **replica-skill** (`Jakeschincariol/replica-skill`): suíte de 11 skills especializadas para engenharia reversa, clonagem e reconstrução de produtos (pesquisa, design system, código, testes, correções e deploy).

## 2. Decisões Arquiteturais Vigentes
- **Topologia de Repositório**: Monorepo unindo aplicações (`apps/`) e pacotes compartilhados (`packages/`).
- **Segurança BYOK**: Chaves mantidas no cofre do SO (DPAPI no Windows) via `credential-store`. Zero proxy de inferência terceiro.
- **Isolamento de Efeitos**: Nenhuma ferramenta escreve no disco sem mediação do `policy-broker` e aprovação humana explícita.
- **Ponte Visual Habblaud**: Desacoplamento da leitura de arquivos do Claude Code; o Habblaud passa a consumir eventos diretos do OpenOrq via API/WebSocket local.
- **Workflow de Clonagem**: Mapeamento das 11 skills do `replica-skill` para papéis de agentes nas mesas do Habblaud.
