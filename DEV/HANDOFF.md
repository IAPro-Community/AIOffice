# HANDOFF — AIOffice

## Canal ativo e conexão móvel — 2026-10-13

- A API em `127.0.0.1:4747` ainda é o backend Habblaud `0.10.0`: informa `marmottajr/habblaud` e `v0.11.0`, sem `meta.remoteAccess` ou instalador. Por isso, essa release não é uma atualização do AIOffice e o processo não expõe o estado móvel novo.
- O cliente compilado reconhece atualização somente com `meta.updates.repo === IAPro-Community/AIOffice`; o HTML servido carrega o bundle atual. Se a aba ainda mostrar **Verificar agora** para o Habblaud, force uma recarga com `Ctrl+F5` para trocar a cópia antiga do cliente.
- Para ativar a integração, encerre a instância antiga manualmente e execute `npm run start:office` na raiz deste repositório. A ferramenta bloqueou o encerramento do PID antigo, então ele permaneceu intacto.
- Acesse **Configurações → Acesso pelo celular**. Configure a conta no computador do AIOffice com `npm run remote:setup`, reinicie o servidor gerenciado e conecte o celular pela URL HTTPS privada anunciada (mesma LAN ou VPN privada). Ainda não há usuário, senha, certificado, VPN ou firewall provisionado.

## Atualização do canal de releases — 2026-10-13

- O número/repositório da release do escritório agora vêm do pacote raiz AIOffice quando roda no monorepo; Habblaud standalone continua usando seu próprio `package.json`.
- O verificador em **Sobre** acompanha releases AIOffice exclusivamente. O botão baixa e compila a tag oficial em pasta separada, aplica apenas em instalação Node gerenciada com checkout limpo, preserva artefatos de runtime, reinicia e exige confirmação da versão para retirar a badge.
- A instalação automática fica bloqueada em Docker/dev, supervisor ou opções de Node, checkout com alterações locais ou commits fora da tag oficial, submódulos, dados dentro da raiz ou PTYs ativos. Backups/journal de operações interrompidas ficam preservados para recuperação manual.
- Acesso remoto opcional usa HTTPS autenticado em uma segunda porta, com leitura por padrão e permissões explícitas; cobre Wi-Fi e VPN privada. Streams respeitam logout/expiração. `--new-ca` renova a CA ao adicionar um domínio que ela não cobre; cada dispositivo precisa remover a antiga e instalar a nova. Continua desligado até configuração com `npm run remote:setup`; nenhuma senha, CA, regra de firewall ou VPN foi provisionada.
- A integração Habblaud é seletiva. `npm run check:habblaud-upstream` consulta a release e exibe o diff sem baixar código ou modificar a árvore.
- A comparação até Habblaud `v0.11.0` está registrada em `apps/office-web/upstream-habblaud.json`. Não declarar paridade total: o manifesto lista correções já presentes e recursos adiados.
- Validação desta rodada: root/app typecheck, build, i18n (2.271/2.271 por idioma), `node --check`, ajuda de setup remoto e `git diff --check` passaram. Testes automatizados não foram executados. A simulação `npm run release` não publicou nada e apontou branch fora de `main`, árvore suja e tag local `v2.0.0` existente.
- Ativação pendente: serviço em `127.0.0.1:4747` continuou na versão `0.10.0`; health indicou `pty:false`, 6 sessões Codex e 10 OMP. O processo não tem pai ativo e a ferramenta bloqueou a tentativa de encerrá-lo, portanto não houve encerramento forçado. Para carregar a build, encerre a instância antiga e rode `npm run start:office` na raiz.
- Nenhuma release, credencial/certificado remoto, commit, push ou implantação foi criada.

## Estado atual — 2026-10-13

- A build de cliente está disponível no serviço local; o processo Node ainda serve o backend Habblaud `0.10.0` e não foi reiniciado. A API mais recente retornou 6 sessões Codex, 10 OMP e 0 Claude Code. O terminal OMP mostra atividade e conversa com o selo de provedor correto.
- A conta Claude Code local existe, mas seus dois registros e transcripts são de 22/09/2026 e não têm processo CLI correspondente ativo. O CLI `claude` está instalado na versão 2.1.170. Os processos `claude.exe` em execução pertencem ao Claude Desktop 2.37337.1; também havia uma aba Claude.ai em login.
- O usuário confirmou que a atividade ausente ocorreu em Claude Desktop → Chat/Cowork. A configuração `aioffice` está presente e o processo MCP estava rodando, mas o Habblaud não tinha agente Claude: a bridge só cria atividade quando o modelo chama `aioffice_heartbeat` ou `aioffice_report_activity`.
- MCP no Chat/Cowork não transmite automaticamente cada mensagem ou o transcript para o Habblaud. A bridge disponível é limitada a presença e resumos explícitos; não oferece mensagens de volta nem leitura do histórico.
- A extensão OMP está versionada em `apps/office-web/mod/omp/aioffice-bridge.ts`. Use `npm run omp:install`, `npm run omp:status` e `npm run omp:uninstall` na pasta `apps/office-web` para instalar, conferir e remover a ponte.
- Mensagens para Claude Code e OMP só ficam disponíveis quando a extensão da sessão consulta a caixa de entrada; Codex usa o entregador próprio. O estado `delivered` depende de confirmação do agente.
- Uma sessão OMP que já estava aberta antes da atualização precisa ser reaberta para carregar a extensão. O envio real ainda aguarda confirmação do usuário; nenhum prompt de teste foi enviado nesta preparação da release.
- Fontes de CLI integradas de ponta a ponta: Claude Code, Codex e OMP. Devin, Antigravity, OpenCode, Freebuf e Gemini CLI ainda não têm cobertura completa. Configuração MCP de Desktop Chat/Cowork disponibiliza ferramentas, sem ingestão automática de sessão.
- A build segue emitindo o aviso do bundle principal acima de 500 kB; a divisão de chunks fica como melhoria futura.

## Próxima ação

Reiniciar o servidor MCP do Claude Desktop para carregar a bridge compilada e suas descrições corrigidas. Depois, pedir explicitamente a Claude que registre a conversa no Habblaud e validar presença/atividade. Não declarar captura passiva de Chat/Cowork sem uma API oficial de eventos. Em outra etapa, reabrir uma sessão OMP e validar composer, prompt e ACK `delivered`.

## Atualização — Central de trabalho (2026-10-13)

- Build concluída com Central de trabalho por projeto, fila de atenção, catálogo de integrações/capacidades e seis modelos reutilizáveis em português.
- Busca e filtros distinguem conta de ferramenta; ajuda e histórico mostram a cobertura disponível. O catálogo deixa explícitos os limites do MCP e os adaptadores ainda incompletos.
- A interface compilada foi aberta em uma aba de QA; para vê-la na sua janela, recarregue o Habblaud. O backend em execução não foi reiniciado, então mudanças de rotas/servidor ainda aguardam uma reinicialização segura.
- Nenhuma mensagem ou aprovação foi enviada, e nenhuma sessão foi interrompida. No CLI, o executor do Orquestrador-Maestro agora exige `--maestro-fallback`; o caminho mantém as escritas automáticas dos artefatos de demonstração. O runtime e o broker não foram alterados.

## Atualização — Layout, visibilidade e temas (2026-10-13)

- Preferência visual confirmada: preservar o pixel-art do Habblaud; adicionar variações de cenário e de paleta da interface.
- Quatro paletas disponíveis: Noite (padrão), Mata, Âmbar e Alto contraste. Doze cenários selecionáveis: Original, Natal, Halloween, Jardim, Aurora, Pôr do sol, Ano-Novo, Carnaval, Páscoa, Dia dos Namorados, Festa Junina e Independência; Automático mantém o calendário sazonal.
- Painéis e textos secundários ganharam mais contraste e legibilidade. Os seletores de tema foram reorganizados para desktop/celular, com foco e navegação por teclado. O cabeçalho compacto evita cortar a marca em telas de 320–410 px.
- Cenários novos incluem elementos pixel-art próprios (flores, cristais, sol, folhagem, céu e tapetes), mantendo os sprites e a identidade existentes.
- Typecheck, build, i18n e QA visual passaram. Capturas ficam em `apps/office-web/.frontend-excellence/after/` (diretório ignorado pelo Git).
- Para ver a alteração no Habblaud local, recarregue a página servida em `127.0.0.1:4747`; a build local já foi atualizada. Nenhum backend foi reiniciado e nenhuma sessão ativa foi interrompida.

## Atualização — Automação de temas por datas e horários (2026-10-13)

- No modo Automático, datas comemorativas brasileiras/internacionais têm prioridade e, nos outros dias, quatro faixas locais escolhem o cenário por horário. O calendário está ativado por padrão e pode ser desligado.
- Carnaval (sexta a terça antes da Quaresma) e Páscoa (sexta a domingo) são calculados anualmente; Dia dos Namorados considera 14/02 e 12/06, além de Festa Junina, Independência, Halloween, Natal e Ano-Novo.
- Os horários e cenários de cada faixa são editáveis nas Configurações e ficam salvos no navegador. Entradas inválidas ou fora de ordem são rejeitadas. A agenda usa o fuso do dispositivo; timelapse segue o instante reproduzido.
- Os seis temas de datas comemorativas também podem ser escolhidos diretamente na grade principal e mantidos fixos.
- Cenários de eventos receberam paletas, tapetes, adornos e decoração de janela em pixel-art. QA visual passou em 390/768/1280/1440 px; em 320 px o popover cabe na largura e usa rolagem vertical.
- A build atual está disponível ao recarregar `127.0.0.1:4747`; o servidor não foi reiniciado. Próximo passo seguro: testar com o usuário se desejar outra lista de eventos ou outros horários padrão.
