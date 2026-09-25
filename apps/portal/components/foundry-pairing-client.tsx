"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  CurrentUserResponse,
  FoundryPairingApprovalResponse,
  FoundryPortalPairingView,
} from "@ordem/contracts";
import { motion } from "motion/react";
import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Button, ButtonAnchor, ButtonLink } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { riseIn } from "@/components/ui/motion";
import { Notice } from "@/components/ui/notice";
import { Card, Eyebrow, Skeleton } from "@/components/ui/surface";
import { ApiClientError, apiFetch, errorMessage } from "@/lib/api-client";
import { cn } from "@/lib/cn";
import { queryKeys } from "@/lib/query-keys";

export function FoundryPairingClient({ initialCode }: Readonly<{ initialCode: string }>) {
  const [codeInput, setCodeInput] = useState(normalizeCode(initialCode));
  const [activeCode, setActiveCode] = useState(normalizeCode(initialCode));
  const [selectedCampaignId, setSelectedCampaignId] = useState("");
  const [codeError, setCodeError] = useState<string | null>(null);
  const codeInputRef = useRef<HTMLInputElement>(null);
  const worldHeadingRef = useRef<HTMLHeadingElement>(null);
  const queryClient = useQueryClient();
  const me = useQuery({
    queryKey: queryKeys.me,
    queryFn: () => apiFetch<CurrentUserResponse>("/api/me"),
  });
  const pairing = useQuery({
    queryKey: ["foundry", "pairing", activeCode],
    queryFn: () =>
      apiFetch<FoundryPortalPairingView>(
        `/api/foundry/pairings/${encodeURIComponent(activeCode)}`,
      ),
    enabled: me.data?.authenticated === true && isCompleteCode(activeCode),
    retry: false,
  });
  const campaigns = pairing.data?.eligibleCampaigns ?? [];
  const campaignId = campaigns.some((campaign) => campaign.id === selectedCampaignId)
    ? selectedCampaignId
    : campaigns[0]?.id ?? "";
  const approval = useMutation({
    mutationFn: () =>
      apiFetch<FoundryPairingApprovalResponse>(
        `/api/foundry/pairings/${pairing.data?.pairing.pairingId}/approve`,
        {
          method: "POST",
          body: JSON.stringify({ campaignId }),
        },
      ),
    onSuccess: async (result) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.foundryWorlds(result.campaignId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.audit(result.campaignId) }),
      ]);
    },
    onError: async (error) => {
      if (error instanceof ApiClientError && error.status === 409) {
        await pairing.refetch();
      }
    },
  });

  useEffect(() => {
    const url = new URL(window.location.href);
    if (activeCode) {
      url.searchParams.set("code", activeCode);
    } else {
      url.searchParams.delete("code");
    }
    window.history.replaceState(null, "", url);
  }, [activeCode]);

  useEffect(() => {
    if (pairing.data?.pairing.pairingId) worldHeadingRef.current?.focus();
  }, [pairing.data?.pairing.pairingId]);

  const returnTo = useMemo(
    () => `/foundry/connect${activeCode ? `?code=${encodeURIComponent(activeCode)}` : ""}`,
    [activeCode],
  );

  function submitCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalized = normalizeCode(codeInput);
    setCodeInput(normalized);
    if (!isCompleteCode(normalized)) {
      setCodeError("Informe um código no formato LUME-XXXX-XXXX, usando apenas as letras e números exibidos no Foundry.");
      window.requestAnimationFrame(() => codeInputRef.current?.focus());
      return;
    }
    setCodeError(null);
    setActiveCode(normalized);
  }

  if (me.isLoading) {
    return <PairingState eyebrow="Aguarde" title="Preparando a autorização" text="Estamos verificando sua sessão com segurança." loading />;
  }

  if (me.isError) {
    return (
      <PairingState
        eyebrow="Sessão indisponível"
        title="Não foi possível verificar sua conta"
        text={errorMessage(me.error)}
      >
        <Button variant="accent" onClick={() => me.refetch()}>Tentar novamente</Button>
        <ButtonLink href="/">Voltar ao portal</ButtonLink>
      </PairingState>
    );
  }

  if (!me.data?.authenticated) {
    return (
      <PairingState
        eyebrow="Conexão protegida"
        title="Autorize o mundo com sua conta Discord"
        text="O código será preservado durante o login. Depois, mostraremos somente as campanhas em que você pode conectar este mundo."
      >
        {activeCode ? <CodeBadge code={activeCode} /> : null}
        <ButtonAnchor variant="accent" href={`/api/auth/discord?returnTo=${encodeURIComponent(returnTo)}`}>
          Entrar com Discord
        </ButtonAnchor>
        <ButtonLink href="/">Voltar ao portal</ButtonLink>
      </PairingState>
    );
  }

  if (!isCompleteCode(activeCode)) {
    return (
      <PairingFrame>
        <Card padding="lg" className="mx-auto max-w-xl space-y-6">
          <div className="space-y-2">
            <Eyebrow>Código de conexão</Eyebrow>
            <h1 className="font-display text-3xl leading-tight">Informe o código exibido no Foundry</h1>
            <p className="text-fg-muted">O código começa com “LUME” e expira dez minutos depois de criado.</p>
          </div>
          <form className="space-y-4" onSubmit={submitCode} noValidate>
            <Field label="Código temporário">
              {({ id }) => (
                <Input
                  id={id}
                  ref={codeInputRef}
                  value={codeInput}
                  onChange={(event) => {
                    setCodeInput(normalizeCode(event.target.value));
                    setCodeError(null);
                  }}
                  placeholder="Exemplo: LUME-7K4P-9Q2M"
                  autoComplete="one-time-code"
                  aria-invalid={codeError ? true : undefined}
                  aria-describedby={codeError ? "foundry-code-error" : undefined}
                  spellCheck={false}
                  required
                  className="font-mono text-lg tracking-widest uppercase"
                />
              )}
            </Field>
            {codeError ? (
              <p className="text-sm text-danger" id="foundry-code-error" role="alert">{codeError}</p>
            ) : null}
            <Button type="submit" variant="accent" className="w-full">Localizar solicitação</Button>
          </form>
        </Card>
      </PairingFrame>
    );
  }

  if (pairing.isLoading) {
    return <PairingState eyebrow="Código reconhecido" title="Buscando os dados do mundo" text="Conferindo a solicitação e as campanhas em que você pode conectar o mundo." loading />;
  }

  if (pairing.isError) {
    const denied = pairing.error instanceof ApiClientError && pairing.error.status === 403;
    return (
      <PairingState
        eyebrow={denied ? "Permissão insuficiente" : "Solicitação indisponível"}
        title={denied ? "Sua conta não pode conectar este mundo" : "Não foi possível abrir esta solicitação"}
        text={errorMessage(pairing.error)}
        tone="error"
      >
        <CodeBadge code={activeCode} />
        {!denied ? <Button variant="accent" onClick={() => pairing.refetch()}>Tentar novamente</Button> : null}
        <Button
          onClick={() => {
            approval.reset();
            setSelectedCampaignId("");
            setActiveCode("");
            setCodeInput("");
          }}
        >
          Informar outro código
        </Button>
      </PairingState>
    );
  }

  if (!pairing.data) return null;
  const request = pairing.data.pairing;

  if (approval.isSuccess) {
    return (
      <PairingState
        eyebrow="Autorização concluída"
        title="Mundo autorizado"
        text={`“${request.worldTitle}” foi associado a “${approval.data.campaignName}”. Volte ao Foundry: a conexão termina sozinha.`}
        tone="success"
      >
        <ButtonLink variant="accent" href="/dashboard/foundry">Ver mundos conectados</ButtonLink>
        <ButtonLink href="/">Voltar ao portal</ButtonLink>
      </PairingState>
    );
  }

  if (request.status !== "pending") {
    const messages = pairingStatusCopy(request.status);
    return (
      <PairingState eyebrow={messages.eyebrow} title={messages.title} text={`${messages.text} Volte ao módulo no Foundry para gerar uma nova solicitação.`}>
        <CodeBadge code={request.userCode} />
        <ButtonLink href="/">Voltar ao portal</ButtonLink>
      </PairingState>
    );
  }

  return (
    <PairingFrame>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <Card padding="lg" className="space-y-6" aria-labelledby="pairing-world-title" role="region">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0 space-y-2">
              <Eyebrow>Solicitação encontrada</Eyebrow>
              <h1
                id="pairing-world-title"
                tabIndex={-1}
                ref={worldHeadingRef}
                className="font-display text-3xl leading-tight break-words outline-none"
              >
                {request.worldTitle}
              </h1>
              <p className="text-fg-muted">Confira a origem antes de autorizar o vínculo.</p>
            </div>
            <CodeBadge code={request.userCode} />
          </div>
          <dl className="grid gap-3 sm:grid-cols-2">
            {[
              ["Sistema", "Shadow of the Demon Lord"],
              ["Foundry VTT", `Versão ${request.foundryVersion}`],
              ["Sistema instalado", `Versão ${request.systemVersion}`],
              ["Módulo da Ordem", `Versão ${request.moduleVersion}`],
              ["Solicitação válida até", formatDate(request.expiresAt)],
            ].map(([label, value]) => (
              <div key={label} className="rounded-md bg-surface-2 px-3 py-2">
                <dt className="text-[0.7rem] font-bold tracking-wide text-fg-subtle uppercase">{label}</dt>
                <dd className="text-sm font-medium">{value}</dd>
              </div>
            ))}
          </dl>
          <Notice tone="info" title="O que será sincronizado">
            Presença do mundo e projeções sanitizadas dos personagens: nome, nível, ancestralidade, caminhos e recursos
            mecânicos mínimos. Notas do mestre, descrições, inventário e conteúdo de livros não são enviados.
          </Notice>
        </Card>

        <Card padding="lg" className="space-y-5 lg:self-start" aria-labelledby="pairing-authorize-title" role="region">
          <div className="space-y-2">
            <Eyebrow>Destino autorizado</Eyebrow>
            <h2 id="pairing-authorize-title" className="font-display text-2xl leading-tight">Escolha a campanha</h2>
            <p className="text-sm text-fg-muted">A conexão fica limitada à campanha escolhida e pode ser revogada depois.</p>
          </div>
          <div className="flex items-center gap-3 rounded-md bg-surface-2 px-3 py-2">
            <span aria-hidden="true" className="inline-flex size-9 items-center justify-center rounded-full border border-line bg-surface-3 font-display text-gold">
              {me.data.user?.displayName.slice(0, 1).toUpperCase()}
            </span>
            <div className="min-w-0">
              <p className="text-xs text-fg-subtle">Autorizando como</p>
              <p className="truncate text-sm font-semibold">{me.data.user?.displayName}</p>
            </div>
          </div>
          {campaigns.length === 1 ? (
            <div className="rounded-md border border-line-soft px-3 py-2">
              <p className="text-xs text-fg-subtle">Campanha elegível</p>
              <p className="font-semibold">{campaigns[0]?.name}</p>
              <p className="text-sm text-fg-muted">{campaigns[0]?.description || "Campanha escolhida para este vínculo."}</p>
            </div>
          ) : (
            <Field label="Campanha de destino">
              {({ id }) => (
                <Select id={id} value={campaignId} onChange={(event) => setSelectedCampaignId(event.target.value)}>
                  {campaigns.map((campaign) => <option value={campaign.id} key={campaign.id}>{campaign.name}</option>)}
                </Select>
              )}
            </Field>
          )}
          <Button variant="accent" className="w-full" disabled={!campaignId || approval.isPending} onClick={() => approval.mutate()}>
            {approval.isPending ? "Autorizando conexão…" : "Autorizar e conectar"}
          </Button>
          {approval.isError ? <Notice tone="danger" role="alert">{errorMessage(approval.error)}</Notice> : null}
          <p className="text-xs text-fg-subtle">O código é de uso único. A campanha nunca é escolhida pelo Foundry.</p>
        </Card>
      </div>
    </PairingFrame>
  );
}

function PairingFrame({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <div className="mx-auto w-full max-w-6xl space-y-8 px-4 py-10 sm:px-6 sm:py-14">
      <p className="text-xs font-bold tracking-[0.14em] text-fg-subtle uppercase">Autorização do Foundry VTT</p>
      <motion.div variants={riseIn} initial="hidden" animate="visible">
        {children}
      </motion.div>
    </div>
  );
}

function PairingState({
  eyebrow,
  title,
  text,
  loading = false,
  tone = "neutral",
  children,
}: Readonly<{
  eyebrow: string;
  title: string;
  text: string;
  loading?: boolean;
  tone?: "neutral" | "success" | "error";
  children?: ReactNode;
}>) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    headingRef.current?.focus();
  }, [title]);
  return (
    <PairingFrame>
      <Card padding="lg" className="mx-auto max-w-xl space-y-4 text-center" aria-busy={loading || undefined}>
        <span
          aria-hidden="true"
          className={cn(
            "mx-auto inline-flex size-12 items-center justify-center rounded-full border font-display text-xl",
            tone === "success" && "border-success bg-success-soft text-success",
            tone === "error" && "border-danger bg-danger-soft text-danger",
            tone === "neutral" && "border-line bg-surface-3 text-gold",
          )}
        >
          {tone === "success" ? "✓" : tone === "error" ? "!" : "◇"}
        </span>
        <Eyebrow>{eyebrow}</Eyebrow>
        <h1 tabIndex={-1} ref={headingRef} className="font-display text-3xl leading-tight text-balance outline-none">
          {title}
        </h1>
        <p className="text-fg-muted">{text}</p>
        {loading ? (
          <div className="space-y-2 pt-2" role="status">
            <span className="sr-only">Carregando</span>
            <Skeleton className="mx-auto h-2 w-2/3" />
            <Skeleton className="mx-auto h-2 w-1/2" />
          </div>
        ) : null}
        {children ? <div className="flex flex-wrap items-center justify-center gap-3 pt-2">{children}</div> : null}
      </Card>
    </PairingFrame>
  );
}

function CodeBadge({ code }: Readonly<{ code: string }>) {
  return (
    <code
      className="inline-flex min-h-11 items-center rounded-md border border-accent-line bg-accent-soft px-3 font-mono text-sm tracking-widest text-accent"
      aria-label={`Código de conexão ${code}`}
    >
      {code}
    </code>
  );
}

function normalizeCode(value: string): string {
  const compact = value.trim().toUpperCase().replace(/[\s-]+/gu, "");
  if (/^LUME[A-Z0-9]{0,8}$/u.test(compact)) {
    const firstGroup = compact.slice(4, 8);
    const secondGroup = compact.slice(8, 12);
    return ["LUME", firstGroup, secondGroup].filter(Boolean).join("-");
  }
  return value.trim().toUpperCase().replace(/\s+/gu, "");
}

function isCompleteCode(value: string): boolean {
  return /^LUME-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/u.test(value);
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo",
  }).format(new Date(value));
}

function pairingStatusCopy(status: FoundryPortalPairingView["pairing"]["status"]) {
  if (status === "expired") {
    return { eyebrow: "Código expirado", title: "Esta solicitação perdeu a validade", text: "Por segurança, códigos de conexão expiram após dez minutos." };
  }
  if (status === "cancelled") {
    return { eyebrow: "Solicitação cancelada", title: "O pareamento foi interrompido no Foundry", text: "Nenhuma campanha foi vinculada por esta solicitação." };
  }
  return { eyebrow: "Código já utilizado", title: "Este mundo já foi autorizado", text: "O mesmo código não pode conectar o mundo novamente." };
}
