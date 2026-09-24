import { cva, type VariantProps } from "class-variance-authority";
import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * Ação do portal. `primary` é a ação principal de uma tela, `accent` carrega a
 * brasa da campanha e fica reservada a chamadas de destaque, `danger` só é usada
 * em ações destrutivas já confirmadas. A altura mínima de 44 px vale para todas.
 */
const button = cva(
  [
    "inline-flex items-center justify-center gap-2 whitespace-nowrap",
    "min-h-11 rounded-md px-4 text-sm font-semibold",
    "transition-[background-color,border-color,color,box-shadow,transform] duration-150",
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
    "disabled:pointer-events-none disabled:opacity-55",
    "active:translate-y-px motion-reduce:active:translate-y-0",
  ],
  {
    variants: {
      variant: {
        primary: "bg-fg text-fg-inverse shadow-sm hover:bg-white",
        accent: "bg-accent text-fg shadow-sm hover:bg-accent-strong",
        secondary:
          "border border-line bg-surface text-fg hover:border-line-strong hover:bg-surface-3",
        ghost: "text-fg-muted hover:bg-surface-3 hover:text-fg",
        danger:
          "border border-danger bg-danger-soft text-danger hover:bg-danger hover:text-fg-inverse",
        link: "min-h-0 px-0 text-accent underline-offset-4 hover:underline",
      },
      size: {
        sm: "min-h-9 px-3 text-xs",
        md: "",
        lg: "min-h-12 px-6 text-base",
        icon: "min-h-11 w-11 px-0",
      },
    },
    defaultVariants: { variant: "secondary", size: "md" },
  },
);

export type ButtonVariants = VariantProps<typeof button>;

export function Button({
  className,
  variant,
  size,
  type = "button",
  ...props
}: ComponentProps<"button"> & ButtonVariants) {
  return <button className={cn(button({ variant, size }), className)} type={type} {...props} />;
}

/** Mesma aparência da ação, para navegação entre rotas. */
export function ButtonLink({
  className,
  variant,
  size,
  children,
  ...props
}: ComponentProps<typeof Link> & ButtonVariants & { children: ReactNode }) {
  return (
    <Link className={cn(button({ variant, size }), className)} {...props}>
      {children}
    </Link>
  );
}

/** Ação que sai do App Router, como o início do OAuth do Discord. */
export function ButtonAnchor({
  className,
  variant,
  size,
  children,
  ...props
}: ComponentProps<"a"> & ButtonVariants & { children: ReactNode }) {
  return (
    <a className={cn(button({ variant, size }), className)} {...props}>
      {children}
    </a>
  );
}
