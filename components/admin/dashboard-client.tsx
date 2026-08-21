"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import type {
  Campaign,
  CampaignListResponse,
  CreateCampaignInput,
  CurrentUserResponse,
} from "@vigilia/contracts";
import { useState, type FormEvent } from "react";
import { apiFetch, errorMessage } from "@/lib/api-client";
import { hasCapability } from "@/lib/capabilities";
import { queryKeys } from "@/lib/query-keys";
import { AuditPanel } from "./audit-panel";
import { MembersPanel } from "./members-panel";
import { MissionsPanel } from "./missions-panel";
import { PostsPanel } from "./posts-panel";

type Tab = "missions" | "posts" | "members" | "audit" | "campaigns";

export function DashboardClient() {
  const [tab, setTab] = useState<Tab>("missions");
  const [selectedCampaign, setSelectedCampaign] = useState<string>("");
  const me = useQuery({
    queryKey: queryKeys.me,
    queryFn: () => apiFetch<CurrentUserResponse>("/api/me"),
  });
  const campaigns = useQuery({
    queryKey: queryKeys.campaigns,
    queryFn: () => apiFetch<CampaignListResponse>("/api/campaigns"),
    enabled: me.data?.authenticated === true,
  });
  const campaignId = selectedCampaign || campaigns.data?.data[0]?.id || "";
  const campaign = campaigns.data?.data.find((item) => item.id === campaignId);

  if (me.isLoading) return <DashboardState text="Acendendo as lanternas…" />;
  if (!me.data?.authenticated) {
    return (
      <DashboardState text="Entre com o Discord para acessar o painel.">
        <a className="admin-primary" href="/api/auth/discord?returnTo=/dashboard">
          Entrar com Discord
        </a>
      </DashboardState>
    );
  }

  return (
    <main className="admin-shell">
      <header className="admin-header">
        <div>
          <Link href="/" className="admin-kicker">← Vigília do Último Farol</Link>
          <h1>Gabinete da campanha</h1>
        </div>
        <div className="admin-identity">
          <span>{me.data.user?.displayName}</span>
          <Link href="/">Ver portal</Link>
        </div>
      </header>

      <div className="admin-context">
        <label>
          Campanha ativa
          <select
            value={campaignId}
            onChange={(event) => setSelectedCampaign(event.target.value)}
          >
            {campaigns.data?.data.map((item) => (
              <option value={item.id} key={item.id}>{item.name}</option>
            ))}
          </select>
        </label>
        {campaign ? <span className={`status-pill status-${campaign.status}`}>{campaign.status}</span> : null}
      </div>

      {!campaignId ? (
        <section className="admin-empty">
          <h2>Nenhuma campanha disponível</h2>
          <p>Crie a primeira campanha caso você possua permissão global.</p>
          {hasCapability(me.data, "campaign:manage") ? (
            <CampaignCreator onCreated={setSelectedCampaign} />
          ) : null}
        </section>
      ) : (
        <>
          <nav className="admin-tabs" aria-label="Áreas administrativas">
            <TabButton active={tab === "missions"} onClick={() => setTab("missions")}>Missões</TabButton>
            <TabButton active={tab === "posts"} onClick={() => setTab("posts")}>Posts</TabButton>
            {hasCapability(me.data, "member:manage", campaignId) ? (
              <TabButton active={tab === "members"} onClick={() => setTab("members")}>Membros</TabButton>
            ) : null}
            {hasCapability(me.data, "audit:read", campaignId) ? (
              <TabButton active={tab === "audit"} onClick={() => setTab("audit")}>Auditoria</TabButton>
            ) : null}
            {hasCapability(me.data, "campaign:manage") ? (
              <TabButton active={tab === "campaigns"} onClick={() => setTab("campaigns")}>Campanhas</TabButton>
            ) : null}
          </nav>
          <section className="admin-workspace">
            {tab === "missions" ? <MissionsPanel campaignId={campaignId} me={me.data} /> : null}
            {tab === "posts" ? <PostsPanel campaignId={campaignId} me={me.data} /> : null}
            {tab === "members" ? <MembersPanel campaignId={campaignId} me={me.data} /> : null}
            {tab === "audit" ? <AuditPanel campaignId={campaignId} /> : null}
            {tab === "campaigns" ? (
              <div className="admin-two-column">
                {campaign ? <CampaignSettings campaign={campaign} /> : null}
                <CampaignCreator onCreated={setSelectedCampaign} />
              </div>
            ) : null}
          </section>
        </>
      )}
    </main>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: Readonly<{ active: boolean; onClick: () => void; children: React.ReactNode }>) {
  return <button className={active ? "is-active" : ""} onClick={onClick} type="button">{children}</button>;
}

function DashboardState({
  text,
  children,
}: Readonly<{ text: string; children?: React.ReactNode }>) {
  return (
    <main className="dashboard-state"><div className="sigil">V</div><p>{text}</p>{children}</main>
  );
}

function CampaignCreator({ onCreated }: Readonly<{ onCreated: (id: string) => void }>) {
  const queryClient = useQueryClient();
  const create = useMutation({
    mutationFn: (input: CreateCampaignInput) =>
      apiFetch<Campaign>("/api/campaigns", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: async (campaign) => {
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
    <div className="admin-panel-narrow">
      <div className="admin-section-title"><div><span>FUNDAÇÃO</span><h2>Nova campanha</h2></div></div>
      <form className="admin-form" onSubmit={submit}>
        <label>Nome<input name="name" required minLength={3} /></label>
        <label>Identificador<input name="slug" required pattern="[a-z0-9]+(?:-[a-z0-9]+)*" /></label>
        <label className="full">Descrição<textarea name="description" rows={4} /></label>
        <label className="check full"><input type="checkbox" name="isPublic" defaultChecked /> Quadro público</label>
        <button className="admin-primary" disabled={create.isPending}>Criar campanha</button>
      </form>
      {create.isError ? <p className="inline-error">{errorMessage(create.error)}</p> : null}
    </div>
  );
}

function CampaignSettings({ campaign }: Readonly<{ campaign: Campaign }>) {
  const queryClient = useQueryClient();
  const update = useMutation({
    mutationFn: (input: Record<string, unknown>) =>
      apiFetch<Campaign>(`/api/campaigns/${campaign.id}`, {
        method: "PATCH",
        body: JSON.stringify({ ...input, version: campaign.version }),
      }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: queryKeys.campaigns }),
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
    });
  }

  return (
    <div>
      <div className="admin-section-title"><div><span>CONFIGURAÇÃO</span><h2>{campaign.name}</h2></div></div>
      <form className="admin-form" key={campaign.version} onSubmit={submit}>
        <label>Nome<input name="name" defaultValue={campaign.name} required /></label>
        <label>Identificador<input name="slug" defaultValue={campaign.slug} required /></label>
        <label className="full">Descrição<textarea name="description" rows={5} defaultValue={campaign.description} /></label>
        <label>Status<select name="status" defaultValue={campaign.status}><option value="draft">Rascunho</option><option value="active">Ativa</option><option value="archived">Arquivada</option></select></label>
        <label className="check"><input type="checkbox" name="isPublic" defaultChecked={campaign.isPublic} /> Quadro público</label>
        <button className="admin-primary" disabled={update.isPending}>Salvar campanha</button>
      </form>
      {update.isError ? <p className="inline-error">{errorMessage(update.error)}</p> : null}
    </div>
  );
}
