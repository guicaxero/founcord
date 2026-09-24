import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

/** Largura de leitura e respiro padrão de todas as telas. */
export function PageContainer({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={cn("mx-auto w-full max-w-7xl space-y-12 px-4 py-10 sm:px-6 sm:py-14", className)}
      {...props}
    />
  );
}

/** Bloco de conteúdo com título próprio dentro de uma tela. */
export function Section({
  title,
  eyebrow,
  description,
  action,
  children,
  className,
  id,
}: Readonly<{
  title: string;
  eyebrow?: string;
  description?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  id?: string;
}>) {
  const headingId = `${id ?? title.toLowerCase().replace(/\s+/g, "-")}-title`;
  return (
    <section aria-labelledby={headingId} className={cn("space-y-6", className)} id={id}>
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0 space-y-1">
          {eyebrow ? (
            <p className="text-xs font-extrabold tracking-[0.14em] text-accent uppercase">
              {eyebrow}
            </p>
          ) : null}
          <h2 className="font-display text-2xl leading-tight sm:text-3xl" id={headingId}>
            {title}
          </h2>
          {description ? <p className="max-w-[68ch] text-fg-muted">{description}</p> : null}
        </div>
        {action}
      </header>
      {children}
    </section>
  );
}
