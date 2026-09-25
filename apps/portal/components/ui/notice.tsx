import { forwardRef, type ReactNode } from "react";
import { cn } from "@/lib/cn";

type NoticeTone = "info" | "success" | "warning" | "danger";

const toneClass: Readonly<Record<NoticeTone, string>> = {
  info: "border-info/50 bg-info-soft text-info",
  success: "border-success/50 bg-success-soft text-success",
  warning: "border-warning/50 bg-warning-soft text-warning",
  danger: "border-danger/50 bg-danger-soft text-danger",
};

/**
 * Mensagem junto do lugar onde algo aconteceu: erro de formulário, aviso de
 * cota, dado parcial. Resultados de ações concluídas vão para o toast.
 */
export const Notice = forwardRef<
  HTMLDivElement,
  Readonly<{
    tone?: NoticeTone | undefined;
    title?: ReactNode | undefined;
    children: ReactNode;
    action?: ReactNode | undefined;
    role?: "alert" | "status" | "note" | undefined;
    className?: string | undefined;
  }>
>(function Notice({ tone = "info", title, children, action, role, className }, ref) {
  return (
    <div
      ref={ref}
      role={role}
      tabIndex={role === "alert" ? -1 : undefined}
      className={cn(
        "flex flex-wrap items-start justify-between gap-3 rounded-md border px-4 py-3 text-sm outline-none",
        toneClass[tone],
        className,
      )}
    >
      <div className="min-w-0 flex-1 space-y-1">
        {title ? <strong className="block font-semibold">{title}</strong> : null}
        <div className="text-fg-muted">{children}</div>
      </div>
      {action ? <div className="flex shrink-0 flex-wrap gap-2">{action}</div> : null}
    </div>
  );
});
