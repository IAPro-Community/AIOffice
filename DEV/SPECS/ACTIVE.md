# ESPECIFICAÇÃO ATIVA — AIOffice

## Tema V2 do mapa de escritório — 2026-10-26
- **Status**: implementação concluída; V2 é o padrão e V1 mantém a composição original, selecionável em Configurações → Aparência.
- **Direção**: preservar o estilo pixel art e os sprites existentes. O V2 organiza recepção, copa, lounge e salas de projeto em zonas de uso; os quadros e pôsteres são variantes pixel art derivadas das referências originais.
- **Compatibilidade**: manter lugares, IDs e vínculos de assentos/pontos de interação, com simulação e movimento dos bonequinhos ativos em ambos os temas.
- **Aceite**: diferença de layout visível entre V1 e V2; lounge com espaço entre pingue-pongue e sofá; postos de projeto separados; build e typecheck aprovados.

## 1. Identificação do Projeto
- **Nome**: AIOffice
- **Status**: release estável latest [`v2.4.4`](https://github.com/IAPro-Community/AIOffice/releases/tag/v2.4.4), publicada a partir do commit `6720cc69a7ab34b5b53369e1949bc5c4e4201433`; workflow `38818251334` aprovou verificação, builds Windows/Linux, smokes, cinco assets e digests. A extensão Chrome, Native Messaging host e tutorial foram publicados. macOS permanece sem pacote até assinatura/notarização Apple verificadas; não orientar a contornar o Gatekeeper.
- **Localização**: Repositório AIOffice

## 2. Pilares de Integração
1. **Governança & Raciocínio**: Orquestrador-Maestro (Protocolo e Regras)
2. **Mediação & Segurança**: OpenOrq (`policy-broker`, `rpc-proxy`, `credential-store`)
3. **Superfície Visual**: Habblaud (Web Pixel-Art Office)
4. **Harness de Ferramentas**: oh-my-pi / Pi (Runtime e Subagentes)
5. **Metodologia de Engenharia**: replica-skill (11 Skills Especializadas)

## Release v2.4.4 — extensão Chrome publicada
- A extensão Manifest V3 é instalada separadamente do AIOffice Desktop e, nesta versão, distribuída como ZIP para carregar no Chrome em modo desenvolvedor.
- O instalador Windows registra no HKCU o host `com.iapro.aioffice`, que conecta ao serviço existente ou inicia o Desktop em segundo plano. A extensão comunica ações tipadas; não oferece shell arbitrário.
- Feed por projeto, filtros de projeto/tipo, avatares do AIOffice, terminal da sessão e envio de instruções à fila local. Notificações de todos os tipos vêm habilitadas inicialmente e podem ser configuradas individualmente.
- Critérios aprovados: `npm run desktop:verify`, ZIP validado, smoke Windows/Linux e verificação remota de exatamente cinco assets/digests. Evidências e hashes em `DEV/HANDOFF.md` e `DEV/VERIFY.md`.

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

## 11. Evolução visual do Habblaud (2026-10-13)
- **Direção visual confirmada pelo usuário**: preservar o pixel-art existente e permitir variar tanto os cenários quanto as cores da interface.
- **Paletas da interface**: Noite (padrão), Mata, Âmbar e Alto contraste; a paleta não altera o cenário.
- **Cenários**: doze opções fixas: Original, Natal, Halloween, Jardim, Aurora, Pôr do sol, Ano-Novo, Carnaval, Páscoa, Dia dos Namorados, Festa Junina e Independência; Automático combina calendário e horário.
- **Legibilidade e layout**: painéis mais opacos e textos auxiliares com contraste maior; controles organizados em grades responsivas, com cores amostradas e suporte às setas do teclado. Cabeçalho compacto preserva a marca entre 320 e 410 px.
- **Aceitação visual**: preservar a identidade e os sprites pixel-art, oferecer todos os cenários e paletas, manter os seletores utilizáveis no celular e não introduzir overflow horizontal.
- **Evidência**: typecheck, build, i18n e QA visual em 390/768/1280/1440 px registrados em `DEV/VERIFY.md`.

## 12. Temas automáticos por calendário e horário (2026-10-13)
- **Automático**: datas comemorativas brasileiras/internacionais prevalecem; nos demais dias, quatro faixas horárias escolhem o cenário. Datas e horários usam o fuso local do dispositivo.
- **Calendário**: Carnaval e Páscoa são móveis e calculados a cada ano; datas fixas cobrem Dia dos Namorados (14/02 e 12/06), Festa Junina, Independência, Halloween, Natal e Ano-Novo.
- **Configuração**: ativar/desativar eventos, ajustar o início de amanhecer/dia/fim de tarde/noite e escolher um cenário por faixa. Preferências ficam no navegador; horários precisam permanecer em ordem.
- **Seleção manual**: todos os doze cenários, inclusive os comemorativos, aparecem na grade principal e podem ser fixados. A grade deve manter os nomes legíveis em celulares estreitos.
- **Timelapse**: a programação usa a data/hora reproduzida. A escolha de um cenário fixo continua sobrepondo calendário e programação.
- **Evidência**: typecheck, build, i18n e QA visual em 320–1440 px registrados em `DEV/VERIFY.md`.

## 13. Atualização e acesso remoto do AIOffice (2026-10-13)
- **Versão**: no monorepo, o selo consulta somente `IAPro-Community/AIOffice`; versões do Habblaud upstream são metadados de integração da equipe.
- **Canal seguro na interface**: badge, notificação, botão de verificação e instalação só podem usar updates cujo repositório seja exatamente `IAPro-Community/AIOffice`. A experiência AIOffice não apresenta controles de versão do Habblaud; o upstream permanece como metadado de manutenção.
- **Instalação**: **Baixar e atualizar** prepara a tag AIOffice e as dependências em pasta externa ao checkout. Só instala via Node gerenciado, origem Git oficial, árvore limpa, sem Docker/dev, supervisão extra, submódulos, dados dentro do checkout ou PTYs ativos.
- **Confirmação**: o servidor encerra cooperativamente, o instalador troca código e artefatos de runtime sem `git clean`, reinicia e valida versão + nonce + PID em loopback. O cliente só limpa a badge quando o snapshot ao vivo anuncia a versão alvo.
- **Recuperação**: falha de build ou health check restaura commit e runtime anterior quando possível; backup e journal permanecem para recuperação manual. Nunca encerrar PTYs à força.
- **Acesso móvel vigente — 2026-10-14**: Quick Tunnel Cloudflare, com `cloudflared` instalado e disponível no `PATH` do AIOffice. Link e QR abrem a tela remota; para autenticar, o painel local gera um código alfanumérico aleatório de seis caracteres, válido por cinco minutos e um único login.
- **Credencial temporária**: o código é entregue somente pela API local protegida, fica em memória, não entra no URL/QR, `.env` ou logs, e é descartado após login, parada, falha/fim do túnel ou reinício do servidor. Gerar outro código invalida o anterior. Senhas mestras antigas são removidas do `.env` quando a configuração Quick Tunnel é inicializada.
- **Configuração e ciclo de vida**: Configurações → **Acesso pelo celular** cria a configuração sem senha e inicia o túnel. A interface oferece **Iniciar**, **Parar**, **Copiar link**, QR, geração e cópia do código. O túnel nunca inicia automaticamente ao ligar o servidor; após reiniciar, exige **Iniciar** e um novo código. O CLI legado `remote:setup`/`remote:off` apenas orienta ao painel e não altera credenciais, certificados ou acesso LAN/VPN. **Parar** no painel encerra túnel, códigos e sessões.
- **Inicialização e término do túnel**: o AIOffice espera até dois minutos pelo URL inicial do Quick Tunnel. Não existe encerramento automático por falta de conexão móvel. O túnel termina quando parado no painel, quando o servidor desliga ou se `cloudflared` encerra; saída inesperada registra código/sinal e diagnóstico stderr sanitizado.
- **Timers de sessão**: conexões longas autenticadas revalidam a sessão a cada 10 s para fechar streams de um dispositivo revogado; esse timer não controla nem encerra o Quick Tunnel.
- **Sessões e dispositivos — 2026-10-14**: cada login remoto cria um registro efêmero com ID aleatório opaco, rótulo de navegador/plataforma, horários de login e última atividade e validade de 12 horas. **Configurações → Acesso pelo celular** lista os registros no horário local e permite revogar somente a sessão escolhida. Lista e revogação só aceitam acesso local; o listener público recusa essas rotas. Não armazenar IP, User-Agent bruto ou material de cookie/assinatura. O painel atualiza em background enquanto estiver aberto, com aba visível e túnel ativo; sem reload integral.
- **Verificação de sessões — 2026-10-14**: 24 testes focados, suíte web 1.249 aprovados/10 ignorados, typecheck, i18n 2.369/2.369, bundles isolados cliente/servidor e diff check aprovados. Health observado `ok` na versão instalada `2.1.0`; o túnel ficou `disabled` no fim. Nenhuma reinicialização ou abertura pública foi feita. Para ativar o código novo e validar por dispositivos, iniciar a próxima build normal e iniciar um túnel novo no painel.
- **Identidade de versão**: selo superior e painel **Sobre** só mostram número, badge, novidades ou link de release quando `meta.updates.repo` é exatamente `IAPro-Community/AIOffice`. Os controles de versão Habblaud são removidos da experiência AIOffice.
- **Atualização de estado**: os dados do escritório devem ser atualizados em segundo plano, sem recarga total automática. O banner de cliente novo só recarrega após clique explícito do usuário.
- **Safe Browsing**: classificar o campo como código de uso único reduz confusão com senhas salvas, mas não altera nem contorna a reputação do hostname `trycloudflare.com`. Se Chrome mostrar **Perigoso**, não prossiga nem informe o código.
- **Aceitação operacional pendente**: build e reinício normal confirmados; health respondeu `ok` e o túnel permaneceu desligado, sem início automático. Geração/cópia do novo código, login pelo celular, expiração/uso único, parada e invalidação de sessões via túnel real continuam pendentes. Os registros anteriores de LAN/VPN/usuário/CA permanecem apenas como histórico em handoff, worklog e verify.
- **Gates**: build raiz, typecheck do app, i18n (2.353 por idioma), `git diff --check` e 10 testes focados aprovados. QA visual ao vivo e operação real do Quick Tunnel continuam pendentes; o bundle principal do Vite ainda supera o limite de aviso de 500 kB.

## 14. Aplicativo Desktop (2026-10-14)
- Electron inicia um utility process supervisionado para hospedar o servidor real do Habblaud e só abre a janela depois de confirmar health e a versão local correta.
- Renderer mantém `contextIsolation`, sandbox, `webSecurity` e `nodeIntegration: false`; o preload limita IPC e navegação remota abre somente URLs permitidas no navegador do SO.
- Estado Habblaud, `.env`, TLS e logs vivem em `userData`; migração inicial copia sem mover/sobrescrever `.habblaud`, `.codetown` ou arquivos de configuração encontrados. CLIs externas continuam separadas; runtime Node vem com Electron.
- Antes de abrir a janela, detectar conflito na porta; pedir shutdown autenticado a serviços reconhecidos do AIOffice e usar sinal somente no PID identificado como AIOffice quando necessário. Respeitar recusa por sessões interativas quando oferecida pelo protocolo; identificar outros donos e mostrar diagnóstico acionável. Não adicionar reload integral ou refresh periódico.
- **Causa de janela ausente**: o pai recebia o payload do evento `UtilityProcess` diretamente, mas o código lia `event.data`, deixando o desktop esperando o handshake mesmo com o servidor saudável. A trava de instância única escondia as próximas tentativas.
- **Correção e aceite**: validar o payload direto, registrar handshake/janela, reportar falha de renderer ou versão incompatível, recuperar a janela numa segunda abertura e iniciar a checagem PowerShell da porta sem mostrar console. O executável empacotado confirmou health em `4747` e abriu janela com HWND válido; nenhum reload integral periódico foi adicionado.
- O setup `AIOffice-Setup.exe` da release existente `v2.1.0` foi substituído por esse build. Hash/tamanho e conteúdo ASAR foram conferidos. Para a instalação imediata, usar o link direto registrado em `DEV/HANDOFF.md`; o alias `latest/download` ainda respondeu com asset antigo em cache durante esta verificação.
- Testes automatizados não foram executados; Authenticode continua `NotSigned`. O build NSIS padrão falhou com `EPERM` na pasta existente, mas o empacotamento foi concluído em saída limpa.
- NSIS `.exe`, macOS `.dmg`/`.zip`, Linux `.AppImage`/`.deb`; o Windows consulta a API da release estável e valida o digest GitHub do instalador único. `electron-updater` nativo permanece para builds macOS assinadas e Linux AppImage. `.deb` orienta atualização manual pelo sistema.
- O workflow tag-gated atual publica apenas Windows x64 com asset `AIOffice-Setup.exe`; Authenticode é opcional. macOS/Linux aguardam runners e artefatos verificados.
- Validação obrigatória: `npm run desktop:verify`, pacote Windows local e `git diff --check`; macOS/Linux dependem da execução real nos runners correspondentes. Atualizações reais só após publicação.
- Detalhes operacionais em `DEV/DESKTOP.md`; atualizar este contrato com os resultados após validar.

## 15. Orquestrador-Maestro obrigatório pelo NPM (2026-10-14)
- **Pacote oficial**: instalar somente `@iapro/orquestrador-maestro-cli` e validar `name`, `version`, `repository` e o binário antes da execução. Não aceitar alias, fork ou pacote com repositório diferente.
- **Escopo da instalação**: usar `install/update/verify --core-only --home-path <perfil>` para preparar a camada compartilhada `.orquestrador`; não instalar perfis de ferramentas de IA como efeito colateral.
- **Pré-requisito**: `npm run setup` instala a última versão `latest`; toda inicialização do servidor confirma pacote e arquivos centrais e corrige/instala se necessário. Se NPM, pacote oficial ou verificação falhar, o servidor não inicia e explica o erro.
- **Atualização**: status mostra versão instalada e versão `latest` consultada no NPM, com verificação periódica de seis horas e ação manual. A instalação de atualização só começa pelo botão local; resultado é transmitido via snapshot/SSE sem recarga nem reinício do AIOffice.
- **Desktop**: incluir CLI NPM e todas as dependências de runtime em `resources/npm`, usar `ELECTRON_RUN_AS_NODE` nos processos filhos quando aplicável e guardar prefixo/cache NPM no userData para não exigir permissão administrativa. O perfil Maestro continua sendo o perfil do usuário.
- **Docker**: compilar/semear a camada central na imagem e manter prefixo/cache/home em volume gravável persistente `/maestro`; atualizações do Maestro podem então funcionar com rootfs read-only.
- **MCP**: `aioffice_get_context` exige a camada instalada e devolve rules, maestro, persistence e contexto ativo do projeto.
- **Separação**: a release do AIOffice continua no updater GitHub existente; a versão do Maestro é independente e vem do NPM. Nenhum desses fluxos deve causar recarga da página ao atualizar somente o Maestro.
- **Gates**: root/app typecheck, builds root e desktop quando disponível, `i18n:check`, validação de sintaxe e `git diff --check`; testes só quando solicitados.

## 16. Launcher normal, QR e hostname Cloudflare (2026-10-14)
- `start-aioffice.bat` compila e sobe `npm run start:office`; ele se recusa a assumir 4747 ocupada e nunca encerra processos Node. O alias `.bat` legado e o atalho PowerShell também seguem esse modo normal.
- O QR do Quick Tunnel é gerado localmente no navegador, acompanha a URL ativa e some quando o túnel para; não há requisição a um gerador externo nem reload de página.
- O Quick Tunnel anuncia hostname temporário `trycloudflare.com`. A aplicação informa que ela não pode remover uma classificação Safe Browsing; se o Chrome disser **Perigoso**, não informe o código. Uso estável requer um domínio próprio configurado no Cloudflare, sem garantia de alterar classificações já existentes.
- A instância antiga em dev deve ser fechada manualmente antes de iniciar o launcher. A instalação atual continua com alterações locais; o updater oficial do AIOffice não instalará sobre essa árvore suja.

## 16. Instalação automática de mensagens do Claude Code (2026-10-14)
- Com `HABBLAUD_MENSAGENS` habilitado, o servidor local e `npm run docker:up` instalam/verificam `habblaud-mensagens` nas contas Claude Code detectadas.
- A automação instala somente esse plugin; o mod Habblaud e o plugin de permissões continuam sob o comando manual `npm run mod:install`.
- O instalador usa `HABBLAUD_CLAUDE_BIN`, a instalação nativa em `~/.local/bin` ou o `claude` no `PATH`; exige Claude Code 2.1.287 ou mais novo e não bloqueia o boot quando falha.
- Sessões já abertas precisam de `/reload-plugins` após a primeira instalação. `HABBLAUD_MENSAGENS=0` desliga a entrega e evita a instalação automática.
- **Aceitação**: instalação manual verificada na conta local; typecheck/build/i18n e `git diff --check` registrados em `DEV/VERIFY.md`. Testes automatizados não foram solicitados.

## 17. Release AIOffice v2.2.1 — publicada em 2026-10-14
- **Escopo**: publicado o conjunto completo de mudanças de acesso móvel e sessões, desktop Electron, atualização do Orquestrador-Maestro, launchers, atividades OMP e correções de detecção de arquivos no Windows.
- **Fonte/tag**: `v2.2.1` foi criada a partir do commit `3ac5d2e` em `main`; changelog, `package.json` e lock usam `2.2.1`. A tag `v2.2.0` permanece sem release após duas falhas do workflow e não deve ser movida.
- **Gates**: `npm run desktop:verify` passou localmente; Actions `38620115438` passou em 2m46s após repetir as verificações no runner Windows. Dry-run e `git diff --check` passaram antes da publicação.
- **Distribuição**: [release v2.2.1](https://github.com/IAPro-Community/AIOffice/releases/tag/v2.2.1) contém somente `AIOffice-Setup.exe`, Windows x64, 118.890.375 bytes, SHA-256 `ad5fbb76669fab9c0dfca69da2a98d9b6c0f10a84df53f4a549f0483f7f87ee3`. Authenticode não configurado; macOS/Linux sem artefatos publicados. A instalação `2.1.0` exige upgrade manual único.
- **Compatibilidade**: não há migração de banco nesta versão. O desktop copia configurações/dados legados para `userData` somente quando o destino não existe; falhas de update mantêm a versão ativa e preservam os dados.

## 18. Diagnóstico inicial da atualização automática — 2026-10-14 (estado anterior à implementação abaixo)
- **Observado**: a aplicação instalada é `2.1.0`, a mesma versão da release estável mais recente no GitHub.
- **Verificação da UI**: o desktop sempre passa `HABBLAUD_UPDATE_CHECK=0` ao servidor embutido, deixando a verificação da seção Sobre em `off`.
- **Instalação nativa**: a versão local do updater habilita Windows apenas para builds com assinatura Authenticode/publisher. O executável instalado não está assinado e a release tem somente `AIOffice-Setup.exe`, sem manifesto `latest.yml` ou blockmap.
- **Fonte de release**: o `origin/main` mais recente é `01e59b3`/`v2.1.0` e não contém o app desktop nem workflow de release; esses arquivos estão na árvore local candidata `2.2.0`, ainda sem publicação.
- **Aceitação para habilitar**: integrar a fonte/workflow no `main`, provisionar signing via GitHub secrets/variables, publicar release estável posterior com metadados do updater, e verificar a detecção/instalação sem recarregar a página inteira. A listagem no escopo do repositório não mostrou configuração de assinatura; secrets de organização não foram inspecionados. Não habilitar instalação unsigned como atalho.
- **Evidência**: `DEV/DESKTOP.md` e `DEV/VERIFY.md`; nenhuma publicação foi feita nesta etapa.

## 19. Atualizador Windows via digest da release — 2026-10-14
- **Descoberta**: `HABBLAUD_UPDATE_CHECK=0` desliga apenas o checker web/Node, que não pode instalar um pacote Electron. O `electron-updater` também não serve para a release Windows unsigned existente, que não tem manifesto `latest.yml`.
- **Implementação candidata**: o processo principal consulta a API oficial do GitHub no início e a cada seis horas, valida release estável/tag/asset único e só baixa `AIOffice-Setup.exe` da tag específica. Exige o digest `sha256:` retornado pela API, confere tamanho, final de redirecionamento e hash antes de manter/executar o arquivo.
- **UX e comportamento**: status do atualizador chega ao painel **Sobre** via IPC. A checagem ocorre em background sem refresh da página; download, abertura do instalador e fechamento/reinício do app exigem confirmação.
- **Workflow**: workflow local tag-gated para Windows x64 publica somente um asset `AIOffice-Setup.exe`. Authenticode pode ser configurado, mas a checagem do digest não depende de certificado; SmartScreen ainda pode mostrar aviso em binário unsigned.
- **Limite do bootstrap**: release pública e instalação atual são `2.1.0`, mesma versão. O executável existente não contém o novo código; ele requer uma instalação manual única de uma versão publicada posterior. `v2.2.0`, fonte desktop e workflow não estão no GitHub.
- **Validação local**: root/app typecheck, build, i18n, sintaxe desktop, presença dos arquivos no ASAR, parse do workflow YAML e `git diff --check` passaram. NSIS local é `2.2.0` sem Authenticode. Suítes automatizadas não foram executadas nesta rodada.
- **Operação pendente**: Actions não foram executadas e não há release `v2.2.0` publicada. O instalador `2.1.0` instalado requer bootstrap manual; detecção/download/instalação contra uma release posterior continuam pendentes de revisão humana, tag e smoke test.
