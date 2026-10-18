"use client";

import { useState } from "react";
import { cn } from "@/lib/cn";

/**
 * Imagem do Corvo (enviada ao portal ou retrato do Foundry). Sem imagem, ou
 * se ela falhar, mostra a inicial do nome sobre a superfície.
 */
export function RavenPortrait({
  name,
  src,
  alt = "",
  className,
}: Readonly<{ name: string; src: string | null; alt?: string; className?: string | undefined }>) {
  const [failed, setFailed] = useState(false);
  const base = cn("overflow-hidden bg-surface-3", className);
  if (src && !failed) {
    return (
      // Imagem servida pelo portal; next/image não se aplica ao armazenamento próprio.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={alt}
        loading="lazy"
        decoding="async"
        onError={() => setFailed(true)}
        className={cn(base, "object-cover object-top")}
      />
    );
  }
  return (
    <div
      aria-hidden={alt ? undefined : true}
      role={alt ? "img" : undefined}
      aria-label={alt || undefined}
      className={cn(base, "flex items-center justify-center font-display text-5xl text-fg-subtle")}
    >
      {name.slice(0, 1).toUpperCase()}
    </div>
  );
}
