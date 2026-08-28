"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Permission } from "@vigilia/authz";
import type {
  Campaign,
  CampaignListResponse,
  CreateCampaignInput,
  CurrentUserResponse,
  PostListResponse,
} from "@vigilia/contracts";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { apiFetch, errorMessage } from "@/lib/api-client";
import { hasCapability } from "@/lib/capabilities";
import { queryKeys } from "@/lib/query-keys";
import { AuditPanel } from "./audit-panel";
import { AutomationsPanel } from "./automations-panel";
import { FoundryPanel } from "./foundry-panel";
import { MembersPanel } from "./members-panel";
import { MissionsPanel } from "./missions-panel";
import { PostsPanel } from "./posts-panel";
import { SessionsPanel } from "./sessions-panel";

type Tab = "missions" | "posts" | "sessions" | "automations" | "foundry" | "members" | "audit" | "campaigns";

type TabDefinition = Readonly<{
  id: Tab;
  label: string;
  eyebrow: string;
  description: string;
  permissions: readonly Permission[];
}>;

const tabDefinitions: readonly TabDefinition[] = [
  {
    id: "sessions",
    label: "Sessões",
    eyebrow: "Registros da mesa",
    description: "Capture registros do Foundry, associe fontes e prepare rascunhos para revisão.",
    permissions: ["session:read", "session:manage"],
  },
  {
    id: "automations",
    label: "Automações",
    eyebrow: "Assistência editorial",
    description: "Transforme registros de sessão em resumos e rascunhos que sempre passam por revisão humana.",
    permissions: ["automation:read", "automation:run"],
  },
  {
    id: "foundry",
    label: "Mundos do Foundry",
    eyebrow: "Integrações",
    description: "Conecte mundos de Shadow of the Demon Lord e acompanhe presença, personagens e versões.",
    permissions: ["foundry:world:manage"],
  },
  {
    id: "missions",
    label: "Missões",
    eyebrow: "Quadro editorial",
    description: "Crie chamados, organize a revisão e publique missões no quadro da Ordem.",
    permissions: ["mission:create", "mission:edit", "mission:review", "mission:publish"],
  },
  {
    id: "posts",
    label: "Publicações",
    eyebrow: "Mesa de revisão",
    description: "Prepare crônicas e comunicados antes de publicá-los no portal.",
    permissions: ["post:create", "post:review", "post:publish", "post:delete"],
  },
  {
    id: "members",
    label: "Pessoas e acessos",
    eyebrow: "Comunidade",
    description: "Gerencie participação e papéis sem confundir acessos globais e locais.",
    permissions: ["member:manage"],
  },
  {
    id: "audit",
    label: "Histórico",
    eyebrow: "Auditoria",
    description: "Acompanhe as alterações relevantes realizadas dentro da campanha.",
    permissions: ["audit:read"],
  },
  {
    id: "campaigns",
    label: "Configurações",
    eyebrow: "Campanha",
    description: "Atualize identidade, visibilidade e estado da campanha selecionada.",
    permissions: ["campaign:manage"],
  },
];

export function DashboardClient({
  initialMe,
  initialCampaigns,
  initialEditorialPosts,
}: Readonly<{
  initialMe?: CurrentUserResponse;
  initialCampaigns?: CampaignListResponse;
  initialEditorialPosts?: PostListResponse;
}> = {}) {
  const [tab, setTab] = useState<Tab>("missions");
  const [selectedCampaign, setSelectedCampaign] = useState("");
  const me = useQuery({
    queryKey: queryKeys.me,
    queryFn: () => apiFetch<CurrentUserResponse>("/api/me"),
    initialData: initialMe,
    enabled: initialMe === undefined,
  });
  const campaigns = useQuery({
    queryKey: queryKeys.campaigns,
    queryFn: () => apiFetch<CampaignListResponse>("/api/campaigns"),
    initialData: initialCampaigns,
    enabled: me.data?.authenticated === true && initialCampaigns === undefined,
  });

  if (me.isLoading) {
    return <DashboardState eyebrow="Aguarde" title="Preparando seu espaço de gestão" text="Estamos carregando suas permissões e campanhas." loading />;
  }

  if (!me.data?.authenticated) {
    return (
      <DashboardState
        eyebrow="Acesso protegido"
        title="Entre para continuar"
        text="O painel de gestão está disponível somente para membros autorizados."
      >
        <a className="admin-primary" href="/api/auth/discord?returnTo=/dashboard">
          Entrar com Discord
        </a>
        <Link className="secondary-action" href="/">Voltar ao portal público</Link>
      </DashboardState>
    );
  }

  const availableTabs = tabDefinitions.filter((definition) =>
    definition.permissions.some((permission) =>
      me.data?.capabilities.some((capability) => capability.permission === permission),
    ),
  );

  if (availableTabs.length === 0) {
    return (
      <DashboardState
        eyebrow="Área do jogador"
        title="Você não precisa do painel de gestão"
        text="Seu perfil participa das missões pelo portal público. Controles administrativos aparecem apenas para a equipe da campanha."
      >
        <Link className="admin-primary" href="/#quadro">Ver missões disponíveis</Link>
        <Link className="secondary-action" href="/">Voltar ao portal</Link>
      </DashboardState>
    );
  }

  if (campaigns.isLoading) {
    return <DashboardState eyebrow="Aguarde" title="Carregando suas campanhas" text="Estamos aplicando seus acessos em cada campanha." loading />;
  }

  if (campaigns.isError) {
    return (
      <DashboardState
        eyebrow="Campanhas indisponíveis"
        title="Não foi possível carregar seu espaço de gestão"
        text={errorMessage(campaigns.error)}
      >
        <button className="admin-primary" type="button" onClick={() => campaigns.refetch()}>
          Tentar novamente
        </button>
        <Link className="secondary-action" href="/">Voltar ao portal</Link>
      </DashboardState>
    );
  }

  const activeTab = availableTabs.some((definition) => definition.id === tab)
    ? tab
    : availableTabs[0]!.id;
  const activeDefinition = availableTabs.find((definition) => definition.id === activeTab)!;
  const eligibleCampaigns = (campaigns.data?.data ?? []).filter((candidate) =>
    activeDefinition.permissions.some((permission) =>
      hasCapability(me.data, permission, candidate.id),
    ),
  );
  const campaignId = eligibleCampaigns.some((candidate) => candidate.id === selectedCampaign)
    ? selectedCampaign
    : eligibleCampaigns[0]?.id ?? "";
  const campaign = eligibleCampaigns.find((item) => item.id === campaignId);
  const globalRole = me.data.assignments.find(
    (assignment) => assignment.scopeKind === "global",
  )?.roleName;

  return (
    <main className="admin-shell" id="main-content">
      <aside className="admin-sidebar">
        <Link className="admin-brand" href="/">
          <span className="admin-brand-mark" aria-hidden="true">O</span>
          <span><small>Ordem da</small><strong>Última Luz</strong></span>
        </Link>

        <div className="admin-campaign-picker">
          <label htmlFor="active-campaign">Campanha ativa</label>
          <select
            id="active-campaign"
            value={campaignId}
            onChange={(event) => setSelectedCampaign(event.target.value)}
            disabled={campaigns.isLoading}
          >
            {eligibleCampaigns.map((item) => (
              <option value={item.id} key={item.id}>{item.name}</option>
            ))}
          </select>
          {campaign ? (
            <span className="campaign-state">
              <i aria-hidden="true" />
              {campaign.status === "active" ? "Campanha ativa" : campaign.status}
            </span>
          ) : null}
        </div>

        <nav className="admin-navigation" aria-label="Áreas de gestão">
          <span className="admin-nav-label">Gestão</span>
          {availableTabs.map((definition) => (
            <button
              key={definition.id}
              type="button"
              aria-current={activeTab === definition.id ? "page" : undefined}
              aria-controls="admin-active-panel"
              className={activeTab === definition.id ? "is-active" : ""}
              onClick={() => setTab(definition.id)}
            >
              <span>{definition.label}</span>
              <small>{definition.eyebrow}</small>
            </button>
          ))}
        </nav>

        <label className="admin-mobile-navigation" htmlFor="active-admin-area">
          <span>Área do painel</span>
          <select
            id="active-admin-area"
            value={activeTab}
            onChange={(event) => {
              const nextTab = availableTabs.find(
                (definition) => definition.id === event.target.value,
              );
              if (nextTab) setTab(nextTab.id);
            }}
          >
            {availableTabs.map((definition) => (
              <option value={definition.id} key={definition.id}>
                {definition.label}
              </option>
            ))}
          </select>
        </label>

        <div className="admin-user-card">
          <span className="admin-user-avatar" aria-hidden="true">
            {me.data.user?.displayName.slice(0, 1).toUpperCase()}
          </span>
          <span>
            <strong>{me.data.user?.displayName}</strong>
            <small>{globalRole ? roleLabel(globalRole) : "Equipe da campanha"}</small>
          </span>
        </div>
      </aside>

      <section className="admin-main">
        <header className="admin-topbar">
          <div className="admin-breadcrumb" aria-label="Localização atual">
            <Link href="/">Portal</Link><span aria-hidden="true">/</span><strong>Painel de gestão</strong>
          </div>
          <Link className="secondary-action" href="/">Visualizar portal</Link>
        </header>

        <div className="admin-page-heading">
          <div>
            <span className="admin-eyebrow">{activeDefinition.eyebrow}</span>
            <h1 id="admin-page-title">{activeDefinition.label}</h1>
            <p>{activeDefinition.description}</p>
          </div>
          {globalRole ? (
            <div className="access-summary">
              <span>Acesso atual</span>
              <strong>{roleLabel(globalRole)}</strong>
              <small>Permissões globais protegidas</small>
            </div>
          ) : null}
        </div>

        {!campaignId ? (
          <section className="admin-empty">
            <span className="empty-mark" aria-hidden="true">O</span>
            <h2>Nenhuma campanha disponível</h2>
            <p>Crie a primeira campanha para começar a organizar missões e membros.</p>
            {hasCapability(me.data, "campaign:manage") ? (
              <CampaignCreator onCreated={setSelectedCampaign} />
            ) : null}
          </section>
        ) : (
          <section
            className="admin-workspace"
            id="admin-active-panel"
            aria-labelledby="admin-page-title"
          >
            {activeTab === "missions" ? <MissionsPanel campaignId={campaignId} me={me.data} /> : null}
            {activeTab === "posts" ? (
              <PostsPanel
                campaignId={campaignId}
                me={me.data}
                {...(initialEditorialPosts
                  ? { initialPosts: initialEditorialPosts }
                  : {})}
              />
            ) : null}
            {activeTab === "sessions" ? (
              <SessionsPanel
                campaignId={campaignId}
                me={me.data}
                onOpenReview={() => setTab("posts")}
              />
            ) : null}
            {activeTab === "automations" ? (
              <AutomationsPanel
                campaignId={campaignId}
                me={me.data}
                onOpenReview={() => setTab("posts")}
              />
            ) : null}
            {activeTab === "foundry" && campaign ? (
              <FoundryPanel key={campaignId} campaignId={campaignId} campaignName={campaign.name} />
            ) : null}
            {activeTab === "members" ? <MembersPanel campaignId={campaignId} me={me.data} /> : null}
            {activeTab === "audit" ? <AuditPanel campaignId={campaignId} /> : null}
            {activeTab === "campaigns" ? (
              <div className="admin-two-column">
                {campaign ? <CampaignSettings campaign={campaign} /> : null}
                <CampaignCreator onCreated={setSelectedCampaign} />
              </div>
            ) : null}
          </section>
        )}
      </section>
    </main>
  );
}

function DashboardState({
  eyebrow,
  title,
  text,
  loading = false,
  children,
}: Readonly<{
  eyebrow: string;
  title: string;
  text: string;
  loading?: boolean;
  children?: React.ReactNode;
}>) {
  return (
    <main className="dashboard-state" id="main-content">
      <div className="dashboard-state-card">
        <span className="dashboard-state-mark" aria-hidden="true">O</span>
        <span className="admin-eyebrow">{eyebrow}</span>
        <h1>{title}</h1>
        <p>{text}</p>
        {loading ? <span className="loading-line" aria-hidden="true" /> : null}
        {children ? <div className="dashboard-state-actions">{children}</div> : null}
      </div>
    </main>
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
    <section className="admin-card admin-panel-narrow">
      <div className="admin-section-title">
        <div><span>Nova estrutura</span><h2>Criar campanha</h2><p>Abra um novo espaço persistente dentro do portal.</p></div>
      </div>
      <form className="admin-form" onSubmit={submit}>
        <label>Nome<input name="name" required minLength={3} /></label>
        <label>Identificador<input name="slug" required pattern="[a-z0-9]+(?:-[a-z0-9]+)*" /></label>
        <label className="full">Descrição<textarea name="description" rows={4} /></label>
        <label className="check full"><input type="checkbox" name="isPublic" defaultChecked /> Exibir no portal público</label>
        <button className="admin-primary" disabled={create.isPending}>
          {create.isPending ? "Criando campanha…" : "Criar campanha"}
        </button>
      </form>
      {create.isSuccess ? <p className="inline-success" role="status">Campanha criada com sucesso.</p> : null}
      {create.isError ? <p className="inline-error">{errorMessage(create.error)}</p> : null}
    </section>
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
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.campaigns }),
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
    <section className="admin-card">
      <div className="admin-section-title">
        <div><span>Configuração atual</span><h2>{campaign.name}</h2><p>Identidade e disponibilidade desta campanha.</p></div>
      </div>
      <form className="admin-form" key={campaign.version} onSubmit={submit}>
        <label>Nome<input name="name" defaultValue={campaign.name} required /></label>
        <label>Identificador<input name="slug" defaultValue={campaign.slug} required /></label>
        <label className="full">Descrição<textarea name="description" rows={5} defaultValue={campaign.description} /></label>
        <label>Status<select name="status" defaultValue={campaign.status}><option value="draft">Rascunho</option><option value="active">Ativa</option><option value="archived">Arquivada</option></select></label>
        <label className="check"><input type="checkbox" name="isPublic" defaultChecked={campaign.isPublic} /> Exibir no portal público</label>
        <button className="admin-primary" disabled={update.isPending}>
          {update.isPending ? "Salvando alterações…" : "Salvar configurações"}
        </button>
      </form>
      {update.isSuccess ? <p className="inline-success" role="status">Configurações atualizadas.</p> : null}
      {update.isError ? <p className="inline-error">{errorMessage(update.error)}</p> : null}
    </section>
  );
}

function roleLabel(role: string): string {
  const labels: Record<string, string> = {
    owner: "Proprietário global",
    administrator: "Administrador global",
    campaign_manager: "Gestor da campanha",
    gm: "Mestre",
    editor: "Editor",
    moderator: "Moderador",
    player: "Jogador",
    automation: "Automação",
  };
  return labels[role] ?? role;
}
