"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { CurrentUserResponse } from "@ordem/contracts";
import { useEffect, useRef, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { Card } from "@/components/ui/surface";
import { useToast } from "@/components/ui/toast";
import { apiFetch, errorMessage } from "@/lib/api-client";

/**
 * Nome no portal: como a pessoa aparece como autora de crônicas, missões e
 * registros. Vazio, vale o nome do Discord, recopiado a cada login.
 */
export function ProfileSettings({ me }: Readonly<{ me: CurrentUserResponse }>) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const errorRef = useRef<HTMLDivElement>(null);
  const discordName = me.profile?.discordName ?? me.user?.displayName ?? "";
  const save = useMutation({
    mutationFn: (portalName: string | null) =>
      apiFetch<{ portalName: string | null }>("/api/me/profile", {
        method: "PATCH",
        body: JSON.stringify({ portalName }),
      }),
    onSuccess: async (profile) => {
      toast({
        title: "Nome atualizado",
        description: profile.portalName
          ? `Você aparece como ${profile.portalName} no portal.`
          : `Você volta a aparecer com o nome do Discord, ${discordName}.`,
      });
      // O nome aparece em quase todas as listas; recarregar tudo é o mais simples.
      await queryClient.invalidateQueries();
    },
  });
  useEffect(() => {
    if (save.isError) errorRef.current?.focus();
  }, [save.isError]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = String(new FormData(event.currentTarget).get("portalName") ?? "").trim();
    save.mutate(value || null);
  }

  return (
    <Card className="max-w-2xl space-y-6">
      <div className="space-y-1">
        <h2 className="font-display text-2xl">Como você aparece no portal</h2>
        <p className="text-sm text-fg-muted">
          É o nome mostrado como autor de crônicas, missões e registros e nas listas da campanha.
        </p>
      </div>
      <form className="space-y-5" onSubmit={submit} key={me.profile?.portalName ?? ""}>
        <Field
          label="Nome no portal"
          optional
          hint={`Vazio, vale o nome do Discord: ${discordName || "—"}. Para crônicas com outro autor, use a assinatura da crônica.`}
        >
          {({ id, describedBy }) => (
            <Input
              id={id}
              name="portalName"
              maxLength={60}
              defaultValue={me.profile?.portalName ?? ""}
              placeholder="Guardião da Chama"
              aria-describedby={describedBy}
            />
          )}
        </Field>
        {save.isError ? (
          <Notice ref={errorRef} tone="danger" role="alert">
            {errorMessage(save.error)}
          </Notice>
        ) : null}
        <div className="flex justify-end border-t border-line-soft pt-4">
          <Button type="submit" variant="primary" disabled={save.isPending}>
            {save.isPending ? "Salvando…" : "Salvar nome"}
          </Button>
        </div>
      </form>
    </Card>
  );
}
