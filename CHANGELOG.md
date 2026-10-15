# Changelog

All notable changes to AIOffice will be documented in this file.

## [Não lançado]
Nenhuma mudança registrada.

## [v2.4.0] - 2026-10-14

### Adicionado
- Gestão opcional dos CLIs oficiais Codex, Claude Code e OMP pelo app desktop: instalação/atualização no perfil privado do AIOffice, progresso e cancelamento, confirmação explícita e abertura do CLI oficial em terminal interativo para autenticação.
- Integração de sessões e mensagens com Google Antigravity por hook local validado; mensagens só ficam disponíveis após atividade recente do hook aceito pelo servidor.
- Nova identidade visual do AIOffice, com ilustração principal, ícones do aplicativo, favicons, imagem social e metadados atualizados.

### Alterado
- A instalação de CLIs não altera o `PATH` global nem coleta credenciais. Reiniciar o AIOffice para ativar uma instalação é uma ação explícita; consultas e progresso chegam à interface sem recarregar a página.
- Falhas ocorridas durante a carga inicial do processo Electron agora são registradas em `aioffice.log`, antes da criação da janela principal, com uma mensagem de diagnóstico acionável.
- O workflow agora inicia o aplicativo empacotado em cada runner de Windows, macOS e Linux, mantém a release como rascunho durante os uploads, verifica nomes/tamanhos/SHA-256 dos nove assets e só então publica.
- README e documentação explicam downloads por arquitetura, autenticação dos provedores, assinatura dos pacotes e limites de atualização de cada sistema.

## [v2.3.0] - 2026-10-14

### Adicionado
- Instaladores nativos para Windows x64, macOS Intel, macOS Apple silicon e Linux x64: `.exe`, `.dmg`, `.AppImage` e `.deb`.
- Workflow de release com verificação comum e builds em runners nativos. A publicação só acontece após todos os sistemas e a validação do conjunto completo de arquivos.
- Manifestos `latest-mac.yml` e `latest-linux.yml` com hashes SHA-512 e tamanhos para as atualizações nativas.
- Downloads por sistema no README, com links estáveis para a última release publicada e instruções específicas de instalação.
- Integrações de mensagens prontas no desktop instalado: instalação/verificação automática do plugin Claude Code e da extensão OMP, além da descoberta da CLI nativa do Codex para `codex queue`.

### Alterado
- A publicação de uma nova versão usa aliases estáveis separados por plataforma e arquitetura; o README aponta sempre para os assets da última release.
- A barra superior e a Central de trabalho se adaptam a telas estreitas sem criar rolagem horizontal na página; a faixa de indicadores mantém sua própria rolagem.
- O login móvel aceita colar o código de acesso, normaliza letras para maiúsculas e envia automaticamente quando os seis caracteres forem preenchidos.
- A compilação macOS pode ser assinada e notarizada quando os segredos Apple estiverem configurados. Sem eles, os pacotes são unsigned, podem exigir autorização manual do Gatekeeper e não habilitam atualização automática no macOS.
- AppImage Linux recebe manifesto para atualização em background; `.deb` permanece sob gestão do sistema de pacotes. A verificação de atualização do desktop não recarrega a página.
- As CLIs dos provedores continuam independentes: precisam estar instaladas e autenticadas. Não é necessário rodar scripts `npm` no desktop instalado; sessões já abertas podem precisar ser recarregadas ou reabertas. Docker continua usando o auxiliar Codex no host.

## [v2.2.1] - 2026-10-14

### Adicionado
- **Acesso pelo celular com código de uso único:** Quick Tunnel da Cloudflare com ações locais para iniciar/parar, link copiável e QR gerado no navegador. O painel emite um código alfanumérico de seis caracteres, válido por cinco minutos e um login; ele não aparece no link nem no QR. O túnel não inicia automaticamente e `cloudflared` é instalado pelo operador.
- **Gestão de sessões móveis:** o painel local lista navegador/plataforma aproximados, horário de entrada, última atividade e validade; é possível revogar um dispositivo individualmente. Registros são efêmeros, duram até 12 horas e não guardam IP nem User-Agent bruto.
- **Aplicativo desktop Electron:** serviços locais supervisionados, dados em `userData`, migração não destrutiva de configurações legadas e fluxo de atualização estável no Windows. Esta release publica o instalador Windows x64; instaladores macOS/Linux ainda não estão publicados.
- **Orquestrador-Maestro pelo NPM:** instalação e verificação do pacote oficial na inicialização, consulta de versões e atualização iniciada pela pessoa na interface. O Docker prepara a camada central em volume persistente.
- **Pipeline de release desktop:** workflow por tag valida o código e compila o instalador Windows x64, publicando um único asset `AIOffice-Setup.exe`. O SHA-256 do GitHub é validado pelo atualizador. Authenticode é opcional; instalações sem assinatura podem exibir o aviso do SmartScreen.
- Instalação/verificação opcional de `habblaud-mensagens` nas contas Claude Code detectadas, controlada por `HABBLAUD_MENSAGENS`.
- Comando `npm run release` para validar e pré-visualizar as notas antes da publicação explícita.

### Alterado
- O selo e o atualizador acompanham exclusivamente releases de `IAPro-Community/AIOffice`. A atualização gerenciada prepara a tag oficial fora do checkout, preserva dados e runtime, reinicia de forma cooperativa, confirma versão/nonce/PID e tenta rollback em caso de falha.
- Os launchers Windows iniciam o modo normal do servidor gerenciado; o desktop só tenta encerrar processos reconhecidos como AIOffice e respeita sessões interativas ativas.
- README principal reformulado com capturas atuais da interface e uma matriz de downloads que distingue o instalador Windows publicado dos pacotes macOS/Linux ainda indisponíveis. Guias do Habblaud atualizados para o login móvel por código temporário.

### Corrigido
- O handshake do processo Electron agora libera a janela após o health check; falhas de renderer, versão divergente e conflito de porta recebem diagnóstico acionável.
- QR do Quick Tunnel é gerado localmente, sem enviar a URL a um serviço externo. Códigos temporários e sessões são invalidados ao parar o túnel ou reiniciar o servidor.
- **Atividades e linha do tempo do OMP (oh-my-pi):** removida a repetição excessiva de eventos genéricos ("bash", "bash terminou", "read", "read terminou"). As ferramentas do OMP (`bash`, `read`, `write`, `edit`, `glob`, `grep`, `task`, `todo`, `eval`, `web_search`, `ask`) agora são descritas detalhadamente em português com ícones próprios. Chamadas de ferramentas, tokens de entrada/saída, custos e modelo alimentam corretamente as estatísticas e a linha do tempo do agente.
- Registros de sessão e transcripts OMP agora detectam mudanças mesmo quando o sistema de arquivos mantém o mesmo horário de modificação.

### Segurança
- O código de acesso existe em memória somente como hash, não é persistido nem aparece em URL, QR ou logs. Listagem e revogação de sessões aceitam somente acesso local; a lista não armazena IP nem User-Agent bruto.

## [v2.1.0] - 2026-10-13

### Adicionado
- Quatro paletas de interface: Noite, Mata, Âmbar e Alto contraste.
- Doze cenários pixel-art, incluindo Carnaval, Páscoa, Dia dos Namorados, Festa Junina e Independência.
- Temas automáticos por datas comemorativas e quatro faixas de horário local configuráveis; o timelapse acompanha a data e hora reproduzidas.

### Alterado
- A seção **Sobre** acompanha releases oficiais do AIOffice e apresenta instruções sem instalar arquivos automaticamente.

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
- Atualização do cliente e estados do túnel seguem em background; nenhuma recarga total acontece automaticamente. A pessoa recarrega quando quiser para carregar um bundle recém-atualizado.
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

[Não lançado]: https://github.com/IAPro-Community/AIOffice/compare/v2.2.1...HEAD
[v2.2.1]: https://github.com/IAPro-Community/AIOffice/releases/tag/v2.2.1
[v2.1.0]: https://github.com/IAPro-Community/AIOffice/releases/tag/v2.1.0
[v2.0.0]: https://github.com/IAPro-Community/AIOffice/releases/tag/v2.0.0
[v1.1.0]: https://github.com/IAPro-Community/AIOffice/releases/tag/v1.1.0
[v1.0.0-beta]: https://github.com/IAPro-Community/AIOffice/releases/tag/v1.0.0-beta
