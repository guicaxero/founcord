"use client";

import { useDeferredValue, useId, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type {
  MerchantCatalogResponse,
  MerchantItemProjection,
} from "@vigilia/contracts";
import { FeedbackState } from "@/components/ui/feedback-state";
import { apiFetch, errorMessage } from "@/lib/api-client";
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

export function MerchantCatalog({ campaignId }: Readonly<{ campaignId: string }>) {
  const [search, setSearch] = useState("");
  const [stockFilter, setStockFilter] = useState<StockFilter>("all");
  const deferredSearch = useDeferredValue(search);
  const searchId = useId();
  const filterId = useId();
  const merchant = useQuery({
    queryKey: queryKeys.merchant(campaignId),
    queryFn: () =>
      apiFetch<MerchantCatalogResponse>(`/api/campaigns/${campaignId}/merchant`),
    refetchInterval: 60_000,
  });

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
            Foundry. Compras e reservas não são realizadas por esta página.
          </p>
        </div>
        <div className="merchant-seal" aria-hidden="true">
          <span>Somente</span>
          <strong>◇</strong>
          <small>consulta</small>
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
              <MerchantTable merchantName={catalog.merchantName} items={filteredItems} />
            )}
          </>
        ) : null}
      </section>
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
}: Readonly<{ merchantName: string; items: MerchantItemProjection[] }>) {
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
          </tr>
        </thead>
        <tbody>
          {items.map((item) => <MerchantRow item={item} key={item.itemId} />)}
        </tbody>
      </table>
    </div>
  );
}

function MerchantRow({ item }: Readonly<{ item: MerchantItemProjection }>) {
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
    </tr>
  );
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
