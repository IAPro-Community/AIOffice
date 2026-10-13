# Changelog

All notable changes to AIOffice will be documented in this file.

## [Não lançado]

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

[Não lançado]: https://github.com/IAPro-Community/AIOffice/compare/v1.1.0...HEAD
[v1.1.0]: https://github.com/IAPro-Community/AIOffice/releases/tag/v1.1.0
[v1.0.0-beta]: https://github.com/IAPro-Community/AIOffice/releases/tag/v1.0.0-beta
