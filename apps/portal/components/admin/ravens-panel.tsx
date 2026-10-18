"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ravenAttributeKeys,
  ravenStatKeys,
  type RavenManagement,
  type RavenManagementListResponse,
  type RavenOverrides,
  type RavenStatus,
} from "@ordem/contracts";
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { ImagePicker } from "@/components/media/image-picker";
import { RavenPortrait } from "@/components/ravens/raven-portrait";
import {
  attributeLabels,
  ravenStatusLabels,
  ravenStatusTone,
  statLabels,
  valueOrDash,
} from "@/components/ravens/raven-presentation";
import { missionNumberLabel } from "@/components/missions/mission-presentation";
import { Button, ButtonLink } from "@/components/ui/button";
import { DataTable, RowActions } from "@/components/ui/data-table";
import { Dialog } from "@/components/ui/dialog";
import { FeedbackState } from "@/components/ui/feedback-state";
import { Checkbox, Field, FormGrid, Input, Select, Textarea } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { Badge } from "@/components/ui/surface";
import { useToast } from "@/components/ui/toast";
import { apiFetch, errorMessage } from "@/lib/api-client";
import { normalizeSearch } from "@/lib/format";
import { queryKeys } from "@/lib/query-keys";
import { PanelLoading, SearchField } from "./kit";

type Editor = { raven: RavenManagement | null };

/** Registro dos Corvos no painel: correções, Corvos avulsos e visibilidade. */
export function RavensPanel({ campaignId }: Readonly<{ campaignId: string }>) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const triggerRef = useRef<HTMLElement | null>(null);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [search, setSearch] = useState("");
  const ravens = useQuery({
    queryKey: queryKeys.ravens(campaignId, "manage"),
    queryFn: () => apiFetch<RavenManagementListResponse>(`/api/campaigns/${campaignId}/ravens/manage`),
  });
  const save = useMutation({
    mutationFn: (payload: { raven: RavenManagement | null; body: Record<string, unknown> }) =>
      payload.raven
        ? apiFetch<RavenManagement>(`/api/ravens/${payload.raven.id}`, {
            method: "PATCH",
            body: JSON.stringify({ ...payload.body, version: payload.raven.version }),
          })
        : apiFetch<RavenManagement>(`/api/campaigns/${campaignId}/ravens`, {
            method: "POST",
            body: JSON.stringify({ ...payload.body, campaignId }),
          }),
    onSuccess: async (raven, payload) => {
      setEditor(null);
      toast({
        title: payload.raven ? "Corvo atualizado" : "Corvo cadastrado",
        description: raven.listed
          ? `${raven.effective.name} aparece assim no Registro dos Corvos.`
          : `${raven.effective.name} está fora do registro público.`,
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.ravens(campaignId, "manage") }),
        queryClient.invalidateQueries({ queryKey: queryKeys.ravens(campaignId) }),
      ]);
    },
  });

  if (ravens.isPending) return <PanelLoading label="Consultando o registro" />;
  if (ravens.isError) {
    return (
      <FeedbackState
        title="Não foi possível carregar o registro"
        tone="error"
        role="alert"
        action={<Button onClick={() => ravens.refetch()}>Tentar novamente</Button>}
      >
        {errorMessage(ravens.error)}
      </FeedbackState>
    );
  }

  const { data, members } = ravens.data;
  const query = normalizeSearch(search);
  const visible = data.filter(
    (raven) => !query || normalizeSearch(`${raven.effective.name} ${raven.effective.playerName ?? ""}`).includes(query),
  );

  function open(event: { currentTarget: HTMLElement }, raven: RavenManagement | null) {
    triggerRef.current = event.currentTarget;
    save.reset();
    setEditor({ raven });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <SearchField label="Buscar Corvo" value={search} onChange={setSearch} placeholder="Nome ou jogador" className="max-w-md" />
        <div className="flex flex-wrap gap-2">
          <ButtonLink href="/corvos" variant="ghost">
            Ver o registro público
          </ButtonLink>
          <Button variant="accent" onClick={(event) => open(event, null)}>
            Novo Corvo avulso
          </Button>
        </div>
      </div>
      <p className="max-w-[70ch] text-sm text-fg-muted">
        Personagens vinculados em Personagens entram aqui sozinhos, com os dados do Foundry. Missões e
        sessões contam a partir dos Corvos marcados no registro de cada missão. Corrija o que precisar:
        campo vazio volta ao valor automático.
      </p>

      {data.length === 0 ? (
        <FeedbackState
          title="Nenhum Corvo ainda"
          action={<Button variant="accent" onClick={(event) => open(event, null)}>Cadastrar o primeiro Corvo</Button>}
        >
          Vincule personagens do Foundry em Personagens ou cadastre um Corvo avulso.
        </FeedbackState>
      ) : (
        <DataTable
          caption="Corvos da campanha"
          rows={visible}
          rowKey={(raven) => raven.id}
          initialSort={{ column: "name", direction: "ascending" }}
          empty={
            <FeedbackState title="Nenhum Corvo corresponde à busca" action={<Button onClick={() => setSearch("")}>Limpar busca</Button>}>
              Tente outro nome.
            </FeedbackState>
          }
          columns={[
            {
              id: "name",
              header: "Corvo",
              hideLabelOnMobile: true,
              sortValue: (raven) => raven.effective.name,
              cell: (raven) => (
                <div className="flex min-w-0 items-center gap-3">
                  <RavenPortrait name={raven.effective.name} src={raven.effective.imageUrl} className="size-11 shrink-0 rounded-full border border-line" />
                  <div className="min-w-0">
                    <p className="font-semibold break-words text-fg">{raven.effective.name}</p>
                    <p className="text-xs text-fg-subtle">{raven.effective.playerName ?? "Sem jogador"}</p>
                  </div>
                </div>
              ),
            },
            {
              id: "source",
              header: "Origem",
              sortValue: (raven) => (raven.foundry ? 0 : 1),
              className: "md:w-28 text-fg-muted",
              cell: (raven) => (raven.foundry ? "Foundry" : "Avulso"),
            },
            {
              id: "status",
              header: "Situação",
              sortValue: (raven) => raven.status,
              className: "md:w-40",
              cell: (raven) => (
                <div className="flex flex-wrap gap-1.5">
                  <Badge tone={ravenStatusTone[raven.status]}>{ravenStatusLabels[raven.status]}</Badge>
                  {raven.listed ? null : <Badge>Fora do registro</Badge>}
                </div>
              ),
            },
            {
              id: "missions",
              header: "Missões",
              sortValue: (raven) => raven.effective.missionsCompleted,
              className: "md:w-32 tabular-nums text-fg-muted",
              cell: (raven) => `${raven.effective.missionsCompleted} conc. · ${raven.effective.missionsFailed} frac.`,
            },
            {
              id: "actions",
              header: "Ações",
              hideLabelOnMobile: true,
              className: "md:w-28",
              cell: (raven) => (
                <RowActions>
                  <Button size="sm" variant="ghost" onClick={(event) => open(event, raven)}>
                    Editar
                  </Button>
                </RowActions>
              ),
            },
          ]}
        />
      )}

      <Dialog
        open={Boolean(editor)}
        onOpenChange={(next) => {
          if (!next && !save.isPending) setEditor(null);
        }}
        title={editor?.raven ? `Editar ${editor.raven.effective.name}` : "Novo Corvo avulso"}
        description={
          editor?.raven?.foundry
            ? "Os dados vêm do Foundry e das missões. Preencha só o que quiser corrigir; campo vazio volta ao automático."
            : "Para Corvos sem personagem no Foundry, como os que morreram ou se aposentaram antes do portal."
        }
        className="max-w-3xl"
        returnFocusRef={triggerRef}
      >
        {editor ? (
          <RavenForm
            key={editor.raven?.id ?? "new"}
            campaignId={campaignId}
            raven={editor.raven}
            members={members}
            busy={save.isPending}
            error={save.isError ? errorMessage(save.error) : null}
            onCancel={() => setEditor(null)}
            onSubmit={(body) => save.mutate({ raven: editor.raven, body })}
          />
        ) : null}
      </Dialog>
    </div>
  );
}

function RavenForm({
  campaignId,
  raven,
  members,
  busy,
  error,
  onCancel,
  onSubmit,
}: Readonly<{
  campaignId: string;
  raven: RavenManagement | null;
  members: RavenManagementListResponse["members"];
  busy: boolean;
  error: string | null;
  onCancel: () => void;
  onSubmit: (body: Record<string, unknown>) => void;
}>) {
  const [image, setImage] = useState<string[]>(raven?.imageMediaId ? [raven.imageMediaId] : []);
  const [uploading, setUploading] = useState(false);
  const errorRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);
  const overrides = raven?.overrides;
  const automatic = raven?.automatic;
  const fromFoundry = Boolean(raven?.foundry);
  const auto = (value: ReactNode) => (raven ? <>Automático: {value}</> : undefined);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const text = (name: string) => String(data.get(name) ?? "").trim() || null;
    const number = (name: string) => {
      const value = String(data.get(name) ?? "").trim();
      return value === "" ? null : Number(value);
    };
    const next: RavenOverrides = {
      name: text("name"),
      playerName: text("playerName"),
      ancestry: text("ancestry"),
      novicePath: text("novicePath"),
      expertPath: text("expertPath"),
      masterPath: text("masterPath"),
      level: number("level"),
      sessionsPlayed: number("sessionsPlayed"),
      missionsCompleted: number("missionsCompleted"),
      missionsFailed: number("missionsFailed"),
      lastMission: text("lastMission"),
      activities: text("activities"),
      attributes: Object.fromEntries(ravenAttributeKeys.map((key) => [key, number(`attr-${key}`)])) as RavenOverrides["attributes"],
      stats: Object.fromEntries(ravenStatKeys.map((key) => [key, number(`stat-${key}`)])) as RavenOverrides["stats"],
    };
    onSubmit({
      status: String(data.get("status")) as RavenStatus,
      listed: data.get("listed") === "on",
      userId: text("userId"),
      imageMediaId: image[0] ?? null,
      overrides: next,
    });
  }

  const lastMissionAuto = automatic?.lastMission
    ? [missionNumberLabel(automatic.lastMission.number), automatic.lastMission.title].filter(Boolean).join(" - ")
    : "nenhuma";

  return (
    <form className="space-y-8" onSubmit={submit}>
      <Section title="Identificação">
        <FormGrid>
          <Field label="Nome" optional={fromFoundry} hint={fromFoundry ? auto(valueOrDash(automatic?.name)) : undefined}>
            {({ id, describedBy }) => (
              <Input id={id} name="name" defaultValue={overrides?.name ?? ""} required={!fromFoundry} maxLength={120} aria-describedby={describedBy} />
            )}
          </Field>
          <Field label="Situação">
            {({ id }) => (
              <Select id={id} name="status" defaultValue={raven?.status ?? "active"}>
                <option value="active">{ravenStatusLabels.active}</option>
                <option value="retired">{ravenStatusLabels.retired}</option>
                <option value="dead">{ravenStatusLabels.dead}</option>
              </Select>
            )}
          </Field>
          <Field label="Jogador" optional hint="Membro da campanha que joga com este Corvo.">
            {({ id, describedBy }) => (
              <Select id={id} name="userId" defaultValue={raven?.userId ?? ""} aria-describedby={describedBy}>
                <option value="">Sem jogador no portal</option>
                {members.map((member) => (
                  <option key={member.userId} value={member.userId}>
                    {member.displayName}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field
            label="Jogador exibido"
            optional
            hint={raven ? auto(valueOrDash(automatic?.playerName)) : "Como o nome aparece no registro, por exemplo @Umamusume (Doug Jones)."}
          >
            {({ id, describedBy }) => (
              <Input id={id} name="playerName" defaultValue={overrides?.playerName ?? ""} maxLength={120} aria-describedby={describedBy} />
            )}
          </Field>
          <div className="full">
            <ImagePicker
              campaignId={campaignId}
              label="Retrato"
              singleName="o retrato"
              hint={automatic?.hasPortrait ? "Sem imagem enviada, o registro usa o retrato do Foundry." : "Retrato do Corvo, mostrado no registro e na ficha."}
              value={image}
              onChange={setImage}
              onBusyChange={setUploading}
            />
          </div>
          <Checkbox className="full" name="listed" defaultChecked={raven?.listed ?? true} label="Mostrar no Registro dos Corvos" />
        </FormGrid>
      </Section>

      <Section title="Trilhas e nível">
        <FormGrid>
          <OverrideText name="ancestry" label="Ancestralidade" value={overrides?.ancestry} automatic={automatic?.ancestry} showAuto={Boolean(raven)} />
          <OverrideNumber name="level" label="Nível" max={99} value={overrides?.level} automatic={automatic?.level} showAuto={Boolean(raven)} />
          <OverrideText name="novicePath" label="Trilha de novato" value={overrides?.novicePath} automatic={automatic?.paths.novice} showAuto={Boolean(raven)} />
          <OverrideText name="expertPath" label="Trilha de especialista" value={overrides?.expertPath} automatic={automatic?.paths.expert} showAuto={Boolean(raven)} />
          <OverrideText name="masterPath" label="Trilha de mestre" value={overrides?.masterPath} automatic={automatic?.paths.master} showAuto={Boolean(raven)} />
        </FormGrid>
      </Section>

      <Section title="Progresso">
        <FormGrid className="sm:grid-cols-3">
          <OverrideNumber name="sessionsPlayed" label="Sessões jogadas" max={9_999} value={overrides?.sessionsPlayed} automatic={automatic?.sessionsPlayed} showAuto={Boolean(raven)} />
          <OverrideNumber name="missionsCompleted" label="Missões concluídas" max={9_999} value={overrides?.missionsCompleted} automatic={automatic?.missionsCompleted} showAuto={Boolean(raven)} />
          <OverrideNumber name="missionsFailed" label="Missões fracassadas" max={9_999} value={overrides?.missionsFailed} automatic={automatic?.missionsFailed} showAuto={Boolean(raven)} />
        </FormGrid>
      </Section>

      <Section title="Vida na Sede">
        <FormGrid>
          <Field label="Última missão" optional className="full" hint={raven ? auto(lastMissionAuto) : "Por exemplo: Missão N° 001 - Problemas na Vila de Asilo."}>
            {({ id, describedBy }) => (
              <Input id={id} name="lastMission" defaultValue={overrides?.lastMission ?? ""} maxLength={200} aria-describedby={describedBy} />
            )}
          </Field>
          <Field
            label="Atividades realizadas"
            optional
            className="full"
            hint={
              raven
                ? auto(automatic?.activities.length ? automatic.activities.join("; ") : "nenhuma resolvida na Sede")
                : "Uma por linha, por exemplo: Escriba - Pesquisa."
            }
          >
            {({ id, describedBy }) => (
              <Textarea id={id} name="activities" rows={3} maxLength={1_000} defaultValue={overrides?.activities ?? ""} aria-describedby={describedBy} />
            )}
          </Field>
        </FormGrid>
      </Section>

      <Section title="Atributos e status">
        <div className="grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-4">
          {attributeLabels.map(({ key, label }) => (
            <OverrideNumber key={key} name={`attr-${key}`} label={label} max={999} value={overrides?.attributes[key]} automatic={automatic?.attributes[key]} showAuto={Boolean(raven)} />
          ))}
          {statLabels.map(({ key, label }) => (
            <OverrideNumber key={key} name={`stat-${key}`} label={label} max={999} value={overrides?.stats[key]} automatic={automatic?.stats[key]} showAuto={Boolean(raven)} />
          ))}
        </div>
      </Section>

      {error ? <Notice ref={errorRef} tone="danger" role="alert">{error}</Notice> : null}
      <div className="flex flex-col-reverse gap-3 border-t border-line-soft pt-4 sm:flex-row sm:justify-end">
        <Button disabled={busy} onClick={onCancel}>Cancelar</Button>
        <Button type="submit" variant="primary" disabled={busy || uploading}>
          {busy ? "Salvando…" : uploading ? "Aguarde o envio…" : raven ? "Salvar Corvo" : "Cadastrar Corvo"}
        </Button>
      </div>
    </form>
  );
}

function Section({ title, children }: Readonly<{ title: string; children: ReactNode }>) {
  return (
    <fieldset className="space-y-4">
      <legend className="mb-4 text-xs font-extrabold tracking-[0.14em] text-accent uppercase">{title}</legend>
      {children}
    </fieldset>
  );
}

function OverrideText({
  name,
  label,
  value,
  automatic,
  showAuto,
}: Readonly<{ name: string; label: string; value: string | null | undefined; automatic: string | null | undefined; showAuto: boolean }>) {
  return (
    <Field label={label} optional hint={showAuto ? <>Automático: {valueOrDash(automatic)}</> : undefined}>
      {({ id, describedBy }) => <Input id={id} name={name} defaultValue={value ?? ""} maxLength={120} aria-describedby={describedBy} />}
    </Field>
  );
}

function OverrideNumber({
  name,
  label,
  max,
  value,
  automatic,
  showAuto,
}: Readonly<{ name: string; label: string; max: number; value: number | null | undefined; automatic: number | null | undefined; showAuto: boolean }>) {
  return (
    <Field label={label} optional hint={showAuto ? <>Automático: {valueOrDash(automatic)}</> : undefined}>
      {({ id, describedBy }) => (
        <Input id={id} name={name} type="number" inputMode="numeric" min={0} max={max} defaultValue={value ?? ""} aria-describedby={describedBy} />
      )}
    </Field>
  );
}
