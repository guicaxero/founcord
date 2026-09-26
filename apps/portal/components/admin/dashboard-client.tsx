"use client";

import { useQuery } from "@tanstack/react-query";
import type {
  CampaignCharacterLinkManagementResponse,
  CampaignMemberListResponse,
  CampaignListResponse,
  CampaignSessionListResponse,
  CurrentUserResponse,
  FoundryWorldListResponse,
  PostListResponse,
  SessionSummaryListResponse,
} from "@ordem/contracts";
import { motion } from "motion/react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { Badge, Card, Eyebrow, Skeleton } from "@/components/ui/surface";
import { Button, ButtonAnchor, ButtonLink } from "@/components/ui/button";
import { FeedbackState } from "@/components/ui/feedback-state";
import { Select } from "@/components/ui/field";
import { riseIn } from "@/components/ui/motion";
import { apiFetch, errorMessage } from "@/lib/api-client";
import { hasCapability } from "@/lib/capabilities";
import { cn } from "@/lib/cn";
import { queryKeys } from "@/lib/query-keys";
import { areaBySlug, areaGroups, areas, type AreaDefinition, type AreaSlug } from "./areas";
import { AuditPanel } from "./audit-panel";
import { AutomationsPanel } from "./automations-panel";
import { CampaignCreatorDialog, CampaignSettings } from "./campaign-settings";
import { CharacterLinksPanel } from "./character-links-panel";
import { FoundryPanel } from "./foundry-panel";
import { MembersPanel } from "./members-panel";
import { MerchantPurchasesPanel } from "./merchant-purchases-panel";
import { MerchantStockPanel } from "./merchant-stock/merchant-stock-panel";
import { MissionsPanel } from "./missions-panel";
import { PostsPanel } from "./posts-panel";
import { SessionSummariesPanel } from "./session-summaries-panel";
import { SessionsPanel } from "./sessions-panel";

/**
 * Painel de gestão. A área vem da URL (`/dashboard/[area]`); a campanha ativa
 * fica no estado do layout, que persiste entre as áreas.
 */
export function DashboardClient({
  area: requestedSlug,
  basePath = "/dashboard",
  initialMe,
  initialCampaigns,
  initialEditorialPosts,
  initialSessionSummaries,
  initialSessions,
  initialCharacterMembers,
  initialCharacterLinks,
  initialCharacterWorlds,
}: Readonly<{
  area?: string | null | undefined;
  basePath?: string | undefined;
  initialMe?: CurrentUserResponse | undefined;
  initialCampaigns?: CampaignListResponse | undefined;
  initialEditorialPosts?: PostListResponse | undefined;
  initialSessionSummaries?: SessionSummaryListResponse | undefined;
  initialSessions?: CampaignSessionListResponse | undefined;
  initialCharacterMembers?: CampaignMemberListResponse | undefined;
  initialCharacterLinks?: CampaignCharacterLinkManagementResponse | undefined;
  initialCharacterWorlds?: FoundryWorldListResponse | undefined;
}>) {
  const router = useRouter();
  const pathname = usePathname();
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
  const hrefFor = (slug: AreaSlug) => `${basePath}/${slug}`;

  if (me.isLoading) {
    return <DashboardState eyebrow="Aguarde" title="Preparando seu espaço de gestão" text="Carregando suas permissões e campanhas." loading />;
  }

  if (!me.data?.authenticated) {
    return (
      <DashboardState
        eyebrow="Acesso protegido"
        title="Entre para continuar"
        text="O painel de gestão está disponível somente para a equipe da campanha."
      >
        <ButtonAnchor variant="accent" href={`/api/auth/discord?returnTo=${encodeURIComponent(pathname || "/dashboard")}`}>
          Entrar com Discord
        </ButtonAnchor>
        <ButtonLink href="/">Voltar ao portal</ButtonLink>
      </DashboardState>
    );
  }

  const user = me.data;
  const availableAreas = areas.filter((definition) =>
    definition.permissions.some((permission) =>
      user.capabilities.some((capability) => capability.permission === permission),
    ),
  );

  if (availableAreas.length === 0) {
    return (
      <DashboardState
        eyebrow="Área do jogador"
        title="Você não precisa do painel de gestão"
        text="Seu perfil participa das missões pelo portal. Os controles de gestão aparecem só para a equipe da campanha."
      >
        <ButtonLink variant="accent" href="/missoes">Ver missões abertas</ButtonLink>
        <ButtonLink href="/eu">Ir para minha área</ButtonLink>
      </DashboardState>
    );
  }

  const requested = requestedSlug ? areaBySlug(requestedSlug) : undefined;
  if (requestedSlug && (!requested || !availableAreas.includes(requested))) {
    return (
      <DashboardState
        eyebrow="Área indisponível"
        title={requested ? "Seu perfil não acessa esta área" : "Esta área não existe"}
        text="Escolha uma das áreas liberadas para o seu perfil."
      >
        <ButtonLink variant="accent" href={hrefFor(availableAreas[0]!.slug)}>
          Abrir {availableAreas[0]!.label}
        </ButtonLink>
      </DashboardState>
    );
  }

  if (campaigns.isLoading) {
    return <DashboardState eyebrow="Aguarde" title="Carregando suas campanhas" text="Aplicando seus acessos em cada campanha." loading />;
  }

  if (campaigns.isError) {
    return (
      <DashboardState
        eyebrow="Campanhas indisponíveis"
        title="Não foi possível carregar o painel"
        text={errorMessage(campaigns.error)}
      >
        <Button variant="accent" onClick={() => campaigns.refetch()}>Tentar novamente</Button>
        <ButtonLink href="/">Voltar ao portal</ButtonLink>
      </DashboardState>
    );
  }

  const area = requested ?? availableAreas[0]!;
  const eligibleCampaigns = (campaigns.data?.data ?? []).filter((candidate) =>
    area.permissions.some((permission) => hasCapability(user, permission, candidate.id)),
  );
  const campaignId = eligibleCampaigns.some((candidate) => candidate.id === selectedCampaign)
    ? selectedCampaign
    : eligibleCampaigns[0]?.id ?? "";
  const campaign = eligibleCampaigns.find((item) => item.id === campaignId);
  const globalRole = user.assignments.find((assignment) => assignment.scopeKind === "global")?.roleName;

  let panel: ReactNode = null;
  if (campaignId) {
    switch (area.slug) {
      case "sessoes":
        panel = <SessionsPanel campaignId={campaignId} me={user} onOpenReview={() => router.push(hrefFor("diario"))} />;
        break;
      case "diario":
        panel = (
          <SessionSummariesPanel
            campaignId={campaignId}
            me={user}
            initialSummaries={initialSessionSummaries}
            initialSessions={initialSessions}
          />
        );
        break;
      case "automacoes":
        panel = (
          <AutomationsPanel
            campaignId={campaignId}
            me={user}
            onOpenReview={(target) => router.push(hrefFor(target === "session_summary" ? "diario" : "cronicas"))}
          />
        );
        break;
      case "missoes":
        panel = <MissionsPanel campaignId={campaignId} me={user} />;
        break;
      case "cronicas":
        panel = <PostsPanel campaignId={campaignId} me={user} initialPosts={initialEditorialPosts} />;
        break;
      case "foundry":
        panel = campaign ? <FoundryPanel key={campaignId} campaignId={campaignId} campaignName={campaign.name} /> : null;
        break;
      case "personagens":
        panel = (
          <CharacterLinksPanel
            campaignId={campaignId}
            initialMembers={initialCharacterMembers}
            initialLinks={initialCharacterLinks}
            initialWorlds={initialCharacterWorlds}
          />
        );
        break;
      case "pedidos":
        panel = <MerchantPurchasesPanel campaignId={campaignId} />;
        break;
      case "estoque":
        panel = <MerchantStockPanel campaignId={campaignId} />;
        break;
      case "pessoas":
        panel = <MembersPanel campaignId={campaignId} me={user} />;
        break;
      case "historico":
        panel = <AuditPanel campaignId={campaignId} />;
        break;
      case "configuracoes":
        panel = campaign ? <CampaignSettings key={campaign.id} campaign={campaign} onCreated={setSelectedCampaign} /> : null;
        break;
    }
  }

  return (
    <div className="mx-auto w-full max-w-[90rem] px-4 py-8 sm:px-6 lg:grid lg:grid-cols-[16.5rem_minmax(0,1fr)] lg:gap-10 lg:py-10">
      <aside className="grid items-start gap-4 max-lg:mb-8 sm:max-lg:grid-cols-2 lg:sticky lg:gap-6 lg:top-24 lg:max-h-[calc(100dvh-7rem)] lg:self-start lg:overflow-y-auto lg:pr-2 lg:pb-6 lg:[scrollbar-width:thin]">
        <CampaignPicker
          campaigns={eligibleCampaigns}
          value={campaignId}
          onChange={setSelectedCampaign}
        />

        <nav aria-label="Áreas de gestão" className="space-y-4 max-lg:hidden">
          {areaGroups.map((group) => {
            const items = availableAreas.filter((definition) => definition.group === group.id);
            if (items.length === 0) return null;
            return (
              <div key={group.id} className="space-y-1">
                <p className="px-3 text-[0.7rem] font-bold tracking-[0.14em] text-fg-subtle uppercase">
                  {group.label}
                </p>
                <ul className="space-y-0.5">
                  {items.map((definition) => (
                    <li key={definition.slug}>
                      <AreaLink definition={definition} href={hrefFor(definition.slug)} current={definition.slug === area.slug} />
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </nav>

        <div className="space-y-2 lg:hidden">
          <label className="block text-sm font-semibold text-fg-muted" htmlFor="active-admin-area">
            Área do painel
          </label>
          <Select
            id="active-admin-area"
            value={area.slug}
            onChange={(event) => {
              const next = areaBySlug(event.target.value);
              if (next) router.push(hrefFor(next.slug));
            }}
          >
            {areaGroups.map((group) => {
              const items = availableAreas.filter((definition) => definition.group === group.id);
              if (items.length === 0) return null;
              return (
                <optgroup key={group.id} label={group.label}>
                  {items.map((definition) => (
                    <option value={definition.slug} key={definition.slug}>{definition.label}</option>
                  ))}
                </optgroup>
              );
            })}
          </Select>
        </div>

      </aside>

      <div className="min-w-0 space-y-8">
        <motion.header
          key={area.slug}
          className="flex flex-wrap items-end justify-between gap-4 border-b border-line-soft pb-6"
          variants={riseIn}
          initial="hidden"
          animate="visible"
        >
          <div className="min-w-0 max-w-[68ch] space-y-2">
            <Eyebrow>{area.eyebrow}</Eyebrow>
            <h1 className="font-display text-3xl leading-tight text-balance sm:text-4xl" id="admin-area-title">
              {area.label}
            </h1>
            <p className="text-fg-muted">{area.description}</p>
          </div>
          {globalRole ? <Badge tone="accent">{roleLabel(globalRole)}</Badge> : null}
        </motion.header>

        {!campaignId ? (
          <NoCampaign canCreate={hasCapability(user, "campaign:manage")} onCreated={setSelectedCampaign} />
        ) : (
          <motion.section
            key={`${area.slug}:${campaignId}`}
            aria-labelledby="admin-area-title"
            variants={riseIn}
            initial="hidden"
            animate="visible"
          >
            {panel}
          </motion.section>
        )}
      </div>
    </div>
  );
}

function AreaLink({
  definition,
  href,
  current,
}: Readonly<{ definition: AreaDefinition; href: string; current: boolean }>) {
  return (
    <Link
      href={href}
      aria-current={current ? "page" : undefined}
      className={cn(
        "relative flex min-h-10 items-center rounded-md px-3 text-sm font-medium transition-colors duration-150",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
        current ? "text-fg" : "text-fg-muted hover:bg-surface-2 hover:text-fg",
      )}
    >
      {current ? (
        <motion.span
          layoutId="admin-area-indicator"
          className="absolute inset-0 rounded-md border border-line bg-surface-3"
          aria-hidden="true"
        >
          <span className="absolute top-2.5 bottom-2.5 left-0 w-0.5 rounded-full bg-accent" />
        </motion.span>
      ) : null}
      <span className="relative">{definition.label}</span>
    </Link>
  );
}

function CampaignPicker({
  campaigns,
  value,
  onChange,
}: Readonly<{
  campaigns: CampaignListResponse["data"];
  value: string;
  onChange: (id: string) => void;
}>) {
  const campaign = campaigns.find((item) => item.id === value);
  if (campaigns.length === 0) return null;
  return (
    <div className="space-y-2">
      <label className="block text-sm font-semibold text-fg-muted" htmlFor="active-campaign">
        Campanha
      </label>
      <Select id="active-campaign" value={value} onChange={(event) => onChange(event.target.value)}>
        {campaigns.map((item) => (
          <option value={item.id} key={item.id}>{item.name}</option>
        ))}
      </Select>
      {campaign ? (
        <p className="flex items-center gap-2 text-xs text-fg-subtle">
          <span
            aria-hidden="true"
            className={cn("size-2 rounded-full", campaign.status === "active" ? "bg-success" : "bg-fg-subtle")}
          />
          {campaignStatusLabel(campaign.status)} · {campaign.isPublic ? "visível no portal" : "privada"}
        </p>
      ) : null}
    </div>
  );
}

function NoCampaign({
  canCreate,
  onCreated,
}: Readonly<{ canCreate: boolean; onCreated: (id: string) => void }>) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <FeedbackState
        title="Nenhuma campanha disponível nesta área"
        action={canCreate ? <Button variant="accent" onClick={() => setOpen(true)}>Criar campanha</Button> : null}
      >
        {canCreate
          ? "Crie a primeira campanha para começar a organizar missões, sessões e membros."
          : "Peça a um gestor que conceda seu papel em uma campanha."}
      </FeedbackState>
      {canCreate ? (
        <CampaignCreatorDialog
          open={open}
          onOpenChange={setOpen}
          onCreated={(id) => {
            setOpen(false);
            onCreated(id);
          }}
        />
      ) : null}
    </>
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
  children?: ReactNode;
}>) {
  return (
    <div className="mx-auto flex w-full max-w-7xl justify-center px-4 py-16 sm:px-6 sm:py-24">
      <motion.div variants={riseIn} initial="hidden" animate="visible" className="w-full max-w-xl">
        <Card padding="lg" className="space-y-4 text-center" aria-busy={loading || undefined}>
          <Eyebrow>{eyebrow}</Eyebrow>
          <h1 className="font-display text-3xl leading-tight text-balance">{title}</h1>
          <p className="text-fg-muted">{text}</p>
          {loading ? (
            <div className="space-y-2 pt-2" role="status">
              <span className="sr-only">Carregando</span>
              <Skeleton className="mx-auto h-2 w-2/3" />
              <Skeleton className="mx-auto h-2 w-1/2" />
            </div>
          ) : null}
          {children ? <div className="flex flex-wrap justify-center gap-3 pt-2">{children}</div> : null}
        </Card>
      </motion.div>
    </div>
  );
}

function campaignStatusLabel(status: string): string {
  if (status === "active") return "Ativa";
  if (status === "draft") return "Rascunho";
  if (status === "archived") return "Arquivada";
  return status;
}

export function roleLabel(role: string): string {
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
