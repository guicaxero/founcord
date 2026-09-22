"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  CurrentUserResponse,
  FoundryPairingApprovalResponse,
  FoundryPortalPairingView,
} from "@ordem/contracts";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { ApiClientError, apiFetch, errorMessage } from "@/lib/api-client";
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
        <button className="admin-primary" type="button" onClick={() => me.refetch()}>
          Tentar novamente
        </button>
        <Link className="secondary-action" href="/">Voltar ao portal</Link>
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
        <a className="admin-primary" href={`/api/auth/discord?returnTo=${encodeURIComponent(returnTo)}`}>
          Entrar com Discord
        </a>
        <Link className="secondary-action" href="/">Voltar ao portal</Link>
      </PairingState>
    );
  }

  if (!isCompleteCode(activeCode)) {
    return (
      <main className="pairing-shell" id="main-content">
        <PairingHeader />
        <section className="pairing-card pairing-code-entry" aria-labelledby="pairing-code-title">
          <span className="admin-eyebrow">Código de conexão</span>
          <h1 id="pairing-code-title">Informe o código exibido no Foundry</h1>
          <p>O código começa com “LUME” e expira dez minutos após ser criado.</p>
          <form onSubmit={submitCode}>
            <label htmlFor="foundry-code">Código temporário</label>
            <input
              id="foundry-code"
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
            />
            {codeError ? <p className="inline-error" id="foundry-code-error" role="alert">{codeError}</p> : null}
            <button className="admin-primary" type="submit">Localizar solicitação</button>
          </form>
        </section>
      </main>
    );
  }

  if (pairing.isLoading) {
    return <PairingState eyebrow="Código reconhecido" title="Buscando os dados do mundo" text="Estamos conferindo a solicitação e suas campanhas elegíveis." loading />;
  }

  if (pairing.isError) {
    const denied = pairing.error instanceof ApiClientError && pairing.error.status === 403;
    return (
      <PairingState
        eyebrow={denied ? "Permissão insuficiente" : "Solicitação indisponível"}
        title={denied ? "Sua conta não pode conectar este mundo" : "Não foi possível abrir esta solicitação"}
        text={errorMessage(pairing.error)}
      >
        <CodeBadge code={activeCode} />
        {!denied ? <button className="admin-primary" type="button" onClick={() => pairing.refetch()}>Tentar novamente</button> : null}
        <button className="secondary-action" type="button" onClick={() => {
          approval.reset();
          setSelectedCampaignId("");
          setActiveCode("");
          setCodeInput("");
        }}>
          Informar outro código
        </button>
      </PairingState>
    );
  }

  if (!pairing.data) return null;
  const request = pairing.data.pairing;

  if (approval.isSuccess) {
    return (
      <PairingState
        eyebrow="Autorização concluída"
        title="Mundo autorizado com sucesso"
        text={`“${request.worldTitle}” foi associado a “${approval.data.campaignName}”. Volte ao Foundry: a conexão será concluída automaticamente.`}
        success
      >
        <Link className="admin-primary" href="/dashboard">Ver mundos conectados</Link>
        <Link className="secondary-action" href="/">Voltar ao portal</Link>
      </PairingState>
    );
  }

  if (request.status !== "pending") {
    const messages = pairingStatusCopy(request.status);
    return (
      <PairingState eyebrow={messages.eyebrow} title={messages.title} text={messages.text}>
        <CodeBadge code={request.userCode} />
        <p className="permission-note">Volte ao módulo no Foundry para gerar uma nova solicitação.</p>
        <Link className="secondary-action" href="/">Voltar ao portal</Link>
      </PairingState>
    );
  }

  return (
    <main className="pairing-shell" id="main-content">
      <PairingHeader />
      <div className="pairing-layout">
        <section className="pairing-card pairing-world-card" aria-labelledby="pairing-world-title">
          <div className="pairing-card-heading">
            <div>
              <span className="admin-eyebrow">Solicitação encontrada</span>
              <h1 id="pairing-world-title" tabIndex={-1} ref={worldHeadingRef}>{request.worldTitle}</h1>
              <p>Confira a origem antes de autorizar o vínculo.</p>
            </div>
            <CodeBadge code={request.userCode} />
          </div>
          <dl className="pairing-world-details">
            <div><dt>Sistema</dt><dd>Shadow of the Demon Lord</dd></div>
            <div><dt>Foundry VTT</dt><dd>Versão {request.foundryVersion}</dd></div>
            <div><dt>Sistema instalado</dt><dd>Versão {request.systemVersion}</dd></div>
            <div><dt>Módulo da Ordem</dt><dd>Versão {request.moduleVersion}</dd></div>
            <div><dt>Solicitação válida até</dt><dd>{formatDate(request.expiresAt)}</dd></div>
          </dl>
          <div className="pairing-data-note">
            <strong>O que será sincronizado</strong>
            <p>Presença do mundo e projeções sanitizadas dos personagens: nome, nível, ancestralidade, caminhos e recursos mecânicos mínimos.</p>
            <p>Notas do mestre, descrições, inventário e conteúdo de livros não são enviados.</p>
          </div>
        </section>

        <section className="pairing-card pairing-authorization-card" aria-labelledby="pairing-authorize-title">
          <span className="admin-eyebrow">Destino autorizado</span>
          <h2 id="pairing-authorize-title">Escolha a campanha</h2>
          <p>A conexão ficará limitada à campanha selecionada e poderá ser revogada depois.</p>
          <div className="pairing-account">
            <span aria-hidden="true">{me.data.user?.displayName.slice(0, 1).toUpperCase()}</span>
            <div><small>Autorizando como</small><strong>{me.data.user?.displayName}</strong></div>
          </div>
          {campaigns.length === 1 ? (
            <div className="pairing-fixed-campaign">
              <small>Campanha elegível</small>
              <strong>{campaigns[0]?.name}</strong>
              <p>{campaigns[0]?.description || "Campanha selecionada para este vínculo."}</p>
            </div>
          ) : (
            <label className="pairing-campaign-field" htmlFor="pairing-campaign">
              Campanha de destino
              <select id="pairing-campaign" value={campaignId} onChange={(event) => setSelectedCampaignId(event.target.value)}>
                {campaigns.map((campaign) => <option value={campaign.id} key={campaign.id}>{campaign.name}</option>)}
              </select>
            </label>
          )}
          <button className="admin-primary full" type="button" disabled={!campaignId || approval.isPending} onClick={() => approval.mutate()}>
            {approval.isPending ? "Autorizando conexão…" : "Autorizar e conectar"}
          </button>
          {approval.isError ? <p className="inline-error" role="alert">{errorMessage(approval.error)}</p> : null}
          <p className="pairing-security-note">O código é de uso único. A campanha nunca é escolhida pelo Foundry.</p>
        </section>
      </div>
    </main>
  );
}

function PairingHeader() {
  return (
    <header className="pairing-header">
      <Link className="admin-brand" href="/">
        <span className="admin-brand-mark" aria-hidden="true">O</span>
        <span><small>Ordem da</small><strong>Última Luz</strong></span>
      </Link>
      <span>Autorização do Foundry VTT</span>
    </header>
  );
}

function PairingState({
  eyebrow,
  title,
  text,
  loading = false,
  success = false,
  children,
}: Readonly<{
  eyebrow: string;
  title: string;
  text: string;
  loading?: boolean;
  success?: boolean;
  children?: React.ReactNode;
}>) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    headingRef.current?.focus();
  }, [title]);
  return (
    <main className="dashboard-state pairing-state" id="main-content">
      <div className="dashboard-state-card">
        <span className={`dashboard-state-mark${success ? " is-success" : ""}`} aria-hidden="true">{success ? "✓" : "O"}</span>
        <span className="admin-eyebrow">{eyebrow}</span>
        <h1 tabIndex={-1} ref={headingRef}>{title}</h1>
        <p>{text}</p>
        {loading ? <span className="loading-line" aria-hidden="true" /> : null}
        {children ? <div className="dashboard-state-actions">{children}</div> : null}
      </div>
    </main>
  );
}

function CodeBadge({ code }: Readonly<{ code: string }>) {
  return <code className="pairing-code" aria-label={`Código de conexão ${code}`}>{code}</code>;
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
