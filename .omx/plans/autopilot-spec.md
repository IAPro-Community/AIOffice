# Especificação — AIOffice Desktop

## Escopo
Acrescentar uma distribuição desktop multiplataforma Electron ao monorepo atual. Preservar os comandos CLI/Docker/web existentes e hospedar a aplicação real do AIOffice localmente. UI principal empacotada localmente; agentes continuam dependentes das CLIs/serviços externos atualmente integrados.

## Critérios de aceite e evidência
1. Main do Electron inicia a interface e o servidor Habblaud existentes; readiness e erro/porta ocupada são mostrados ao usuário. Evidência: teste de lifecycle e build local.
2. Aplicação encerra Vite/HTTP/observers/PTYs cooperativamente sem processos órfãos. Evidência: teste de close e API de encerramento idempotente.
3. Dados/configuração própria ficam no diretório `userData`; descoberta/leitura dos dados externos e cofre existente permanecem; dados antigos não são apagados. Evidência: testes de caminho/migração não destrutiva e inspeção do startup.
4. Janela usa context isolation, preload sandboxed e IPC pequeno validado; navegação externa só abre links HTTP(S) seguros fora do app. Evidência: revisão e testes do IPC/navigation.
5. Release publicada no GitHub ativa verificação estável, confirmação, download/progresso, nova confirmação de instalação e retorno pós-restart; assinatura validada onde exigida. Evidência: teste de orquestração em development fake adapter e metadados reais no workflow; nenhum update será alegado publicado.
6. Build Windows gera instalador `.exe`; CI define builds Windows/macOS/Linux e `.dmg`, `.AppImage`, `.deb`; códigos não executados localmente são explicitamente marcados. Evidência: artefatos Windows inspecionados e workflow validado sintaticamente; macOS/Linux dependem dos runners próprios.
7. README/DEV documentam desenvolvimento, instalação, CLIs opcionais, release/assinatura, update, logs e diagnóstico. Evidência: conteúdo revisado e `git diff --check`.

## Decisões
- Electron encaixa no servidor Node, WebSocket/SSE, processos locais e módulos nativos melhor que um wrapper web isolado.
- Utility process dedicado mantém o servidor existente isolado, mas gerenciado pelo Electron e interrompido cooperativamente.
- Electron Builder gera NSIS/DMG + ZIP/AppImage/DEB e metadados para GitHub Releases; electron-updater controla o canal estável. Assinatura é exigida em release Windows/macOS e AppImage quando configurada/obrigatória. Debian usa pacote/gerenciador do sistema para atualizar.
- AppData (`app.getPath('userData')`) guarda estado de AIOffice. Pastas de Claude/Codex/OMP continuam sendo dados externos observados, e a antiga `.habblaud` continua preservada e deve ser migrada sem sobrescrita quando aplicável.

## Fora do escopo / dependências humanas
- Publicar tag/release, subir artefatos e configurar segredos de signing/notarização não é autorizado por este pedido de implementação local.
- Testar distribuição macOS/Linux depende de seus runners; assinatura/notarização reais dependem das credenciais da organização.
- Ferramentas de agente (Claude Code, Codex, OMP e outras efetivamente suportadas) seguem instaladas/autenticadas separadamente conforme suportado no host; serão detectadas e diagnosticadas sem empacotar credenciais.

## Limites
- Nunca substituir checkout existente, estado de usuário, credenciais, configurações ou segredos.
- Preservar PolicyBroker, credential-store, allowlists e travas já existentes.
- Atualizações usam apenas releases do produto `IAPro-Community/AIOffice`; sem simulações exibidas como releases reais.
