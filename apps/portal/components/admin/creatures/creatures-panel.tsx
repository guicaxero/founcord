"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback } from "react";
import { UrlTabs } from "@/components/ui/tabs";
import { PanelLoading } from "../kit";
import { CompendiumTab } from "./compendium-tab";
import { CreatureEditor } from "./creature-editor";
import { LibraryTab } from "./library-tab";

/**
 * Criador de criaturas: biblioteca da campanha, compêndio importado pelo
 * mestre e editor (`?criatura=<id>`). O conteúdo do livro só entra por
 * importação e fica restrito a quem gerencia criaturas.
 */
export function CreaturesPanel({ campaignId }: Readonly<{ campaignId: string }>) {
  return (
    // As abas e o editor leem a URL; o Suspense mantém a rota pré-renderizável.
    <Suspense fallback={<PanelLoading label="Carregando as criaturas" />}>
      <CreaturesView campaignId={campaignId} />
    </Suspense>
  );
}

export type CreatureNavigation = Readonly<{
  openCreature: (creatureId: string) => void;
  openTab: (tab: "biblioteca" | "compendio") => void;
}>;

function CreaturesView({ campaignId }: Readonly<{ campaignId: string }>) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const creatureId = searchParams.get("criatura");

  const navigate = useCallback(
    (update: (params: URLSearchParams) => void) => {
      const params = new URLSearchParams(searchParams.toString());
      update(params);
      const query = params.toString();
      router.push(query ? `${pathname}?${query}` : pathname, { scroll: true });
    },
    [pathname, router, searchParams],
  );

  const navigation: CreatureNavigation = {
    openCreature: (id) =>
      navigate((params) => {
        params.delete("aba");
        params.set("criatura", id);
      }),
    openTab: (tab) =>
      navigate((params) => {
        params.delete("criatura");
        if (tab === "biblioteca") params.delete("aba");
        else params.set("aba", tab);
      }),
  };

  if (creatureId) {
    return (
      <CreatureEditor
        key={creatureId}
        campaignId={campaignId}
        creatureId={creatureId}
        onClose={() => navigation.openTab("biblioteca")}
      />
    );
  }

  return (
    <UrlTabs
      label="Seções das criaturas"
      tabs={[
        {
          value: "biblioteca",
          label: "Biblioteca",
          content: <LibraryTab campaignId={campaignId} navigation={navigation} />,
        },
        {
          value: "compendio",
          label: "Compêndio",
          content: <CompendiumTab campaignId={campaignId} navigation={navigation} />,
        },
      ]}
    />
  );
}
