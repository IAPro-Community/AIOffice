export interface ReplicaSkillMetadata {
  readonly id: string;
  readonly name: string;
  readonly role: string;
  readonly officeRoom: string;
  readonly directory: string;
  readonly summary: string;
}

export const REPLICA_SKILL_CATALOG: readonly ReplicaSkillMetadata[] = [
  {
    id: 'replica-recon',
    name: 'Recon & Mapeamento de Telas',
    role: 'Especialista em Reconhecimento',
    officeRoom: 'Sala de Estratégia',
    directory: 'skills/replica/replica-recon',
    summary: 'Mapeia telas, fluxos de navegação e features do app de referência.',
  },
  {
    id: 'replica-entrepreneur',
    name: 'Análise de Mercado & Reviews',
    role: 'Especialista em Produto & Mercado',
    officeRoom: 'Sala de Estratégia',
    directory: 'skills/replica/replica-entrepreneur',
    summary: 'Analisa reviews de usuários públicos, extrai dores e oportunidades de melhoria.',
  },
  {
    id: 'replica-brand',
    name: 'Estratégia de Marca & Tom',
    role: 'Estrategista de Marca',
    officeRoom: 'Estúdio Criativo',
    directory: 'skills/replica/replica-brand',
    summary: 'Cria nova identidade de marca, nome, paleta e diretrizes para evitar infrações.',
  },
  {
    id: 'replica-design',
    name: 'Design System & Tokens',
    role: 'Designer UI/UX',
    officeRoom: 'Estúdio Criativo',
    directory: 'skills/replica/replica-design',
    summary: 'Extrai design tokens (cores, tipografia, espaçamento) e especificações de componentes.',
  },
  {
    id: 'replica-build',
    name: 'Arquitetura & Codificação',
    role: 'Engenheiro Fullstack Lead',
    officeRoom: 'Baia de Engenharia',
    directory: 'skills/replica/replica-build',
    summary: 'Scaffolding, seleção de stack e implementação de front-end e back-end.',
  },
  {
    id: 'replica-diff',
    name: 'Comparador de Paridade',
    role: 'Auditor de Interface',
    officeRoom: 'Laboratório de Testes',
    directory: 'skills/replica/replica-diff',
    summary: 'Compara a paridade visual e funcional entre o app original e o clone.',
  },
  {
    id: 'replica-test',
    name: 'QA & Reprodução de Bugs',
    role: 'Engenheiro de QA',
    officeRoom: 'Laboratório de Testes',
    directory: 'skills/replica/replica-test',
    summary: 'Testes automatizados end-to-end e testes de regressão de cenários críticos.',
  },
  {
    id: 'replica-fix',
    name: 'Correção de Dores de Usuários',
    role: 'Especialista em Resolução',
    officeRoom: 'Baia de Engenharia',
    directory: 'skills/replica/replica-fix',
    summary: 'Resolve os problemas crônicos que os usuários odiavam no aplicativo original.',
  },
  {
    id: 'replica-deploy',
    name: 'Preflight & Publicação',
    role: 'Engenheiro de DevOps',
    officeRoom: 'Sala de Operações',
    directory: 'skills/replica/replica-deploy',
    summary: 'Preflight checklist, banco de dados, variáveis de ambiente e deploy em produção.',
  },
  {
    id: 'replica-launch',
    name: 'Checklist de Lançamento',
    role: 'Growth & Launch Lead',
    officeRoom: 'Sala de Operações',
    directory: 'skills/replica/replica-launch',
    summary: 'Checklist final para submissão a lojas e anúncio de lançamento.',
  },
  {
    id: 'replica-sweep',
    name: 'Auditoria de Trademark & Limpeza',
    role: 'Auditor de Compliance',
    officeRoom: 'Sala de Estratégia',
    directory: 'skills/replica/replica-sweep',
    summary: 'Garante que nenhum ativo proprietário, logo ou fonte do original vazou para o clone.',
  },
];
