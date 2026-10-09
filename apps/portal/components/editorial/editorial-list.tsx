"use client";

import { motion } from "motion/react";
import Link from "next/link";
import { useId, useMemo, useState, type ReactNode } from "react";
import { FeedbackState } from "@/components/ui/feedback-state";
import { listItem, staggerList } from "@/components/ui/motion";
import { Badge, Card, Skeleton } from "@/components/ui/surface";
import { Button } from "@/components/ui/button";
import { excerpt, formatDate, normalizeSearch } from "@/lib/format";
import { RichText, plainText } from "./rich-text";

export type EditorialEntry = Readonly<{
  id: string;
  title: string;
  body: string;
  authorName: string;
  publishedAt: string | null;
  /** Selos curtos: sessão, missão ou origem do texto. */
  tags?: readonly string[];
  /** Capa do texto, mostrada no topo do cartão. */
  coverUrl?: string | null;
}>;

/**
 * Lista de textos editoriais (crônicas e diário). Recebe os dados já
 * carregados, porque cada superfície tem sua própria consulta e permissões.
 */
export function EditorialList({
  entries,
  basePath,
  searchLabel,
  searchPlaceholder,
  isPending,
  error,
  onRetry,
  emptyTitle,
  emptyDescription,
  limit,
}: Readonly<{
  entries: readonly EditorialEntry[];
  basePath: string;
  searchLabel: string;
  searchPlaceholder: string;
  isPending: boolean;
  error: ReactNode | null;
  onRetry: () => void;
  emptyTitle: string;
  emptyDescription: string;
  limit?: number | undefined;
}>) {
  const searchId = useId();
  const [search, setSearch] = useState("");

  const visible = useMemo(() => {
    const term = normalizeSearch(search);
    const filtered = term
      ? entries.filter((entry) => normalizeSearch(`${entry.title} ${entry.body}`).includes(term))
      : entries;
    return limit ? filtered.slice(0, limit) : filtered;
  }, [entries, limit, search]);

  if (isPending) {
    return (
      <div className="grid gap-4 sm:grid-cols-2" role="status" aria-label="Consultando o arquivo">
        <Skeleton className="h-44" />
        <Skeleton className="h-44" />
      </div>
    );
  }

  if (error) {
    return (
      <FeedbackState
        title="O arquivo não pôde ser consultado"
        tone="error"
        role="alert"
        action={
          <Button variant="secondary" onClick={onRetry}>
            Tentar novamente
          </Button>
        }
      >
        {error}
      </FeedbackState>
    );
  }

  if (entries.length === 0) {
    return <FeedbackState title={emptyTitle}>{emptyDescription}</FeedbackState>;
  }

  return (
    <div className="space-y-6">
      {limit ? null : (
        <div className="max-w-md space-y-2">
          <label className="block text-sm font-semibold text-fg-muted" htmlFor={searchId}>
            {searchLabel}
          </label>
          <input
            id={searchId}
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={searchPlaceholder}
            autoComplete="off"
            className="min-h-11 w-full rounded-md border border-line bg-surface px-3 text-fg placeholder:text-fg-subtle focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
          />
        </div>
      )}

      {visible.length === 0 ? (
        <FeedbackState
          title="Nenhum texto corresponde à busca"
          action={
            <Button variant="secondary" onClick={() => setSearch("")}>
              Limpar busca
            </Button>
          }
        >
          Tente outra palavra do título ou do corpo do texto.
        </FeedbackState>
      ) : (
        <motion.ul
          className="grid list-none gap-4 p-0 sm:grid-cols-2"
          variants={staggerList}
          initial="hidden"
          animate="visible"
        >
          {visible.map((entry) => (
            <motion.li key={entry.id} variants={listItem}>
              <Link
                href={`${basePath}/${entry.id}`}
                className="group block h-full rounded-lg focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-focus"
              >
                <Card
                  interactive
                  className="flex h-full flex-col gap-3 transition-transform duration-200 group-hover:-translate-y-0.5 motion-reduce:group-hover:translate-y-0"
                >
                  {entry.coverUrl ? (
                    // Imagens enviadas ao portal: next/image não se aplica ao bucket próprio.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={entry.coverUrl}
                      alt=""
                      loading="lazy"
                      className="-mx-6 -mt-6 mb-1 aspect-[16/9] w-[calc(100%+3rem)] max-w-none rounded-t-lg object-cover"
                    />
                  ) : null}
                  <div className="flex flex-wrap items-center gap-2 text-xs text-fg-subtle">
                    <span>{formatDate(entry.publishedAt, "Sem data")}</span>
                    <span aria-hidden="true">•</span>
                    <span>{entry.authorName}</span>
                  </div>
                  <h3 className="font-display text-xl leading-tight group-hover:text-accent">
                    {entry.title}
                  </h3>
                  <p className="text-sm text-fg-muted text-pretty">{excerpt(plainText(entry.body))}</p>
                  {entry.tags && entry.tags.length > 0 ? (
                    <div className="mt-auto flex flex-wrap gap-2 pt-2">
                      {entry.tags.map((tag) => (
                        <Badge key={tag}>{tag}</Badge>
                      ))}
                    </div>
                  ) : null}
                </Card>
              </Link>
            </motion.li>
          ))}
        </motion.ul>
      )}
    </div>
  );
}

/** Corpo longo em parágrafos, com largura de leitura controlada. */
export function ArticleBody({ body }: Readonly<{ body: string }>) {
  return (
    <div className="flex max-w-[68ch] flex-col gap-5 text-lg leading-relaxed text-fg-muted">
      <RichText body={body} paragraphClassName="text-pretty" />
    </div>
  );
}

/** Imagens do texto, depois do corpo; cada uma abre em tamanho original. */
export function ArticleGallery({ urls, title }: Readonly<{ urls: readonly string[]; title: string }>) {
  if (urls.length === 0) return null;
  return (
    <section aria-label={`Imagens de ${title}`} className="space-y-3">
      <h2 className="font-display text-xl">Imagens</h2>
      <ul className="grid list-none gap-3 p-0 sm:grid-cols-2">
        {urls.map((url, index) => (
          <li key={url}>
            <a
              href={url}
              target="_blank"
              rel="noreferrer"
              className="block rounded-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
            >
              {/* Imagens do bucket do portal: next/image não se aplica. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={url}
                alt={`Imagem ${index + 1} de ${title} (abre em tamanho original)`}
                loading="lazy"
                className="w-full rounded-md border border-line-soft bg-surface-2 object-cover"
              />
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
