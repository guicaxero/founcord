"use client";

import { MEDIA_MAX_BYTES, MEDIA_CONTENT_TYPES, mediaUrl, type MediaAsset } from "@ordem/contracts";
import { useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";
import { apiFetch, errorMessage } from "@/lib/api-client";
import { cn } from "@/lib/cn";

/**
 * Escolhe e envia imagens ao portal. Com `max` 1, é a capa; com mais, uma
 * galeria em ordem de envio. O valor são os ids das imagens já enviadas.
 */
export function ImagePicker({
  campaignId,
  label,
  hint,
  value,
  onChange,
  max = 1,
  onBusyChange,
}: Readonly<{
  campaignId: string;
  label: string;
  hint?: string | undefined;
  value: readonly string[];
  onChange: (ids: string[]) => void;
  max?: number | undefined;
  onBusyChange?: ((busy: boolean) => void) | undefined;
}>) {
  const inputRef = useRef<HTMLInputElement>(null);
  const labelId = useId();
  const hintId = useId();
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const single = max === 1;
  const room = max - value.length;

  async function upload(files: readonly File[]) {
    setError(null);
    const chosen = single ? files.slice(0, 1) : files.slice(0, room);
    const tooBig = chosen.find((file) => file.size > MEDIA_MAX_BYTES);
    if (tooBig) {
      setError(`"${tooBig.name}" passa de 8 MB. Reduza o tamanho e envie de novo.`);
      return;
    }
    onBusyChange?.(true);
    const uploaded: string[] = [];
    try {
      for (const [index, file] of chosen.entries()) {
        setProgress(chosen.length > 1 ? `Enviando ${index + 1} de ${chosen.length}…` : "Enviando…");
        const form = new FormData();
        form.set("file", file);
        const asset = await apiFetch<MediaAsset>(`/api/campaigns/${campaignId}/media`, { method: "POST", body: form });
        uploaded.push(asset.id);
      }
      if (files.length > chosen.length && !single) {
        setError(`Só cabem ${max} imagens; ${files.length - chosen.length} ficaram de fora.`);
      }
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      if (uploaded.length > 0) onChange(single ? uploaded.slice(0, 1) : [...value, ...uploaded]);
      setProgress(null);
      onBusyChange?.(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="space-y-3" role="group" aria-labelledby={labelId} aria-describedby={hint ? hintId : undefined}>
      <div className="space-y-1">
        <p id={labelId} className="text-sm font-semibold text-fg-muted">
          {label} <span className="font-normal text-fg-subtle">(opcional)</span>
        </p>
        {hint ? (
          <p id={hintId} className="text-xs text-fg-subtle">
            {hint}
          </p>
        ) : null}
      </div>
      {value.length > 0 ? (
        <ul className={cn("grid list-none gap-3 p-0", single ? "grid-cols-1" : "grid-cols-2 sm:grid-cols-4")}>
          {value.map((id, index) => (
            <li key={id} className="space-y-2">
              {/* Imagens do próprio portal, já no tamanho enviado: next/image não se aplica. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={mediaUrl(id)}
                alt={single ? "Capa escolhida" : `Imagem ${index + 1}`}
                className={cn(
                  "w-full rounded-md border border-line-soft bg-surface-2 object-cover",
                  single ? "aspect-[16/9]" : "aspect-square",
                )}
              />
              <Button
                size="sm"
                variant="ghost"
                className="w-full"
                aria-label={single ? "Remover a capa" : `Remover a imagem ${index + 1}`}
                onClick={() => onChange(value.filter((other) => other !== id))}
              >
                Remover
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
      <input
        ref={inputRef}
        type="file"
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        accept={MEDIA_CONTENT_TYPES.join(",")}
        multiple={!single}
        onChange={(event) => void upload([...(event.target.files ?? [])])}
      />
      <div className="flex flex-wrap items-center gap-3">
        <Button
          size="sm"
          disabled={Boolean(progress) || (!single && room <= 0)}
          onClick={() => inputRef.current?.click()}
        >
          {single ? (value.length > 0 ? "Trocar a capa" : "Escolher a capa") : "Adicionar imagens"}
        </Button>
        <span className="text-xs text-fg-subtle" aria-live="polite">
          {progress ?? (single ? "WebP, PNG, JPEG ou GIF, até 8 MB." : `${value.length} de ${max} · WebP, PNG, JPEG ou GIF, até 8 MB cada.`)}
        </span>
      </div>
      {error ? (
        <Notice tone="danger" role="alert">
          {error}
        </Notice>
      ) : null}
    </div>
  );
}
