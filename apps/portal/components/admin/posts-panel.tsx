"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  CreatePostInput,
  CurrentUserResponse,
  Post,
  PostListResponse,
  PostStatus,
  UpdatePostInput,
} from "@ordem/contracts";
import { useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { DataTable, RowActions } from "@/components/ui/data-table";
import { Dialog } from "@/components/ui/dialog";
import { FeedbackState } from "@/components/ui/feedback-state";
import { Field, FormGrid, Input, Textarea } from "@/components/ui/field";
import { FilterChips } from "@/components/ui/filter-chips";
import { Notice } from "@/components/ui/notice";
import { Badge } from "@/components/ui/surface";
import { useToast } from "@/components/ui/toast";
import { apiFetch, errorMessage } from "@/lib/api-client";
import { hasCapability } from "@/lib/capabilities";
import { formatDate, normalizeSearch } from "@/lib/format";
import { queryKeys } from "@/lib/query-keys";
import { PanelLoading, PermissionNote, SearchField } from "./kit";
import { editorialOrder, editorialTone, timestamp } from "./status";

const statusLabels: Readonly<Record<PostStatus, string>> = {
  draft: "Rascunho",
  pending_review: "Em revisão",
  approved: "Aprovada",
  published: "Publicada",
  archived: "Arquivada",
  rejected: "Rejeitada",
};

const sourceLabels: Readonly<Record<Post["source"], string>> = {
  manual: "escrita manual",
  discord: "Discord",
  foundry: "Foundry",
  automation: "automação",
};

const transitionToast: Partial<Record<PostStatus, string>> = {
  pending_review: "Crônica enviada à revisão",
  approved: "Crônica aprovada",
  rejected: "Crônica rejeitada",
  published: "Crônica publicada no portal",
  draft: "Restaurada como rascunho",
};

type Filter = "active" | "all" | PostStatus;

export function PostsPanel({
  campaignId,
  me,
  initialPosts,
}: Readonly<{
  campaignId: string;
  me: CurrentUserResponse;
  initialPosts?: PostListResponse | undefined;
}>) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const triggerRef = useRef<HTMLElement | null>(null);
  const [editor, setEditor] = useState<{ post: Post | null } | null>(null);
  const [archiving, setArchiving] = useState<Post | null>(null);
  const [deleting, setDeleting] = useState<Post | null>(null);
  const [filter, setFilter] = useState<Filter>("active");
  const [search, setSearch] = useState("");
  const posts = useQuery({
    queryKey: queryKeys.posts(campaignId, "editorial"),
    queryFn: () => apiFetch<PostListResponse>(`/api/campaigns/${campaignId}/posts?scope=editorial`),
    initialData: initialPosts,
    enabled: initialPosts === undefined,
  });
  const save = useMutation({
    mutationFn: (payload: CreatePostInput | (UpdatePostInput & { id: string })) => {
      if ("id" in payload) {
        const { id, ...body } = payload;
        return apiFetch<Post>(`/api/posts/${id}`, { method: "PATCH", body: JSON.stringify(body) });
      }
      return apiFetch<Post>(`/api/campaigns/${campaignId}/posts`, { method: "POST", body: JSON.stringify(payload) });
    },
    onSuccess: async (post, payload) => {
      setEditor(null);
      toast({ title: "id" in payload ? "Texto salvo" : "Rascunho criado", description: post.title });
      await invalidatePosts(queryClient, campaignId);
    },
  });
  const transition = useMutation({
    mutationFn: ({ post, status }: { post: Post; status: PostStatus }) =>
      apiFetch<Post>(`/api/posts/${post.id}`, {
        method: "PATCH",
        body: JSON.stringify({ version: post.version, status }),
      }),
    onSuccess: async (post) => {
      toast({ title: transitionToast[post.status] ?? "Crônica atualizada", description: post.title });
      await invalidatePosts(queryClient, campaignId);
    },
    onError: (error) => toast({ title: "A crônica não foi alterada", description: errorMessage(error), tone: "danger" }),
  });
  const archive = useMutation({
    mutationFn: (post: Post) =>
      apiFetch<void>(`/api/posts/${post.id}?version=${post.version}&mode=archive`, { method: "DELETE" }),
    onSuccess: async (_, post) => {
      setArchiving(null);
      toast({ title: "Crônica arquivada", description: `${post.title} saiu da leitura pública.` });
      await invalidatePosts(queryClient, campaignId);
    },
  });
  const destroy = useMutation({
    mutationFn: (post: Post) =>
      apiFetch<void>(`/api/posts/${post.id}?version=${post.version}&mode=permanent`, { method: "DELETE" }),
    onSuccess: async (_, post) => {
      setDeleting(null);
      toast({ title: "Crônica excluída", description: `${post.title} foi removida permanentemente.` });
      await invalidatePosts(queryClient, campaignId);
    },
  });

  const canCreate = hasCapability(me, "post:create", campaignId);
  const canReview = hasCapability(me, "post:review", campaignId);
  const canPublish = hasCapability(me, "post:publish", campaignId);
  const canDelete = hasCapability(me, "post:delete", campaignId);
  const canEditAll = canCreate && canReview;

  if (posts.isPending) return <PanelLoading label="Reunindo as crônicas" />;
  if (posts.isError) {
    return (
      <FeedbackState
        title="Não foi possível carregar as crônicas"
        tone="error"
        role="alert"
        action={<Button onClick={() => posts.refetch()}>Tentar novamente</Button>}
      >
        {errorMessage(posts.error)}
      </FeedbackState>
    );
  }

  const data = posts.data?.data ?? [];
  const query = normalizeSearch(search);
  const visible = data.filter((post) => {
    const matchesFilter =
      filter === "all" ? true : filter === "active" ? post.status !== "archived" : post.status === filter;
    return matchesFilter && (!query || normalizeSearch(`${post.title} ${post.authorName}`).includes(query));
  });
  const count = (status: PostStatus) => data.filter((post) => post.status === status).length;

  function remember(event: { currentTarget: HTMLElement }) {
    triggerRef.current = event.currentTarget;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <SearchField label="Buscar crônica" value={search} onChange={setSearch} placeholder="Título ou autoria" className="max-w-md" />
        {canCreate ? (
          <Button variant="accent" onClick={(event) => { remember(event); save.reset(); setEditor({ post: null }); }}>
            Nova crônica
          </Button>
        ) : null}
      </div>
      <FilterChips
        label="Filtrar crônicas por situação"
        value={filter}
        onChange={setFilter}
        options={[
          { value: "active", label: "Em andamento", count: data.filter((post) => post.status !== "archived").length },
          { value: "pending_review", label: "Em revisão", count: count("pending_review") },
          { value: "approved", label: "Aprovadas", count: count("approved") },
          { value: "published", label: "Publicadas", count: count("published") },
          { value: "archived", label: "Arquivadas", count: count("archived") },
          { value: "all", label: "Todas", count: data.length },
        ]}
      />
      {!canCreate ? <PermissionNote>Seu perfil revisa e publica, mas não escreve crônicas.</PermissionNote> : null}

      {data.length === 0 ? (
        <FeedbackState
          title="Nenhuma crônica ainda"
          action={canCreate ? <Button variant="accent" onClick={() => setEditor({ post: null })}>Escrever a primeira</Button> : null}
        >
          As crônicas da lore passam por revisão humana antes de aparecer em Crônicas no portal.
        </FeedbackState>
      ) : (
        <DataTable
          caption="Crônicas da campanha"
          rows={visible}
          rowKey={(post) => post.id}
          initialSort={{ column: "status", direction: "ascending" }}
          empty={
            <FeedbackState title="Nenhuma crônica neste filtro" action={<Button onClick={() => { setFilter("all"); setSearch(""); }}>Mostrar todas</Button>}>
              Ajuste a busca ou escolha outra situação.
            </FeedbackState>
          }
          columns={[
            {
              id: "title",
              header: "Crônica",
              hideLabelOnMobile: true,
              sortValue: (post) => post.title,
              cell: (post) => (
                <div className="min-w-0 space-y-1">
                  <p className="font-semibold text-fg">{post.title}</p>
                  <p className="text-xs text-fg-subtle">{post.authorName} · {sourceLabels[post.source]}</p>
                </div>
              ),
            },
            {
              id: "status",
              header: "Situação",
              sortValue: (post) => editorialOrder[post.status],
              className: "md:w-36",
              cell: (post) => <Badge tone={editorialTone[post.status]}>{statusLabels[post.status]}</Badge>,
            },
            {
              id: "updated",
              header: "Atualizada",
              sortValue: (post) => timestamp(post.updatedAt),
              className: "md:w-36 text-fg-muted",
              cell: (post) => formatDate(post.updatedAt),
            },
            {
              id: "actions",
              header: "Ações",
              hideLabelOnMobile: true,
              className: "lg:w-80",
              cell: (post) => (
                <RowActions>
                  {canCreate && (post.authorUserId === me.user?.id || canEditAll) &&
                  ["draft", "pending_review", "rejected"].includes(post.status) ? (
                    <Button size="sm" variant="ghost" onClick={(event) => { remember(event); save.reset(); setEditor({ post }); }}>
                      Editar
                    </Button>
                  ) : null}
                  {(post.status === "draft" || post.status === "rejected") && post.authorUserId === me.user?.id ? (
                    <Button size="sm" disabled={transition.isPending} onClick={() => transition.mutate({ post, status: "pending_review" })}>
                      Enviar à revisão
                    </Button>
                  ) : null}
                  {post.status === "pending_review" && canReview ? (
                    <>
                      <Button size="sm" variant="primary" disabled={transition.isPending} onClick={() => transition.mutate({ post, status: "approved" })}>
                        Aprovar
                      </Button>
                      <Button size="sm" disabled={transition.isPending} onClick={() => transition.mutate({ post, status: "rejected" })}>
                        Rejeitar
                      </Button>
                    </>
                  ) : null}
                  {post.status === "approved" && canPublish ? (
                    <Button size="sm" variant="primary" disabled={transition.isPending} onClick={() => transition.mutate({ post, status: "published" })}>
                      Publicar no portal
                    </Button>
                  ) : null}
                  {post.status === "archived" && canPublish ? (
                    <Button size="sm" disabled={transition.isPending} onClick={() => transition.mutate({ post, status: "draft" })}>
                      Restaurar como rascunho
                    </Button>
                  ) : null}
                  {post.status !== "archived" && canPublish ? (
                    <Button size="sm" variant="ghost" className="text-danger" onClick={(event) => { remember(event); archive.reset(); setArchiving(post); }}>
                      Arquivar
                    </Button>
                  ) : null}
                  {post.status === "archived" && canDelete ? (
                    <Button size="sm" variant="danger" onClick={(event) => { remember(event); destroy.reset(); setDeleting(post); }}>
                      Excluir permanentemente
                    </Button>
                  ) : null}
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
        title={editor?.post ? "Editar crônica" : "Nova crônica"}
        description={editor?.post ? editor.post.title : "A crônica começa como rascunho e só vai para Crônicas depois da revisão. Resumos de sessão são escritos no Diário de Sessões."}
        returnFocusRef={triggerRef}
        className="max-w-3xl"
      >
        {editor ? (
          <PostForm
            key={editor.post?.id ?? "new"}
            campaignId={campaignId}
            post={editor.post}
            busy={save.isPending}
            error={save.isError ? errorMessage(save.error) : null}
            onCancel={() => setEditor(null)}
            onSubmit={(payload) => save.mutate(payload)}
          />
        ) : null}
      </Dialog>

      <ConfirmDialog
        open={Boolean(archiving)}
        title="Arquivar crônica?"
        description={archiving ? `“${archiving.title}” sai da leitura pública, mas pode ser restaurada depois.` : undefined}
        confirmLabel="Arquivar"
        busyLabel="Arquivando…"
        busy={archive.isPending}
        error={archive.isError ? errorMessage(archive.error) : null}
        onCancel={() => setArchiving(null)}
        onConfirm={() => archiving && archive.mutate(archiving)}
        returnFocusRef={triggerRef}
      />

      <ConfirmDialog
        open={Boolean(deleting)}
        title="Excluir crônica permanentemente?"
        description="Esta ação não pode ser desfeita."
        confirmLabel="Excluir permanentemente"
        busyLabel="Excluindo…"
        confirmationText="EXCLUIR"
        busy={destroy.isPending}
        error={destroy.isError ? errorMessage(destroy.error) : null}
        onCancel={() => setDeleting(null)}
        onConfirm={() => deleting && destroy.mutate(deleting)}
        returnFocusRef={triggerRef}
      >
        <p>
          A crônica <strong className="text-fg">{deleting?.title}</strong> e seus registros internos serão removidos do
          portal. Uma crônica já enviada ao Discord continuará existindo no fórum.
        </p>
      </ConfirmDialog>
    </div>
  );
}

function PostForm({
  campaignId,
  post,
  busy,
  error,
  onCancel,
  onSubmit,
}: Readonly<{
  campaignId: string;
  post: Post | null;
  busy: boolean;
  error: string | null;
  onCancel: () => void;
  onSubmit: (value: CreatePostInput | (UpdatePostInput & { id: string })) => void;
}>) {
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const fields = { title: String(data.get("title")), body: String(data.get("body")) };
    onSubmit(post ? { ...fields, id: post.id, version: post.version } : { ...fields, campaignId, source: "manual" });
  }

  return (
    <form className="space-y-6" onSubmit={submit}>
      <FormGrid>
        <Field label="Título" className="full">
          {({ id }) => <Input id={id} name="title" required minLength={3} maxLength={140} defaultValue={post?.title} />}
        </Field>
        <Field label="Conteúdo" className="full" hint="Separe parágrafos com uma linha em branco.">
          {({ id, describedBy }) => (
            <Textarea id={id} name="body" required rows={14} maxLength={20_000} defaultValue={post?.body} aria-describedby={describedBy} />
          )}
        </Field>
      </FormGrid>
      {error ? <Notice tone="danger" role="alert">{error}</Notice> : null}
      <div className="flex flex-col-reverse gap-3 border-t border-line-soft pt-4 sm:flex-row sm:justify-end">
        <Button disabled={busy} onClick={onCancel}>Cancelar</Button>
        <Button type="submit" variant="primary" disabled={busy}>
          {busy ? "Salvando…" : post ? "Salvar texto" : "Criar rascunho"}
        </Button>
      </div>
    </form>
  );
}

async function invalidatePosts(queryClient: ReturnType<typeof useQueryClient>, campaignId: string) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: queryKeys.posts(campaignId, "editorial") }),
    queryClient.invalidateQueries({ queryKey: queryKeys.posts(campaignId) }),
  ]);
}
