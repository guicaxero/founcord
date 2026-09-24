import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/cn";

const card = cva("rounded-lg border border-line-soft bg-surface shadow-sm", {
  variants: {
    padding: { none: "p-0", sm: "p-4", md: "p-6", lg: "p-8" },
    interactive: {
      true: "transition-colors duration-150 hover:border-line-strong hover:bg-surface-2",
      false: "",
    },
  },
  defaultVariants: { padding: "md", interactive: false },
});

export function Card({
  className,
  padding,
  interactive,
  ...props
}: ComponentProps<"div"> & VariantProps<typeof card>) {
  return <div className={cn(card({ padding, interactive }), className)} {...props} />;
}

const badge = cva(
  "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold",
  {
    variants: {
      tone: {
        neutral: "border-line bg-surface-2 text-fg-muted",
        accent: "border-accent-line bg-accent-soft text-accent",
        success: "border-success bg-success-soft text-success",
        warning: "border-warning bg-warning-soft text-warning",
        danger: "border-danger bg-danger-soft text-danger",
        info: "border-info bg-info-soft text-info",
      },
    },
    defaultVariants: { tone: "neutral" },
  },
);

/** Estado sempre textual: a cor reforça, mas nunca carrega o significado sozinha. */
export function Badge({
  className,
  tone,
  ...props
}: ComponentProps<"span"> & VariantProps<typeof badge>) {
  return <span className={cn(badge({ tone }), className)} {...props} />;
}

/** Rótulo curto acima de um título de seção. */
export function Eyebrow({ className, ...props }: ComponentProps<"p">) {
  return (
    <p
      className={cn("m-0 text-xs font-extrabold tracking-[0.14em] text-accent uppercase", className)}
      {...props}
    />
  );
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  className,
}: Readonly<{
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
}>) {
  return (
    <header className={cn("flex flex-wrap items-end justify-between gap-6", className)}>
      <div className="min-w-0 max-w-[68ch] space-y-2">
        {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
        <h1 className="m-0 font-display text-4xl leading-tight text-balance sm:text-5xl">
          {title}
        </h1>
        {description ? <p className="m-0 text-fg-muted text-pretty">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-3">{actions}</div> : null}
    </header>
  );
}

/** Bloco que ocupa o espaço do conteúdo enquanto ele carrega. */
export function Skeleton({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={cn("animate-pulse rounded-md bg-surface-3 motion-reduce:animate-none", className)}
      {...props}
    />
  );
}
