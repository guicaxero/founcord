"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  MERCHANT_AVAILABILITY_ORDER,
  type MerchantCatalogImportResponse,
  type MerchantCatalogItem,
  type MerchantCatalogItemInput,
  type MerchantCatalogKind,
  type MerchantItemAvailability,
} from "@ordem/contracts";
import { useId, useMemo, useRef, useState, type FormEvent } from "react";
import { priceLabel } from "@/components/coins";
import { Button } from "@/components/ui/button";
import { DataTable, RowActions } from "@/components/ui/data-table";
import { Dialog } from "@/components/ui/dialog";
import { FeedbackState } from "@/components/ui/feedback-state";
import { Checkbox, Field, FormGrid, Input, Select, Textarea } from "@/components/ui/field";
import { FilterChips } from "@/components/ui/filter-chips";
import { Notice } from "@/components/ui/notice";
import { Badge } from "@/components/ui/surface";
import { useToast } from "@/components/ui/toast";
import { apiFetch, errorMessage } from "@/lib/api-client";
import { normalizeSearch } from "@/lib/format";
import { queryKeys } from "@/lib/query-keys";
import { SearchField } from "../kit";
import {
  attributeLabels,
  availabilityLabel,
  availabilityTone,
  combatSummary,
  handlingSummary,
  kindLabels,
} from "./presentation";

type AvailabilityFilter = "all" | MerchantItemAvailability;

export function CatalogTab({
  campaignId,
  catalog,
}: Readonly<{ campaignId: string; catalog: readonly MerchantCatalogItem[] }>) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const triggerRef = useRef<HTMLElement | null>(null);
  const [search, setSearch] = useState("");
  const [availability, setAvailability] = useState<AvailabilityFilter>("all");
  const [category, setCategory] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [editor, setEditor] = useState<{ item: MerchantCatalogItem | null } | null>(null);
  const categoryId = useId();

  const invalidate = () => queryClient.invalidateQueries({ queryKey: queryKeys.merchantCatalog(campaignId) });
  const importBase = useMutation({
    mutationFn: () =>
      apiFetch<MerchantCatalogImportResponse>(`/api/campaigns/${campaignId}/merchant/catalog/import-base`, {
        method: "POST",
      }),
    onSuccess: async (result) => {
      toast({
        title: result.created > 0 ? "Lista base importada" : "A lista base já estava no catálogo",
        description:
          result.created > 0
            ? `${result.created} itens adicionados${result.skipped ? `; ${result.skipped} já existiam` : ""}.`
            : "Nenhum item foi duplicado.",
      });
      await invalidate();
    },
    onError: (error) => toast({ title: "A importação falhou", description: errorMessage(error), tone: "danger" }),
  });
  const save = useMutation({
    mutationFn: (payload: Readonly<{ id: string | null; body: Record<string, unknown> }>) =>
      apiFetch<MerchantCatalogItem>(
        payload.id
          ? `/api/campaigns/${campaignId}/merchant/catalog/${payload.id}`
          : `/api/campaigns/${campaignId}/merchant/catalog`,
        { method: payload.id ? "PATCH" : "POST", body: JSON.stringify(payload.body) },
      ),
    onSuccess: async (item, payload) => {
      setEditor(null);
      if (payload.id && "active" in payload.body && Object.keys(payload.body).length === 2) {
        toast({ title: item.active ? "Item reativado" : "Item desativado", description: item.name });
      } else {
        toast({ title: payload.id ? "Item atualizado" : "Item adicionado", description: item.name });
      }
      await invalidate();
    },
    onError: (error, payload) => {
      // Erros do formulário ficam no diálogo; os da tabela vão para o toast.
      if (!editor || payload.id !== (editor.item?.id ?? null)) {
        toast({ title: "O item não foi alterado", description: errorMessage(error), tone: "danger" });
      }
    },
  });

  const categories = useMemo(
    () => [...new Set(catalog.map((item) => item.category))].sort((left, right) => left.localeCompare(right, "pt-BR")),
    [catalog],
  );
  const query = normalizeSearch(search);
  const visible = catalog.filter(
    (item) =>
      (showInactive || item.active) &&
      (availability === "all" || item.availability === availability) &&
      (!category || item.category === category) &&
      (!query || normalizeSearch(`${item.name} ${item.properties ?? ""}`).includes(query)),
  );
  const drawable = catalog.filter((item) => item.active && item.price).length;
  const unpriced = catalog.filter((item) => item.active && !item.price).length;

  function remember(event: { currentTarget: HTMLElement }) {
    triggerRef.current = event.currentTarget;
  }

  if (catalog.length === 0) {
    return (
      <FeedbackState
        title="O catálogo ainda está vazio"
        action={
          <>
            <Button variant="accent" disabled={importBase.isPending} onClick={() => importBase.mutate()}>
              {importBase.isPending ? "Importando…" : "Importar lista base (137 itens)"}
            </Button>
            <Button onClick={(event) => { remember(event); save.reset(); setEditor({ item: null }); }}>Cadastrar item</Button>
          </>
        }
      >
        A lista base traz as armas, armaduras, equipamentos, vestuário e ferramentas da planilha do Lojista, com
        preço, disponibilidade e ícones do sistema. Depois você pode editar qualquer item.
      </FeedbackState>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <SearchField label="Buscar no catálogo" value={search} onChange={setSearch} placeholder="Nome ou propriedade" className="max-w-md" />
        <div className="flex flex-wrap gap-2">
          <Button disabled={importBase.isPending} onClick={() => importBase.mutate()}>
            {importBase.isPending ? "Importando…" : "Importar lista base"}
          </Button>
          <Button variant="accent" onClick={(event) => { remember(event); save.reset(); setEditor({ item: null }); }}>
            Novo item
          </Button>
        </div>
      </div>
      <div className="flex flex-wrap items-end gap-4">
        <FilterChips
          label="Filtrar por disponibilidade"
          value={availability}
          onChange={setAvailability}
          options={[
            { value: "all", label: "Todas" },
            ...MERCHANT_AVAILABILITY_ORDER.map((value) => ({
              value,
              label: availabilityLabel(value),
              count: catalog.filter((item) => item.active && item.availability === value).length,
            })),
          ]}
        />
        <div className="space-y-2">
          <label className="block text-sm font-semibold text-fg-muted" htmlFor={categoryId}>Categoria</label>
          <Select id={categoryId} value={category} onChange={(event) => setCategory(event.target.value)} className="min-w-56">
            <option value="">Todas as categorias</option>
            {categories.map((value) => <option key={value} value={value}>{value}</option>)}
          </Select>
        </div>
        <Checkbox checked={showInactive} onChange={(event) => setShowInactive(event.target.checked)} label="Mostrar desativados" />
      </div>
      <p className="text-sm text-fg-subtle" aria-live="polite">
        {visible.length} de {catalog.length} itens · {drawable} entram no sorteio
        {unpriced > 0 ? ` · ${unpriced} sem preço ${unpriced === 1 ? "fica" : "ficam"} de fora` : ""}.
      </p>

      <DataTable
        caption="Catálogo do Lojista"
        rows={visible}
        rowKey={(item) => item.id}
        initialSort={{ column: "name", direction: "ascending" }}
        empty={
          <FeedbackState
            title="Nenhum item neste filtro"
            action={<Button onClick={() => { setSearch(""); setAvailability("all"); setCategory(""); }}>Limpar filtros</Button>}
          >
            Ajuste a busca, a disponibilidade ou a categoria.
          </FeedbackState>
        }
        columns={[
          {
            id: "name",
            header: "Item",
            hideLabelOnMobile: true,
            sortValue: (item) => item.name,
            cell: (item) => (
              <div className="min-w-0 space-y-1">
                <p className="font-semibold text-fg">
                  {item.name}
                  {!item.active ? <Badge className="ml-2 align-middle">Desativado</Badge> : null}
                </p>
                <p className="text-xs text-fg-subtle">{item.category} · {kindLabels[item.kind]}</p>
              </div>
            ),
          },
          {
            id: "availability",
            header: "Disponibilidade",
            className: "md:w-36",
            sortValue: (item) => MERCHANT_AVAILABILITY_ORDER.indexOf(item.availability),
            cell: (item) => <Badge tone={availabilityTone[item.availability]}>{availabilityLabel(item.availability)}</Badge>,
          },
          { id: "combat", header: "Dano/Defesa", className: "md:w-36 text-fg-muted", cell: (item) => combatSummary(item) },
          { id: "handling", header: "Mãos/Requisito", className: "md:w-44 text-fg-muted", cell: (item) => handlingSummary(item) },
          {
            id: "price",
            header: "Preço",
            className: "md:w-40",
            cell: (item) =>
              item.price ? priceLabel(item.price) : <span className="text-warning">Sem preço</span>,
          },
          {
            id: "actions",
            header: "Ações",
            hideLabelOnMobile: true,
            className: "lg:w-52",
            cell: (item) => (
              <RowActions>
                <Button size="sm" variant="ghost" onClick={(event) => { remember(event); save.reset(); setEditor({ item }); }}>
                  Editar
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className={item.active ? "text-danger" : undefined}
                  disabled={save.isPending}
                  onClick={() => save.mutate({ id: item.id, body: { active: !item.active, version: item.version } })}
                >
                  {item.active ? "Desativar" : "Reativar"}
                </Button>
              </RowActions>
            ),
          },
        ]}
      />

      <Dialog
        open={Boolean(editor)}
        onOpenChange={(next) => {
          if (!next && !save.isPending) setEditor(null);
        }}
        title={editor?.item ? "Editar item" : "Novo item do catálogo"}
        description="Os dados vão para o Foundry quando o item for sorteado."
        returnFocusRef={triggerRef}
        className="max-w-3xl"
      >
        {editor ? (
          <CatalogItemForm
            key={editor.item?.id ?? "new"}
            item={editor.item}
            categories={categories}
            busy={save.isPending}
            error={save.isError ? errorMessage(save.error) : null}
            onCancel={() => setEditor(null)}
            onSubmit={(body) => save.mutate({ id: editor.item?.id ?? null, body: editor.item ? { ...body, version: editor.item.version } : body })}
          />
        ) : null}
      </Dialog>
    </div>
  );
}

function CatalogItemForm({
  item,
  categories,
  busy,
  error,
  onCancel,
  onSubmit,
}: Readonly<{
  item: MerchantCatalogItem | null;
  categories: readonly string[];
  busy: boolean;
  error: string | null;
  onCancel: () => void;
  onSubmit: (body: MerchantCatalogItemInput) => void;
}>) {
  const [kind, setKind] = useState<MerchantCatalogKind>(item?.kind ?? "item");
  const listId = useId();

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const text = (name: string) => {
      const value = String(data.get(name) ?? "").trim();
      return value || null;
    };
    const attribute = text("requirementAttribute");
    const minimum = Number(data.get("requirementMinimum") ?? 0);
    onSubmit({
      name: String(data.get("name")).trim(),
      category: String(data.get("category")).trim(),
      kind,
      availability: String(data.get("availability")) as MerchantItemAvailability,
      price: text("price"),
      damage: kind === "weapon" ? text("damage") : null,
      hands: kind === "weapon" ? (text("hands") as MerchantCatalogItemInput["hands"]) : null,
      agility: kind === "armor" ? text("agility") : null,
      fixed: kind === "armor" ? text("fixed") : null,
      requirement:
        attribute && minimum > 0
          ? { attribute: attribute as keyof typeof attributeLabels, minimum }
          : null,
      properties: text("properties"),
      description: text("description"),
      icon: text("icon"),
    });
  }

  return (
    <form className="space-y-6" onSubmit={submit}>
      <FormGrid>
        <Field label="Nome" className="full">
          {({ id }) => <Input id={id} name="name" required minLength={2} maxLength={160} defaultValue={item?.name} />}
        </Field>
        <Field label="Categoria" hint="Escolha uma existente ou digite uma nova.">
          {({ id, describedBy }) => (
            <>
              <Input id={id} name="category" required minLength={2} maxLength={80} list={listId} defaultValue={item?.category} aria-describedby={describedBy} />
              <datalist id={listId}>
                {categories.map((value) => <option key={value} value={value} />)}
              </datalist>
            </>
          )}
        </Field>
        <Field label="Tipo no Foundry">
          {({ id }) => (
            <Select id={id} value={kind} onChange={(event) => setKind(event.target.value as MerchantCatalogKind)}>
              <option value="item">Item</option>
              <option value="weapon">Arma</option>
              <option value="armor">Armadura</option>
            </Select>
          )}
        </Field>
        <Field label="Disponibilidade">
          {({ id }) => (
            <Select id={id} name="availability" defaultValue={item?.availability ?? "common"}>
              {MERCHANT_AVAILABILITY_ORDER.map((value) => (
                <option key={value} value={value}>{availabilityLabel(value)}</option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Preço" optional hint="Como no livro: 5 cc, 1 co, 2 xp+. Sem preço, o item fica fora do sorteio.">
          {({ id, describedBy }) => <Input id={id} name="price" maxLength={64} defaultValue={item?.price ?? ""} aria-describedby={describedBy} />}
        </Field>
        {kind === "weapon" ? (
          <>
            <Field label="Dano" optional>
              {({ id }) => <Input id={id} name="damage" maxLength={40} placeholder="1d6+1" defaultValue={item?.damage ?? ""} />}
            </Field>
            <Field label="Empunhadura" optional>
              {({ id }) => (
                <Select id={id} name="hands" defaultValue={item?.hands ?? ""}>
                  <option value="">Não informada</option>
                  <option value="one">Uma mão</option>
                  <option value="two">Duas mãos</option>
                  <option value="off">Mão secundária</option>
                </Select>
              )}
            </Field>
          </>
        ) : null}
        {kind === "armor" ? (
          <>
            <Field label="Defesa fixa" optional hint="Ex.: 13. Deixe vazio se a armadura soma à Agilidade.">
              {({ id, describedBy }) => <Input id={id} name="fixed" maxLength={40} defaultValue={item?.fixed ?? ""} aria-describedby={describedBy} />}
            </Field>
            <Field label="Bônus de Agilidade" optional hint="Ex.: 1 para Agilidade + 1.">
              {({ id, describedBy }) => <Input id={id} name="agility" maxLength={40} defaultValue={item?.agility ?? ""} aria-describedby={describedBy} />}
            </Field>
          </>
        ) : null}
        <Field label="Requisito" optional>
          {({ id }) => (
            <Select id={id} name="requirementAttribute" defaultValue={item?.requirement?.attribute ?? ""}>
              <option value="">Sem requisito</option>
              {Object.entries(attributeLabels).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Valor mínimo do requisito" optional>
          {({ id }) => <Input id={id} name="requirementMinimum" type="number" min={1} max={99} defaultValue={item?.requirement?.minimum ?? ""} />}
        </Field>
        <Field label="Propriedades" optional className="full">
          {({ id }) => <Input id={id} name="properties" maxLength={500} placeholder="Acuidade, alcance (curto), arremesso" defaultValue={item?.properties ?? ""} />}
        </Field>
        <Field label="Descrição" optional className="full">
          {({ id }) => <Textarea id={id} name="description" rows={4} maxLength={4_000} defaultValue={item?.description ?? ""} />}
        </Field>
        <Field label="Ícone no Foundry" optional className="full" hint="Caminho de um ícone do Foundry, como systems/demonlord/assets/icons/weapons/axe.webp.">
          {({ id, describedBy }) => <Input id={id} name="icon" maxLength={512} defaultValue={item?.icon ?? ""} aria-describedby={describedBy} />}
        </Field>
      </FormGrid>
      {error ? <Notice tone="danger" role="alert">{error}</Notice> : null}
      <div className="flex flex-col-reverse gap-3 border-t border-line-soft pt-4 sm:flex-row sm:justify-end">
        <Button disabled={busy} onClick={onCancel}>Cancelar</Button>
        <Button type="submit" variant="primary" disabled={busy}>
          {busy ? "Salvando…" : item ? "Salvar item" : "Adicionar item"}
        </Button>
      </div>
    </form>
  );
}
