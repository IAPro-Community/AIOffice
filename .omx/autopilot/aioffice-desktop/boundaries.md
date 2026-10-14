# Limites de execução — AIOffice Desktop

## NEVER
- Não descartar nem restaurar alterações já existentes no checkout.
- Não executar release/publish, push, commit, assinatura real, atualização de sistema, instalação em máquina de produção ou comunicação externa.
- Não embutir tokens, credenciais, arquivos `.env` ou certificados.
- Não sobrescrever nem remover `~/.habblaud`, histórico de agentes, credenciais protegidas ou pastas de Claude/Codex/OMP.

## DANGER
- IPC Electron, leitura de sessões locais, permissões/mensagens/terminal, `node-pty`, atualizações e preservação de dados.
- Builds nativos e atualização requerem assinatura compatível por plataforma; não simular assinatura ou publicação.

## ROLLBACK
- Base: branch `codex/habblaud-011-integration-20261013` e diffs pré-existentes registrados em `git status` no início.
- Alterações novas ficam em arquivos da integração desktop e edições necessárias do servidor/manifests/docs; não usar reset/clean/checkout destrutivo.

## VERIFY
- Typecheck/build/test existentes, testes focados da aplicação desktop, bundle Electron/servidor, pacote NSIS Windows se tooling permitir, inspeção de dados/IPC/manifestos e `git diff --check`.
- Para macOS/Linux, somente CI da plataforma pode constituir evidência de build; no Windows local não declarar artefatos multiplataforma.
