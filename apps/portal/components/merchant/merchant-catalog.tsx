"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  CurrentUserResponse,
  MerchantCatalogResponse,
  MerchantItemProjection,
  MerchantPurchaseRequest,
  MerchantPurchaseRequestInput,
  PlayerCharacterListResponse,
} from "@ordem/contracts";
import { motion } from "motion/react";
import { usePathname } from "next/navigation";
import { useDeferredValue, useId, useMemo, useRef, useState } from "react";
import { MerchantPrice } from "@/components/coins";
import { Section } from "@/components/layout/page-container";
import { Button, ButtonAnchor, ButtonLink } from "@/components/ui/button";
import { FeedbackState } from "@/components/ui/feedback-state";
import { listItem, staggerList } from "@/components/ui/motion";
import { Badge, Card, PageHeader, Skeleton } from "@/components/ui/surface";
import { apiFetch, errorMessage } from "@/lib/api-client";
import { hasCapability } from "@/lib/capabilities";
import { formatDateTime, formatRelative, normalizeSearch } from "@/lib/format";
import { queryKeys } from "@/lib/query-keys";
import { ItemBadges, ItemDescription, ItemImage, ItemStats } from "./item-details";
import { MyPurchaseRequests } from "./my-purchases";
import { PurchaseDialog } from "./purchase-dialog";

type StockFilter = "todos" | "em-estoque" | "esgotados";

export function MerchantCatalog({
  campaignId,
  pollingEnabled = true,
}: Readonly<{ campaignId: string; pollingEnabled?: boolean }>) {
  const queryClient = useQueryClient();
  const pathname = usePathname();
  const searchId = useId();
  const filterId = useId();
  const [search, setSearch] = useState("");
  const [stockFilter, setStockFilter] = useState<StockFilter>("todos");
  const [selectedItem, setSelectedItem] = useState<MerchantItemProjection | null>(null);
  const [requestId, setRequestId] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const deferredSearch = useDeferredValue(search);
  // Botão que abriu o pedido, para devolver o foco quando o diálogo fechar.
  const requestTriggerRef = useRef<HTMLElement | null>(null);

  const merchant = useQuery({
    queryKey: queryKeys.merchant(campaignId),
    queryFn: () => apiFetch<MerchantCatalogResponse>(`/api/campaigns/${campaignId}/merchant`),
    refetchInterval: pollingEnabled ? 60_000 : false,
  });
  const me = useQuery({
    queryKey: queryKeys.me,
    queryFn: () => apiFetch<CurrentUserResponse>("/api/me"),
    staleTime: 60_000,
  });
  const canRequest =
    me.data?.authenticated === true &&
    hasCapability(me.data, "merchant:purchase:request", campaignId);
  const characters = useQuery({
    queryKey: queryKeys.myCharacters,
    queryFn: () => apiFetch<PlayerCharacterListResponse>("/api/me/characters"),
    enabled: canRequest,
    staleTime: 30_000,
  });
  const linkedCharacter =
    characters.data?.data.find((entry) => entry.campaign.id === campaignId)?.link ?? null;

  const createPurchase = useMutation({
    mutationFn: (input: MerchantPurchaseRequestInput) =>
      apiFetch<MerchantPurchaseRequest>(`/api/campaigns/${campaignId}/merchant/purchases`, {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: async (created) => {
      setSelectedItem(null);
      setRequestId("");
      setSuccessMessage(
        created.status === "delivery_failed"
          ? "Pedido registrado, mas o aviso ao Foundry falhou. A equipe poderá consultá-lo no painel."
          : "Pedido enviado ao mestre. Nenhuma moeda ou item foi alterado.",
      );
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.merchantPurchases(campaignId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.audit(campaignId) }),
      ]);
    },
  });

  const catalog = merchant.data?.catalog ?? null;
  const items = useMemo(
    () => filterItems(catalog?.items ?? [], deferredSearch, stockFilter),
    [catalog?.items, deferredSearch, stockFilter],
  );
  const hasFilters = search.trim().length > 0 || stockFilter !== "todos";

  return (
    <>
      <PageHeader
        eyebrow="Estoque da campanha"
        title="Lojista"
        description="Consulte os itens conhecidos, seus preços e a quantidade registrada no Foundry. Jogadores vinculados podem enviar um pedido para o mestre realizar o acerto na mesa."
        actions={<Badge tone="accent">Compra assistida</Badge>}
      />

      <Section
        id="estoque"
        eyebrow="01 / Estoque"
        title="Catálogo disponível"
        action={
          merchant.isFetching && catalog ? (
            <span className="text-sm text-fg-subtle" role="status">
              Atualizando catálogo…
            </span>
          ) : null
        }
      >
        {merchant.data ? <CatalogStatus response={merchant.data} /> : null}

        {merchant.isError && catalog ? (
          <div
            className="flex flex-wrap items-center justify-between gap-3 border-l-2 border-warning bg-warning-soft px-4 py-3"
            role="alert"
          >
            <div>
              <strong className="block text-sm">Não foi possível atualizar agora</strong>
              <span className="text-sm text-fg-muted">
                {errorMessage(merchant.error)} O catálogo anterior continua disponível.
              </span>
            </div>
            <Button variant="secondary" size="sm" onClick={() => merchant.refetch()}>
              Tentar novamente
            </Button>
          </div>
        ) : null}

        {!merchant.data && merchant.isPending ? (
          <div className="grid gap-4" role="status" aria-label="Consultando o catálogo">
            <Skeleton className="h-24" />
            <Skeleton className="h-24" />
          </div>
        ) : !merchant.data && merchant.isError ? (
          <FeedbackState
            title="O catálogo não pôde ser consultado"
            tone="error"
            role="alert"
            action={
              <Button variant="secondary" onClick={() => merchant.refetch()}>
                Tentar novamente
              </Button>
            }
          >
            {errorMessage(merchant.error)}
          </FeedbackState>
        ) : merchant.data && !catalog ? (
          <UnavailableCatalog response={merchant.data} onRetry={() => merchant.refetch()} />
        ) : catalog ? (
          <div className="space-y-6">
            <div className="flex flex-wrap items-end gap-4">
              <div className="min-w-56 flex-1 space-y-2">
                <label className="block text-sm font-semibold text-fg-muted" htmlFor={searchId}>
                  Buscar no estoque
                </label>
                <input
                  id={searchId}
                  type="search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Nome, descrição ou propriedade"
                  autoComplete="off"
                  className="min-h-11 w-full rounded-md border border-line bg-surface px-3 text-fg placeholder:text-fg-subtle focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                />
              </div>
              <div className="space-y-2">
                <label className="block text-sm font-semibold text-fg-muted" htmlFor={filterId}>
                  Disponibilidade
                </label>
                <select
                  id={filterId}
                  value={stockFilter}
                  onChange={(event) => setStockFilter(event.target.value as StockFilter)}
                  className="min-h-11 rounded-md border border-line bg-surface px-3 text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                >
                  <option value="todos">Todos os itens</option>
                  <option value="em-estoque">Em estoque</option>
                  <option value="esgotados">Esgotados</option>
                </select>
              </div>
              {hasFilters ? (
                <Button
                  variant="ghost"
                  onClick={() => {
                    setSearch("");
                    setStockFilter("todos");
                  }}
                >
                  Limpar busca e filtro
                </Button>
              ) : null}
            </div>

            <p className="text-sm text-fg-subtle" aria-live="polite" aria-atomic="true">
              {resultCopy(items.length, catalog.items.length, hasFilters)}
            </p>

            {catalog.items.length === 0 ? (
              <FeedbackState title="Nenhum item publicado">
                Novos itens aparecem depois que o estoque for atualizado no mundo da campanha.
              </FeedbackState>
            ) : items.length === 0 ? (
              <FeedbackState
                title="Nenhum item encontrado"
                action={
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setSearch("");
                      setStockFilter("todos");
                    }}
                  >
                    Mostrar todos os itens
                  </Button>
                }
              >
                Ajuste a busca ou a disponibilidade para consultar outras mercadorias.
              </FeedbackState>
            ) : (
              <motion.ul
                className="grid list-none gap-4 p-0"
                variants={staggerList}
                initial="hidden"
                animate="visible"
              >
                {items.map((item) => (
                  <motion.li key={item.itemId} variants={listItem}>
                    <MerchantItem
                      item={item}
                      merchantName={catalog.merchantName}
                      canRequest={Boolean(canRequest && linkedCharacter)}
                      onRequest={(trigger) => {
                        requestTriggerRef.current = trigger;
                        createPurchase.reset();
                        setSuccessMessage("");
                        setRequestId(crypto.randomUUID());
                        setSelectedItem(item);
                      }}
                    />
                  </motion.li>
                ))}
              </motion.ul>
            )}
          </div>
        ) : null}
      </Section>

      <PurchaseAccess
        authenticated={me.data?.authenticated === true}
        canRequest={canRequest}
        loading={me.isLoading || (canRequest && characters.isLoading)}
        linkedCharacterName={linkedCharacter?.actorName ?? null}
        returnTo={pathname}
      />

      {successMessage ? (
        <p
          className="border-l-2 border-success bg-success-soft px-4 py-3 text-sm"
          role="status"
        >
          {successMessage}
        </p>
      ) : null}

      {canRequest ? (
        <Section id="meus-pedidos" eyebrow="03 / Acompanhamento" title="Meus pedidos">
          <MyPurchaseRequests campaignId={campaignId} pollingEnabled={pollingEnabled} />
        </Section>
      ) : null}

      <PurchaseDialog
        item={selectedItem}
        characterName={linkedCharacter?.actorName ?? null}
        characterWealth={linkedCharacter?.character?.wealth ?? null}
        requestId={requestId}
        busy={createPurchase.isPending}
        error={createPurchase.isError ? errorMessage(createPurchase.error) : null}
        onClose={() => {
          if (!createPurchase.isPending) setSelectedItem(null);
        }}
        onSubmit={(input) => createPurchase.mutate(input)}
        returnFocusRef={requestTriggerRef}
      />
    </>
  );
}

/**
 * O catálogo só é reenviado quando o mestre altera o estoque ou sincroniza no
 * Foundry, então o tempo desde o envio não indica atraso. Mostramos apenas quando
 * foi a última atualização.
 */
function CatalogStatus({ response }: Readonly<{ response: MerchantCatalogResponse }>) {
  const catalog = response.catalog;
  if (!catalog) return null;
  const relative = formatRelative(catalog.syncedAt);

  return (
    <p className="text-sm text-fg-muted">
      Última atualização do estoque:{" "}
      <time className="font-semibold text-fg" dateTime={catalog.syncedAt}>
        {formatDateTime(catalog.syncedAt)}
      </time>
      {relative ? <span className="text-fg-subtle"> ({relative})</span> : null}
    </p>
  );
}

function MerchantItem({
  item,
  merchantName,
  canRequest,
  onRequest,
}: Readonly<{
  item: MerchantItemProjection;
  merchantName: string;
  canRequest: boolean;
  onRequest: (trigger: HTMLElement) => void;
}>) {
  const available = item.price !== null && item.quantity !== null && item.quantity > 0;

  return (
    <Card className="grid gap-4 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-start" interactive>
      <ItemImage item={item} />

      <div className="min-w-0 space-y-3">
        <div className="space-y-1.5">
          {item.category ? (
            <p className="text-xs font-bold tracking-wider text-accent uppercase">{item.category}</p>
          ) : null}
          <h3 className="font-display text-xl leading-tight break-words">{item.name}</h3>
          <ItemBadges item={item} />
        </div>
        <ItemStats item={item} />
        <ItemDescription description={item.description} />
        <p className="sr-only">Vendido por {merchantName}</p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4 border-t border-line-soft pt-4 sm:w-56 sm:flex-col sm:items-end sm:border-0 sm:pt-0">
        <div className="sm:text-right">
          <MerchantPrice price={item.price} />
          <Stock quantity={item.quantity} />
        </div>
        {canRequest && available ? (
          <Button variant="accent" onClick={(event) => onRequest(event.currentTarget)}>
            Solicitar ao mestre
          </Button>
        ) : (
          <span className="text-sm text-fg-subtle italic">
            {available ? "Vínculo necessário" : "Indisponível para pedido"}
          </span>
        )}
      </div>
    </Card>
  );
}

function UnavailableCatalog({
  response,
  onRetry,
}: Readonly<{ response: MerchantCatalogResponse; onRetry: () => void }>) {
  if (response.connection.status === "not_connected") {
    return (
      <FeedbackState title="Nenhum mundo conectado">
        Esta campanha ainda não possui um mundo do Foundry conectado ao portal.
      </FeedbackState>
    );
  }

  if (response.connection.status === "offline") {
    return (
      <FeedbackState
        title="Mundo offline e sem catálogo"
        tone="error"
        action={
          <Button variant="secondary" onClick={onRetry}>
            Verificar novamente
          </Button>
        }
      >
        O portal ainda não recebeu um estoque para manter em consulta. Quando o mundo voltar a se
        conectar e sincronizar o Lojista, os itens aparecem aqui.
      </FeedbackState>
    );
  }

  return (
    <FeedbackState
      title="Aguardando a primeira sincronização"
      action={
        <Button variant="secondary" onClick={onRetry}>
          Verificar novamente
        </Button>
      }
    >
      O mundo está conectado, mas ainda não enviou o catálogo do Lojista.
    </FeedbackState>
  );
}

function PurchaseAccess({
  authenticated,
  canRequest,
  loading,
  linkedCharacterName,
  returnTo,
}: Readonly<{
  authenticated: boolean;
  canRequest: boolean | undefined;
  loading: boolean;
  linkedCharacterName: string | null;
  returnTo: string;
}>) {
  if (loading) {
    return <Skeleton className="h-24" aria-label="Verificando seu acesso a pedidos" />;
  }
  if (!authenticated) {
    return (
      <Card className="flex flex-wrap items-center justify-between gap-4" padding="lg">
        <div className="min-w-0 space-y-1">
          <h2 className="font-display text-2xl">Peça itens ao mestre</h2>
          <p className="text-fg-muted">
            Entre com o Discord para usar o personagem vinculado à campanha.
          </p>
        </div>
        <ButtonAnchor
          variant="accent"
          href={`/api/auth/discord?returnTo=${encodeURIComponent(returnTo)}`}
        >
          Entrar para solicitar
        </ButtonAnchor>
      </Card>
    );
  }
  if (!canRequest) return null;
  if (!linkedCharacterName) {
    return (
      <Card className="flex flex-wrap items-center justify-between gap-4" padding="lg">
        <div className="min-w-0 space-y-1">
          <h2 className="font-display text-2xl">Personagem ainda não vinculado</h2>
          <p className="text-fg-muted">
            Peça ao mestre ou gestor da campanha para associar sua conta a um personagem do Foundry.
          </p>
        </div>
        <ButtonLink variant="secondary" href="/eu">
          Ver minha área
        </ButtonLink>
      </Card>
    );
  }
  return (
    <Card className="flex flex-wrap items-center justify-between gap-4" padding="lg">
      <div className="min-w-0 space-y-1">
        <h2 className="font-display text-2xl">Pedidos para {linkedCharacterName}</h2>
        <p className="text-fg-muted">
          Escolha um item disponível no catálogo. O mestre faz o acerto manualmente no Foundry.
        </p>
      </div>
    </Card>
  );
}

function Stock({ quantity }: Readonly<{ quantity: number | null }>) {
  if (quantity === null) {
    return <span className="block text-sm text-fg-subtle">Estoque não informado</span>;
  }
  if (quantity === 0) {
    return <span className="block text-sm font-semibold text-danger">Esgotado</span>;
  }
  return <span className="block text-sm text-fg-muted">{quantity} em estoque</span>;
}

function filterItems(
  items: readonly MerchantItemProjection[],
  search: string,
  stockFilter: StockFilter,
): MerchantItemProjection[] {
  const term = normalizeSearch(search);
  return items.filter((item) => {
    const matchesSearch =
      term.length === 0 ||
      normalizeSearch(`${item.name} ${item.description ?? ""} ${item.properties ?? ""} ${item.category ?? ""}`).includes(term);
    const matchesStock =
      stockFilter === "todos" ||
      (stockFilter === "em-estoque" && item.quantity !== null && item.quantity > 0) ||
      (stockFilter === "esgotados" && item.quantity === 0);
    return matchesSearch && matchesStock;
  });
}

function resultCopy(visible: number, total: number, filtered: boolean): string {
  if (!filtered) return total === 1 ? "1 item no catálogo." : `${total} itens no catálogo.`;
  return visible === 1
    ? `1 de ${total} itens corresponde à consulta.`
    : `${visible} de ${total} itens correspondem à consulta.`;
}
