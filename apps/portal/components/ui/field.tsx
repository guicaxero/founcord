import { useId, type ComponentProps, type ReactNode } from "react";
import { cn } from "@/lib/cn";

const control = [
  "w-full rounded-md border border-line bg-surface-sunken px-3 text-fg",
  "placeholder:text-fg-subtle transition-colors duration-150",
  "hover:border-line-strong",
  "focus-visible:border-focus focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
  "disabled:cursor-not-allowed disabled:opacity-55",
  "read-only:bg-surface-2 read-only:text-fg-muted",
  "aria-invalid:border-danger",
].join(" ");

export function Input({ className, ...props }: ComponentProps<"input">) {
  return <input className={cn(control, "min-h-11", className)} {...props} />;
}

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return <textarea className={cn(control, "min-h-24 resize-y py-2.5 leading-relaxed", className)} {...props} />;
}

export function Select({ className, children, ...props }: ComponentProps<"select">) {
  return (
    <select className={cn(control, "min-h-11 cursor-pointer pr-8", className)} {...props}>
      {children}
    </select>
  );
}

/**
 * Rótulo, controle e ajuda ligados por id. O controle recebe o id pelo
 * render prop, de modo que `htmlFor` e `aria-describedby` nunca se desencontram.
 */
export function Field({
  label,
  hint,
  optional = false,
  className,
  children,
}: Readonly<{
  label: ReactNode;
  hint?: ReactNode | undefined;
  optional?: boolean | undefined;
  className?: string | undefined;
  children: (ids: Readonly<{ id: string; describedBy: string | undefined }>) => ReactNode;
}>) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  return (
    <div className={cn("space-y-2", className)}>
      <label className="flex flex-wrap items-baseline gap-2 text-sm font-semibold text-fg" htmlFor={id}>
        {label}
        {optional ? <span className="text-xs font-normal text-fg-subtle">opcional</span> : null}
      </label>
      {children({ id, describedBy: hintId })}
      {hint ? (
        <p className="text-xs text-fg-subtle" id={hintId}>
          {hint}
        </p>
      ) : null}
    </div>
  );
}

/** Caixa de seleção com alvo de toque de 44 px. */
export function Checkbox({
  label,
  className,
  ...props
}: Omit<ComponentProps<"input">, "type"> & { label: ReactNode }) {
  return (
    <label className={cn("flex min-h-11 cursor-pointer items-center gap-3 text-sm", className)}>
      <input
        type="checkbox"
        className="size-5 shrink-0 cursor-pointer rounded accent-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        {...props}
      />
      <span>{label}</span>
    </label>
  );
}

/** Grade de formulário: uma coluna no celular, duas a partir de `sm`. */
export function FormGrid({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("grid gap-5 sm:grid-cols-2 [&>.full]:sm:col-span-2", className)} {...props} />;
}
