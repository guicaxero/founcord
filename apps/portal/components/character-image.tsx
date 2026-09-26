"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { cn } from "@/lib/cn";

type View = "portrait" | "token";

const labels: Readonly<Record<View, string>> = { portrait: "Retrato", token: "Token" };

/**
 * Retrato e token do personagem vindos do Foundry. Com as duas imagens, a
 * pessoa escolhe qual ver; com uma só, ela aparece sem alternância; sem
 * nenhuma, fica a inicial do nome. Clicar na imagem abre a versão ampliada.
 */
export function CharacterImage({
  name,
  portraitUrl,
  tokenUrl,
  size = "md",
  className,
}: Readonly<{
  name: string;
  portraitUrl: string | null;
  tokenUrl: string | null;
  size?: "sm" | "md" | undefined;
  className?: string | undefined;
}>) {
  const available = (["portrait", "token"] as const).filter((view) =>
    view === "portrait" ? Boolean(portraitUrl) : Boolean(tokenUrl),
  );
  const [chosen, setChosen] = useState<View>(available[0] ?? "portrait");
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const view = available.includes(chosen) ? chosen : available[0];
  const src = view === "portrait" ? portraitUrl : view === "token" ? tokenUrl : null;
  const box = size === "sm" ? "size-16" : "size-28";

  if (!view || !src) {
    return (
      <span
        aria-hidden="true"
        className={cn(
          "grid shrink-0 place-items-center rounded-xl border border-accent-line bg-accent-soft font-display text-accent",
          size === "sm" ? "size-16 text-2xl" : "size-28 text-4xl",
          className,
        )}
      >
        {name.slice(0, 1).toUpperCase()}
      </span>
    );
  }

  return (
    <div className={cn("flex shrink-0 flex-col items-center gap-2", className)}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          "group relative overflow-hidden rounded-xl border border-line bg-surface-sunken transition-colors hover:border-line-strong",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
          box,
        )}
        aria-label={`Ampliar ${labels[view].toLowerCase()} de ${name}`}
      >
        {/* Miniatura em data URL gerada pelo módulo do Foundry; next/image não se aplica. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt=""
          className={cn("size-full", view === "portrait" ? "object-cover" : "object-contain p-1.5")}
        />
      </button>
      {available.length > 1 ? (
        <div className="flex rounded-md border border-line-soft bg-surface p-0.5" role="group" aria-label={`Imagem de ${name}`}>
          {available.map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={view === option}
              onClick={() => setChosen(option)}
              className={cn(
                "min-h-8 rounded px-2.5 text-xs font-semibold transition-colors",
                "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus",
                view === option ? "bg-surface-3 text-fg" : "text-fg-subtle hover:text-fg",
              )}
            >
              {labels[option]}
            </button>
          ))}
        </div>
      ) : (
        <span className="text-xs text-fg-subtle">{labels[view]}</span>
      )}

      <Dialog
        open={open}
        onOpenChange={setOpen}
        title={name}
        description={`${labels[view]} sincronizado do Foundry.`}
        returnFocusRef={triggerRef}
        className="max-w-md"
      >
        <div className="space-y-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={src}
            alt={`${labels[view]} de ${name}`}
            className={cn(
              "mx-auto aspect-square w-full max-w-72 rounded-xl border border-line bg-surface-sunken",
              view === "portrait" ? "object-cover" : "object-contain p-4",
            )}
          />
          {available.length > 1 ? (
            <div className="flex justify-center gap-2" role="group" aria-label={`Imagem de ${name}`}>
              {available.map((option) => (
                <Button
                  key={option}
                  size="sm"
                  variant={view === option ? "primary" : "secondary"}
                  aria-pressed={view === option}
                  onClick={() => setChosen(option)}
                >
                  {labels[option]}
                </Button>
              ))}
            </div>
          ) : null}
        </div>
      </Dialog>
    </div>
  );
}
