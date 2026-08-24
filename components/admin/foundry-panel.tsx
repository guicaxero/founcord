"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { FoundryWorldListResponse, FoundryWorldStatus } from "@vigilia/contracts";
import { useEffect, useRef, useState } from "react";
import { apiFetch, errorMessage } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";

export function FoundryPanel({
  campaignId,
  campaignName,
}: Readonly<{ campaignId: string; campaignName: string }>) {
  const queryClient = useQueryClient();
  const instructionsRef = useRef<HTMLDetailsElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const disconnectErrorRef = useRef<HTMLParagraphElement>(null);
  const [disconnectTarget, setDisconnectTarget] = useState<FoundryWorldStatus | null>(null);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const worlds = useQuery({
    queryKey: queryKeys.foundryWorlds(campaignId),
    queryFn: () =>
      apiFetch<FoundryWorldListResponse>(
        `/api/campaigns/${campaignId}/foundry/worlds`,
      ),
    refetchInterval: 30_000,
  });
  const sync = useMutation({
    mutationFn: (worldId: string) =>
      apiFetch<{ commandId: string }>(
        `/api/campaigns/${campaignId}/foundry/worlds/${worldId}/sync`,
        { method: "POST" },
      ),
    onSuccess: async (_result, worldId) => {
      const worldName = worlds.data?.data.find((world) => world.worldId === worldId)?.worldTitle;
      setSyncMessage(
        `Sincronização de “${worldName ?? "mundo selecionado"}” solicitada. O Foundry executará o comando quando estiver online.`,
      );
      await queryClient.invalidateQueries({ queryKey: queryKeys.audit(campaignId) });
    },
  });
  const disconnect = useMutation({
    mutationFn: (worldId: string) =>
      apiFetch(`/api/campaigns/${campaignId}/foundry/worlds/${worldId}`, {
        method: "DELETE",
      }),
    onSuccess: async () => {
      setDisconnectTarget(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.foundryWorlds(campaignId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.audit(campaignId) }),
      ]);
    },
    onError: () => {
      window.requestAnimationFrame(() => disconnectErrorRef.current?.focus());
    },
  });

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (disconnectTarget && !dialog.open) dialog.showModal();
    if (!disconnectTarget && dialog.open) dialog.close();
  }, [disconnectTarget]);

  const data = worlds.data?.data ?? [];
  const connected = data.filter((world) => world.status !== "revoked");
  const online = connected.filter((world) => world.status === "online");
  const attention = connected.filter((world) => world.status === "offline");

  function revealInstructions() {
    if (instructionsRef.current) {
      instructionsRef.current.open = true;
      instructionsRef.current.scrollIntoView({ behavior: "auto", block: "center" });
      instructionsRef.current.querySelector("summary")?.focus();
    }
  }

  return (
    <div className="foundry-panel">
      <section className="foundry-overview" aria-labelledby="foundry-overview-title">
        <div>
          <span className="admin-eyebrow">Escopo atual</span>
          <h2 id="foundry-overview-title">{campaignName}</h2>
          <p>
            Autorize mundos pelo módulo da Ordem e acompanhe presença, personagens e
            compatibilidade sem expor seu Foundry à internet.
          </p>
        </div>
        <button className="admin-primary" type="button" onClick={revealInstructions}>
          Conectar novo mundo
        </button>
      </section>

      <section className="foundry-metrics" aria-label="Resumo das conexões">
        <article><strong>{connected.length}</strong><span>Conectados</span></article>
        <article><strong>{online.length}</strong><span>Online agora</span></article>
        <article><strong>{attention.length}</strong><span>Exigem atenção</span></article>
      </section>

      <details className="foundry-instructions admin-card" ref={instructionsRef}>
        <summary>Como conectar um mundo</summary>
        <div className="foundry-instruction-body">
          <ol>
            <li><span>1</span><div><strong>Abra o mundo no Foundry</strong><p>Ative o módulo Ordem da Última Luz e entre como mestre.</p></div></li>
            <li><span>2</span><div><strong>Inicie a conexão</strong><p>Em Configurações, abra a tela do módulo e selecione “Conectar este mundo”.</p></div></li>
            <li><span>3</span><div><strong>Autorize no portal</strong><p>O módulo abrirá uma solicitação com os dados do mundo. Escolha esta campanha e confirme.</p></div></li>
          </ol>
          <p className="permission-note">
            O fluxo não solicita secrets, IDs de campanha nem comandos no console. O código
            temporário expira em dez minutos e só pode autorizar uma conexão.
          </p>
        </div>
      </details>

      {syncMessage ? <p className="inline-success" role="status">{syncMessage}</p> : null}
      {sync.isError ? <p className="inline-error" role="alert">{errorMessage(sync.error)}</p> : null}

      {worlds.isLoading ? (
        <div className="foundry-world-grid" aria-label="Carregando mundos">
          <span className="foundry-world-skeleton" />
          <span className="foundry-world-skeleton" />
        </div>
      ) : null}

      {worlds.isError ? (
        <section className="admin-card foundry-query-state" role="alert">
          <span className="admin-eyebrow">Conexão indisponível</span>
          <h2>Não foi possível carregar os mundos</h2>
          <p>{errorMessage(worlds.error)}</p>
          <button className="secondary-action" type="button" onClick={() => worlds.refetch()}>
            Tentar novamente
          </button>
        </section>
      ) : null}

      {!worlds.isLoading && !worlds.isError && data.length === 0 ? (
        <section className="admin-card foundry-query-state">
          <span className="foundry-empty-mark" aria-hidden="true">◇</span>
          <h2>Nenhum mundo conectado</h2>
          <p>
            Quando um mestre iniciar a conexão pelo módulo da Ordem no Foundry, o mundo
            aparecerá aqui.
          </p>
          <button className="secondary-action" type="button" onClick={revealInstructions}>
            Ver instruções de conexão
          </button>
        </section>
      ) : null}

      {data.length > 0 ? (
        <section aria-labelledby="foundry-world-list-title">
          <div className="admin-section-title foundry-list-heading">
            <div>
              <span>Vínculos registrados</span>
              <h2 id="foundry-world-list-title">Mundos da campanha</h2>
              <p>O estado é atualizado automaticamente a cada trinta segundos.</p>
            </div>
            <button className="secondary-action" type="button" onClick={() => worlds.refetch()} disabled={worlds.isFetching}>
              {worlds.isFetching ? "Atualizando…" : "Atualizar estados"}
            </button>
          </div>
          <div className="foundry-world-grid">
            {data.map((world) => (
              <WorldCard
                key={world.worldId}
                world={world}
                syncing={sync.isPending && sync.variables === world.worldId}
                syncDisabled={sync.isPending}
                onSync={() => {
                  setSyncMessage(null);
                  sync.mutate(world.worldId);
                }}
                onDisconnect={() => {
                  disconnect.reset();
                  setDisconnectTarget(world);
                }}
              />
            ))}
          </div>
        </section>
      ) : null}

      <dialog
        className="destructive-dialog"
        ref={dialogRef}
        aria-labelledby="disconnect-world-title"
        onCancel={(event) => {
          event.preventDefault();
          if (!disconnect.isPending) {
            disconnect.reset();
            setDisconnectTarget(null);
          }
        }}
        onClose={() => {
          disconnect.reset();
          setDisconnectTarget(null);
        }}
      >
        <div className="destructive-dialog-card">
          <span className="dialog-kicker">INTERROMPER INTEGRAÇÃO</span>
          <h2 id="disconnect-world-title">Desconectar “{disconnectTarget?.worldTitle}”?</h2>
          <p>
            O portal deixará de receber presença, personagens e comandos deste mundo em
            “{campaignName}”. Nenhum personagem será apagado no Foundry.
          </p>
          {disconnect.isError ? (
            <p className="inline-error" role="alert" tabIndex={-1} ref={disconnectErrorRef}>
              {errorMessage(disconnect.error)} Você pode tentar novamente ou manter a conexão.
            </p>
          ) : null}
          <div className="dialog-actions">
            <button type="button" disabled={disconnect.isPending} onClick={() => {
              disconnect.reset();
              setDisconnectTarget(null);
            }}>
              Manter conexão
            </button>
            <button
              className="danger-primary"
              type="button"
              disabled={!disconnectTarget || disconnect.isPending}
              onClick={() => disconnectTarget && disconnect.mutate(disconnectTarget.worldId)}
            >
              {disconnect.isPending ? "Desconectando…" : "Desconectar mundo"}
            </button>
          </div>
        </div>
      </dialog>
    </div>
  );
}

function WorldCard({
  world,
  syncing,
  syncDisabled,
  onSync,
  onDisconnect,
}: Readonly<{
  world: FoundryWorldStatus;
  syncing: boolean;
  syncDisabled: boolean;
  onSync: () => void;
  onDisconnect: () => void;
}>) {
  return (
    <article className="foundry-world-card">
      <header>
        <div className={`foundry-status-icon is-${world.status}`} aria-hidden="true" />
        <div>
          <span className={`status-pill foundry-status is-${world.status}`}>
            {statusLabel(world.status)}
          </span>
          <h3>{world.worldTitle}</h3>
          <p>{world.status === "online" ? "Recebendo atualizações do Foundry" : statusDescription(world)}</p>
        </div>
      </header>
      <dl className="foundry-world-stats">
        <div><dt>Último contato</dt><dd>{world.lastSeenAt ? formatDate(world.lastSeenAt) : "Ainda não recebido"}</dd></div>
        <div><dt>Personagens</dt><dd>{world.actorCount}</dd></div>
        <div><dt>Usuários ativos</dt><dd>{world.activeUsers}</dd></div>
      </dl>
      <details className="foundry-technical-details">
        <summary>Detalhes técnicos</summary>
        <dl>
          <div><dt>Foundry</dt><dd>{world.foundryVersion}</dd></div>
          <div><dt>Sistema</dt><dd>{world.systemVersion}</dd></div>
          <div><dt>Módulo</dt><dd>{world.moduleVersion}</dd></div>
          <div><dt>ID do mundo</dt><dd title={world.foundryWorldId}>{world.foundryWorldId}</dd></div>
          <div><dt>Registrado</dt><dd>{formatDate(world.registeredAt)}</dd></div>
        </dl>
      </details>
      {world.status !== "revoked" ? (
        <footer>
          <button className="secondary-action" type="button" onClick={onSync} disabled={syncDisabled}>
            {syncing ? "Solicitando…" : "Sincronizar personagens"}
          </button>
          <button className="danger-secondary" type="button" onClick={onDisconnect}>
            Desconectar
          </button>
        </footer>
      ) : (
        <p className="foundry-reconnect-note">Inicie um novo pareamento no Foundry para reconectar este mundo.</p>
      )}
    </article>
  );
}

function statusLabel(status: FoundryWorldStatus["status"]): string {
  if (status === "online") return "Online";
  if (status === "offline") return "Offline";
  return "Desconectado";
}

function statusDescription(world: FoundryWorldStatus): string {
  if (world.status === "revoked") return "A credencial deste vínculo foi revogada";
  return world.lastSeenAt
    ? `Sem contato desde ${formatDate(world.lastSeenAt)}`
    : "Autorizado, aguardando o Foundry concluir a conexão";
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo",
  }).format(new Date(value));
}
