"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  CreatePostInput,
  CurrentUserResponse,
  Post,
  PostListResponse,
  PostStatus,
  UpdatePostInput,
} from "@vigilia/contracts";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { apiFetch, errorMessage } from "@/lib/api-client";
import { hasCapability } from "@/lib/capabilities";
import { queryKeys } from "@/lib/query-keys";

const statusLabels: Readonly<Record<PostStatus, string>> = {
  draft: "Rascunho",
  pending_review: "Em revisão",
  approved: "Aprovado",
  published: "Publicado",
  archived: "Arquivado",
  rejected: "Rejeitado",
};

export function PostsPanel({
  campaignId,
  me,
}: Readonly<{ campaignId: string; me: CurrentUserResponse }>) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<Post | null>(null);
  const [deleting, setDeleting] = useState<Post | null>(null);
  const posts = useQuery({
    queryKey: queryKeys.posts(campaignId, "editorial"),
    queryFn: () =>
      apiFetch<PostListResponse>(`/api/campaigns/${campaignId}/posts?scope=editorial`),
  });
  const save = useMutation({
    mutationFn: (payload: CreatePostInput | (UpdatePostInput & { id: string })) => {
      if ("id" in payload) {
        const { id, ...body } = payload;
        return apiFetch<Post>(`/api/posts/${id}`, {
          method: "PATCH",
          body: JSON.stringify(body),
        });
      }
      return apiFetch<Post>(`/api/campaigns/${campaignId}/posts`, {
        method: "POST",
        body: JSON.stringify(payload),
      });
    },
    onSuccess: async () => {
      setEditing(null);
      await invalidatePosts(queryClient, campaignId);
    },
  });
  const transition = useMutation({
    mutationFn: ({ post, status }: { post: Post; status: PostStatus }) =>
      apiFetch<Post>(`/api/posts/${post.id}`, {
        method: "PATCH",
        body: JSON.stringify({ version: post.version, status }),
      }),
    onSuccess: () => invalidatePosts(queryClient, campaignId),
  });
  const archive = useMutation({
    mutationFn: (post: Post) =>
      apiFetch<void>(`/api/posts/${post.id}?version=${post.version}&mode=archive`, {
        method: "DELETE",
      }),
    onSuccess: () => invalidatePosts(queryClient, campaignId),
  });
  const destroy = useMutation({
    mutationFn: (post: Post) =>
      apiFetch<void>(`/api/posts/${post.id}?version=${post.version}&mode=permanent`, {
        method: "DELETE",
      }),
    onSuccess: async () => {
      setDeleting(null);
      await invalidatePosts(queryClient, campaignId);
    },
  });

  const canCreate = hasCapability(me, "post:create", campaignId);
  const canReview = hasCapability(me, "post:review", campaignId);
  const canPublish = hasCapability(me, "post:publish", campaignId);
  const canDelete = hasCapability(me, "post:delete", campaignId);
  const canEditAll = canCreate && canReview;

  return (
    <div className="admin-two-column">
      <div>
        <div className="admin-section-title">
          <div><span>MESA DE REVISÃO</span><h2>Posts</h2></div>
          <b>{posts.data?.data.length ?? 0} registros</b>
        </div>
        {posts.isLoading ? <p>Reunindo os manuscritos…</p> : null}
        {posts.isError ? <p className="inline-error">{errorMessage(posts.error)}</p> : null}
        <div className="admin-list post-list">
          {posts.data?.data.map((post) => (
            <article key={post.id}>
              <div className="admin-list-main">
                <span className={`status-pill status-${post.status}`}>{statusLabels[post.status]}</span>
                <h3>{post.title}</h3>
                <p>{post.authorName} · origem {post.source}</p>
              </div>
              <div className="admin-row-actions">
                {canCreate &&
                (post.authorUserId === me.user?.id || canEditAll) &&
                ["draft", "pending_review", "rejected"].includes(post.status) ? (
                  <button type="button" onClick={() => setEditing(post)}>Editar</button>
                ) : null}
                {(post.status === "draft" || post.status === "rejected") && post.authorUserId === me.user?.id ? (
                  <button type="button" onClick={() => transition.mutate({ post, status: "pending_review" })}>Enviar à revisão</button>
                ) : null}
                {post.status === "pending_review" && canReview ? (
                  <>
                    <button type="button" onClick={() => transition.mutate({ post, status: "approved" })}>Aprovar</button>
                    <button type="button" onClick={() => transition.mutate({ post, status: "rejected" })}>Rejeitar</button>
                  </>
                ) : null}
                {post.status === "approved" && canPublish ? (
                  <button type="button" onClick={() => transition.mutate({ post, status: "published" })}>Publicar no portal</button>
                ) : null}
                {post.status === "archived" && canPublish ? (
                  <button type="button" onClick={() => transition.mutate({ post, status: "draft" })}>Restaurar como rascunho</button>
                ) : null}
                {post.status !== "archived" && canPublish ? (
                  <button className="danger-link" type="button" onClick={() => archive.mutate(post)}>Arquivar</button>
                ) : null}
                {post.status === "archived" && canDelete ? (
                  <button className="danger-link" type="button" onClick={() => setDeleting(post)}>Excluir permanentemente</button>
                ) : null}
              </div>
            </article>
          ))}
        </div>
        {transition.isError ? <p className="inline-error">{errorMessage(transition.error)}</p> : null}
        {archive.isError ? <p className="inline-error">{errorMessage(archive.error)}</p> : null}
      </div>
      {canCreate || editing ? (
        <PostForm
          campaignId={campaignId}
          post={editing}
          busy={save.isPending}
          onCancel={() => setEditing(null)}
          onSubmit={(payload) => save.mutate(payload)}
          error={save.isError ? errorMessage(save.error) : null}
        />
      ) : (
        <aside className="permission-note">Seu perfil não cria conteúdo editorial.</aside>
      )}
      {deleting ? (
        <PermanentDeleteDialog
          key={deleting.id}
          post={deleting}
          busy={destroy.isPending}
          error={destroy.isError ? errorMessage(destroy.error) : null}
          onCancel={() => setDeleting(null)}
          onConfirm={() => destroy.mutate(deleting)}
        />
      ) : null}
    </div>
  );
}

function PermanentDeleteDialog({
  post,
  busy,
  error,
  onCancel,
  onConfirm,
}: Readonly<{
  post: Post;
  busy: boolean;
  error: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}>) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const confirmationRef = useRef<HTMLInputElement>(null);
  const [confirmation, setConfirmation] = useState("");
  const confirmed = confirmation === "EXCLUIR";

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) {
      dialog.showModal();
      confirmationRef.current?.focus();
    }
    return () => {
      if (dialog?.open) dialog.close();
    };
  }, []);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (confirmed && !busy) onConfirm();
  }

  return (
    <dialog
      ref={dialogRef}
      className="destructive-dialog"
      aria-labelledby="permanent-delete-title"
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onCancel();
      }}
    >
      <form className="destructive-dialog-card" onSubmit={submit}>
        <span className="dialog-kicker">AÇÃO IRREVERSÍVEL</span>
        <h2 id="permanent-delete-title">Excluir post permanentemente?</h2>
        <p>
          O post <strong>{post.title}</strong> e seus registros internos serão removidos do
          portal. Uma publicação já enviada ao Discord continuará existindo no fórum.
        </p>
        <label>
          Digite <strong>EXCLUIR</strong> para confirmar
          <input
            ref={confirmationRef}
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
            autoComplete="off"
            spellCheck={false}
          />
        </label>
        {error ? <p className="inline-error">{error}</p> : null}
        <div className="dialog-actions">
          <button type="button" disabled={busy} onClick={onCancel}>Cancelar</button>
          <button className="danger-primary" disabled={!confirmed || busy}>
            {busy ? "Excluindo…" : "Excluir permanentemente"}
          </button>
        </div>
      </form>
    </dialog>
  );
}

function PostForm({
  campaignId,
  post,
  busy,
  onCancel,
  onSubmit,
  error,
}: Readonly<{
  campaignId: string;
  post: Post | null;
  busy: boolean;
  onCancel: () => void;
  onSubmit: (value: CreatePostInput | (UpdatePostInput & { id: string })) => void;
  error: string | null;
}>) {
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const fields = {
      title: String(data.get("title")),
      body: String(data.get("body")),
    };
    onSubmit(
      post
        ? { ...fields, id: post.id, version: post.version }
        : { ...fields, campaignId, source: "manual" },
    );
  }

  return (
    <aside className="admin-editor">
      <div className="admin-section-title">
        <div><span>{post ? "EDIÇÃO" : "NOVO TEXTO"}</span><h2>{post ? post.title : "Criar post"}</h2></div>
      </div>
      <form className="admin-form" key={post?.id ?? "new"} onSubmit={submit}>
        <label className="full">Título<input name="title" required minLength={3} defaultValue={post?.title} /></label>
        <label className="full">Conteúdo<textarea name="body" required rows={14} defaultValue={post?.body} /></label>
        <div className="form-actions full">
          <button className="admin-primary" disabled={busy}>{post ? "Salvar texto" : "Criar rascunho"}</button>
          {post ? <button type="button" onClick={onCancel}>Cancelar</button> : null}
        </div>
      </form>
      <p className="editorial-note">Nenhum post é publicado sem passar por revisão humana.</p>
      {error ? <p className="inline-error">{error}</p> : null}
    </aside>
  );
}

async function invalidatePosts(
  queryClient: ReturnType<typeof useQueryClient>,
  campaignId: string,
) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: queryKeys.posts(campaignId, "editorial") }),
    queryClient.invalidateQueries({ queryKey: queryKeys.posts(campaignId) }),
  ]);
}
