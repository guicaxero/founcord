import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

type FeedbackTone = "neutral" | "error" | "success";

const toneClass: Readonly<Record<FeedbackTone, string>> = {
  neutral: "border-line-soft bg-surface",
  error: "border-danger/60 bg-danger-soft",
  success: "border-success/60 bg-success-soft",
};

/**
 * Estado vazio, de erro ou de sucesso: diz o que aconteceu e, quando houver,
 * qual é o próximo passo.
 */
export function FeedbackState({
  title,
  children,
  action,
  tone = "neutral",
  role,
}: Readonly<{
  title: string;
  children: ReactNode;
  action?: ReactNode | undefined;
  tone?: FeedbackTone | undefined;
  role?: "alert" | "status" | undefined;
}>) {
  return (
    <div
      className={cn("flex flex-col items-start gap-2 rounded-lg border px-5 py-6", toneClass[tone])}
      role={role}
    >
      <strong className={cn("font-display text-lg", tone === "error" ? "text-danger" : "text-fg")}>
        {title}
      </strong>
      <p className="max-w-[60ch] text-sm text-fg-muted">{children}</p>
      {action ? <div className="mt-2 flex flex-wrap gap-2">{action}</div> : null}
    </div>
  );
}
