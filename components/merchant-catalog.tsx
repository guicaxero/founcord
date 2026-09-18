"use client";

import { useDeferredValue, useEffect, useId, useMemo, useRef, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  CurrentUserResponse,
  MerchantCatalogResponse,
  MerchantItemProjection,
  MerchantPurchaseDecisionInput,
  MerchantPurchaseListResponse,
  MerchantPurchaseRequest,
  MerchantPurchaseRequestInput,
  MerchantPurchaseStatus,
  PlayerCharacterListResponse,
} from "@vigilia/contracts";
import Link from "next/link";
import { FeedbackState } from "@/components/ui/feedback-state";
import { apiFetch, errorMessage } from "@/lib/api-client";
import { hasCapability } from "@/lib/capabilities";
import { queryKeys } from "@/lib/query-keys";

type StockFilter = "all" | "in-stock" | "out-of-stock";

const freshnessCopy = {
  fresh: {
    label: "Catálogo atualizado",
    description: "A vitrine está sincronizada com um mundo online.",
  },
  stale: {
    label: "Atualização atrasada",
    description: "O mundo está online, mas este catálogo não é recente.",
  },
  offline: {
    label: "Mundo offline",
    description: "Você está consultando o último catálogo recebido do Foundry.",
  },
} as const;

export function MerchantCatalog({
  campaignId,
  pollingEnabled = true,
}: Readonly<{
  campaignId: string;
  pollingEnabled?: boolean;
}>) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [stockFilter, setStockFilter] = useState<StockFilter>("all");
  const [selectedItem, setSelectedItem] = useState<MerchantItemProjection | null>(null);
  const [requestId, setRequestId] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const deferredSearch = useDeferredValue(search);
  const purchaseDialogRef = useRef<HTMLDialogElement>(null);
  const searchId = useId();
  const filterId = useId();
  const merchant = useQuery({
    queryKey: queryKeys.merchant(campaignId),
    queryFn: () =>
      apiFetch<MerchantCatalogResponse>(`/api/campaigns/${campaignId}/merchant`),
    refetchInterval: pollingEnabled ? 60_000 : false,
  });
  const me = useQuery({
    queryKey: queryKeys.me,
    queryFn: () => apiFetch<CurrentUserResponse>("/api/me"),
    staleTime: 60_000,
  });
  const canRequest = me.data?.authenticated === true
    && hasCapability(me.data, "merchant:purchase:request", campaignId);
  const characters = useQuery({
    queryKey: queryKeys.myCharacters,
    queryFn: () => apiFetch<PlayerCharacterListResponse>("/api/me/characters"),
    enabled: canRequest,
    staleTime: 30_000,
  });
  const linkedCharacter = characters.data?.data.find(
    (entry) => entry.campaign.id === campaignId,
  )?.link ?? null;
  const purchases = useQuery({
    queryKey: [...queryKeys.merchantPurchases(campaignId), "self"],
    queryFn: () => apiFetch<MerchantPurchaseListResponse>(
      `/api/campaigns/${campaignId}/merchant/purchases?scope=self`,
    ),
    enabled: canRequest,
    refetchInterval: pollingEnabled ? (query) => query.state.data?.data.some((purchase) =>
      purchase.status === "pending_delivery" || purchase.status === "awaiting_master",
    ) ? 10_000 : false : false,
  });
  const createPurchase = useMutation({
    mutationFn: (input: MerchantPurchaseRequestInput) =>
      apiFetch<MerchantPurchaseRequest>(
        `/api/campaigns/${campaignId}/merchant/purchases`,
        { method: "POST", body: JSON.stringify(input) },
      ),
    onSuccess: async (created) => {
      purchaseDialogRef.current?.close();
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
  const cancelPurchase = useMutation({
    mutationFn: ({ purchaseId, input }: Readonly<{
      purchaseId: string;
      input: MerchantPurchaseDecisionInput;
    }>) => apiFetch<MerchantPurchaseRequest>(
      `/api/campaigns/${campaignId}/merchant/purchases/${purchaseId}`,
      { method: "PATCH", body: JSON.stringify(input) },
    ),
    onSuccess: async () => {
      setSuccessMessage("Pedido cancelado. A equipe verá o estado atualizado.");
      await queryClient.invalidateQueries({ queryKey: queryKeys.merchantPurchases(campaignId) });
    },
  });

  useEffect(() => {
    if (selectedItem && purchaseDialogRef.current && !purchaseDialogRef.current.open) {
      purchaseDialogRef.current.showModal();
    }
  }, [selectedItem]);

  const catalog = merchant.data?.catalog ?? null;
  const filteredItems = useMemo(
    () => filterItems(catalog?.items ?? [], deferredSearch, stockFilter),
    [catalog?.items, deferredSearch, stockFilter],
  );
  const hasFilters = search.trim().length > 0 || stockFilter !== "all";

  return (
    <>
      <header className="merchant-hero">
        <div>
          <p className="eyebrow">Estoque da campanha <span>•</span> Consulta pública</p>
          <h1>Mercador</h1>
          <p>
            Consulte os itens conhecidos, seus preços e a quantidade registrada no
            Foundry. Jogadores vinculados podem enviar um pedido para o mestre
            realizar o acerto na mesa.
          </p>
        </div>
        <div className="merchant-seal" aria-hidden="true">
          <span>Compra</span>
          <strong>◇</strong>
          <small>assistida</small>
        </div>
      </header>

      <section className="merchant-workspace" aria-labelledby="merchant-catalog-title">
        <div className="merchant-heading">
          <div>
            <p className="section-index">01 / ESTOQUE</p>
            <h2 id="merchant-catalog-title">Catálogo disponível</h2>
          </div>
          {merchant.isFetching && catalog ? (
            <span className="merchant-refreshing" role="status">Atualizando catálogo…</span>
          ) : null}
        </div>

        {merchant.data ? <CatalogStatus response={merchant.data} /> : null}

        {merchant.isError && catalog ? (
          <div className="merchant-inline-warning" role="alert">
            <div>
              <strong>Não foi possível atualizar agora</strong>
              <span>{errorMessage(merchant.error)} O catálogo anterior continua disponível.</span>
            </div>
            <button className="secondary-action" type="button" onClick={() => merchant.refetch()}>
              Tentar novamente
            </button>
          </div>
        ) : null}

        {!merchant.data && merchant.isPending ? (
          <MerchantLoading />
        ) : !merchant.data && merchant.isError ? (
          <FeedbackState
            title="O catálogo não pôde ser consultado"
            tone="error"
            role="alert"
            action={(
              <button className="secondary-action" type="button" onClick={() => merchant.refetch()}>
                Tentar novamente
              </button>
            )}
          >
            {errorMessage(merchant.error)}
          </FeedbackState>
        ) : merchant.data && !catalog ? (
          <UnavailableCatalog response={merchant.data} onRetry={() => merchant.refetch()} />
        ) : catalog ? (
          <>
            <div className="merchant-controls">
              <label htmlFor={searchId}>
                <span>Buscar no estoque</span>
                <input
                  id={searchId}
                  type="search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Nome ou descrição do item"
                  autoComplete="off"
                />
              </label>
              <label htmlFor={filterId}>
                <span>Disponibilidade</span>
                <select
                  id={filterId}
                  value={stockFilter}
                  onChange={(event) => setStockFilter(event.target.value as StockFilter)}
                >
                  <option value="all">Todos os itens</option>
                  <option value="in-stock">Em estoque</option>
                  <option value="out-of-stock">Esgotados</option>
                </select>
              </label>
              {hasFilters ? (
                <button
                  className="merchant-clear"
                  type="button"
                  onClick={() => {
                    setSearch("");
                    setStockFilter("all");
                  }}
                >
                  Limpar busca e filtro
                </button>
              ) : null}
            </div>

            <p className="merchant-results" aria-live="polite" aria-atomic="true">
              {resultCopy(filteredItems.length, catalog.items.length, hasFilters)}
            </p>

            {catalog.items.length === 0 ? (
              <FeedbackState title="Nenhum item publicado">
                Novos itens aparecerão depois que o estoque for atualizado no mundo da campanha.
              </FeedbackState>
            ) : filteredItems.length === 0 ? (
              <FeedbackState
                title="Nenhum item encontrado"
                action={(
                  <button
                    className="secondary-action"
                    type="button"
                    onClick={() => {
                      setSearch("");
                      setStockFilter("all");
                    }}
                  >
                    Mostrar todos os itens
                  </button>
                )}
              >
                Ajuste a busca ou a disponibilidade para consultar outras mercadorias.
              </FeedbackState>
            ) : (
            <MerchantTable
              merchantName={catalog.merchantName}
              items={filteredItems}
              canRequest={Boolean(canRequest && linkedCharacter)}
              onRequest={(item) => {
                createPurchase.reset();
                setSuccessMessage("");
                setRequestId(crypto.randomUUID());
                setSelectedItem(item);
              }}
            />
            )}
          </>
        ) : null}
      </section>

      <PurchaseAccess
        authenticated={me.data?.authenticated === true}
        canRequest={canRequest}
        loading={me.isLoading || (canRequest && characters.isLoading)}
        linkedCharacterName={linkedCharacter?.actorName ?? null}
      />

      {successMessage ? <p className="merchant-operation-success" role="status">{successMessage}</p> : null}

      {canRequest ? (
        <MyPurchaseRequests
          query={purchases}
          cancellingId={cancelPurchase.isPending ? cancelPurchase.variables?.purchaseId ?? null : null}
          cancelError={cancelPurchase.isError ? errorMessage(cancelPurchase.error) : null}
          onCancel={(purchaseId) => cancelPurchase.mutate({
            purchaseId,
            input: { action: "cancel", resolutionNote: null },
          })}
        />
      ) : null}

      <PurchaseDialog
        dialogRef={purchaseDialogRef}
        item={selectedItem}
        characterName={linkedCharacter?.actorName ?? null}
        requestId={requestId}
        busy={createPurchase.isPending}
        error={createPurchase.isError ? errorMessage(createPurchase.error) : null}
        onClose={() => {
          if (!createPurchase.isPending) {
            purchaseDialogRef.current?.close();
            setSelectedItem(null);
          }
        }}
        onSubmit={(input) => createPurchase.mutate(input)}
      />
    </>
  );
}

function CatalogStatus({ response }: Readonly<{ response: MerchantCatalogResponse }>) {
  const catalog = response.catalog;
  if (!catalog) return null;
  const copy = freshnessCopy[catalog.freshness];

  return (
    <div className={`merchant-status merchant-status-${catalog.freshness}`}>
      <span className="merchant-status-mark" aria-hidden="true" />
      <div>
        <strong>{copy.label}</strong>
        <span>{copy.description}</span>
      </div>
      <dl>
        <div>
          <dt>Último catálogo</dt>
          <dd><FormattedDateTime value={catalog.syncedAt} /></dd>
        </div>
        {response.connection.lastSeenAt ? (
          <div>
            <dt>Último contato do mundo</dt>
            <dd><FormattedDateTime value={response.connection.lastSeenAt} /></dd>
          </div>
        ) : null}
      </dl>
    </div>
  );
}

function MerchantLoading() {
  return (
    <div className="merchant-loading" role="status" aria-label="Consultando o catálogo">
      <div>
        <strong>Consultando o catálogo</strong>
        <span>Estamos buscando o estoque registrado no Foundry.</span>
      </div>
      <div className="merchant-loading-grid" aria-hidden="true">
        <span /><span /><span /><span />
      </div>
    </div>
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
        action={<button className="secondary-action" type="button" onClick={onRetry}>Verificar novamente</button>}
      >
        O portal ainda não recebeu um estoque para manter em consulta. Quando o mundo voltar a se conectar e sincronizar o Mercador, os itens aparecerão aqui.
      </FeedbackState>
    );
  }

  return (
    <FeedbackState
      title="Aguardando a primeira sincronização"
      action={<button className="secondary-action" type="button" onClick={onRetry}>Verificar novamente</button>}
    >
      O mundo está conectado, mas ainda não enviou o catálogo do Mercador.
    </FeedbackState>
  );
}

function MerchantTable({
  merchantName,
  items,
  canRequest,
  onRequest,
}: Readonly<{
  merchantName: string;
  items: MerchantItemProjection[];
  canRequest: boolean;
  onRequest: (item: MerchantItemProjection) => void;
}>) {
  return (
    <div className="merchant-table-frame">
      <table className="merchant-table">
        <caption>Itens disponíveis com {merchantName}</caption>
        <thead>
          <tr>
            <th scope="col">Item</th>
            <th scope="col">Descrição</th>
            <th scope="col">Preço</th>
            <th scope="col">Estoque</th>
            <th scope="col">Pedido</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <MerchantRow item={item} canRequest={canRequest} onRequest={onRequest} key={item.itemId} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MerchantRow({
  item,
  canRequest,
  onRequest,
}: Readonly<{
  item: MerchantItemProjection;
  canRequest: boolean;
  onRequest: (item: MerchantItemProjection) => void;
}>) {
  const available = item.price !== null && item.quantity !== null && item.quantity > 0;
  return (
    <tr>
      <th scope="row" data-label="Item">
        <div className="merchant-item-identity">
          <ItemImage item={item} />
          <div>
            {item.category ? <span>{item.category}</span> : null}
            <strong>{item.name}</strong>
          </div>
        </div>
      </th>
      <td data-label="Descrição">
        {item.description ? (
          <details className="merchant-description">
            <summary>
              <span className="merchant-details-closed">Ver detalhes</span>
              <span className="merchant-details-open">Ocultar detalhes</span>
            </summary>
            <p>{item.description}</p>
          </details>
        ) : <span className="merchant-unavailable">Descrição não informada</span>}
      </td>
      <td data-label="Preço"><Price price={item.price} /></td>
      <td data-label="Estoque"><Stock quantity={item.quantity} /></td>
      <td data-label="Pedido">
        {canRequest && available ? (
          <button className="merchant-request-action" type="button" onClick={() => onRequest(item)}>
            Solicitar ao mestre
          </button>
        ) : (
          <span className="merchant-unavailable">
            {available ? "Vínculo necessário" : "Indisponível para pedido"}
          </span>
        )}
      </td>
    </tr>
  );
}

function PurchaseAccess({
  authenticated,
  canRequest,
  loading,
  linkedCharacterName,
}: Readonly<{
  authenticated: boolean;
  canRequest: boolean | undefined;
  loading: boolean;
  linkedCharacterName: string | null;
}>) {
  if (loading) {
    return <section className="merchant-purchase-access" aria-busy="true"><p>Verificando seu acesso a pedidos…</p></section>;
  }
  if (!authenticated) {
    return (
      <section className="merchant-purchase-access" aria-labelledby="merchant-request-access-title">
        <div><span className="section-index">02 / PEDIDOS</span><h2 id="merchant-request-access-title">Peça itens ao mestre</h2><p>Entre com o Discord para usar o personagem vinculado à campanha.</p></div>
        <a className="merchant-request-primary" href="/api/auth/discord?returnTo=/mercador">Entrar para solicitar</a>
      </section>
    );
  }
  if (!canRequest) return null;
  if (!linkedCharacterName) {
    return (
      <section className="merchant-purchase-access merchant-purchase-access-warning" aria-labelledby="merchant-request-access-title">
        <div><span className="section-index">02 / PEDIDOS</span><h2 id="merchant-request-access-title">Personagem ainda não vinculado</h2><p>Peça ao mestre ou gestor da campanha para associar sua conta a um personagem do Foundry.</p></div>
        <Link className="secondary-action" href="/personagem">Ver área do personagem</Link>
      </section>
    );
  }
  return (
    <section className="merchant-purchase-access" aria-labelledby="merchant-request-access-title">
      <div><span className="section-index">02 / PEDIDOS</span><h2 id="merchant-request-access-title">Pedidos para {linkedCharacterName}</h2><p>Escolha um item disponível no catálogo. O mestre fará o acerto manualmente no Foundry.</p></div>
      <span className="merchant-assisted-badge">Compra assistida</span>
    </section>
  );
}

function PurchaseDialog({
  dialogRef,
  item,
  characterName,
  requestId,
  busy,
  error,
  onClose,
  onSubmit,
}: Readonly<{
  dialogRef: React.RefObject<HTMLDialogElement | null>;
  item: MerchantItemProjection | null;
  characterName: string | null;
  requestId: string;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: (input: MerchantPurchaseRequestInput) => void;
}>) {
  if (!item) return null;
  const maxQuantity = Math.min(item.quantity ?? 1, 99);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    onSubmit({
      requestId,
      itemId: item!.itemId,
      quantity: Number(form.get("quantity")),
      note: String(form.get("note") ?? "").trim() || null,
    });
  }

  return (
    <dialog
      className="merchant-purchase-dialog"
      ref={dialogRef}
      aria-labelledby="merchant-purchase-dialog-title"
      aria-describedby="merchant-purchase-dialog-description"
      onClose={() => { if (!busy) onClose(); }}
    >
      <form onSubmit={submit}>
        <header>
          <span className="section-index">PEDIDO ASSISTIDO</span>
          <h2 id="merchant-purchase-dialog-title">Solicitar {item.name}</h2>
          <p id="merchant-purchase-dialog-description">Revise o pedido que será enviado aos mestres da campanha.</p>
        </header>
        <dl className="merchant-purchase-summary">
          <div><dt>Personagem</dt><dd>{characterName}</dd></div>
          <div><dt>Preço registrado</dt><dd>{item.price}</dd></div>
        </dl>
        <label>
          <span>Quantidade</span>
          <input name="quantity" type="number" min="1" max={maxQuantity} defaultValue="1" required />
          <small>Até {maxQuantity} unidade{maxQuantity === 1 ? "" : "s"} no estoque atual.</small>
        </label>
        <label>
          <span>Observação para o mestre <small>(opcional)</small></span>
          <textarea name="note" rows={4} maxLength={500} placeholder="Exemplo: gostaria de retirar antes da próxima missão." />
        </label>
        <div className="merchant-no-mutation" role="note">
          <strong>Nenhuma moeda ou item será alterado agora.</strong>
          <span>O mestre receberá o pedido e confirmará o acerto depois de realizá-lo no Foundry.</span>
        </div>
        {error ? <p className="merchant-dialog-error" role="alert">{error}</p> : null}
        <footer>
          <button className="secondary-action" type="button" onClick={onClose} disabled={busy}>Voltar ao catálogo</button>
          <button className="merchant-request-primary" type="submit" disabled={busy}>
            {busy ? "Enviando pedido…" : "Enviar pedido ao mestre"}
          </button>
        </footer>
      </form>
    </dialog>
  );
}

type PurchaseQuery = ReturnType<typeof useQuery<MerchantPurchaseListResponse>>;

function MyPurchaseRequests({
  query,
  cancellingId,
  cancelError,
  onCancel,
}: Readonly<{
  query: PurchaseQuery;
  cancellingId: string | null;
  cancelError: string | null;
  onCancel: (purchaseId: string) => void;
}>) {
  return (
    <section className="merchant-purchase-history" aria-labelledby="merchant-purchase-history-title">
      <header className="merchant-heading">
        <div><p className="section-index">03 / ACOMPANHAMENTO</p><h2 id="merchant-purchase-history-title">Meus pedidos</h2></div>
        {query.isFetching && query.data ? <span className="merchant-refreshing" role="status">Atualizando pedidos…</span> : null}
      </header>
      {query.isPending ? (
        <p className="merchant-purchases-loading" role="status">Consultando seus pedidos…</p>
      ) : query.isError ? (
        <FeedbackState title="Não foi possível consultar seus pedidos" tone="error" role="alert" action={<button className="secondary-action" type="button" onClick={() => query.refetch()}>Tentar novamente</button>}>
          {errorMessage(query.error)}
        </FeedbackState>
      ) : (query.data?.data.length ?? 0) === 0 ? (
        <FeedbackState title="Nenhum pedido enviado">Quando você solicitar um item, o andamento aparecerá aqui.</FeedbackState>
      ) : (
        <div className="merchant-purchase-list">
          {query.data!.data.map((purchase) => (
            <PurchaseCard purchase={purchase} key={purchase.id}>
              {canCancelPurchase(purchase.status) ? (
                <button className="merchant-cancel-action" type="button" disabled={cancellingId === purchase.id} onClick={() => onCancel(purchase.id)}>
                  {cancellingId === purchase.id ? "Cancelando…" : "Cancelar pedido"}
                </button>
              ) : null}
            </PurchaseCard>
          ))}
        </div>
      )}
      {cancelError ? <p className="merchant-dialog-error" role="alert">{cancelError}</p> : null}
    </section>
  );
}

export function PurchaseCard({ purchase, children }: Readonly<{
  purchase: MerchantPurchaseRequest;
  children?: React.ReactNode;
}>) {
  const status = purchaseStatusContent[purchase.status];
  return (
    <article className={`merchant-purchase-card merchant-purchase-${purchase.status}`}>
      <header><div><span>{purchase.character.actorName}</span><h3>{purchase.item.name}</h3></div><span className="merchant-purchase-status">{status.label}</span></header>
      <dl>
        <div><dt>Quantidade</dt><dd>{purchase.item.quantity}</dd></div>
        <div><dt>Preço registrado</dt><dd>{purchase.item.price}</dd></div>
        <div><dt>Solicitado em</dt><dd><FormattedDateTime value={purchase.createdAt} /></dd></div>
      </dl>
      <p className="merchant-purchase-state-copy">{status.description}</p>
      {purchase.note ? <p className="merchant-purchase-note"><strong>Observação:</strong> {purchase.note}</p> : null}
      {purchase.deliveryError ? <p className="merchant-dialog-error" role="alert">{purchase.deliveryError}</p> : null}
      {purchase.resolutionNote ? <p className="merchant-purchase-note"><strong>Retorno do mestre:</strong> {purchase.resolutionNote}</p> : null}
      {children ? <footer>{children}</footer> : null}
    </article>
  );
}

export const purchaseStatusContent: Readonly<Record<MerchantPurchaseStatus, Readonly<{ label: string; description: string }>>> = {
  pending_delivery: { label: "Enviando ao Foundry", description: "O pedido foi registrado e aguarda entrega ao mundo." },
  awaiting_master: { label: "Aguardando o mestre", description: "Os mestres foram avisados. Nenhuma moeda ou item foi alterado." },
  delivery_failed: { label: "Aviso não entregue", description: "O pedido continua registrado no portal para a equipe consultar." },
  fulfilled: { label: "Atendido", description: "Um mestre confirmou que realizou o acerto manualmente." },
  rejected: { label: "Recusado", description: "Um mestre encerrou o pedido sem atendimento." },
  cancelled: { label: "Cancelado", description: "Você cancelou este pedido antes da decisão do mestre." },
};

function canCancelPurchase(status: MerchantPurchaseStatus): boolean {
  return status === "pending_delivery" || status === "awaiting_master" || status === "delivery_failed";
}

function ItemImage({ item }: Readonly<{ item: MerchantItemProjection }>) {
  if (!item.imageUrl) {
    return <span className="merchant-item-placeholder" aria-hidden="true">{item.name.slice(0, 1)}</span>;
  }

  return (
    // URLs vêm de uma lista HTTPS validada e podem usar qualquer host do mundo Foundry.
    // eslint-disable-next-line @next/next/no-img-element
    <img className="merchant-item-image" src={item.imageUrl} alt="" width="64" height="64" loading="lazy" />
  );
}

function Price({ price }: Readonly<{ price: string | null }>) {
  if (!price) return <span className="merchant-unavailable">Preço não informado</span>;
  return <span className="merchant-price"><strong>{price}</strong></span>;
}

function Stock({ quantity }: Readonly<{ quantity: number | null }>) {
  if (quantity === null) {
    return <span className="merchant-stock merchant-stock-unknown">Estoque não informado</span>;
  }
  if (quantity === 0) {
    return <span className="merchant-stock merchant-stock-empty">Esgotado</span>;
  }
  return <span className="merchant-stock merchant-stock-available">{quantity} em estoque</span>;
}

function FormattedDateTime({ value }: Readonly<{ value: string }>) {
  const date = new Date(value);
  return (
    <time dateTime={value} title={date.toISOString()}>
      {new Intl.DateTimeFormat("pt-BR", {
        dateStyle: "short",
        timeStyle: "short",
        timeZone: "America/Sao_Paulo",
      }).format(date)}
    </time>
  );
}

function filterItems(
  items: MerchantItemProjection[],
  search: string,
  stockFilter: StockFilter,
): MerchantItemProjection[] {
  const normalizedSearch = normalize(search.trim());
  return items.filter((item) => {
    const matchesSearch = normalizedSearch.length === 0 || normalize(
      `${item.name} ${item.description ?? ""}`,
    ).includes(normalizedSearch);
    const matchesStock = stockFilter === "all"
      || (stockFilter === "in-stock" && item.quantity !== null && item.quantity > 0)
      || (stockFilter === "out-of-stock" && item.quantity === 0);
    return matchesSearch && matchesStock;
  });
}

function normalize(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR");
}

function resultCopy(visible: number, total: number, filtered: boolean): string {
  if (!filtered) return total === 1 ? "1 item no catálogo." : `${total} itens no catálogo.`;
  return visible === 1
    ? `1 de ${total} itens corresponde à consulta.`
    : `${visible} de ${total} itens correspondem à consulta.`;
}
