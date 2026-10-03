"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  SEDE_MAX_LEVEL,
  type SedeActivity,
  type SedeActivityInputMode,
  type SedeDeclaration,
  type SedeImportResponse,
  type SedeManageResponse,
} from "@ordem/contracts";
import { Suspense, useRef, useState, type FormEvent, type RefObject } from "react";
import { DeclarationCard } from "@/components/sede/sede-life";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { DataTable, RowActions } from "@/components/ui/data-table";
import { Dialog } from "@/components/ui/dialog";
import { FeedbackState } from "@/components/ui/feedback-state";
import { Checkbox, Field, FormGrid, Input, Select, Textarea } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { Badge, Card } from "@/components/ui/surface";
import { UrlTabs } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/toast";
import { apiFetch, errorMessage } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";
import { PanelHeader, PanelLoading } from "../kit";

const inputModeLabels: Readonly<Record<SedeActivityInputMode, string>> = {
  none: "Nada",
  note: "Pedido opcional",
  question: "Pergunta obrigatória",
};

/**
 * Vida na Sede para o Guardião: nível da Sede, atividades escolhidas pelos
 * Corvos para resolver e o catálogo de atividades.
 */
export function SedePanel({ campaignId }: Readonly<{ campaignId: string }>) {
  return (
    <Suspense fallback={<PanelLoading label="Carregando a Vida na Sede" />}>
      <SedeTabs campaignId={campaignId} />
    </Suspense>
  );
}

function SedeTabs({ campaignId }: Readonly<{ campaignId: string }>) {
  const manage = useQuery({
    queryKey: queryKeys.sedeManage(campaignId),
    queryFn: () => apiFetch<SedeManageResponse>(`/api/campaigns/${campaignId}/sede/manage`),
  });

  if (manage.isPending) return <PanelLoading label="Carregando a Vida na Sede" />;
  if (manage.isError) {
    return (
      <FeedbackState
        title="Não foi possível carregar a Vida na Sede"
        tone="error"
        role="alert"
        action={<Button onClick={() => manage.refetch()}>Tentar novamente</Button>}
      >
        {errorMessage(manage.error)}
      </FeedbackState>
    );
  }

  const data = manage.data;
  return (
    <div className="space-y-8">
      <LevelCard campaignId={campaignId} level={data.level} />
      <UrlTabs
        label="Seções da Vida na Sede"
        tabs={[
          {
            value: "pendentes",
            label: `Para resolver (${data.pending.length})`,
            content: <PendingList campaignId={campaignId} declarations={data.pending} />,
          },
          {
            value: "resolvidas",
            label: "Resolvidas",
            content: <ResolvedList campaignId={campaignId} declarations={data.resolved} />,
          },
          {
            value: "atividades",
            label: `Atividades (${data.activities.filter((activity) => activity.active).length})`,
            content: <ActivitiesTab campaignId={campaignId} activities={data.activities} level={data.level} />,
          },
        ]}
      />
    </div>
  );
}

function useInvalidate(campaignId: string) {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: queryKeys.sede(campaignId) });
}

function LevelCard({ campaignId, level }: Readonly<{ campaignId: string; level: number }>) {
  const toast = useToast();
  const invalidate = useInvalidate(campaignId);
  const [value, setValue] = useState(level);
  const save = useMutation({
    mutationFn: (next: number) =>
      apiFetch<{ level: number }>(`/api/campaigns/${campaignId}/sede/settings`, {
        method: "PUT",
        body: JSON.stringify({ level: next }),
      }),
    onSuccess: async (result) => {
      toast({
        title: `Sede no nível ${result.level}`,
        description: `Cada Corvo pode fazer ${result.level} ${result.level === 1 ? "atividade" : "atividades"} por período.`,
        tone: "success",
      });
      await invalidate();
    },
  });

  return (
    <Card className="flex flex-wrap items-end justify-between gap-4">
      <PanelHeader
        eyebrow="Sede da Ordem"
        title={`Nível ${level}`}
        description={`Cada Corvo faz ${level} ${level === 1 ? "atividade" : "atividades"} entre uma missão e outra, entre as liberadas até este nível. O período fecha quando o Corvo se inscreve numa missão.`}
      />
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          save.mutate(value);
        }}
      >
        <Field label="Nível da Sede" className="w-36">
          {({ id }) => (
            <Select id={id} value={value} onChange={(event) => setValue(Number(event.target.value))}>
              {Array.from({ length: SEDE_MAX_LEVEL }, (_, index) => index + 1).map((option) => (
                <option key={option} value={option}>
                  Nível {option}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Button type="submit" variant="primary" disabled={value === level || save.isPending}>
          {save.isPending ? "Salvando…" : "Salvar nível"}
        </Button>
      </form>
      {save.isError ? (
        <Notice tone="danger" role="alert" className="w-full">
          {errorMessage(save.error)}
        </Notice>
      ) : null}
    </Card>
  );
}

function PendingList({
  campaignId,
  declarations,
}: Readonly<{ campaignId: string; declarations: readonly SedeDeclaration[] }>) {
  const toast = useToast();
  const invalidate = useInvalidate(campaignId);
  const resolveTriggerRef = useRef<HTMLElement | null>(null);
  const discardTriggerRef = useRef<HTMLElement | null>(null);
  const [resolving, setResolving] = useState<SedeDeclaration | null>(null);
  const [discarding, setDiscarding] = useState<SedeDeclaration | null>(null);
  const discard = useMutation({
    mutationFn: (id: string) =>
      apiFetch<SedeDeclaration>(`/api/campaigns/${campaignId}/sede/declarations/${id}/cancel`, { method: "POST" }),
    onSuccess: async () => {
      setDiscarding(null);
      toast({ title: "Atividade descartada", tone: "info" });
      await invalidate();
    },
  });

  if (declarations.length === 0) {
    return (
      <FeedbackState title="Nada para resolver">
        Quando um Corvo escolher uma atividade na área do jogador, ela aparece aqui.
      </FeedbackState>
    );
  }

  return (
    <>
      <ul className="grid gap-3">
        {declarations.map((declaration) => (
          <li key={declaration.id}>
            <DeclarationCard
              declaration={declaration}
              showPlayer
              actions={
                <>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={(event) => {
                      discardTriggerRef.current = event.currentTarget;
                      discard.reset();
                      setDiscarding(declaration);
                    }}
                  >
                    Descartar
                  </Button>
                  <Button
                    size="sm"
                    variant="primary"
                    onClick={(event) => {
                      resolveTriggerRef.current = event.currentTarget;
                      setResolving(declaration);
                    }}
                  >
                    Resolver
                  </Button>
                </>
              }
            />
          </li>
        ))}
      </ul>
      <ResolveDialog
        campaignId={campaignId}
        declaration={resolving}
        returnFocusRef={resolveTriggerRef}
        onClose={() => setResolving(null)}
      />
      <ConfirmDialog
        open={Boolean(discarding)}
        title="Descartar esta atividade?"
        description={
          discarding
            ? `${discarding.actorName} perde a escolha de ${discarding.activity.name} e pode escolher de novo neste período.`
            : undefined
        }
        confirmLabel="Descartar"
        busyLabel="Descartando…"
        busy={discard.isPending}
        error={discard.isError ? errorMessage(discard.error) : null}
        onCancel={() => setDiscarding(null)}
        onConfirm={() => discarding && discard.mutate(discarding.id)}
        returnFocusRef={discardTriggerRef}
      />
    </>
  );
}

function ResolvedList({
  campaignId,
  declarations,
}: Readonly<{ campaignId: string; declarations: readonly SedeDeclaration[] }>) {
  const triggerRef = useRef<HTMLElement | null>(null);
  const [editing, setEditing] = useState<SedeDeclaration | null>(null);
  if (declarations.length === 0) {
    return <FeedbackState title="Nenhuma atividade resolvida ainda">Os resultados registrados aparecem aqui.</FeedbackState>;
  }
  return (
    <>
      <ul className="grid gap-3">
        {declarations.map((declaration) => (
          <li key={declaration.id}>
            <DeclarationCard
              declaration={declaration}
              showPlayer
              actions={
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={(event) => {
                    triggerRef.current = event.currentTarget;
                    setEditing(declaration);
                  }}
                >
                  Corrigir resultado
                </Button>
              }
            />
          </li>
        ))}
      </ul>
      <ResolveDialog campaignId={campaignId} declaration={editing} returnFocusRef={triggerRef} onClose={() => setEditing(null)} />
    </>
  );
}

function ResolveDialog({
  campaignId,
  declaration,
  returnFocusRef,
  onClose,
}: Readonly<{
  campaignId: string;
  declaration: SedeDeclaration | null;
  returnFocusRef: RefObject<HTMLElement | null>;
  onClose: () => void;
}>) {
  const toast = useToast();
  const invalidate = useInvalidate(campaignId);
  const [result, setResult] = useState("");
  const [shownFor, setShownFor] = useState<string | null>(null);
  if (declaration && shownFor !== declaration.id) {
    setShownFor(declaration.id);
    setResult(declaration.result ?? "");
  }
  const resolve = useMutation({
    mutationFn: () =>
      apiFetch<SedeDeclaration>(`/api/campaigns/${campaignId}/sede/declarations/${declaration!.id}/resolve`, {
        method: "POST",
        body: JSON.stringify({ result }),
      }),
    onSuccess: async (updated) => {
      toast({ title: "Resultado registrado", description: `${updated.actorName} — ${updated.activity.name}.`, tone: "success" });
      onClose();
      await invalidate();
    },
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (result.trim()) resolve.mutate();
  }

  return (
    <Dialog
      open={Boolean(declaration)}
      onOpenChange={(next) => {
        if (!next && !resolve.isPending) {
          resolve.reset();
          onClose();
        }
      }}
      title={declaration ? `${declaration.activity.npc} — ${declaration.activity.name}` : ""}
      description={declaration ? `${declaration.actorName}, de ${declaration.playerName}` : undefined}
      returnFocusRef={returnFocusRef}
      className="max-w-xl"
    >
      {declaration ? (
        <form className="space-y-5" onSubmit={submit}>
          <dl className="space-y-2 text-sm">
            <div>
              <dt className="font-semibold text-fg">Efeito</dt>
              <dd className="text-fg-muted">{declaration.activity.effect}</dd>
            </div>
            {declaration.note ? (
              <div>
                <dt className="font-semibold text-fg">Pedido do jogador</dt>
                <dd className="text-fg-muted whitespace-pre-line">{declaration.note}</dd>
              </div>
            ) : null}
            {declaration.roll ? (
              <div>
                <dt className="font-semibold text-fg">Rolagem {declaration.roll.formula}</dt>
                <dd className="text-fg-muted tabular-nums">
                  {declaration.roll.dice.join(" + ")} = <strong className="text-fg">{declaration.roll.total}</strong>
                </dd>
              </div>
            ) : null}
          </dl>
          <Field label="Resultado" hint="O jogador vê este texto na área dele.">
            {({ id, describedBy }) => (
              <Textarea
                id={id}
                aria-describedby={describedBy}
                rows={6}
                maxLength={2_000}
                required
                value={result}
                onChange={(event) => setResult(event.target.value)}
              />
            )}
          </Field>
          {resolve.isError ? (
            <Notice tone="danger" role="alert">
              {errorMessage(resolve.error)}
            </Notice>
          ) : null}
          <div className="flex flex-wrap justify-end gap-2 border-t border-line-soft pt-4">
            <Button variant="ghost" disabled={resolve.isPending} onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" variant="primary" disabled={resolve.isPending || !result.trim()}>
              {resolve.isPending ? "Registrando…" : "Registrar resultado"}
            </Button>
          </div>
        </form>
      ) : null}
    </Dialog>
  );
}

function ActivitiesTab({
  campaignId,
  activities,
  level,
}: Readonly<{ campaignId: string; activities: readonly SedeActivity[]; level: number }>) {
  const toast = useToast();
  const invalidate = useInvalidate(campaignId);
  const triggerRef = useRef<HTMLElement | null>(null);
  const [editor, setEditor] = useState<{ activity: SedeActivity | null } | null>(null);
  const importBase = useMutation({
    mutationFn: () =>
      apiFetch<SedeImportResponse>(`/api/campaigns/${campaignId}/sede/activities/import-base`, { method: "POST" }),
    onSuccess: async (result) => {
      toast({
        title: result.created > 0 ? "Atividades do nível 1 importadas" : "As atividades do nível 1 já estavam cadastradas",
        description: result.created > 0 ? `${result.created} atividades adicionadas.` : "Nada foi duplicado.",
      });
      await invalidate();
    },
    onError: (error) => toast({ title: "A importação falhou", description: errorMessage(error), tone: "danger" }),
  });

  const actions = (
    <>
      <Button disabled={importBase.isPending} onClick={() => importBase.mutate()}>
        {importBase.isPending ? "Importando…" : "Importar atividades do nível 1"}
      </Button>
      <Button
        variant="accent"
        onClick={(event) => {
          triggerRef.current = event.currentTarget;
          setEditor({ activity: null });
        }}
      >
        Nova atividade
      </Button>
    </>
  );

  return (
    <div className="space-y-5">
      <PanelHeader
        eyebrow="Catálogo"
        title="Atividades da Sede"
        description={`Os jogadores veem as atividades ativas até o nível atual (${level}). Desative em vez de apagar: o histórico continua apontando para elas.`}
        actions={actions}
      />
      <DataTable
        caption="Atividades da Sede"
        rows={activities}
        rowKey={(activity) => activity.id}
        empty={
          <FeedbackState title="Nenhuma atividade cadastrada">
            Importe as atividades do nível 1 (Cozinheiro, Cervejeiro, Zelador, Caçador, Lojista e Escriba) ou crie a
            primeira.
          </FeedbackState>
        }
        columns={[
          {
            id: "name",
            header: "Atividade",
            hideLabelOnMobile: true,
            sortValue: (activity) => `${activity.npc} ${activity.name}`,
            cell: (activity) => (
              <div className="min-w-0 space-y-1">
                <p className="text-xs font-bold tracking-wider text-fg-subtle uppercase">{activity.npc}</p>
                <p className="font-semibold text-fg">{activity.name}</p>
                <p className="text-xs text-fg-muted">{activity.effect}</p>
              </div>
            ),
          },
          {
            id: "level",
            header: "Nível",
            className: "md:w-20 tabular-nums",
            sortValue: (activity) => activity.minLevel,
            cell: (activity) => activity.minLevel,
          },
          {
            id: "input",
            header: "O jogador informa",
            className: "md:w-44 text-fg-muted",
            cell: (activity) =>
              [inputModeLabels[activity.inputMode], activity.roll ? `rola ${activity.roll}` : null].filter(Boolean).join(" · "),
          },
          {
            id: "status",
            header: "Situação",
            className: "md:w-28",
            cell: (activity) =>
              activity.active ? (
                activity.minLevel > level ? (
                  <Badge tone="info">Nível {activity.minLevel}</Badge>
                ) : (
                  <Badge tone="success">Disponível</Badge>
                )
              ) : (
                <Badge>Desativada</Badge>
              ),
          },
          {
            id: "actions",
            header: "Ações",
            hideLabelOnMobile: true,
            className: "md:w-28",
            cell: (activity) => (
              <RowActions>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={(event) => {
                    triggerRef.current = event.currentTarget;
                    setEditor({ activity });
                  }}
                >
                  Editar
                </Button>
              </RowActions>
            ),
          },
        ]}
      />
      <ActivityEditor
        campaignId={campaignId}
        editor={editor}
        returnFocusRef={triggerRef}
        onClose={() => setEditor(null)}
      />
    </div>
  );
}

type ActivityForm = {
  npc: string;
  name: string;
  description: string;
  effect: string;
  minLevel: number;
  inputMode: SedeActivityInputMode;
  roll: string;
  active: boolean;
  sort: number;
};

const emptyForm: ActivityForm = {
  npc: "",
  name: "",
  description: "",
  effect: "",
  minLevel: 1,
  inputMode: "none",
  roll: "",
  active: true,
  sort: 100,
};

function ActivityEditor({
  campaignId,
  editor,
  returnFocusRef,
  onClose,
}: Readonly<{
  campaignId: string;
  editor: { activity: SedeActivity | null } | null;
  returnFocusRef: RefObject<HTMLElement | null>;
  onClose: () => void;
}>) {
  const toast = useToast();
  const invalidate = useInvalidate(campaignId);
  const [form, setForm] = useState<ActivityForm>(emptyForm);
  const [shownFor, setShownFor] = useState<string | null>(null);
  const key = editor ? (editor.activity?.id ?? "new") : null;
  if (key && shownFor !== key) {
    setShownFor(key);
    const activity = editor?.activity;
    setForm(
      activity
        ? {
            npc: activity.npc,
            name: activity.name,
            description: activity.description,
            effect: activity.effect,
            minLevel: activity.minLevel,
            inputMode: activity.inputMode,
            roll: activity.roll ?? "",
            active: activity.active,
            sort: activity.sort,
          }
        : emptyForm,
    );
  }
  if (!key && shownFor) setShownFor(null);

  const save = useMutation({
    mutationFn: () => {
      const body = { ...form, roll: form.roll.trim() || null };
      const activity = editor?.activity;
      return apiFetch<SedeActivity>(
        activity
          ? `/api/campaigns/${campaignId}/sede/activities/${activity.id}`
          : `/api/campaigns/${campaignId}/sede/activities`,
        {
          method: activity ? "PATCH" : "POST",
          body: JSON.stringify(activity ? { ...body, version: activity.version } : body),
        },
      );
    },
    onSuccess: async (activity) => {
      toast({ title: editor?.activity ? "Atividade atualizada" : "Atividade criada", description: activity.name, tone: "success" });
      onClose();
      await invalidate();
    },
  });
  const update = <K extends keyof ActivityForm>(field: K, value: ActivityForm[K]) =>
    setForm((current) => ({ ...current, [field]: value }));

  return (
    <Dialog
      open={Boolean(editor)}
      onOpenChange={(next) => {
        if (!next && !save.isPending) {
          save.reset();
          onClose();
        }
      }}
      title={editor?.activity ? "Editar atividade" : "Nova atividade"}
      description="O texto aparece para os jogadores como no livro de regras da Sede."
      returnFocusRef={returnFocusRef}
      className="max-w-2xl"
    >
      <form
        className="space-y-5"
        onSubmit={(event) => {
          event.preventDefault();
          save.mutate();
        }}
      >
        <FormGrid>
          <Field label="NPC" hint="Ex.: Cozinheiro">
            {({ id, describedBy }) => (
              <Input id={id} aria-describedby={describedBy} required minLength={2} maxLength={60} value={form.npc} onChange={(event) => update("npc", event.target.value)} />
            )}
          </Field>
          <Field label="Atividade" hint="Ex.: Refeição Reforçada">
            {({ id, describedBy }) => (
              <Input id={id} aria-describedby={describedBy} required minLength={2} maxLength={80} value={form.name} onChange={(event) => update("name", event.target.value)} />
            )}
          </Field>
          <Field label="Descrição" className="full">
            {({ id }) => (
              <Textarea id={id} rows={3} required maxLength={1_000} value={form.description} onChange={(event) => update("description", event.target.value)} />
            )}
          </Field>
          <Field label="Efeito" className="full">
            {({ id }) => (
              <Textarea id={id} rows={3} required maxLength={1_000} value={form.effect} onChange={(event) => update("effect", event.target.value)} />
            )}
          </Field>
          <Field label="Nível mínimo da Sede">
            {({ id }) => (
              <Select id={id} value={form.minLevel} onChange={(event) => update("minLevel", Number(event.target.value))}>
                {Array.from({ length: SEDE_MAX_LEVEL }, (_, index) => index + 1).map((option) => (
                  <option key={option} value={option}>
                    Nível {option}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="O jogador informa">
            {({ id }) => (
              <Select id={id} value={form.inputMode} onChange={(event) => update("inputMode", event.target.value as SedeActivityInputMode)}>
                {(Object.keys(inputModeLabels) as SedeActivityInputMode[]).map((mode) => (
                  <option key={mode} value={mode}>
                    {inputModeLabels[mode]}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Rolagem automática" optional hint="Ex.: 2d20. O portal rola quando o jogador escolhe.">
            {({ id, describedBy }) => (
              <Input
                id={id}
                aria-describedby={describedBy}
                maxLength={8}
                pattern="[1-9][0-9]?d(4|6|8|10|12|20|100)"
                value={form.roll}
                onChange={(event) => update("roll", event.target.value)}
              />
            )}
          </Field>
          <Field label="Ordem na lista" hint="Menor aparece primeiro.">
            {({ id, describedBy }) => (
              <Input
                id={id}
                aria-describedby={describedBy}
                type="number"
                min={0}
                max={1_000}
                value={form.sort}
                onChange={(event) => update("sort", Number(event.target.value) || 0)}
              />
            )}
          </Field>
          <Checkbox
            className="full"
            label="Ativa (aparece para os jogadores a partir do nível mínimo)"
            checked={form.active}
            onChange={(event) => update("active", event.target.checked)}
          />
        </FormGrid>
        {save.isError ? (
          <Notice tone="danger" role="alert">
            {errorMessage(save.error)}
          </Notice>
        ) : null}
        <div className="flex flex-wrap justify-end gap-2 border-t border-line-soft pt-4">
          <Button variant="ghost" disabled={save.isPending} onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" variant="primary" disabled={save.isPending}>
            {save.isPending ? "Salvando…" : "Salvar atividade"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
