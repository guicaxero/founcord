"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { FoundryWorldListResponse, FoundryWorldStatus } from "@ordem/contracts";
import { motion } from "motion/react";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { FeedbackState } from "@/components/ui/feedback-state";
import { listItem, staggerList } from "@/components/ui/motion";
import { Badge, Card } from "@/components/ui/surface";
import { useToast } from "@/components/ui/toast";
import { apiFetch, errorMessage } from "@/lib/api-client";
import { cn } from "@/lib/cn";
import { formatDateTime } from "@/lib/format";
import { queryKeys } from "@/lib/query-keys";
import { DetailList, PanelHeader, PanelLoading, Stats } from "./kit";

const statusContent: Readonly<
  Record<FoundryWorldStatus["status"], Readonly<{ label: string; tone: "success" | "warning" | "neutral"; dot: string }>>
> = {
  online: { label: "Online", tone: "success", dot: "bg-success" },
  offline: { label: "Offline", tone: "warning", dot: "bg-warning" },
  revoked: { label: "Desconectado", tone: "neutral", dot: "bg-fg-subtle" },
};

export function FoundryPanel({
  campaignId,
  campaignName,
}: Readonly<{ campaignId: string; campaignName: string }>) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const instructionsRef = useRef<HTMLDetailsElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  const [disconnectTarget, setDisconnectTarget] = useState<FoundryWorldStatus | null>(null);
  const worlds = useQuery({
    queryKey: queryKeys.foundryWorlds(campaignId),
    queryFn: () => apiFetch<FoundryWorldListResponse>(`/api/campaigns/${campaignId}/foundry/worlds`),
    refetchInterval: 30_000,
  });
  const sync = useMutation({
    mutationFn: (worldId: string) =>
      apiFetch<{ commandId: string }>(`/api/campaigns/${campaignId}/foundry/worlds/${worldId}/sync`, { method: "POST" }),
    onSuccess: async (_result, worldId) => {
      const worldName = worlds.data?.data.find((world) => world.worldId === worldId)?.worldTitle;
      toast({
        title: "Sincronização solicitada",
        description: `O Foundry atualizará os personagens de “${worldName ?? "mundo selecionado"}” quando o mestre estiver conectado.`,
        tone: "info",
      });
      await queryClient.invalidateQueries({ queryKey: queryKeys.audit(campaignId) });
    },
    onError: (error) => toast({ title: "A sincronização não foi solicitada", description: errorMessage(error), tone: "danger" }),
  });
  const disconnect = useMutation({
    mutationFn: (worldId: string) =>
      apiFetch(`/api/campaigns/${campaignId}/foundry/worlds/${worldId}`, { method: "DELETE" }),
    onSuccess: async () => {
      const title = disconnectTarget?.worldTitle;
      setDisconnectTarget(null);
      toast({ title: "Mundo desconectado", description: title ? `“${title}” não envia mais dados ao portal.` : undefined });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.foundryWorlds(campaignId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.audit(campaignId) }),
      ]);
    },
  });

  const data = worlds.data?.data ?? [];
  const connected = data.filter((world) => world.status !== "revoked");
  const online = connected.filter((world) => world.status === "online");
  const attention = connected.filter((world) => world.status === "offline");

  function revealInstructions() {
    const details = instructionsRef.current;
    if (!details) return;
    details.open = true;
    details.scrollIntoView({ behavior: "smooth", block: "center" });
    details.querySelector("summary")?.focus();
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <p className="max-w-[60ch] text-sm text-fg-muted">
          Autorize mundos de <strong className="text-fg">{campaignName}</strong> pelo módulo da Ordem e acompanhe
          presença, personagens e versões sem expor seu Foundry à internet.
        </p>
        <Button variant="accent" onClick={revealInstructions}>Conectar novo mundo</Button>
      </div>

      <Stats
        label="Resumo das conexões"
        items={[
          { label: "Conectados", value: connected.length },
          { label: "Online agora", value: online.length, hint: "Só com o mestre no mundo" },
          { label: "Offline", value: attention.length },
        ]}
      />

      <details ref={instructionsRef} className="group rounded-lg border border-line-soft bg-surface">
        <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 rounded-lg px-5 font-semibold focus-visible:outline-2 focus-visible:outline-focus [&::-webkit-details-marker]:hidden">
          Como conectar um mundo
          <span aria-hidden="true" className="text-fg-subtle transition-transform duration-200 group-open:rotate-180">⌄</span>
        </summary>
        <div className="space-y-5 border-t border-line-soft px-5 py-5">
          <ol className="grid gap-4 md:grid-cols-3">
            {[
              ["Abra o mundo no Foundry", "Ative o módulo Ordem da Última Luz e entre como mestre."],
              ["Inicie a conexão", "Em Configurações, abra a tela do módulo e escolha “Conectar este mundo”."],
              ["Autorize no portal", "O módulo abre uma solicitação com os dados do mundo. Escolha esta campanha e confirme."],
            ].map(([title, text], index) => (
              <li key={title} className="flex gap-3">
                <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-full border border-accent-line bg-accent-soft font-display text-accent">
                  {index + 1}
                </span>
                <div className="space-y-1">
                  <strong className="block text-sm">{title}</strong>
                  <p className="text-sm text-fg-muted">{text}</p>
                </div>
              </li>
            ))}
          </ol>
          <p className="text-xs text-fg-subtle">
            O fluxo não pede secrets, IDs de campanha nem comandos no console. O código temporário expira em dez
            minutos e só autoriza uma conexão.
          </p>
        </div>
      </details>

      {worlds.isPending ? (
        <PanelLoading label="Carregando mundos" rows={2} />
      ) : worlds.isError ? (
        <FeedbackState
          title="Não foi possível carregar os mundos"
          tone="error"
          role="alert"
          action={<Button onClick={() => worlds.refetch()}>Tentar novamente</Button>}
        >
          {errorMessage(worlds.error)}
        </FeedbackState>
      ) : data.length === 0 ? (
        <FeedbackState title="Nenhum mundo conectado" action={<Button onClick={revealInstructions}>Ver instruções de conexão</Button>}>
          Quando um mestre iniciar a conexão pelo módulo da Ordem no Foundry, o mundo aparece aqui.
        </FeedbackState>
      ) : (
        <section className="space-y-5" aria-labelledby="foundry-world-list-title">
          <PanelHeader
            id="foundry-world-list-title"
            eyebrow="Vínculos registrados"
            title="Mundos da campanha"
            description="O estado é atualizado sozinho a cada trinta segundos."
            actions={
              <Button size="sm" onClick={() => worlds.refetch()} disabled={worlds.isFetching}>
                {worlds.isFetching ? "Atualizando…" : "Atualizar estados"}
              </Button>
            }
          />
          <motion.ul className="grid gap-4 xl:grid-cols-2" variants={staggerList} initial="hidden" animate="visible">
            {data.map((world) => (
              <motion.li key={world.worldId} variants={listItem}>
                <WorldCard
                  world={world}
                  syncing={sync.isPending && sync.variables === world.worldId}
                  syncDisabled={sync.isPending}
                  onSync={() => sync.mutate(world.worldId)}
                  onDisconnect={(trigger) => {
                    triggerRef.current = trigger;
                    disconnect.reset();
                    setDisconnectTarget(world);
                  }}
                />
              </motion.li>
            ))}
          </motion.ul>
        </section>
      )}

      <ConfirmDialog
        open={Boolean(disconnectTarget)}
        title={`Desconectar “${disconnectTarget?.worldTitle ?? ""}”?`}
        description={`O portal deixa de receber presença, personagens e comandos deste mundo em “${campaignName}”.`}
        confirmLabel="Desconectar mundo"
        busyLabel="Desconectando…"
        cancelLabel="Manter conexão"
        busy={disconnect.isPending}
        error={disconnect.isError ? `${errorMessage(disconnect.error)} Você pode tentar de novo ou manter a conexão.` : null}
        onCancel={() => setDisconnectTarget(null)}
        onConfirm={() => disconnectTarget && disconnect.mutate(disconnectTarget.worldId)}
        returnFocusRef={triggerRef}
      >
        <p>Nenhum personagem é apagado no Foundry. Para reconectar, inicie um novo pareamento pelo módulo.</p>
      </ConfirmDialog>
    </div>
  );
}

function WorldCard({
  world,
  syncing,
  syncDisabled,
  onSync,
  onDisconnect,
}: Readonly<{
  world: FoundryWorldStatus;
  syncing: boolean;
  syncDisabled: boolean;
  onSync: () => void;
  onDisconnect: (trigger: HTMLElement) => void;
}>) {
  const status = statusContent[world.status];
  return (
    <Card className={cn("flex h-full flex-col gap-5", world.status === "revoked" && "opacity-75")}>
      <header className="flex items-start gap-3">
        <span className="relative mt-2 flex size-2.5 shrink-0" aria-hidden="true">
          {world.status === "online" ? (
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-success opacity-60 motion-reduce:animate-none" />
          ) : null}
          <span className={cn("relative inline-flex size-2.5 rounded-full", status.dot)} />
        </span>
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-display text-xl leading-tight break-words">{world.worldTitle}</h3>
            <Badge tone={status.tone}>{status.label}</Badge>
          </div>
          <p className="text-sm text-fg-muted">
            {world.status === "online" ? "Recebendo atualizações do Foundry." : statusDescription(world)}
          </p>
        </div>
      </header>
      <DetailList
        items={[
          { label: "Último contato", value: world.lastSeenAt ? formatDateTime(world.lastSeenAt) : "Ainda não recebido" },
          { label: "Personagens", value: world.actorCount },
          { label: "Usuários ativos", value: world.activeUsers },
        ]}
      />
      <details className="group text-sm">
        <summary className="inline-flex min-h-9 cursor-pointer list-none items-center gap-1 rounded-md text-fg-subtle hover:text-fg focus-visible:outline-2 focus-visible:outline-focus [&::-webkit-details-marker]:hidden">
          <span aria-hidden="true" className="transition-transform duration-200 group-open:rotate-90">›</span>
          Detalhes técnicos
        </summary>
        <dl className="mt-2 grid gap-x-4 gap-y-1 sm:grid-cols-[auto_minmax(0,1fr)]">
          {[
            ["Foundry", world.foundryVersion],
            ["Sistema", world.systemVersion],
            ["Módulo", world.moduleVersion],
            ["ID do mundo", world.foundryWorldId],
            ["Registrado", formatDateTime(world.registeredAt)],
          ].map(([label, value]) => (
            <div key={label} className="contents">
              <dt className="text-fg-subtle">{label}</dt>
              <dd className="truncate font-mono text-xs leading-5 text-fg-muted max-sm:mb-2" title={value}>{value}</dd>
            </div>
          ))}
        </dl>
      </details>
      {world.status !== "revoked" ? (
        <footer className="mt-auto flex flex-wrap gap-2 border-t border-line-soft pt-4">
          <Button size="sm" onClick={onSync} disabled={syncDisabled}>
            {syncing ? "Solicitando…" : "Sincronizar personagens"}
          </Button>
          <Button size="sm" variant="ghost" className="text-danger" onClick={(event) => onDisconnect(event.currentTarget)}>
            Desconectar
          </Button>
        </footer>
      ) : (
        <p className="mt-auto border-t border-line-soft pt-4 text-sm text-fg-subtle">
          Inicie um novo pareamento no Foundry para reconectar este mundo.
        </p>
      )}
    </Card>
  );
}

function statusDescription(world: FoundryWorldStatus): string {
  if (world.status === "revoked") return "A credencial deste vínculo foi revogada.";
  return world.lastSeenAt
    ? `Sem contato desde ${formatDateTime(world.lastSeenAt)}. O mundo só fica online com o mestre conectado.`
    : "Autorizado, aguardando o Foundry concluir a conexão.";
}
