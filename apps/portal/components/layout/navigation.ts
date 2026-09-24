import type { Permission } from "@ordem/authz";
import type { CurrentUserResponse } from "@ordem/contracts";

export type NavigationItem = Readonly<{
  href: string;
  label: string;
  /** Descrição curta usada no menu compacto. */
  hint?: string;
}>;

/** Rotas abertas a qualquer visitante. */
export const publicNavigation: readonly NavigationItem[] = [
  { href: "/missoes", label: "Missões", hint: "Chamados abertos e concluídos" },
  { href: "/cronicas", label: "Crônicas", hint: "Publicações da campanha" },
  { href: "/diario", label: "Diário", hint: "Registros das sessões" },
  { href: "/mercador", label: "Mercador", hint: "Estoque e pedidos" },
  { href: "/ordem", label: "A Ordem", hint: "Código e ambientação" },
];

/** Área autenticada do jogador. */
export const playerNavigation: readonly NavigationItem[] = [
  { href: "/eu", label: "Minha área", hint: "Personagem, inscrições e pedidos" },
];

/** Qualquer uma destas permissões revela a entrada do painel de gestão. */
const managementPermissions: readonly Permission[] = [
  "audit:read",
  "automation:read",
  "automation:run",
  "campaign:manage",
  "character:link:manage",
  "foundry:world:manage",
  "integration:manage",
  "member:manage",
  "mission:create",
  "mission:edit",
  "mission:publish",
  "mission:review",
  "post:create",
  "post:delete",
  "post:publish",
  "post:review",
  "role:assign",
  "session:manage",
  "session:read",
];

export function canManage(me: CurrentUserResponse | undefined): boolean {
  return Boolean(
    me?.capabilities.some((capability) =>
      managementPermissions.includes(capability.permission as Permission),
    ),
  );
}

/** A rota atual marca o item; `/missoes/xyz` mantém "Missões" ativo. */
export function isCurrent(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}
