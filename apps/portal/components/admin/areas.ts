import type { Permission } from "@ordem/authz";

/**
 * Áreas do painel de gestão. Cada uma tem URL própria em `/dashboard/[slug]`
 * e aparece só para quem tem ao menos uma das permissões listadas, em alguma
 * campanha. Este módulo não depende do cliente: as rotas o usam para validar o
 * endereço e montar os metadados.
 */
export type AreaSlug =
  | "sessoes"
  | "diario"
  | "automacoes"
  | "missoes"
  | "cronicas"
  | "foundry"
  | "personagens"
  | "pedidos"
  | "estoque"
  | "pessoas"
  | "historico"
  | "configuracoes";

export type AreaGroup = "mesa" | "conteudo" | "integracao" | "campanha";

export type AreaDefinition = Readonly<{
  slug: AreaSlug;
  label: string;
  eyebrow: string;
  description: string;
  group: AreaGroup;
  permissions: readonly Permission[];
}>;

export const areaGroups: readonly Readonly<{ id: AreaGroup; label: string }>[] = [
  { id: "mesa", label: "Mesa de jogo" },
  { id: "conteudo", label: "Conteúdo" },
  { id: "integracao", label: "Foundry e Mercador" },
  { id: "campanha", label: "Campanha" },
];

export const areas: readonly AreaDefinition[] = [
  {
    slug: "sessoes",
    label: "Sessões",
    eyebrow: "Registros da mesa",
    description: "Capture registros do Foundry, associe fontes e prepare rascunhos para revisão.",
    group: "mesa",
    permissions: ["session:read", "session:manage"],
  },
  {
    slug: "diario",
    label: "Diário de Sessões",
    eyebrow: "Resumos das sessões",
    description: "Revise e publique os resumos das sessões jogadas. Eles aparecem só no Diário, nunca em Crônicas.",
    group: "mesa",
    permissions: ["session:manage", "post:review", "post:publish", "post:delete"],
  },
  {
    slug: "automacoes",
    label: "Automações",
    eyebrow: "Assistência editorial",
    description: "Transforme registros de sessão em rascunhos que sempre passam por revisão humana.",
    group: "mesa",
    permissions: ["automation:read", "automation:run"],
  },
  {
    slug: "missoes",
    label: "Missões",
    eyebrow: "Quadro editorial",
    description: "Crie chamados, organize a revisão e publique missões no quadro da Ordem.",
    group: "conteudo",
    permissions: ["mission:create", "mission:edit", "mission:review", "mission:publish"],
  },
  {
    slug: "cronicas",
    label: "Crônicas",
    eyebrow: "Registros da lore",
    description: "Escreva e revise as crônicas da lore da campanha. Resumos de sessão ficam no Diário de Sessões.",
    group: "conteudo",
    permissions: ["post:create", "post:review", "post:publish", "post:delete"],
  },
  {
    slug: "foundry",
    label: "Mundos do Foundry",
    eyebrow: "Integrações",
    description: "Conecte mundos de Shadow of the Demon Lord e acompanhe presença, personagens e versões.",
    group: "integracao",
    permissions: ["foundry:world:manage"],
  },
  {
    slug: "personagens",
    label: "Personagens",
    eyebrow: "Identidade integrada",
    description: "Associe membros aos personagens sincronizados antes de liberar fichas e pedidos.",
    group: "integracao",
    permissions: ["character:link:manage"],
  },
  {
    slug: "pedidos",
    label: "Pedidos do Mercador",
    eyebrow: "Acertos da campanha",
    description: "Acompanhe solicitações, faça o acerto no Foundry e registre a decisão.",
    group: "integracao",
    permissions: ["merchant:purchase:manage"],
  },
  {
    slug: "estoque",
    label: "Estoque do Lojista",
    eyebrow: "Sorteio de estoque",
    description: "Mantenha o catálogo de itens e sorteie o estoque do Lojista, que o módulo cria no Foundry.",
    group: "integracao",
    permissions: ["merchant:catalog:manage"],
  },
  {
    slug: "pessoas",
    label: "Pessoas e acessos",
    eyebrow: "Comunidade",
    description: "Gerencie participação e papéis sem confundir acessos globais e locais.",
    group: "campanha",
    permissions: ["member:manage"],
  },
  {
    slug: "historico",
    label: "Histórico",
    eyebrow: "Auditoria",
    description: "Acompanhe as alterações relevantes feitas dentro da campanha.",
    group: "campanha",
    permissions: ["audit:read"],
  },
  {
    slug: "configuracoes",
    label: "Configurações",
    eyebrow: "Campanha",
    description: "Atualize identidade, visibilidade e estado da campanha selecionada.",
    group: "campanha",
    permissions: ["campaign:manage"],
  },
];

export function areaBySlug(slug: string | null | undefined): AreaDefinition | undefined {
  return areas.find((area) => area.slug === slug);
}
