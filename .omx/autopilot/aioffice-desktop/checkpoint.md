# Checkpoint — AIOffice Desktop

- **Fase:** implementação e revisão concluídas; gates e pacote Windows x64 aprovados.
- **Hipótese:** Electron main + utility process hospeda o servidor atual; janela acessa o bundle local servido pelo processo; app userData guarda dados próprios.
- **Alterações protegidas:** diffs não relacionados foram preservados conforme `boundaries.md`.
- **Refresh:** nenhuma recarga periódica da página; SSE/polling atualiza estado em background. Banner e mudança de idioma recarregam somente por ação explícita.
- **Gate:** `desktop:verify` e instalador Windows x64 aprovados. O teste MCP usa servidor HTTP efêmero. macOS/Linux/CI e assinatura real continuam sem execução neste host.
- **Correção posterior:** `electron-updater` é CommonJS; main usa import default para evitar a exceção de export nomeado. Teste de regressão incluso e desktop:test agora 13/13.
- **Link estável:** a release existente `v2.1.0` agora contém somente `AIOffice-Setup.exe` (ProductVersion 2.1.0). A URL latest foi verificada com HTTP 200; o setup é estático e sem assinatura. O updater nativo ainda precisa de release assinada com `latest.yml` e blockmap.
