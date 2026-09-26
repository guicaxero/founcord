"use client";

import { useState } from "react";
import { cn } from "@/lib/cn";

/**
 * Foto do Discord da pessoa. Sem foto, ou se a imagem falhar, mostra a
 * inicial do nome. É decorativa: o nome sempre aparece ao lado.
 */
export function Avatar({
  name,
  src,
  className,
}: Readonly<{ name: string; src: string | null | undefined; className?: string | undefined }>) {
  const [failed, setFailed] = useState(false);
  const base = cn("inline-flex shrink-0 overflow-hidden rounded-full", className);

  if (src && !failed) {
    return (
      // Imagem da CDN do Discord, com tamanho fixo; next/image não compensa aqui.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt=""
        aria-hidden="true"
        className={cn(base, "border border-line bg-surface-3 object-cover")}
        referrerPolicy="no-referrer"
        loading="lazy"
        decoding="async"
        onError={() => setFailed(true)}
      />
    );
  }

  return (
    <span
      aria-hidden="true"
      className={cn(base, "items-center justify-center border border-line bg-surface-3 font-display text-gold")}
    >
      {name.slice(0, 1).toUpperCase()}
    </span>
  );
}
