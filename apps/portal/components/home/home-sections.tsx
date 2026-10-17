"use client";

import { useQuery } from "@tanstack/react-query";
import type { CurrentUserResponse } from "@ordem/contracts";
import Link from "next/link";
import { Section } from "@/components/layout/page-container";
import { SessionDiary } from "@/components/editorial/diary";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/surface";
import { apiFetch } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";

const destinations = [
  {
    href: "/missoes",
    label: "Missões",
    description: "Chamados publicados, inscrições e lista de espera.",
  },
  {
    href: "/cronicas",
    label: "Crônicas",
    description: "O que a Ordem registrou sobre o mundo e seus mortos.",
  },
  {
    href: "/diario",
    label: "Diário de Sessões",
    description: "Registros factuais de cada noite jogada.",
  },
  {
    href: "/lojista",
    label: "Lojista",
    description: "Estoque sincronizado do Foundry e pedidos ao mestre.",
  },
] as const;

function useDiaryVisible(): boolean {
  const me = useQuery({
    queryKey: queryKeys.me,
    queryFn: () => apiFetch<CurrentUserResponse>("/api/me"),
    staleTime: 60_000,
  });
  return me.data?.diary.visible === true;
}

/** Atalhos para as áreas do portal; o Diário só aparece para quem pode lê-lo. */
export function PortalDestinations() {
  const diaryVisible = useDiaryVisible();
  const visible = destinations.filter((destination) => destination.href !== "/diario" || diaryVisible);

  return (
    <nav aria-label="Áreas do portal">
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {visible.map((destination) => (
          <li key={destination.href}>
            <Link
              href={destination.href}
              className="group block h-full rounded-lg focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-focus"
            >
              <Card
                interactive
                className="flex h-full flex-col gap-2 transition-transform duration-200 group-hover:-translate-y-0.5 motion-reduce:group-hover:translate-y-0"
              >
                <strong className="font-display text-xl">{destination.label}</strong>
                <span className="text-sm text-fg-muted">{destination.description}</span>
                <span aria-hidden="true" className="mt-auto pt-3 text-sm font-semibold text-accent">
                  Abrir →
                </span>
              </Card>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/** Últimos registros do Diário, só para quem pode lê-lo. */
export function HomeDiarySection({ campaignId }: Readonly<{ campaignId: string }>) {
  if (!useDiaryVisible()) return null;
  return (
    <Section
      eyebrow="Registro"
      title="Diário de Sessões"
      description="O que aconteceu nas últimas noites de jogo."
      action={
        <ButtonLink href="/diario" variant="ghost">
          Ver todos
        </ButtonLink>
      }
    >
      <SessionDiary campaignId={campaignId} limit={2} />
    </Section>
  );
}
