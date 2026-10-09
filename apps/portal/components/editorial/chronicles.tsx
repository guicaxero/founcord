"use client";

import { useQuery } from "@tanstack/react-query";
import { mediaUrl, type Post, type PostListResponse } from "@ordem/contracts";
import { motion } from "motion/react";
import { ButtonLink } from "@/components/ui/button";
import { FeedbackState } from "@/components/ui/feedback-state";
import { riseIn } from "@/components/ui/motion";
import { PageHeader, Skeleton } from "@/components/ui/surface";
import { ApiClientError, apiFetch, errorMessage } from "@/lib/api-client";
import { formatDate } from "@/lib/format";
import { queryKeys } from "@/lib/query-keys";
import { ArticleBody, ArticleGallery, EditorialList, type EditorialEntry } from "./editorial-list";

function toEntry(post: Post): EditorialEntry {
  return {
    id: post.id,
    title: post.title,
    body: post.body,
    authorName: post.authorName,
    publishedAt: post.publishedAt,
    tags: post.source === "manual" ? [] : [sourceLabel(post.source)],
    coverUrl: post.coverMediaId ? mediaUrl(post.coverMediaId) : null,
  };
}

function sourceLabel(source: Post["source"]): string {
  if (source === "discord") return "Enviado pelo Discord";
  if (source === "automation") return "Rascunho de automação";
  if (source === "foundry") return "Registrado no Foundry";
  return "Escrito no portal";
}

export function Chronicles({
  campaignId,
  limit,
}: Readonly<{ campaignId: string; limit?: number | undefined }>) {
  const posts = useQuery({
    queryKey: queryKeys.posts(campaignId),
    queryFn: () => apiFetch<PostListResponse>(`/api/campaigns/${campaignId}/posts`),
  });

  return (
    <EditorialList
      entries={(posts.data?.data ?? []).map(toEntry)}
      basePath="/cronicas"
      searchLabel="Buscar crônica"
      searchPlaceholder="Título ou trecho do texto"
      isPending={posts.isPending}
      error={posts.isError ? errorMessage(posts.error) : null}
      onRetry={() => posts.refetch()}
      emptyTitle="Nenhuma crônica publicada"
      emptyDescription="Os textos aprovados pela Ordem aparecem aqui depois da revisão."
      limit={limit}
    />
  );
}

export function ChronicleDetail({
  postId,
  campaignId,
}: Readonly<{ postId: string; campaignId: string }>) {
  const post = useQuery({
    queryKey: ["posts", postId],
    queryFn: () => apiFetch<Post>(`/api/posts/${postId}?campaignId=${campaignId}`),
  });

  if (post.isPending) {
    return (
      <div className="space-y-6" role="status" aria-label="Abrindo a crônica">
        <Skeleton className="h-12 w-2/3" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (post.isError) {
    const notFound = post.error instanceof ApiClientError && post.error.status === 404;
    return (
      <FeedbackState
        title={notFound ? "Crônica não encontrada" : "Não foi possível abrir a crônica"}
        tone={notFound ? "neutral" : "error"}
        role={notFound ? undefined : "alert"}
        action={<ButtonLink href="/cronicas">Voltar ao arquivo</ButtonLink>}
      >
        {notFound
          ? "Ela pode ter sido arquivada ou ainda não foi publicada."
          : errorMessage(post.error)}
      </FeedbackState>
    );
  }

  return (
    <motion.article className="space-y-8" variants={riseIn} initial="hidden" animate="visible">
      <div className="space-y-4">
        <ButtonLink variant="link" href="/cronicas">
          ← Voltar ao arquivo
        </ButtonLink>
        <PageHeader
          eyebrow="Crônica"
          title={post.data.title}
          description={`Por ${post.data.authorName} · ${formatDate(post.data.publishedAt, "Sem data")}`}
        />
      </div>
      {post.data.coverMediaId ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={mediaUrl(post.data.coverMediaId)}
          alt={`Capa de ${post.data.title}`}
          className="aspect-[16/9] w-full max-w-4xl rounded-lg border border-line-soft bg-surface-2 object-cover"
        />
      ) : null}
      <ArticleBody body={post.data.body} />
      <ArticleGallery urls={post.data.galleryMediaIds.map(mediaUrl)} title={post.data.title} />
    </motion.article>
  );
}
