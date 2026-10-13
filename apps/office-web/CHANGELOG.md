# Novidades

O que entrou em cada versão do Habblaud. Cada versão tem a sua seção aqui, e o texto dela vira as notas da
[release no GitHub](https://github.com/marmottajr/habblaud/releases) (`npm run release`), que o Habblaud abre em
**Configurações › Sobre › Ver o que mudou**.

O formato segue o [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/), e os números seguem o
[versionamento semântico](https://semver.org/lang/pt-BR/): correção sobe o último número (0.2.**1**), novidade sobe o
do meio (0.**3**.0).

## [Não lançado]

### Corrigido

- No timelapse, os avisos do canto ficam acima da barra de reprodução, em vez de cobrir a linha do tempo e os botões.
- Com muitas contas ou a janela estreita, os cartões de uso vão para uma segunda linha da barra superior, em vez de
  cobrir os botões da direita (zoom, Meu dia, Configurações, Ajuda).
- No celular estreito (até uns 414 px), a barra superior não corta mais o logo e o botão do painel lateral: os
  contadores descem para a linha dos cartões de uso.
- "Meu dia" no celular: o seletor Demonstração | Dados reais não sai mais da tela (em francês, nem a 390 px).
- Dois pedidos de permissão do mesmo agente no mesmo instante: o detalhe do mais novo não diz mais que há outro
  pedido esperando atrás dele.
- "Meu dia": o limite de 1.000 esperas por dia vale também quando todas estão abertas (antes a lista e o arquivo do
  dia cresciam sem teto).
- Um arquivo de conversa reescrito no mesmo lugar (em vez de só crescer) volta a ser lido do começo; antes o
  conteúdo novo era ignorado ou lido a partir do meio.

## [0.10.0] - 2026-10-13

Para atualizar: `git pull` e `npm run docker:up`. A interface segue o idioma do navegador (ou Configurações › Idioma).
Os textos que o servidor monta continuam em português; para outro idioma, defina `HABBLAUD_LANG` (`en`, `es` ou `fr`)
no `.env` antes do `docker:up`. Em outubro, o tema automático já deixa o escritório no clima de Halloween; para o
visual de sempre, escolha **Nenhum** em Configurações › Aparência.

### Adicionado

- **Temas do escritório** em Configurações › Aparência: decoração em pixel art (árvores com presentes, guirlandas e
  neve nas janelas no Natal; abóboras, fantasmas, teias e morcegos no Halloween), luzes, tapetes e acessórios nos
  personagens. **Automático**, o padrão, segue o calendário: Halloween de 1º a 31 de outubro e Natal de 1º de
  novembro a 26 de dezembro (no resto do ano, o visual de sempre). **Nenhum** deixa o visual de sempre o ano todo, e
  **Natal** e **Halloween** fixam um tema. A escolha fica salva no navegador.
- **Interface em inglês, espanhol e francês.** Os textos passam por `tr()` (`shared/i18n.ts`), com o português como
  língua de origem: um texto sem tradução continua em PT. A interface segue o navegador e pode ser fixada em
  **Configurações › Idioma**. Os textos montados pelo servidor (atividades, avisos, terminal, logs e scripts de
  instalação) seguem `HABBLAUD_LANG` (`pt-BR`, `en`, `es` ou `fr`) e, sem ele, o idioma do sistema, menos o inglês
  (muita máquina e todo container vêm em inglês por padrão): para o servidor em inglês, `HABBLAUD_LANG=en`.
  `npm run i18n:check` lista os textos ainda sem tradução. O francês veio da comunidade (#67).
- **README em inglês**, com versões em português (`README.pt-BR.md`), espanhol e francês, e a linha de idiomas no
  topo de cada um.

## [0.9.0] - 2026-10-13

Para atualizar: `git pull` e `npm run docker:up`. O terminal interativo vem desligado e só funciona fora do Docker:
`npm install`, `npm run build` e `HABBLAUD_PTY=1 npm start` (leia antes o aviso em "Privacidade e segurança" no
README).

### Adicionado

- **Terminal interativo (opt-in, `HABBLAUD_PTY=1`):** o Claude Code de verdade numa janela do escritório, com abas para
  os agentes do mesmo projeto. **Nova sessão** abre um Claude Code na pasta da sala; **Assumir daqui** encerra a sessão
  aberta noutro terminal e continua a mesma conversa aqui (`claude --resume`); **Encerrar** e o X das abas fecham a
  sessão, aqui ou noutro terminal. Só para sessões do Claude Code (nem Codex nem demo). Antes de encerrar um processo de
  fora, o Habblaud confere que o PID ainda é aquele Claude Code. Usa `node-pty` e `@xterm/headless` (dependências
  opcionais); a tela volta inteira ao reconectar ou trocar de aba, com os modos que o Claude ligou. Ao iniciar, abre
  um terminal de teste: se o `node-pty` ou o `claude` não funcionarem, o recurso fica desligado, com o motivo no log
  (no macOS, antes ele corrige a permissão de execução que falta no `spawn-helper` do `node-pty` 1.1.0).
- **Abas e atalho do terminal:** a janela de terminal ganhou abas com os agentes principais do mesmo projeto (com o
  começo do que cada um faz), e a lista lateral, um atalho ao lado de cada agente que abre o terminal dele. Com um
  terminal aberto, clicar noutro agente da lista troca a janela para o dele. Valem também para o terminal ao vivo, com
  o interativo desligado.

### Corrigido

- Mensagem mandada pelo escritório não vai mais para a conversa errada: se o agente trocar de conversa (`/clear`,
  `/resume` ou outro thread no Codex) antes de buscá-la, ela falha com o motivo em vez de entrar na conversa nova.
- As tarefas antigas e seus estados são preservados ao recuperar sessões com histórico longo que ganharam novas tarefas.
- O detalhe da atividade não mostra mais o segredo de webhooks (Slack, Discord e Telegram) nem de tokens `npm_` e
  `hf_` colados num comando.
- Mensagens ao Codex no Docker agora são entregues uma por vez por sessão e confirmadas individualmente, reduzindo
  falhas prematuras e reenvios duplicados.
- Listas de tarefas malformadas do Claude Code não interrompem a leitura; o escritório preserva as demais atividades
  do mesmo lote, inclusive nos subagentes.
- Uma imagem do Codex gravada no Windows (disco `C:` ou pasta de rede `\\servidor\...`) aparecia com o caminho
  errado na atividade e no terminal (`/C:/...`, ou a pasta sem o servidor). Agora o caminho é o do arquivo de origem.
- Salvar um personagem ou voltar ao sorteio não fecha mais outra edição aberta enquanto a resposta chega, nem mostra
  nela um erro da edição anterior.
- Uma linha enorme numa conversa, ou uma linha que nunca fechava, ficava inteira na memória e a leitura
  ia ficando mais lenta. Uma linha acima de 8 MB agora é ignorada, e o Habblaud segue na linha seguinte.
- Sessões do Codex revertidas passam a mostrar o turno atual no escritório e no terminal, mesmo quando o arquivo da
  conversa anterior continua no disco.
- No timelapse, a linha do tempo do agente deixa de mostrar o que aconteceu depois do momento reproduzido quando se
  volta no tempo. Uma resposta de histórico que ainda estava a caminho também não entra durante o replay.
- No timelapse, os tempos dos painéis acompanham a reprodução e ficam parados ao pausar, junto com o escritório e o
  selo do replay.
- O feed pausado guarda só os 50 eventos mais recentes e libera os dados de sessões antigas, mantendo a contagem de
  novidades.
- No timelapse, as setas no controle de velocidade passam a trocar a velocidade, em vez de mover a câmera do escritório.
- O escritório evita conexões ao vivo duplicadas e libera os recursos de rede e fontes ao ser fechado.
- `usage:install`, `hooks:install`, `mod:install` e `codex:install` param quando o arquivo de configuração muda
  no meio da instalação, em vez de apagar essa edição (ela também sumia do backup). Rode o comando de novo; o
  backup passa a ser o arquivo que foi substituído.

## [0.8.0] - 2026-10-09

Para atualizar: `git pull` e `npm run docker:up`. Renomear salas e editar o personagem funcionam só pelo próprio
computador (a mesma trava do terminal). Os nomes das salas ficam em `rooms.json` e os personagens em `names.json`, na
pasta de dados do Habblaud; voltar para a 0.7 faz os personagens escolhidos sumirem na primeira gravação.

### Adicionado

- A lista lateral e a dica do personagem mostram o título da sessão (nos subagentes, a tarefa) embaixo do nome. Na
  lista, o agente principal parado há 1 minuto ou mais mostra **ocioso 12 min** no lugar de "Principal"; na dica, o
  estado vem com há quanto tempo ele está assim (**há 12 min**).
- **Janelas móveis:** o terminal e a gaveta do agente se soltam do lugar arrastando pela barra, mudam de tamanho por
  qualquer borda ou quina e voltam ao lugar com um duplo clique na barra. O terminal ganha o botão **Expandir na tela
  toda**. Posição e tamanho ficam guardados no navegador; em tela estreita tudo continua fixo. Solta, a gaveta deixa de
  reservar a lateral do escritório.
- **Reordenar a lista lateral:** arrastar a linha de um agente principal muda a ordem dos agentes da sala, e arrastar
  o cabeçalho de uma sala muda a ordem das salas (no prédio elas ficam onde estão). A ordem fica guardada no
  navegador; a dos agentes vai pela sessão do Claude Code e sobrevive a retomar a sessão.
- **Renomear sala:** botão direito numa sala (na lista lateral ou no escritório) abre um campo para dar outro nome a
  ela; vazio volta ao nome da pasta. O nome fica no servidor (`rooms.json`, na pasta de dados do Habblaud), por pasta:
  vale em qualquer navegador e sobrevive a reinícios. Na gaveta da sala, um lápis ao lado do nome abre o mesmo campo.
  Só pelo próprio computador; as salas de demonstração não mudam.
- **Editar o personagem de um projeto.** Nos detalhes do agente principal, o lápis ao lado do nome abre um editor
  com o nome, **Sortear** e as peças (pele, cabelo, barba, olhos, roupa, sapatos e acessório), com prévia. A escolha
  vale para o projeto: a próxima sessão na mesma sala chega com o mesmo personagem, e **Voltar ao sorteio** desfaz.
  Só funciona pelo próprio computador, como o terminal.

### Alterado

- A linha do tempo do agente mostra os 15 itens mais recentes, com **Mostrar mais** (mais 15 a cada clique, até
  os 200 guardados) e **Mostrar menos** (volta aos 15). Antes eram 80 de uma vez.

### Corrigido

- No Windows, as mensagens ao Codex procuravam `codex` no PATH e achavam o script que o npm instala ao lado do
  executável: o Habblaud dizia que as mensagens estavam ligadas, mas cada entrega falhava, porque o script não roda
  sem shell. Agora a busca é pelo `codex.exe`. Com o Codex instalado só pelo npm, aponte `HABBLAUD_CODEX_BIN` para um
  `codex.exe`.
- No Windows, o comando de statusline que já existia antes do `npm run usage:install` (o Habblaud o guarda e
  continua rodando) era executado pelo `cmd.exe`, e o que funcionava no Claude Code (aspas simples, variáveis, pipes)
  quebrava. Agora ele roda no Git Bash, como no Claude Code: o de `CLAUDE_CODE_GIT_BASH_PATH` ou o da instalação do
  Git. Sem o Git Bash, continua no `cmd.exe`.
- No Windows, os instaladores (`usage:install`, `hooks:install`, `codex:install` e `mod:install`) mostravam os
  caminhos da pasta do usuário por inteiro (`C:\Users\...`) em vez de `~/...`.
- A suíte de testes (`npm test`) passa no Windows: os testes que supunham caminhos, shell ou permissões do Linux e do
  macOS agora valem nos três sistemas, e os poucos que dependem de algo que o Windows não tem são pulados nele.

## [0.7.0] - 2026-10-09

Para atualizar: `git pull` e `npm run docker:up` (o Codex aparece sozinho, se houver uma pasta `~/.codex`). Para ver o
Codex ao vivo e aprovar pelo escritório: `npm run codex:install` e aprove os hooks do Habblaud em `/hooks` no Codex
(reinicie o Codex antes, se ele estava aberto). Com o Habblaud no Docker, para mandar mensagens ao Codex deixe
`npm run codex:bridge` rodando no Mac.

### Adicionado

- **Codex no escritório.** As sessões do Codex da OpenAI (a CLI `codex` e o app) entram no escritório como as do
  Claude Code: cada projeto é uma sala (a mesma do Claude Code, quando os dois estão no mesmo projeto), cada sessão um
  personagem com o selo **CODEX**, com atividade, subagentes, terminal, histórico, uso de 5 horas e semanal (com a
  idade dos números e "sem cota" quando acabam os créditos) e o Meu dia (só tokens: o Codex não informa custo). Sem
  instalar nada, o Habblaud lê os arquivos do Codex (`~/.codex`, `CODEX_HOME` ou `~/.codex*`; `HABBLAUD_CODEX_DIRS`
  escolhe as pastas e `HABBLAUD_CODEX=0` desliga). Uma sessão entra com a primeira mensagem, que é quando o Codex diz
  a pasta do projeto (uma CLI aberta e ainda sem conversa não aparece). No Docker, só `sessions/`,
  `archived_sessions/` e `thread-writer-locks/` são montadas, somente leitura.
- **Codex ao vivo e aprovar pelo escritório:** `npm run codex:install` acrescenta os hooks do Habblaud no
  `~/.codex/hooks.json` (com backup; os hooks de outros apps ficam no mesmo lugar) e, depois de aprová-los em `/hooks`
  no Codex, a atividade é a de agora (e não só quando cada passo termina) e os pedidos de aprovação esperam a sua resposta no
  escritório por até 25 s (`-- --espera <s>`) antes de irem ao terminal. `codex:status` confere e `codex:uninstall`
  tira.
- **Mensagens ao Codex** pela mesma caixa **Mandar mensagem**, via `codex queue` (entram quando a sessão termina o que
  está fazendo). No Docker, deixe `npm run codex:bridge` rodando no Mac.

### Alterado

- Uma pasta do Codex nunca vira conta do Claude Code, nem listada em `HABBLAUD_CLAUDE_DIRS` ou `CLAUDE_CONFIG_DIR`; o
  servidor e o `docker:up` avisam.
- Com quatro contas ou mais, os cartões de uso do topo ficam mais estreitos e os botões de zoom somem até 1700 px de
  largura, para não invadir os botões da direita.

## [0.6.0] - 2026-10-09

Para atualizar: `git pull`, `npm run docker:up` e `npm run mod:install` (traz o plugin de permissões novo e o de
mensagens); nas sessões já abertas, `/reload-plugins`.

### Adicionado

- **Responder as perguntas do agente pelo escritório.** Quando o agente faz uma pergunta (`AskUserQuestion`), o cartão
  de perguntas mostra cada uma com as opções e as descrições: escolha uma (ou várias, quando a pergunta deixa),
  escreva a sua em "Outro" ou recuse. Como nas permissões, o diálogo continua no terminal e vale o que você responder
  primeiro; a tecla `P` e o contador "precisam de você" também levam às perguntas. Precisa do plugin
  `habblaud-permissoes` desta versão.
- **Mandar mensagens aos agentes pelo escritório.** Os detalhes de cada agente principal ganham a seção "Mandar
  mensagem": o texto entra na sessão como se você tivesse digitado no terminal dela (com o agente ocupado, entra
  quando ele terminar o turno), e a caixa mostra se a mensagem está na fila, foi entregue ou não. Vem de um plugin
  novo, `habblaud-mensagens` (Claude Code 2.1.287+), instalado pelo `npm run mod:install` (`-- --sem-mensagens` deixa
  de fora); o `npm run docker:up` não o instala sozinho, só avisa. Segue a trava do terminal (só acesso local) e
  `HABBLAUD_MENSAGENS=0` desliga. Leia o aviso em "Privacidade e segurança" no README: qualquer programa desta máquina
  consegue mandar mensagem às sessões que têm o plugin.

### Alterado

- **O terminal (tecla `T`) aceita digitação.** Deixou de ser "somente leitura": nos agentes principais, o rodapé
  virou a caixa de mensagem (`Enter` manda, `Shift+Enter` quebra a linha). Subagentes e sessões do histórico continuam
  só para ler.
- `npm run mod:install`, `mod:status` e `mod:uninstall` cuidam também do plugin `habblaud-mensagens`, e o
  `mod:status` diz se o Habblaud está com as mensagens ligadas.

## [0.5.0] - 2026-10-09

### Adicionado

- O cartão "Precisa de você" mostra as perguntas do `AskUserQuestion` completas, com as opções e as descrições
  (até 4 perguntas, com 6 opções cada). É só para ler: a resposta continua sendo dada no Claude Code.
- Verificação automática no GitHub (Actions): a cada push na `main` e a cada pull request, o projeto roda
  `typecheck`, testes e build no Node 22.12, a versão mínima que o `package.json` declara.

### Corrigido

- Quando um arquivo de transcript era apagado e outro, maior, era criado no lugar, o Habblaud podia não perceber a
  troca: alguns sistemas de arquivos reaproveitam o número (inode) do arquivo apagado, e só o inode era comparado.
  Agora também contam o momento de criação do arquivo (quando o sistema o informa) e o começo dele, e a leitura
  recomeça do início do arquivo novo.
- No Windows, com o Node 23 até o 24.19, o hook do plugin `habblaud-permissoes` caía ao sair (código 0xC0000409,
  um bug do Node: nodejs/node#56645) logo depois de receber a resposta do escritório. A decisão chegava antes da
  queda, mas sem decisão (como em "Responder no terminal") a sessão podia registrar um erro do hook. Agora o hook
  sai sem cair.
- O `npm install` alterava o `package-lock.json` (o do repositório estava desatualizado em relação ao
  `package.json`), e por isso o `git pull` da versão seguinte parava com "Your local changes … would be
  overwritten". Agora o arquivo fica igual. Quem já tem a alteração roda uma vez `git checkout -- package-lock.json`
  antes do `git pull`.
- No Windows, o mod não gravava o uso de 5 horas e semanal quando o `HOME` não estava definido (o normal fora do Git
  Bash): agora usa o `USERPROFILE`. E um `CLAUDE_CONFIG_DIR` com `\` (ex.: `C:\Users\voce\.claude-conta2`) virava um
  nome de arquivo inválido; agora dá a mesma conta, inclusive com o Habblaud no Docker.

## [0.4.0] - 2026-10-08

### Alterado

- **O CodeTown agora se chama Habblaud.** O nome muda em toda parte: interface, logotipo, placa da recepção, totem da
  entrada, prévia de link, repositório (`github.com/marmottajr/habblaud`), marketplace e plugins do Claude Code
  (`habblaud` e `habblaud-permissoes`, com o comando `/habblaud`), variáveis de ambiente (`HABBLAUD_*`), pasta de
  estado (`~/.habblaud`) e Docker (container e imagem `habblaud`, volume `habblaud-data`).
- Para quem vem do CodeTown: rode `npm run mod:install` uma vez (troca o marketplace e os plugins antigos pelos novos
  em cada conta) e `npm run docker:up` (tira o container antigo e copia os nomes, a linha do tempo e as estatísticas
  do volume `codetown_codetown-data` para o novo, sem apagar o antigo). A pasta `~/.codetown` e as preferências e
  moedinhas guardadas no navegador passam para os nomes novos sozinhas. As variáveis `CODETOWN_*` não valem mais:
  renomeie para `HABBLAUD_*` no `.env` (o servidor e o `docker:up` avisam). Detalhes no README, em
  "Vindo do CodeTown".

## [0.3.2] - 2026-10-08

### Corrigido

- Quando um terminal fechava e a sala dele era desmontada, ficava um jardim no meio do prédio, entre salas. Agora a
  sala mais distante se muda para a vaga: é montada lá, ainda apagada; o primeiro a chegar acende a luz e cada um
  volta para a mesma mesa. O endereço antigo apaga e é desmontado, e o prédio encolhe. Uma sala que abre ocupa a
  primeira vaga livre, e a carga inicial já vem sem buracos.
- Quem estava a caminho de algo que deixou de existir, como o bebedouro de uma coluna do corredor que sumiu quando o
  prédio encolheu, era teletransportado. Agora muda de plano e segue andando.

## [0.3.1] - 2026-10-08

### Corrigido

- Quem cochilava na mesa (ocioso há mais de 10 minutos) e levantava para uma roda, uma festa ou um passeio saía
  andando com o "zzz" na cabeça. Agora o "zzz" só aparece enquanto o personagem dorme.

## [0.3.0] - 2026-10-08

### Adicionado

- **Mod do Habblaud para o Claude Code** (2.1.287 ou mais novo): `npm run mod:install` instala, em cada conta, o
  marketplace desta pasta com o mod `habblaud` (uso de 5 horas e semanal ao vivo, uma linha no terminal quando outra
  sessão precisa de você e o comando `/habblaud`) e o plugin `habblaud-permissoes` (responder permissões pelo
  escritório; `-- --sem-permissoes` deixa de fora). `npm run mod:status` mostra o que cada conta tem e
  `npm run mod:uninstall` tira tudo. O `npm run docker:up` atualiza o mod de quem já instalou.

### Mudado

- O tap de statusline (`npm run usage:install`) e o hook de permissão (`npm run hooks:install`) viram o jeito antigo,
  para o Claude Code anterior ao 2.1.287. O `npm run mod:install` tira os dois da conta (com backup), porque o mod faz
  o mesmo. A interface e o README passam a ensinar o `npm run mod:install`.
- O script do hook de permissão mudou para `mod/habblaud-permissoes/hooks/permission-hook.mjs`. O caminho antigo
  (`scripts/permission-hook.mjs`) virou um atalho, então quem instalou o hook antes continua funcionando.
- Em Contas e uso, a origem dos números diz quando vêm do mod ("ao vivo (mod do Habblaud)").
- O leitor do uso ao vivo ignora um arquivo lido pela metade e fica com o último número bom, em vez de esconder a
  conta por um ciclo.

## [0.2.0] - 2026-10-08

Primeira versão publicada.

### Adicionado

- **Versão e atualizações:** a versão em uso aparece na barra superior e em Configurações › Sobre. A cada 6 horas o
  Habblaud confere as releases no GitHub; quando sai uma versão nova, aparece o selo **Nova versão**, com um aviso e o
  link do que mudou. `HABBLAUD_UPDATE_CHECK=0` desliga a consulta.
- **Meu dia** (tecla M): para onde foi o tempo dos agentes, quanto tempo esperaram você, tokens e custo, com 30 dias
  de histórico.
- **GitHub no escritório:** PR aberto ou mergeado e release publicada viram festa na sala; CI vermelho liga o alarme,
  até um CI verde.
- **Responder pelo escritório** (tecla P): com o hook instalado (`npm run hooks:install`), aprovar, recusar ou
  "sempre permitir" pedidos de permissão sem ir ao terminal. Só com acesso local.
- **Timelapse do dia** (tecla L): o escritório reproduz o dia em alta velocidade.
- **Terminal somente leitura** (tecla T): a conversa de cada agente, ao vivo, no estilo do Claude Code, com busca,
  filtro, botão de copiar e histórico das sessões dos últimos 7 dias. Só com acesso local.
- **Dia e noite** pela hora local e **sons** sintetizados no navegador (desligados por padrão).
- **Vida social:** quem está à toa se junta em rodas (TV, videogame, pingue-pongue, papo na copa, jokenpô valendo
  moedinhas), com personalidades, amizades e rivalidades.
- **Esperando o shell:** o agente que espera um comando longo fica na mesa com a ampulheta, e a espera vira uma gag.
- Forks de sessão aparecem no escritório.
- A página aberta se recarrega sozinha quando o servidor passa a servir outra versão.
- O container usa o fuso horário do computador.
- **O escritório:** cada projeto aberto no Claude Code vira uma sala e cada sessão, um personagem com nome próprio.
  Subagentes chegam, trabalham e entregam ao principal. Mostra as duas contas, com o uso de 5 horas e semanal de
  cada uma (tap de statusline), além de feed de atividade, avisos e modo demonstração. Roda no Node ou no Docker local.

[Não lançado]: https://github.com/marmottajr/habblaud/compare/v0.5.0...HEAD
[0.5.0]: https://github.com/marmottajr/habblaud/releases/tag/v0.5.0
[0.4.0]: https://github.com/marmottajr/habblaud/releases/tag/v0.4.0
[0.3.2]: https://github.com/marmottajr/habblaud/releases/tag/v0.3.2
[0.3.1]: https://github.com/marmottajr/habblaud/releases/tag/v0.3.1
[0.3.0]: https://github.com/marmottajr/habblaud/releases/tag/v0.3.0
[0.2.0]: https://github.com/marmottajr/habblaud/releases/tag/v0.2.0
