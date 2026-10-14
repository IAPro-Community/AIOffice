# ADR-0002 — Política de atualização do Habblaud no AIOffice

- **Status:** Aceito
- **Data:** 2026-10-13
- **Escopo:** Integração de mudanças de `marmottajr/habblaud` e atualização das instalações do AIOffice

## Contexto

O AIOffice adapta o Habblaud dentro de um monorepo. Mesclar o upstream diretamente pode trocar versões, rotas, segurança, interface e dependências sem validar o conjunto. A release upstream `v0.11.0` altera 95 arquivos; parte das correções já está presente no código do AIOffice, enquanto recursos novos exigem avaliação própria.

## Decisão

- A equipe mantenedora revisa releases upstream e porta seletivamente mudanças compatíveis em uma branch de integração.
- Cada porte passa por revisão de dependências, compatibilidade, segurança e gates do AIOffice. O manifesto `apps/office-web/upstream-habblaud.json` registra o marco revisado, correções já presentes e recursos adiados.
- O pacote raiz define a versão e o repositório de release do AIOffice. No monorepo, o verificador dentro do escritório compara essa versão com as releases oficiais do AIOffice. A instalação standalone do Habblaud mantém seu fallback aos metadados locais.
- Usuários atualizam o AIOffice completo por uma release oficial e suas instruções. O verificador informa e abre as notas, mas não instala nem altera arquivos.
- `npm run check:habblaud-upstream` é uma consulta somente de leitura para mantenedores; nunca baixa ou mescla código.

## Alternativas consideradas

- **Mesclar a branch upstream diretamente:** rejeitada porque mistura alterações de produto sem revisão e pode sobrescrever adaptações locais.
- **Atualização automática para usuários:** rejeitada porque um app integrado precisa atualizar como um conjunto compatível, e a instalação pode variar por release.
- **Parar de acompanhar o upstream:** rejeitada porque deixaria correções e melhorias úteis sem um processo para avaliá-las.

## Consequências e riscos

- A equipe assume o custo de comparar, portar e validar cada mudança que decidir adotar.
- Recursos adiados não aparecem no AIOffice só porque existem no upstream; precisam de uma decisão e implementação futuras.
- A notificação de nova release exige acesso ao GitHub e fornece descoberta, não instalação. Falhas de rede não impedem o app de iniciar.
- A release candidata local só se torna atualizável para usuários após publicação de uma release própria do AIOffice.

## Verificação e revisão

- Referências upstream fixadas: `v0.10.0` (`e3204a6a533089fa9df74970ddc4340ecc1c8cd4`) a `v0.11.0` (`4ccce2537472fe5a8d432f06974494d2e778ff15`).
- Rever a decisão quando o upstream mudar o modelo de distribuição, quando uma atualização automática fizer parte de uma distribuição concreta ou antes de adotar acesso remoto, PTY, ditado ou esperas longas.
