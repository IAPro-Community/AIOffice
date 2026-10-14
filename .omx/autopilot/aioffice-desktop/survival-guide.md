# Retomada — AIOffice Desktop

- Leia `.omx/context/aioffice-desktop-20261014T115515Z.md` e este diretório antes de continuar.
- Não tocar nos diffs prévios listados no contexto; o updater web já tem trabalho local independente.
- O servidor Habblaud hoje inicia tudo por efeitos colaterais ao importar `apps/office-web/server/index.ts`, faz bind de `HABBLAUD_HOST/HABBLAUD_PORT` e responde a SIGINT/SIGTERM. Converter para ciclo de vida controlável sem alterar `npm start`/`start:office`.
- Raiz usa npm workspaces e `npm run build`, `npm test`, `npm run typecheck`; cliente/server têm `npm --prefix apps/office-web run typecheck|build|test`.
- Próximo passo: introduzir runtime Electron seguro, persistência em `app.getPath('userData')`, detecção do serviço pronto/falhas/porta, lifecycle de atualização e build NSIS; depois workflow e docs.
- Verificação: comandos registrados em `validation.md`, mais revisão manual do diff.
