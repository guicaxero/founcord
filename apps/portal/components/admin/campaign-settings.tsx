"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { Campaign, CreateCampaignInput } from "@ordem/contracts";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Checkbox, Field, FormGrid, Input, Select, Textarea } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { Card } from "@/components/ui/surface";
import { useToast } from "@/components/ui/toast";
import { apiFetch, errorMessage } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";
import { PanelHeader } from "./kit";

const slugPattern = "[a-z0-9]+(?:-[a-z0-9]+)*";

export function CampaignSettings({
  campaign,
  onCreated,
}: Readonly<{ campaign: Campaign; onCreated: (id: string) => void }>) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [creating, setCreating] = useState(false);
  const update = useMutation({
    mutationFn: (input: Record<string, unknown>) =>
      apiFetch<Campaign>(`/api/campaigns/${campaign.id}`, {
        method: "PATCH",
        body: JSON.stringify({ ...input, version: campaign.version }),
      }),
    onSuccess: async () => {
      toast({ title: "Configurações salvas", description: `${campaign.name} foi atualizada.` });
      await queryClient.invalidateQueries({ queryKey: queryKeys.campaigns });
    },
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    update.mutate({
      name: String(form.get("name")),
      slug: String(form.get("slug")),
      description: String(form.get("description")),
      status: String(form.get("status")),
      isPublic: form.get("isPublic") === "on",
      diaryPublic: form.get("diaryPublic") === "on",
    });
  }

  return (
    <div className="space-y-6">
      <Card className="space-y-6">
        <PanelHeader
          eyebrow="Configuração atual"
          title={campaign.name}
          description="Identidade e disponibilidade desta campanha no portal."
          actions={<Button onClick={() => setCreating(true)}>Nova campanha</Button>}
        />
        <form className="space-y-6" key={campaign.version} onSubmit={submit}>
          <FormGrid>
            <Field label="Nome">
              {({ id }) => <Input id={id} name="name" defaultValue={campaign.name} required minLength={3} />}
            </Field>
            <Field label="Identificador" hint="Letras minúsculas, números e hífens. Aparece nos endereços.">
              {({ id, describedBy }) => (
                <Input id={id} name="slug" defaultValue={campaign.slug} required pattern={slugPattern} aria-describedby={describedBy} />
              )}
            </Field>
            <Field label="Descrição" className="full">
              {({ id }) => <Textarea id={id} name="description" rows={5} defaultValue={campaign.description} />}
            </Field>
            <Field label="Situação">
              {({ id }) => (
                <Select id={id} name="status" defaultValue={campaign.status}>
                  <option value="draft">Rascunho</option>
                  <option value="active">Ativa</option>
                  <option value="archived">Arquivada</option>
                </Select>
              )}
            </Field>
            <div className="flex items-end">
              <Checkbox name="isPublic" defaultChecked={campaign.isPublic} label="Exibir no portal público" />
            </div>
            <div className="full space-y-1">
              <Checkbox
                name="diaryPublic"
                defaultChecked={campaign.diaryPublic}
                label="Diário de Sessões aberto aos jogadores"
                aria-describedby="diary-public-hint"
              />
              <p id="diary-public-hint" className="pl-8 text-sm text-fg-subtle">
                Desmarcado, o Diário some do menu e da página inicial e só a gestão o lê.
              </p>
            </div>
          </FormGrid>
          {update.isError ? <Notice tone="danger" role="alert">{errorMessage(update.error)}</Notice> : null}
          <div className="flex justify-end border-t border-line-soft pt-4">
            <Button type="submit" variant="primary" disabled={update.isPending}>
              {update.isPending ? "Salvando…" : "Salvar configurações"}
            </Button>
          </div>
        </form>
      </Card>
      <CampaignCreatorDialog
        open={creating}
        onOpenChange={setCreating}
        onCreated={(id) => {
          setCreating(false);
          onCreated(id);
        }}
      />
    </div>
  );
}

export function CampaignCreatorDialog({
  open,
  onOpenChange,
  onCreated,
}: Readonly<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (id: string) => void;
}>) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const create = useMutation({
    mutationFn: (input: CreateCampaignInput) =>
      apiFetch<Campaign>("/api/campaigns", { method: "POST", body: JSON.stringify(input) }),
    onSuccess: async (campaign) => {
      toast({ title: "Campanha criada", description: `${campaign.name} já está disponível no painel.` });
      await queryClient.invalidateQueries({ queryKey: queryKeys.campaigns });
      onCreated(campaign.id);
    },
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    create.mutate({
      name: String(form.get("name")),
      slug: String(form.get("slug")),
      description: String(form.get("description")),
      status: "active",
      isPublic: form.get("isPublic") === "on",
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!create.isPending) {
          create.reset();
          onOpenChange(next);
        }
      }}
      title="Criar campanha"
      description="Abra um novo espaço persistente dentro do portal."
    >
      <form className="space-y-6" onSubmit={submit}>
        <FormGrid>
          <Field label="Nome">
            {({ id }) => <Input id={id} name="name" required minLength={3} />}
          </Field>
          <Field label="Identificador" hint="Ex.: ordem-da-ultima-luz">
            {({ id, describedBy }) => (
              <Input id={id} name="slug" required pattern={slugPattern} aria-describedby={describedBy} />
            )}
          </Field>
          <Field label="Descrição" className="full">
            {({ id }) => <Textarea id={id} name="description" rows={4} />}
          </Field>
          <Checkbox className="full" name="isPublic" defaultChecked label="Exibir no portal público" />
        </FormGrid>
        {create.isError ? <Notice tone="danger" role="alert">{errorMessage(create.error)}</Notice> : null}
        <div className="flex flex-col-reverse gap-3 border-t border-line-soft pt-4 sm:flex-row sm:justify-end">
          <Button disabled={create.isPending} onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button type="submit" variant="primary" disabled={create.isPending}>
            {create.isPending ? "Criando campanha…" : "Criar campanha"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
