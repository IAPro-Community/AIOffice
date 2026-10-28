# Extensão Chrome do AIOffice

Extensão piloto Manifest V3 para abrir o painel lateral, acompanhar eventos dos agentes e exibir notificações locais do Chrome.

O ícone da extensão e o botão da barra do Chrome usam a arte oficial do AIOffice nos tamanhos exigidos pelo Chrome.

## Requisitos

- Chrome 120 ou superior.
- Aplicativo AIOffice Desktop instalado para iniciar automaticamente o serviço parado.
- Host Native Messaging `com.iapro.aioffice` instalado e registrado pelo instalador Windows do AIOffice Desktop.

Extensão e desktop são duas instalações separadas. O instalador do desktop registra o host no perfil atual do Windows; ele não instala a extensão. A extensão sozinha não instala o executável. Depois de instalada, ela tenta reconectar ao abrir o Chrome (configurável) sem iniciar uma janela inesperada; abrir o painel inicia o serviço parado quando a versão do Desktop permite. Se o serviço já estiver rodando, conecta-se à mesma instância. A primeira inicialização pode levar até seis minutos.

O modo invisível na bandeja e o encerramento pelo painel são capacidades opcionais anunciadas pelo Desktop. Em builds legadas como a 2.4.3, abrir o painel com o serviço parado abre a janela normal do Desktop e espera a API local; o botão de encerrar não aparece. Não instale um setup piloto mais antigo por cima de um Desktop mais novo para obter o host.

O Chrome precisa estar aberto para as notificações da extensão. Se o Chrome fechar, o desktop pode continuar ativo na bandeja; ao abrir o Chrome novamente, a extensão reconecta e tenta recuperar eventos ainda presentes no feed. O feed transmite até 50 eventos recentes; se o cursor já expirou, o painel sinaliza uma lacuna.

## Painel de trabalho

O feed agrupa eventos pelo projeto/sala do AIOffice e oferece filtros independentes por projeto e tipo de atividade. Cada evento mostra o resumo e o detalhe completo já preparado pelo servidor, junto ao provedor, estado e personagem 2D do agente. A lista de agentes fica agrupada por projeto; os atalhos **Terminal** e **Instrução** aparecem ao lado de cada agente elegível.

**Terminal** abre o histórico recente da sessão e acompanha mensagens, ferramentas, comandos e resultados ao vivo. **Dar uma instrução ao agente** envia o texto para a fila local já existente do AIOffice; a confirmação informa que entrou na fila, não que o agente já a executou. A extensão só encaminha as ações fixas validadas pelo host Native Messaging.

## Cotas de uso

O painel exibe as janelas de 5 horas e semanal enviadas pelo AIOffice para contas Claude Code e Codex, incluindo as janelas por modelo quando disponíveis. Cada cartão informa quando os números foram lidos e quando a janela deve reiniciar. Uma leitura antiga é marcada; se a janela já reiniciou, o uso atual aparece como desconhecido em vez de ser tratado como zero. Provedores que ainda não enviam limites mostram esse estado sem inventar percentuais.

## Instalação para desenvolvimento

1. Instale uma build Windows do AIOffice que inclua o host Native Messaging. A instalação é por usuário, registra o host no HKCU e não exige instalar Go. Confira a versão antes de executar um setup de piloto: não substitua um Desktop mais novo por uma build experimental mais antiga.
2. Abra `chrome://extensions`, habilite o **Modo do desenvolvedor** e escolha **Carregar sem compactação**.
3. Selecione esta pasta e abra o painel pelo ícone da extensão. O painel orienta baixar o desktop se o host não estiver disponível.

As Configurações do AIOffice trazem um tutorial para instalar esta extensão e apontam para o ZIP oficial. O workflow de release empacota `AIOffice-Chrome-Extension.zip`, que deve ser extraído antes de usar **Carregar sem compactação**. O link de download só fica disponível após publicar uma release que inclua o pacote. O ZIP do GitHub mantém a identidade fixa do companion para que o Desktop reconheça a extensão instalada.

Esta distribuição por ZIP não é uma publicação na Chrome Web Store. Uma futura listagem na loja precisa de revisão própria da identidade, da política de privacidade e do processo de atualização do host. A identidade fixa no manifesto é `kcapmchomgbpjgdfdijhlnnjehmhdfdc`; ela também está autorizada no instalador e no Native Messaging host. Mantenha esses três valores sincronizados.

## Permissões

- `sidePanel`: mostrar o AIOffice no painel lateral do Chrome.
- `nativeMessaging`: conversar com o host instalado pelo desktop e solicitar conectar, abrir ou encerrar o serviço.
- `notifications`: exibir notificações locais para eventos habilitados.
- `storage`: persistir preferências, feed recente e IDs de eventos já vistos para deduplicação.

A extensão não solicita acesso geral a sites, abas, cookies ou scripts de conteúdo.

## Preferências e privacidade

Todos os tipos `ActivityKind` são habilitados inicialmente. Cada tipo pode ser alterado no painel. “Conectar ao abrir o Chrome” fica ligado por padrão para retomar as notificações e pode ser desligado nas preferências. “Detalhes nas notificações” fica desligado por padrão; o feed do painel sempre mostra o resumo e o detalhe da ação. Avisos do escritório podem ser controlados separadamente. Preferências, contas detectadas, leituras de uso e IDs recentes ficam no armazenamento local do Chrome; transcript ao vivo não é persistido pela extensão e esses dados não são enviados a serviços remotos por ela.

Ao reabrir o Chrome, a extensão recupera notificações dos eventos ainda presentes no feed local do AIOffice. O endpoint envia até 50 eventos recentes. Se o cursor anterior já tiver saído desse conjunto, o painel mostra um aviso de lacuna; eventos que aconteceram enquanto o serviço estava parado não podem ser reconstruídos.

## Validação local

Na raiz do monorepo, execute:

```powershell
node apps/office-chrome-extension/build-avatar.mjs
node --test apps/office-chrome-extension/test/*.test.mjs
node apps/office-chrome-extension/validate.mjs
```

Os testes cobrem categorias, preferências padrão, agrupamento/filtros por projeto, chamadas de terminal/instrução, reconexão, deduplicação/entrega de notificações e montagem segura do texto. O validador confere permissões, arquivos de entrada e sincronização de `ActivityKind`. O build gera `avatar-renderer.js` usando a arte original do AIOffice. Se o feed chegar antes do snapshot visual do escritório, o painel usa uma aparência 2D estável baseada no ID/nome do agente e troca pelo seed oficial assim que os dados chegam; nunca deixa um `<img>` sem origem.

O instalador Windows do desktop compila e inclui o host nativo. A compilação a partir do código-fonte requer Go 1.22 ou superior; o executável instalado não requer Go.

## Publicação

O ZIP é distribuído junto das releases do AIOffice no GitHub e carrega essa identidade estável. A Chrome Web Store é um canal separado e não está habilitado nesta versão.
