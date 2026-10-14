# Tarefas — AIOffice Desktop

Todas sequenciais e sob propriedade do agente líder: integram servidor, manifestos e protocolo do updater; lockfile e interfaces compartilhadas não serão editados em paralelo.

1. `[x] D1` lifecycle/startup e caminhos de dados do servidor; typecheck e testes focados aprovados; prontidão vinculada por nonce ao processo criado e o diretório de execução é gravável fora do ASAR.
2. `[x] D2` shell Electron, preload/IPC restrito, falha de startup, updater nativo e CLI de diagnóstico; 13 testes desktop aprovados após correção do import CommonJS.
3. `[x] D3` dependências, scripts, electron-builder, avisos de licença e empacotamento Windows x64; instalador NSIS (115.690.061 bytes), metadados e blockmap gerados; assinatura local `NotSigned`.
4. `[x] D4` workflow matrix, assinatura/notarização por secrets e publicação condicionada aos gates; YAML validado estaticamente. Execução real ainda depende do CI.
5. `[x] D5` documentação de instalação, persistência, releases, diagnóstico e verificação atualizada em `DEV/`.
6. `[x] D6` revisão adversarial incorporada, verificações registradas, reload automático auditado; limitações do host e status dos testes anotados.
7. `[x] D7` erro de import do `electron-updater` corrigido e URL estável para o instalador Windows configurada no workflow; publicação continua pendente.
