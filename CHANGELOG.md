# Changelog

All notable changes to AIOffice will be documented in this file.

## [Não lançado]

### Adicionado
- O selo de versão acompanha exclusivamente releases do AIOffice; o botão baixa e compila a tag oficial em pasta separada, reinicia a instalação gerenciada e confirma a versão antes de limpar o aviso, com preservação de runtime e recuperação em caso de falha.
- Acesso remoto opcional por HTTPS com login, sessão assinada e permissões explícitas, disponível pela rede Wi-Fi local ou por VPN privada; desligado por padrão.
- Comando de mantenedor `npm run release` para validar e simular uma release AIOffice antes da publicação explícita.

## [v2.0.0] - 2026-10-13

### Adicionado
- **Central de trabalho por projeto:** reúne sessões, agentes, estado das tarefas, sinais observados de build/teste e erros recentes.
- **Fila de atenção:** destaca agentes aguardando e erros recentes, com navegação direta para o agente.
- **Catálogo de integrações:** mostra capacidades e limites reais de Claude Code, Codex, OMP, MCP e adaptadores ainda incompletos.
- **Seis modelos de workflow:** investigação de bug, funcionalidade, revisão de código, testes/correções, release e pesquisa; todos permitem revisar e copiar antes de usar.

### Alterado
- **Incompatível — execução pelo CLI:** `npm start -- "..."` agora prepara a decisão e não inicia um executor. `--maestro-fallback` ativa explicitamente o executor Maestro de demonstração como último recurso. Esse caminho grava artefatos e aprova essas escritas automaticamente.
- Busca, filtro e histórico separam melhor a ferramenta da conta. O estado de conexão do servidor não é apresentado como saúde de cada provedor.
- A interface inclui traduções atualizadas em inglês, espanhol e francês.

### Corrigido
- Terminal OMP não apresenta conteúdo de demonstração quando falta um transcript real; responde com erro explícito.
- A chamada do Codex no Windows usa o executável `codex.exe` e argumentos sem montagem de comando shell.
- A bridge MCP só confirma eventos aceitos pelo Habblaud, e o instalador preserva arquivos de configuração inválidos para evitar sobrescrita destrutiva.

### Limites conhecidos
- Claude Desktop Chat/Cowork só reporta atividade por chamadas MCP explícitas. OpenCode, Antigravity, Devin, Freebuf e Gemini CLI ainda não têm integração completa de sessões e mensagens.
- O bundle principal ainda supera 500 kB; dividir os chunks fica para uma versão futura.

## [v1.1.0] - 2026-10-13

### Adicionado
- **Envio de mensagens para sessões do oh-my-pi (OMP).** A ponte global entrega o texto como prompt na sessão ativa e
  só confirma a mensagem depois do ACK do OMP. Instale com `npm --prefix apps/office-web run omp:install`, confira
  com `npm --prefix apps/office-web run omp:status` e remova com `npm --prefix apps/office-web run omp:uninstall`;
  abra uma nova sessão OMP depois de instalar.
- **Leitura completa das conversas OMP.** O terminal e o histórico reconhecem prompts, respostas, raciocínio e chamadas
  e resultados de ferramentas.
- **Identidade OMP nas superfícies do escritório.** Busca, filtro, gaveta, terminal e histórico exibem o provedor
  correto, e as métricas de uso aparecem somente para fontes que fornecem esses dados.

### Alterado
- **Disponibilidade de mensagens baseada na conexão real.** Claude Code e OMP precisam consultar a caixa de entrada;
  Codex precisa do próprio entregador. A interface explica quando a extensão ou a ponte não está conectada.
- **Reconhecimento de salas no Windows.** Variações de maiúsculas, separadores e caminhos equivalentes não criam salas
  duplicadas, sem alterar o caminho original mostrado ao usuário.
- **Cobertura documentada com precisão.** Claude Code, Codex e OMP são as fontes de CLI integradas de ponta a ponta.
  Devin, Antigravity, OpenCode, Freebuf e Gemini CLI ainda não têm integração completa de sessões e mensagens.

### Corrigido
- Mensagens para OMP deixam de ser gravadas apenas no arquivo de conversa, o que não as fazia chegar ao terminal
  interativo. Agora entram pelo fluxo de entrada da sessão e falhas de rede mantêm o ACK pendente para nova tentativa.
- A interface deixa de marcar uma sessão como pronta para receber mensagens antes que o entregador correspondente
  esteja conectado.
- Atividades e chamadas de ferramentas do OMP aparecem corretamente no feed e no terminal, em vez de deixar a
  conversa vazia ou rotular a sessão como Claude Code.

### Segurança
- A ponte OMP comunica-se apenas com o serviço local em `127.0.0.1:4747`; a proteção de acesso local e a configuração
  `HABBLAUD_MENSAGENS` continuam sendo aplicadas pelo servidor.

## [v1.0.0-beta] - 2026-10-13

### Added
- Provider type extended with devin, antigravity, opencode, freebuf (shared/types.ts)
- AgentSource implementations for devin, antigravity, opencode, freebuf
- OMP terminalParser for realtime terminal output
- Statistics weekly/5h window calculation fix in service.ts
- Message routing entries for new providers in registry.ts
- Provider tag display for all 7 providers in UI (provider.ts)
- SKILLS_ROUTER.json updated with provider triggers

### Changed
- ALIAS_TOOLS updated in detect.ts for all new providers
- AgentSource source directories restructured
- Account provider detection logic enhanced
- Fallback short letter generation for all providers
- Provider name and tag rendering consistency

### Fixed
- Statistics weekly percentage display (was showing 16% instead of 80%)
- Provider tag rendering for devin, antigravity, opencode, freebuf
- Message routing for all provider types

### Deprecated
- None

### Removed
- None

### Security
- None

[Não lançado]: https://github.com/IAPro-Community/AIOffice/compare/v2.0.0...HEAD
[v2.0.0]: https://github.com/IAPro-Community/AIOffice/releases/tag/v2.0.0
[v1.1.0]: https://github.com/IAPro-Community/AIOffice/releases/tag/v1.1.0
[v1.0.0-beta]: https://github.com/IAPro-Community/AIOffice/releases/tag/v1.0.0-beta
