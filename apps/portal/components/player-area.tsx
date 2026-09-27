"use client";

import { useQuery } from "@tanstack/react-query";
import type { CurrentUserResponse } from "@ordem/contracts";
import { usePathname } from "next/navigation";
import { MyPurchaseRequests } from "@/components/merchant/my-purchases";
import { MissionBoard } from "@/components/missions/mission-board";
import { PlayerCharacters } from "@/components/player-characters";
import { ButtonAnchor } from "@/components/ui/button";
import { FeedbackState } from "@/components/ui/feedback-state";
import { UrlTabs } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/surface";
import { apiFetch } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";
import { DEFAULT_CAMPAIGN_ID } from "@/server/shared/constants";

/** Área privada do jogador: personagem, inscrições e pedidos do Lojista. */
export function PlayerArea() {
  const pathname = usePathname();
  const me = useQuery({
    queryKey: queryKeys.me,
    queryFn: () => apiFetch<CurrentUserResponse>("/api/me"),
  });

  if (me.isPending) return <Skeleton className="h-64 w-full" />;

  if (!me.data?.authenticated) {
    return (
      <FeedbackState
        title="Entre para ver sua área"
        action={
          <ButtonAnchor
            variant="accent"
            href={`/api/auth/discord?returnTo=${encodeURIComponent(pathname)}`}
          >
            Entrar com Discord
          </ButtonAnchor>
        }
      >
        Sua conta do Discord identifica com segurança o personagem vinculado pela equipe da
        campanha e os pedidos que você enviou ao Lojista.
      </FeedbackState>
    );
  }

  return (
    <UrlTabs
      label="Seções da sua área"
      tabs={[
        {
          value: "personagem",
          label: "Meu personagem",
          content: <PlayerCharacters />,
        },
        {
          value: "inscricoes",
          label: "Minhas inscrições",
          content: (
            <MissionBoard
              campaignId={DEFAULT_CAMPAIGN_ID}
              initialFilter="minhas"
              emptyState={
                <FeedbackState title="Nenhum chamado publicado">
                  Quando a Ordem anunciar novas missões, elas aparecem aqui para inscrição.
                </FeedbackState>
              }
            />
          ),
        },
        {
          value: "pedidos",
          label: "Pedidos do Lojista",
          content: <MyPurchaseRequests campaignId={DEFAULT_CAMPAIGN_ID} />,
        },
      ]}
    />
  );
}
