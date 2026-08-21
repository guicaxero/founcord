"use client";

import { useQuery } from "@tanstack/react-query";
import type { Post, PostListResponse } from "@vigilia/contracts";
import { apiFetch } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";

export function PublishedPosts({
  campaignId,
  initialPosts,
}: Readonly<{ campaignId: string; initialPosts: Post[] }>) {
  const posts = useQuery({
    queryKey: queryKeys.posts(campaignId),
    queryFn: () =>
      apiFetch<PostListResponse>(`/api/campaigns/${campaignId}/posts`),
    initialData: { data: initialPosts },
    initialDataUpdatedAt: 0,
  });

  return (
    <section className="publications" id="cronicas">
      <div className="section-heading">
        <div><p className="section-index">04 / CRÔNICAS</p><h2>Arquivo da Última Luz</h2></div>
      </div>
      <div className="publication-grid">
        {posts.data.data.length === 0 ? (
          <article><span>O arquivo aguarda</span><h3>Nenhuma crônica publicada</h3><p>Os registros aprovados pela Ordem aparecerão aqui.</p></article>
        ) : (
          posts.data.data.slice(0, 6).map((post) => (
            <article key={post.id}>
              <span>{post.authorName} · {formatDate(post.publishedAt)}</span>
              <h3>{post.title}</h3>
              <p>{firstParagraph(post.body)}</p>
              <details>
                <summary>Ler crônica completa</summary>
                <div className="chronicle-body">
                  {post.body.split(/\n\s*\n/).map((paragraph, index) => (
                    <p key={`${post.id}-${index}`}>{paragraph}</p>
                  ))}
                </div>
              </details>
            </article>
          ))
        )}
      </div>
    </section>
  );
}

function formatDate(value: string | null): string {
  if (!value) return "data não informada";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "long",
    timeZone: "America/Sao_Paulo",
  }).format(new Date(value));
}

function firstParagraph(body: string): string {
  return body.split(/\n\s*\n/, 1)[0] ?? body;
}
