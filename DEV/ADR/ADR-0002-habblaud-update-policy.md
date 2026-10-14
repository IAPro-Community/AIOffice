# ADR-0002 — Política de atualização do Habblaud no AIOffice

- **Status:** Aceito, revisado em 2026-10-13
- **Escopo:** Integração de mudanças de `marmottajr/habblaud` e atualização das instalações do AIOffice

## Contexto

O AIOffice adapta o Habblaud dentro de um monorepo. Mesclar o upstream diretamente pode trocar versões, rotas, segurança, interface e dependências sem validar o conjunto. A release upstream `v0.11.0` altera 95 arquivos; parte das correções já está presente no código do AIOffice, enquanto recursos novos exigem avaliação própria.

## Decisão

- A equipe mantenedora revisa releases upstream e porta seletivamente mudanças compatíveis em uma branch de integração.
- Cada porte passa por revisão de dependências, compatibilidade, segurança e gates do AIOffice. O manifesto `apps/office-web/upstream-habblaud.json` registra o marco revisado, correções já presentes e recursos adiados.
- O pacote raiz define a versão e o repositório de release do AIOffice. No monorepo, o verificador dentro do escritório compara essa versão com as releases oficiais do AIOffice. A instalação standalone do Habblaud mantém seu fallback aos metadados locais.
- O verificador acompanha exclusivamente `IAPro-Community/AIOffice`; versões do Habblaud upstream nunca controlam o selo do produto.
- O botão pode instalar automaticamente uma release oficial do AIOffice somente em uma instalação local Node compatível, gerenciada, limpa e sem sessões PTY ativas. O processo valida a release/tag, prepara a build fora da instalação ativa, preserva os artefatos locais, encerra o servidor de forma coordenada, confirma a nova versão e faz rollback se a inicialização falhar. Docker, desenvolvimento, checkout modificado ou inicialização sem o modo gerenciado ficam no fluxo manual.
- O selo só é removido quando o servidor em execução confirma a versão alvo. Falha, bloqueio ou download incompleto não altera a versão mostrada.
- `npm run release` é uma simulação local; `npm run release -- --publish` exige origem canônica, branch principal limpa e sincronizada, versão/changelog válidos e uma tag inédita antes de publicar a release AIOffice.
- O acesso remoto é uma porta HTTPS separada com autenticação, desligada por padrão e leitura apenas inicialmente. Usuário, senha, certificados, capabilities, VPN e firewall não são provisionados sem configuração explícita; acesso via rede pública direta não é o caminho suportado.
- `npm run check:habblaud-upstream` é uma consulta somente de leitura para mantenedores; nunca baixa ou mescla código.

## Alternativas consideradas

- **Mesclar a branch upstream diretamente:** rejeitada porque mistura alterações de produto sem revisão e pode sobrescrever adaptações locais.
- **Atualização automática irrestrita:** rejeitada porque instalações Docker, editadas, em desenvolvimento ou com sessões ativas não podem ser substituídas com segurança. A instalação automática fica limitada ao caminho gerenciado com rollback.
- **Parar de acompanhar o upstream:** rejeitada porque deixaria correções e melhorias úteis sem um processo para avaliá-las.

## Consequências e riscos

- A equipe assume o custo de comparar, portar e validar cada mudança que decidir adotar.
- Recursos adiados não aparecem no AIOffice só porque existem no upstream; precisam de uma decisão e implementação futuras.
- A notificação e a instalação exigem acesso ao GitHub; falhas de rede não impedem o app de iniciar, e a versão em execução continua visível até confirmação.
- Uma release candidata local só se torna instalável após a publicação de uma release própria do AIOffice. A publicação não foi executada nesta tarefa.
- Instalações fora dos critérios recebem motivo de bloqueio e continuam com atualização manual.

## Verificação e revisão

- Referências upstream fixadas: `v0.10.0` (`e3204a6a533089fa9df74970ddc4340ecc1c8cd4`) a `v0.11.0` (`4ccce2537472fe5a8d432f06974494d2e778ff15`).
- Referências e contrato revistos em 2026-10-13 após a solicitação explícita de atualização automática com segurança e acesso remoto por LAN/VPN.
- Revisar se o método de distribuição mudar ou se a equipe quiser suportar Docker, update packages assinados, ditado ou novos poderes remotos.
