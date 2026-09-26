"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CREATURE_ATTRIBUTES,
  CREATURE_DIFFICULTIES,
  CreatureDraftSchema,
  CreatureItemSchema,
  type Creature,
  type CreatureDifficulty,
  type CreatureDraft,
  type CreatureItem,
  type CreatureTarget,
} from "@ordem/contracts";
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { FeedbackState } from "@/components/ui/feedback-state";
import { Checkbox, Field, FormGrid, Input, Select, Textarea } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { Badge, Card } from "@/components/ui/surface";
import { useToast } from "@/components/ui/toast";
import { ApiClientError, apiFetch, errorMessage } from "@/lib/api-client";
import { formatDateTime } from "@/lib/format";
import { queryKeys } from "@/lib/query-keys";
import { PanelHeader, PanelLoading } from "../kit";
import {
  againstLabel,
  attributeLabels,
  blockedCopy,
  creatureSituation,
  itemKindContent,
  itemKindOrder,
} from "./presentation";
import { useCreatureTargets } from "./queries";
import { SpellPicker } from "./spell-picker";

const MAX_ITEMS = 60;

export function CreatureEditor({
  campaignId,
  creatureId,
  onClose,
}: Readonly<{
  campaignId: string;
  creatureId: string;
  onClose: () => void;
}>) {
  const creature = useQuery({
    queryKey: queryKeys.creature(campaignId, creatureId),
    queryFn: () => apiFetch<Creature>(`/api/campaigns/${campaignId}/creatures/${creatureId}`),
    refetchInterval: (query) => (query.state.data?.status === "pending_delivery" ? 10_000 : false),
  });

  if (creature.isPending) return <PanelLoading label="Carregando a criatura" rows={4} />;
  if (creature.isError) {
    const missing = creature.error instanceof ApiClientError && creature.error.status === 404;
    return (
      <FeedbackState
        title={missing ? "Criatura não encontrada" : "Não foi possível carregar a criatura"}
        tone="error"
        role="alert"
        action={
          <div className="flex flex-wrap justify-center gap-2">
            {missing ? null : <Button onClick={() => creature.refetch()}>Tentar novamente</Button>}
            <Button variant="accent" onClick={onClose}>
              Voltar à biblioteca
            </Button>
          </div>
        }
      >
        {missing ? "Ela pode ter sido excluída por outra pessoa." : errorMessage(creature.error)}
      </FeedbackState>
    );
  }
  return (
    <EditorForm
      campaignId={campaignId}
      creature={creature.data}
      onClose={onClose}
      onReload={() => creature.refetch()}
    />
  );
}

function EditorForm({
  campaignId,
  creature,
  onClose,
  onReload,
}: Readonly<{
  campaignId: string;
  creature: Creature;
  onClose: () => void;
  onReload: () => Promise<unknown>;
}>) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const targets = useCreatureTargets(campaignId);
  const [draft, setDraft] = useState<CreatureDraft>(creature.draft);
  // Versão em que o rascunho local se baseia; o servidor recusa salvar sobre uma mais nova.
  const [base, setBase] = useState<Readonly<{ version: number; draft: CreatureDraft }>>({
    version: creature.version,
    draft: creature.draft,
  });
  const dirty = JSON.stringify(draft) !== JSON.stringify(base.draft);
  if (creature.version !== base.version && !dirty) {
    setBase({ version: creature.version, draft: creature.draft });
    setDraft(creature.draft);
  }

  const [conflict, setConflict] = useState(false);
  const [problems, setProblems] = useState<readonly string[]>([]);
  const [confirmingSend, setConfirmingSend] = useState(false);
  const [confirmingLeave, setConfirmingLeave] = useState(false);
  const [pickingSpell, setPickingSpell] = useState(false);
  const [worldId, setWorldId] = useState("");
  const [openItems, setOpenItems] = useState<ReadonlySet<string>>(new Set());
  const sendTriggerRef = useRef<HTMLButtonElement>(null);
  const backTriggerRef = useRef<HTMLButtonElement>(null);
  const spellTriggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const afterChange = async (updated: Creature) => {
    queryClient.setQueryData(queryKeys.creature(campaignId, updated.id), updated);
    await queryClient.invalidateQueries({ queryKey: queryKeys.creatures(campaignId), exact: true });
  };

  const save = useMutation({
    mutationFn: (input: Readonly<{ draft: CreatureDraft; version: number }>) =>
      apiFetch<Creature>(`/api/campaigns/${campaignId}/creatures/${creature.id}`, {
        method: "PATCH",
        body: JSON.stringify(input),
      }),
    onSuccess: async (updated) => {
      setBase({ version: updated.version, draft: updated.draft });
      setDraft(updated.draft);
      toast({ title: "Criatura salva", tone: "success" });
      await afterChange(updated);
    },
    onError: (error) => {
      if (error instanceof ApiClientError && error.status === 409) setConflict(true);
    },
  });

  const send = useMutation({
    mutationFn: (target: string) =>
      apiFetch<Creature>(`/api/campaigns/${campaignId}/creatures/${creature.id}/send`, {
        method: "POST",
        body: JSON.stringify({ worldId: target }),
      }),
    onSuccess: async (updated) => {
      setConfirmingSend(false);
      toast(
        updated.status === "failed"
          ? { title: "A criatura não foi enviada", description: updated.error ?? undefined, tone: "danger" }
          : {
              title: "Criatura enviada ao Foundry",
              description: "O ator aparece na pasta “Ordem — Criaturas” quando o mestre estiver no mundo.",
              tone: "info",
            },
      );
      await afterChange(updated);
    },
  });

  function update<K extends keyof CreatureDraft>(key: K, value: CreatureDraft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function updateItem(id: string, patch: Partial<CreatureItem>) {
    setDraft((current) => ({
      ...current,
      items: current.items.map((item) => (item.id === id ? ({ ...item, ...patch } as CreatureItem) : item)),
    }));
  }

  function addItem(item: CreatureItem) {
    setDraft((current) => ({ ...current, items: [...current.items, item] }));
    setOpenItems((current) => new Set(current).add(item.id));
  }

  function removeItem(id: string) {
    setDraft((current) => ({ ...current, items: current.items.filter((item) => item.id !== id) }));
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = CreatureDraftSchema.safeParse(draft);
    if (!parsed.success) {
      setProblems(parsed.error.issues.map((issue) => describeIssue(draft, issue.path)));
      return;
    }
    setProblems([]);
    setConflict(false);
    save.mutate({ draft: parsed.data, version: base.version });
  }

  async function reloadFromServer() {
    const result = (await onReload()) as { data?: Creature } | undefined;
    const latest = result?.data ?? creature;
    setBase({ version: latest.version, draft: latest.draft });
    setDraft(latest.draft);
    setConflict(false);
    save.reset();
  }

  const situation = creatureSituation(creature);
  const availableTargets = (targets.data?.data ?? []).filter((target) => !target.blockedReason);
  const chosenWorld = availableTargets.some((target) => target.worldId === worldId)
    ? worldId
    : creature.worldId && availableTargets.some((target) => target.worldId === creature.worldId)
      ? creature.worldId
      : availableTargets[0]?.worldId ?? "";
  const alreadySent = creature.sentVersion === creature.version && creature.status !== "failed";
  const full = draft.items.length >= MAX_ITEMS;

  return (
    <form className="space-y-8" onSubmit={submit} aria-labelledby="creature-editor-title">
      <div className="space-y-4">
        <Button
          ref={backTriggerRef}
          variant="link"
          onClick={() => (dirty ? setConfirmingLeave(true) : onClose())}
        >
          ← Voltar à biblioteca
        </Button>
        <PanelHeader
          id="creature-editor-title"
          eyebrow="Editor de criatura"
          title={draft.name.trim() || "Criatura sem nome"}
          description={
            creature.basedOn
              ? `Baseada em ${creature.basedOn.name}, do bestiário. Alterações aqui não mudam o bestiário.`
              : "Criada do zero."
          }
          actions={
            <>
              <Badge tone={situation.tone}>{situation.label}</Badge>
              {situation.outdated ? <Badge tone="warning">Alterações não enviadas</Badge> : null}
            </>
          }
        />
        <DeliveryNotice
          creature={creature}
          targets={targets.data?.data ?? []}
          targetsError={targets.isError ? errorMessage(targets.error) : null}
        />
      </div>

      <Section title="Identidade" description="Como a criatura aparece no Foundry e na ficha.">
        <FormGrid>
          <Field label="Nome">
            {({ id }) => (
              <Input
                id={id}
                value={draft.name}
                onChange={(event) => update("name", event.target.value)}
                required
                minLength={2}
                maxLength={120}
                autoComplete="off"
              />
            )}
          </Field>
          <Field label="Descritor" optional hint="Ex.: Criatura grande (fera). Até 120 caracteres.">
            {({ id, describedBy }) => (
              <Input
                id={id}
                aria-describedby={describedBy}
                value={draft.descriptor}
                onChange={(event) => update("descriptor", event.target.value)}
                maxLength={120}
                autoComplete="off"
              />
            )}
          </Field>
          <Field label="Dificuldade">
            {({ id }) => (
              <Select
                id={id}
                value={draft.difficulty}
                onChange={(event) => update("difficulty", Number(event.target.value) as CreatureDifficulty)}
              >
                {CREATURE_DIFFICULTIES.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Tamanho" hint="Como no livro: 1/2, 1, 2, 3…">
            {({ id, describedBy }) => (
              <Input
                id={id}
                aria-describedby={describedBy}
                value={draft.size}
                onChange={(event) => update("size", event.target.value)}
                maxLength={20}
                required
                autoComplete="off"
              />
            )}
          </Field>
          <Field
            label="Imagem"
            optional
            className="full"
            hint="Caminho de um arquivo do Foundry (ex.: icons/svg/mystery-man.svg) ou endereço HTTPS. Vale para o retrato e o token."
          >
            {({ id, describedBy }) => (
              <Input
                id={id}
                aria-describedby={describedBy}
                value={draft.image ?? ""}
                onChange={(event) => update("image", event.target.value.trim() ? event.target.value : null)}
                maxLength={512}
                autoComplete="off"
                spellCheck={false}
              />
            )}
          </Field>
        </FormGrid>
      </Section>

      <Section title="Atributos" description="Valores de 0 a 30. A base humana é 10.">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
          {CREATURE_ATTRIBUTES.map((key) => (
            <Field key={key} label={attributeLabels[key]}>
              {({ id }) => (
                <NumberInput
                  id={id}
                  min={0}
                  max={30}
                  value={draft.attributes[key]}
                  onChange={(value) => update("attributes", { ...draft.attributes, [key]: value })}
                />
              )}
            </Field>
          ))}
        </div>
      </Section>

      <Section title="Características" description="Defesa, Vida e o que mais o bloco de estatísticas trouxer.">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          <NumberField label="Defesa" min={0} max={40} value={draft.defense} onChange={(value) => update("defense", value)} />
          <NumberField label="Vida" min={1} max={2000} value={draft.health} onChange={(value) => update("health", value)} />
          <NumberField label="Deslocamento" min={0} max={100} value={draft.speed} onChange={(value) => update("speed", value)} />
          <NumberField label="Poder" min={0} max={10} value={draft.power} onChange={(value) => update("power", value)} />
          <NumberField label="Insanidade" min={0} max={100} value={draft.insanity} onChange={(value) => update("insanity", value)} />
          <NumberField label="Corrupção" min={0} max={100} value={draft.corruption} onChange={(value) => update("corruption", value)} />
        </div>
        <FormGrid className="mt-5">
          <Field label="Percepção e sentidos" optional hint="Ex.: visão no escuro, sentidos verdadeiros.">
            {({ id, describedBy }) => (
              <Input
                id={id}
                aria-describedby={describedBy}
                value={draft.perceptionSenses}
                onChange={(event) => update("perceptionSenses", event.target.value)}
                maxLength={200}
              />
            )}
          </Field>
          <Field label="Traços de deslocamento" optional hint="Ex.: voador, escalador.">
            {({ id, describedBy }) => (
              <Input
                id={id}
                aria-describedby={describedBy}
                value={draft.speedTraits}
                onChange={(event) => update("speedTraits", event.target.value)}
                maxLength={200}
              />
            )}
          </Field>
          <Field label="Armadura" optional hint="Ex.: couro endurecido.">
            {({ id, describedBy }) => (
              <Input
                id={id}
                aria-describedby={describedBy}
                value={draft.armor}
                onChange={(event) => update("armor", event.target.value)}
                maxLength={120}
              />
            )}
          </Field>
          <div className="flex flex-wrap items-end gap-x-6">
            <Checkbox
              label="Amedrontadora"
              checked={draft.frightening}
              onChange={(event) => update("frightening", event.target.checked)}
            />
            <Checkbox
              label="Horripilante"
              checked={draft.horrifying}
              onChange={(event) => update("horrifying", event.target.checked)}
            />
          </div>
        </FormGrid>
      </Section>

      <Section title="Descrição" description="Texto simples. Parágrafos separados por linha em branco.">
        <Field label="Descrição da criatura" optional>
          {({ id }) => (
            <Textarea
              id={id}
              rows={8}
              value={draft.description}
              onChange={(event) => update("description", event.target.value)}
              maxLength={8000}
            />
          )}
        </Field>
      </Section>

      <Section
        title="Ataques, traços e magias"
        description={`Cada item vira um item do ator no Foundry. Até ${MAX_ITEMS} itens; esta criatura tem ${draft.items.length}.`}
      >
        <div className="space-y-8">
          {itemKindOrder.map((kind) => {
            const items = draft.items.filter((item) => item.kind === kind);
            const content = itemKindContent[kind];
            return (
              <section key={kind} className="space-y-3" aria-labelledby={`items-${kind}`}>
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <div>
                    <h4 id={`items-${kind}`} className="font-semibold text-fg">
                      {content.plural} <span className="text-fg-subtle tabular-nums">({items.length})</span>
                    </h4>
                    <p className="text-xs text-fg-subtle">{content.hint}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {kind === "spell" ? (
                      <Button
                        ref={spellTriggerRef}
                        size="sm"
                        disabled={full}
                        onClick={() => setPickingSpell(true)}
                      >
                        Adicionar do grimório
                      </Button>
                    ) : null}
                    <Button
                      size="sm"
                      disabled={full}
                      onClick={() =>
                        addItem(
                          CreatureItemSchema.parse({
                            id: crypto.randomUUID(),
                            kind,
                            name: `${kind === "attack" || kind === "trait" ? "Novo" : "Nova"} ${content.label.toLocaleLowerCase("pt-BR")}`,
                          }),
                        )
                      }
                    >
                      Adicionar {content.label.toLocaleLowerCase("pt-BR")}
                    </Button>
                  </div>
                </div>
                {items.length > 0 ? (
                  <ul className="space-y-2">
                    {items.map((item) => (
                      <li key={item.id}>
                        <ItemEditor
                          item={item}
                          open={openItems.has(item.id)}
                          onToggle={(open) =>
                            setOpenItems((current) => {
                              const next = new Set(current);
                              if (open) next.add(item.id);
                              else next.delete(item.id);
                              return next;
                            })
                          }
                          onChange={(patch) => updateItem(item.id, patch)}
                          onRemove={() => removeItem(item.id)}
                        />
                      </li>
                    ))}
                  </ul>
                ) : null}
              </section>
            );
          })}
        </div>
      </Section>

      <div className="sticky bottom-0 z-10 -mx-4 space-y-3 border-t border-line-soft bg-canvas/95 px-4 py-4 backdrop-blur sm:mx-0 sm:rounded-lg sm:border sm:px-5">
        {problems.length > 0 ? (
          <Notice tone="danger" role="alert" title="Revise a ficha antes de salvar">
            <ul className="list-disc space-y-1 pl-5">
              {problems.slice(0, 6).map((problem) => (
                <li key={problem}>{problem}</li>
              ))}
            </ul>
          </Notice>
        ) : null}
        {conflict ? (
          <Notice tone="warning" role="alert" title="Outra pessoa salvou esta criatura">
            <p>Carregue a versão atual para continuar. As alterações feitas aqui desde o último salvamento serão descartadas.</p>
            <Button size="sm" className="mt-2" onClick={() => void reloadFromServer()}>
              Carregar a versão atual
            </Button>
          </Notice>
        ) : save.isError ? (
          <Notice tone="danger" role="alert">
            {errorMessage(save.error)}
          </Notice>
        ) : null}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-fg-muted" aria-live="polite">
            {dirty ? "Alterações não salvas." : `Salva em ${formatDateTime(creature.updatedAt)}.`}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" variant="primary" disabled={!dirty || save.isPending}>
              {save.isPending ? "Salvando…" : "Salvar"}
            </Button>
            <Button
              ref={sendTriggerRef}
              variant="accent"
              disabled={dirty || availableTargets.length === 0 || creature.status === "pending_delivery"}
              title={dirty ? "Salve as alterações antes de enviar." : undefined}
              onClick={() => {
                send.reset();
                setConfirmingSend(true);
              }}
            >
              {alreadySent ? "Reenviar ao Foundry" : "Enviar ao Foundry"}
            </Button>
          </div>
        </div>
      </div>

      <SpellPicker
        campaignId={campaignId}
        open={pickingSpell}
        onOpenChange={setPickingSpell}
        returnFocusRef={spellTriggerRef}
        onPick={(spell) => addItem({ ...spell, id: crypto.randomUUID() })}
      />

      <ConfirmDialog
        open={confirmingSend}
        title={`Enviar ${draft.name} ao Foundry?`}
        description="O módulo cria o ator na pasta “Ordem — Criaturas” ou atualiza o ator enviado antes."
        confirmLabel={alreadySent ? "Reenviar" : "Enviar"}
        busyLabel="Enviando…"
        busy={send.isPending}
        error={send.isError ? errorMessage(send.error) : null}
        onCancel={() => setConfirmingSend(false)}
        onConfirm={() => chosenWorld && send.mutate(chosenWorld)}
        returnFocusRef={sendTriggerRef}
      >
        <p>
          Reenviar substitui atributos e itens do ator por esta versão. Se o mestre não estiver no mundo agora, o
          envio espera na fila até ele entrar.
        </p>
        {availableTargets.length > 1 ? (
          <Field label="Mundo de destino">
            {({ id }) => (
              <Select id={id} value={chosenWorld} onChange={(event) => setWorldId(event.target.value)}>
                {availableTargets.map((target) => (
                  <option key={target.worldId} value={target.worldId}>
                    {target.worldTitle}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        ) : availableTargets[0] ? (
          <p>
            Destino: <strong className="text-fg">{availableTargets[0].worldTitle}</strong>.
          </p>
        ) : null}
      </ConfirmDialog>

      <ConfirmDialog
        open={confirmingLeave}
        title="Descartar as alterações?"
        description="As mudanças feitas desde o último salvamento serão perdidas."
        confirmLabel="Descartar e voltar"
        busyLabel="Voltando…"
        cancelLabel="Continuar editando"
        busy={false}
        error={null}
        onCancel={() => setConfirmingLeave(false)}
        onConfirm={() => {
          setConfirmingLeave(false);
          onClose();
        }}
        returnFocusRef={backTriggerRef}
      />
    </form>
  );
}

function Section({
  title,
  description,
  children,
}: Readonly<{ title: string; description: string; children: ReactNode }>) {
  return (
    <Card>
      <fieldset className="min-w-0 space-y-5">
        <legend className="sr-only">{title}</legend>
        <PanelHeader title={title} description={description} as="h3" />
        {children}
      </fieldset>
    </Card>
  );
}

/** Número com texto livre enquanto se digita; só avisa quando o valor é um inteiro. */
function NumberInput({
  id,
  value,
  min,
  max,
  onChange,
  describedBy,
}: Readonly<{
  id: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
  describedBy?: string | undefined;
}>) {
  const [text, setText] = useState(String(value));
  const [shown, setShown] = useState(value);
  if (value !== shown) {
    setShown(value);
    setText(String(value));
  }
  return (
    <Input
      id={id}
      type="number"
      inputMode="numeric"
      step={1}
      min={min}
      max={max}
      required
      aria-describedby={describedBy}
      className="tabular-nums"
      value={text}
      onChange={(event) => {
        setText(event.target.value);
        const parsed = Number.parseInt(event.target.value, 10);
        if (Number.isFinite(parsed)) {
          setShown(parsed);
          onChange(parsed);
        }
      }}
    />
  );
}

function NumberField({
  label,
  min,
  max,
  value,
  onChange,
}: Readonly<{ label: string; min: number; max: number; value: number; onChange: (value: number) => void }>) {
  return (
    <Field label={label}>
      {({ id }) => <NumberInput id={id} min={min} max={max} value={value} onChange={onChange} />}
    </Field>
  );
}

function itemSummary(item: CreatureItem): string {
  switch (item.kind) {
    case "attack":
      return [
        item.bonus ? `${item.bonus} contra ${againstLabel(item.against)}` : `contra ${againstLabel(item.against)}`,
        item.damage,
        item.boons ? `${item.boons > 0 ? "+" : ""}${item.boons} ${Math.abs(item.boons) === 1 ? "dádiva" : "dádivas"}` : "",
      ]
        .filter(Boolean)
        .join(" · ");
    case "spell":
      return [item.tradition, `nível ${item.rank}`, item.spellType === "attack" ? "ataque" : "utilidade"]
        .filter(Boolean)
        .join(" · ");
    default:
      return item.description.length > 90 ? `${item.description.slice(0, 90)}…` : item.description;
  }
}

function ItemEditor({
  item,
  open,
  onToggle,
  onChange,
  onRemove,
}: Readonly<{
  item: CreatureItem;
  open: boolean;
  onToggle: (open: boolean) => void;
  onChange: (patch: Partial<CreatureItem>) => void;
  onRemove: () => void;
}>) {
  const summary = itemSummary(item);
  return (
    <details
      className="group rounded-md border border-line-soft bg-surface-2"
      open={open}
      onToggle={(event) => onToggle(event.currentTarget.open)}
    >
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-4 py-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus [&::-webkit-details-marker]:hidden">
        <span className="min-w-0">
          <span className="block truncate font-semibold text-fg">{item.name || "Sem nome"}</span>
          {summary ? <span className="block truncate text-xs text-fg-subtle">{summary}</span> : null}
        </span>
        <span aria-hidden="true" className="shrink-0 text-fg-subtle transition-transform group-open:rotate-180">
          ▾
        </span>
      </summary>
      <div className="space-y-5 border-t border-line-soft px-4 py-4">
        <FormGrid>
          <Field label="Nome" className={item.kind === "attack" || item.kind === "spell" ? undefined : "full"}>
            {({ id }) => (
              <Input
                id={id}
                value={item.name}
                onChange={(event) => onChange({ name: event.target.value })}
                required
                maxLength={120}
                autoComplete="off"
              />
            )}
          </Field>
          {item.kind === "attack" ? <AttackFields item={item} onChange={onChange} /> : null}
          {item.kind === "spell" ? <SpellFields item={item} onChange={onChange} /> : null}
          <Field label="Descrição" optional className="full">
            {({ id }) => (
              <Textarea
                id={id}
                rows={4}
                value={item.description}
                onChange={(event) => onChange({ description: event.target.value })}
                maxLength={8000}
              />
            )}
          </Field>
        </FormGrid>
        <div className="flex justify-end">
          <Button size="sm" variant="ghost" onClick={onRemove}>
            Remover {item.name ? `“${item.name}”` : "item"}
          </Button>
        </div>
      </div>
    </details>
  );
}

function AttackFields({
  item,
  onChange,
}: Readonly<{ item: Extract<CreatureItem, { kind: "attack" }>; onChange: (patch: Partial<CreatureItem>) => void }>) {
  return (
    <>
      <Field label="Modificador" hint="Ex.: +7">
        {({ id, describedBy }) => (
          <Input
            id={id}
            aria-describedby={describedBy}
            value={item.bonus}
            onChange={(event) => onChange({ bonus: event.target.value })}
            maxLength={10}
            autoComplete="off"
          />
        )}
      </Field>
      <Field label="Contra">
        {({ id }) => (
          <Select id={id} value={item.against} onChange={(event) => onChange({ against: event.target.value as typeof item.against })}>
            <option value="defense">Defesa</option>
            {CREATURE_ATTRIBUTES.map((key) => (
              <option key={key} value={key}>
                {attributeLabels[key]}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <Field label="Dano" hint="Ex.: 2d6 + 2">
        {({ id, describedBy }) => (
          <Input
            id={id}
            aria-describedby={describedBy}
            value={item.damage}
            onChange={(event) => onChange({ damage: event.target.value })}
            maxLength={60}
            autoComplete="off"
          />
        )}
      </Field>
      <Field label="Dádivas ou perdições" hint="Positivo para dádivas, negativo para perdições.">
        {({ id, describedBy }) => (
          <NumberInput
            id={id}
            describedBy={describedBy}
            min={-10}
            max={10}
            value={item.boons}
            onChange={(boons) => onChange({ boons })}
          />
        )}
      </Field>
      <Field label="Propriedades" optional className="full" hint="Ex.: alcance 1, enredar.">
        {({ id, describedBy }) => (
          <Input
            id={id}
            aria-describedby={describedBy}
            value={item.properties}
            onChange={(event) => onChange({ properties: event.target.value })}
            maxLength={200}
          />
        )}
      </Field>
    </>
  );
}

function SpellFields({
  item,
  onChange,
}: Readonly<{ item: Extract<CreatureItem, { kind: "spell" }>; onChange: (patch: Partial<CreatureItem>) => void }>) {
  const text = (label: string, key: "tradition" | "target" | "area" | "duration", max: number) => (
    <Field label={label} optional>
      {({ id }) => (
        <Input id={id} value={item[key]} onChange={(event) => onChange({ [key]: event.target.value })} maxLength={max} />
      )}
    </Field>
  );
  return (
    <>
      {text("Tradição", "tradition", 60)}
      <Field label="Nível">
        {({ id }) => <NumberInput id={id} min={0} max={10} value={item.rank} onChange={(rank) => onChange({ rank })} />}
      </Field>
      <Field label="Atributo">
        {({ id }) => (
          <Select
            id={id}
            value={item.attribute}
            onChange={(event) => onChange({ attribute: event.target.value as typeof item.attribute })}
          >
            <option value="intellect">Intelecto</option>
            <option value="will">Vontade</option>
          </Select>
        )}
      </Field>
      <Field label="Tipo">
        {({ id }) => (
          <Select
            id={id}
            value={item.spellType}
            onChange={(event) => onChange({ spellType: event.target.value as typeof item.spellType })}
          >
            <option value="attack">Ataque</option>
            <option value="utility">Utilidade</option>
          </Select>
        )}
      </Field>
      {text("Alvo", "target", 200)}
      {text("Área", "area", 200)}
      {text("Duração", "duration", 120)}
    </>
  );
}

function DeliveryNotice({
  creature,
  targets,
  targetsError,
}: Readonly<{ creature: Creature; targets: readonly CreatureTarget[]; targetsError: string | null }>) {
  if (creature.status === "pending_delivery") {
    return (
      <Notice tone="info" role="status" title="Aguardando o Foundry">
        A criatura está na fila e o ator é criado assim que o mestre entrar no mundo com o módulo conectado.
      </Notice>
    );
  }
  if (creature.status === "failed") {
    return (
      <Notice tone="danger" role="alert" title="O Foundry não criou o ator">
        {creature.error ?? "Tente enviar de novo."}
      </Notice>
    );
  }
  if (targetsError) return <Notice tone="warning">Não foi possível consultar os mundos agora: {targetsError}</Notice>;
  if (targets.length === 0) {
    return <Notice tone="warning">Nenhum mundo do Foundry está conectado a esta campanha. A criatura fica só no portal.</Notice>;
  }
  if (targets.every((target) => target.blockedReason)) {
    return (
      <Notice tone="warning" title="Ainda não dá para enviar ao Foundry">
        <ul className="list-disc space-y-1 pl-5">
          {targets.map((target) => (
            <li key={target.worldId}>
              {target.worldTitle}: {blockedCopy[target.blockedReason!]}
              {target.blockedReason === "module_outdated" ? ` (versão registrada: ${target.moduleVersion})` : null}.
            </li>
          ))}
        </ul>
      </Notice>
    );
  }
  if (creature.status === "synced" && creature.sentAt) {
    return (
      <Notice tone="success" title="No Foundry">
        Ator atualizado em {formatDateTime(creature.sentAt)}, com a versão {creature.sentVersion} da ficha.
      </Notice>
    );
  }
  return null;
}

const fieldLabels: Readonly<Record<string, string>> = {
  name: "Nome",
  descriptor: "Descritor",
  description: "Descrição",
  difficulty: "Dificuldade",
  size: "Tamanho",
  image: "Imagem",
  defense: "Defesa",
  health: "Vida",
  speed: "Deslocamento",
  power: "Poder",
  insanity: "Insanidade",
  corruption: "Corrupção",
  perceptionSenses: "Percepção e sentidos",
  speedTraits: "Traços de deslocamento",
  armor: "Armadura",
  bonus: "Modificador",
  damage: "Dano",
  boons: "Dádivas ou perdições",
  properties: "Propriedades",
  tradition: "Tradição",
  rank: "Nível",
  target: "Alvo",
  area: "Área",
  duration: "Duração",
  ...attributeLabels,
};

function describeIssue(draft: CreatureDraft, path: readonly PropertyKey[]): string {
  const [first, index, field] = path;
  if (first === "items" && typeof index === "number") {
    const item = draft.items[index];
    const label = typeof field === "string" ? fieldLabels[field] ?? field : "item";
    return `${item?.name || "Item sem nome"}: revise ${label.toLocaleLowerCase("pt-BR")}.`;
  }
  const key = String(path[path.length - 1] ?? first ?? "");
  return `Revise ${(fieldLabels[key] ?? key).toLocaleLowerCase("pt-BR")}.`;
}
