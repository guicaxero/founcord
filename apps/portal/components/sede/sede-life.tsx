"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  sedeNoteLabel,
  sedeNoteRequired,
  type SedeActivityInputMode,
  type SedeDeclaration,
  type SedeStateResponse,
} from "@ordem/contracts";
import { useRef, useState, type FormEvent, type ReactNode, type RefObject } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Dialog } from "@/components/ui/dialog";
import { FeedbackState } from "@/components/ui/feedback-state";
import { Field, Textarea } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { Badge, Card, Eyebrow, Skeleton } from "@/components/ui/surface";
import { useToast } from "@/components/ui/toast";
import { apiFetch, errorMessage } from "@/lib/api-client";
import { formatDateTime } from "@/lib/format";
import { queryKeys } from "@/lib/query-keys";
import { ShopPicker, type ShopSelection } from "./shop-picker";

type AvailableActivity = SedeStateResponse["activities"][number];

/** Texto que o jogador escreve ao escolher a atividade, por modo; ausente quando não há. */
const NOTE_FIELDS: Readonly<Partial<Record<SedeActivityInputMode, { label: string; hint: string }>>> = {
  note: { label: "Pedido", hint: "Algo que o Corvo gostaria, se houver." },
  question: { label: "Pergunta para investigar", hint: "O que o Corvo quer descobrir? Seja específico." },
  intent: {
    label: "O que o Corvo pretende fazer",
    hint: "Descreva a atividade com detalhes: o que ele faz, com quem e com que objetivo.",
  },
};

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

/**
 * Vida na Sede na área do jogador: entre uma missão e outra, o Corvo escolhe
 * atividades na Sede. O Guardião resolve cada uma e registra o resultado.
 */
export function SedeLife({ campaignId }: Readonly<{ campaignId: string }>) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const chooseTriggerRef = useRef<HTMLElement | null>(null);
  const cancelTriggerRef = useRef<HTMLElement | null>(null);
  const [choosing, setChoosing] = useState<AvailableActivity | null>(null);
  const [cancelling, setCancelling] = useState<SedeDeclaration | null>(null);

  const state = useQuery({
    queryKey: queryKeys.sede(campaignId),
    queryFn: () => apiFetch<SedeStateResponse>(`/api/campaigns/${campaignId}/sede`),
  });
  const invalidate = () => queryClient.invalidateQueries({ queryKey: queryKeys.sede(campaignId) });

  const cancel = useMutation({
    mutationFn: (declarationId: string) =>
      apiFetch<SedeDeclaration>(`/api/campaigns/${campaignId}/sede/declarations/${declarationId}/cancel`, {
        method: "POST",
      }),
    onSuccess: async () => {
      setCancelling(null);
      toast({ title: "Atividade desfeita", description: "Ela volta a ficar disponível neste período.", tone: "info" });
      await invalidate();
    },
  });

  if (state.isPending) {
    return (
      <div className="grid gap-4" role="status" aria-label="Carregando a Vida na Sede">
        <Skeleton className="h-40" />
        <Skeleton className="h-64" />
      </div>
    );
  }
  if (state.isError) {
    return (
      <FeedbackState
        title="Não foi possível carregar a Vida na Sede"
        tone="error"
        role="alert"
        action={<Button onClick={() => state.refetch()}>Tentar novamente</Button>}
      >
        {errorMessage(state.error)}
      </FeedbackState>
    );
  }

  const { level, period, activities, current, history, actorName } = state.data;
  const canChoose = Boolean(actorName) && period.remaining > 0;

  return (
    <div className="space-y-8">
      <Card padding="lg" className="space-y-4 max-sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 space-y-1">
            <Eyebrow>Vida na Sede</Eyebrow>
            <h3 className="font-display text-2xl leading-tight">
              {!actorName
                ? "Nenhum personagem vinculado"
                : period.remaining > 0
                  ? `Você tem ${plural(period.remaining, "atividade disponível", "atividades disponíveis")}`
                  : "Atividades deste período escolhidas"}
            </h3>
            <p className="max-w-[65ch] text-sm text-fg-muted">
              {actorName
                ? `${actorName} pode fazer ${plural(period.allowance, "atividade", "atividades")} entre uma missão e outra. Escolha antes de se inscrever na próxima missão: a inscrição encerra o período.`
                : "Peça a um mestre para vincular seu personagem do Foundry. Depois disso, você escolhe as atividades aqui."}
            </p>
          </div>
          <Badge tone="accent">Sede nível {level}</Badge>
        </div>
        {period.startedAt ? (
          <p className="text-xs text-fg-subtle">Período aberto desde a sua inscrição em {formatDateTime(period.startedAt)}.</p>
        ) : null}
      </Card>

      {current.length > 0 ? (
        <section className="space-y-3" aria-labelledby="sede-current-title">
          <h4 id="sede-current-title" className="text-xs font-extrabold tracking-[0.14em] text-accent uppercase">
            Neste período
          </h4>
          <ul className="grid gap-3">
            {current.map((declaration) => (
              <li key={declaration.id}>
                <DeclarationCard
                  declaration={declaration}
                  onCancel={
                    declaration.status === "declared"
                      ? (trigger) => {
                          cancelTriggerRef.current = trigger;
                          cancel.reset();
                          setCancelling(declaration);
                        }
                      : undefined
                  }
                />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="space-y-3" aria-labelledby="sede-activities-title">
        <h4 id="sede-activities-title" className="text-xs font-extrabold tracking-[0.14em] text-accent uppercase">
          Atividades da Sede
        </h4>
        {activities.length === 0 ? (
          <FeedbackState title="Nenhuma atividade disponível">
            O Guardião ainda não cadastrou as atividades da Sede.
          </FeedbackState>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {activities.map((activity) => (
              <li key={activity.id} className="min-w-0">
                <Card className="flex h-full flex-col gap-3">
                  <div className="space-y-1">
                    <p className="text-xs font-bold tracking-wider text-fg-subtle uppercase">{activity.npc}</p>
                    <h5 className="font-display text-xl leading-tight">{activity.name}</h5>
                  </div>
                  <p className="text-sm text-fg-muted">{activity.description}</p>
                  <p className="text-sm">
                    <strong className="text-fg">Efeito:</strong> <span className="text-fg-muted">{activity.effect}</span>
                  </p>
                  <div className="mt-auto pt-2">
                    {activity.chosenThisPeriod ? (
                      <Badge tone="success">Escolhida neste período</Badge>
                    ) : (
                      <Button
                        variant="secondary"
                        disabled={!canChoose}
                        onClick={(event) => {
                          chooseTriggerRef.current = event.currentTarget;
                          setChoosing(activity);
                        }}
                      >
                        Escolher
                      </Button>
                    )}
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>

      {history.length > 0 ? (
        <section className="space-y-3" aria-labelledby="sede-history-title">
          <h4 id="sede-history-title" className="text-xs font-extrabold tracking-[0.14em] text-accent uppercase">
            Períodos anteriores
          </h4>
          <ul className="grid gap-3">
            {history.map((declaration) => (
              <li key={declaration.id}>
                <DeclarationCard declaration={declaration} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <ChooseDialog
        campaignId={campaignId}
        activity={choosing}
        returnFocusRef={chooseTriggerRef}
        onClose={() => setChoosing(null)}
        onChosen={async (declaration) => {
          setChoosing(null);
          toast({
            title: `${declaration.activity.name} escolhida`,
            description: "O Guardião resolve a atividade e registra o resultado.",
            tone: "success",
          });
          await invalidate();
        }}
      />

      <ConfirmDialog
        open={Boolean(cancelling)}
        title={`Desfazer ${cancelling?.activity.name ?? "a atividade"}?`}
        description="A atividade volta a ficar disponível neste período."
        confirmLabel="Desfazer"
        busyLabel="Desfazendo…"
        busy={cancel.isPending}
        error={cancel.isError ? errorMessage(cancel.error) : null}
        onCancel={() => setCancelling(null)}
        onConfirm={() => cancelling && cancel.mutate(cancelling.id)}
        returnFocusRef={cancelTriggerRef}
      />
    </div>
  );
}

export function DeclarationCard({
  declaration,
  onCancel,
  showPlayer = false,
  actions,
}: Readonly<{
  declaration: SedeDeclaration;
  onCancel?: ((trigger: HTMLElement) => void) | undefined;
  showPlayer?: boolean | undefined;
  actions?: ReactNode | undefined;
}>) {
  const resolved = declaration.status === "resolved";
  return (
    <Card padding="sm" className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-bold tracking-wider text-fg-subtle uppercase">
            {declaration.activity.npc}
            {showPlayer ? ` · ${declaration.actorName} (${declaration.playerName})` : ""}
          </p>
          <p className="font-display text-lg leading-tight">{declaration.activity.name}</p>
          <p className="text-xs text-fg-subtle">Escolhida em {formatDateTime(declaration.createdAt)}</p>
        </div>
        <Badge tone={resolved ? "success" : "info"}>{resolved ? "Resolvida" : "Aguardando o Guardião"}</Badge>
      </div>
      {showPlayer && !declaration.registroLinked ? (
        <p className="text-xs text-warning">
          Sem tópico no Registro do Corvo: a atividade e o resultado não vão para o Discord. Ligue o tópico em
          Personagens.
        </p>
      ) : null}
      {declaration.note ? (
        <p className="text-sm text-fg-muted whitespace-pre-line">
          <strong className="text-fg">{sedeNoteLabel(declaration.activity.inputMode)}:</strong> {declaration.note}
        </p>
      ) : null}
      {declaration.items.length > 0 ? (
        <div className="text-sm text-fg-muted">
          <p>
            <strong className="text-fg">Itens com o Lojista</strong> (total {declaration.itemsTotal}):{" "}
            {declaration.items.map((item) => (item.quantity > 1 ? `${item.quantity}× ${item.name}` : item.name)).join(", ")}
          </p>
          {declaration.delivery ? <DeliveryStatus delivery={declaration.delivery} /> : null}
        </div>
      ) : null}
      {declaration.roll ? (
        <p className="text-sm text-fg-muted">
          <strong className="text-fg">Rolagem {declaration.roll.formula}:</strong> {declaration.roll.dice.join(" + ")} ={" "}
          <strong className="text-fg tabular-nums">{declaration.roll.total}</strong>
        </p>
      ) : null}
      {resolved && declaration.result ? (
        <Notice tone="success" title="Resultado">
          <p className="whitespace-pre-line">{declaration.result}</p>
          {declaration.resolvedByName ? (
            <p className="mt-1 text-xs">
              Registrado por {declaration.resolvedByName}
              {declaration.resolvedAt ? ` em ${formatDateTime(declaration.resolvedAt)}` : ""}.
            </p>
          ) : null}
        </Notice>
      ) : null}
      {onCancel || actions ? (
        <div className="flex flex-wrap justify-end gap-2">
          {actions}
          {onCancel ? (
            <Button size="sm" variant="ghost" onClick={(event) => onCancel(event.currentTarget)}>
              Desfazer
            </Button>
          ) : null}
        </div>
      ) : null}
    </Card>
  );
}

function DeliveryStatus({ delivery }: Readonly<{ delivery: NonNullable<SedeDeclaration["delivery"]> }>) {
  if (delivery.status === "delivered") {
    return (
      <p className="mt-1 text-xs text-success">
        Itens entregues no Foundry{delivery.deliveredAt ? ` em ${formatDateTime(delivery.deliveredAt)}` : ""}.
      </p>
    );
  }
  if (delivery.status === "pending_delivery") {
    return <p className="mt-1 text-xs text-info">Itens a caminho do Foundry: chegam quando o mestre estiver no mundo.</p>;
  }
  return <p className="mt-1 text-xs text-danger">A entrega no Foundry falhou: {delivery.error ?? "tente de novo."}</p>;
}

function ChooseDialog({
  campaignId,
  activity,
  returnFocusRef,
  onClose,
  onChosen,
}: Readonly<{
  campaignId: string;
  activity: AvailableActivity | null;
  returnFocusRef: RefObject<HTMLElement | null>;
  onClose: () => void;
  onChosen: (declaration: SedeDeclaration) => Promise<void>;
}>) {
  const [note, setNote] = useState("");
  const [items, setItems] = useState<ShopSelection>(new Map());
  const declare = useMutation({
    mutationFn: () =>
      apiFetch<SedeDeclaration>(`/api/campaigns/${campaignId}/sede/declarations`, {
        method: "POST",
        body: JSON.stringify({
          activityId: activity!.id,
          note: note.trim() || null,
          items: [...items].map(([catalogItemId, quantity]) => ({ catalogItemId, quantity })),
        }),
      }),
    onSuccess: async (declaration) => {
      setNote("");
      setItems(new Map());
      await onChosen(declaration);
    },
  });
  const noteField = activity ? NOTE_FIELDS[activity.inputMode] : undefined;
  const noteRequired = activity ? sedeNoteRequired(activity.inputMode) : false;
  const shop = activity?.inputMode === "shop";

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (noteRequired && !note.trim()) return;
    if (shop && items.size === 0) return;
    declare.mutate();
  }

  return (
    <Dialog
      open={Boolean(activity)}
      onOpenChange={(next) => {
        if (!next && !declare.isPending) {
          declare.reset();
          onClose();
        }
      }}
      title={activity ? `${activity.npc} — ${activity.name}` : ""}
      description={activity?.description}
      returnFocusRef={returnFocusRef}
      className="max-w-lg"
    >
      {activity ? (
        <form className="space-y-5" onSubmit={submit}>
          <p className="text-sm">
            <strong className="text-fg">Efeito:</strong> <span className="text-fg-muted">{activity.effect}</span>
          </p>
          {activity.roll ? (
            <p className="text-sm text-fg-muted">
              O portal rola {activity.roll} quando você confirmar, e o Guardião usa o resultado para resolver.
            </p>
          ) : null}
          {shop ? (
            <ShopPicker campaignId={campaignId} activityId={activity.id} selection={items} onChange={setItems} />
          ) : null}
          {noteField ? (
            <Field label={noteField.label} optional={!noteRequired} hint={noteField.hint}>
              {({ id, describedBy }) => (
                <Textarea
                  id={id}
                  aria-describedby={describedBy}
                  rows={4}
                  maxLength={1_000}
                  required={noteRequired}
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                />
              )}
            </Field>
          ) : null}
          {declare.isError ? (
            <Notice tone="danger" role="alert">
              {errorMessage(declare.error)}
            </Notice>
          ) : null}
          <div className="flex flex-wrap justify-end gap-2 border-t border-line-soft pt-4">
            <Button variant="ghost" disabled={declare.isPending} onClick={onClose}>
              Voltar
            </Button>
            <Button
              type="submit"
              variant="primary"
              disabled={declare.isPending || (noteRequired && !note.trim()) || (shop && items.size === 0)}
            >
              {declare.isPending ? "Registrando…" : "Escolher esta atividade"}
            </Button>
          </div>
        </form>
      ) : null}
    </Dialog>
  );
}
