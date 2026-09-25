import type { Permission } from "@ordem/authz";
import type { CurrentUserResponse } from "@ordem/contracts";
import { areas } from "@/components/admin/areas";

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

/**
 * A entrada "Gestão" aparece quando a pessoa pode abrir ao menos uma área do
 * painel. As permissões vêm das próprias áreas, para que menu e painel nunca
 * discordem sobre quem enxerga o quê.
 */
const managementPermissions: ReadonlySet<Permission> = new Set(
  areas.flatMap((area) => area.permissions),
);

export function canManage(me: CurrentUserResponse | undefined): boolean {
  return Boolean(
    me?.capabilities.some((capability) =>
      managementPermissions.has(capability.permission as Permission),
    ),
  );
}

/** A rota atual marca o item; `/missoes/xyz` mantém "Missões" ativo. */
export function isCurrent(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}
