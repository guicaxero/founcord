import type { ReactNode } from "react";

type FeedbackTone = "neutral" | "error" | "success";

export function FeedbackState({
  title,
  children,
  action,
  tone = "neutral",
  role,
}: Readonly<{
  title: string;
  children: ReactNode;
  action?: ReactNode;
  tone?: FeedbackTone;
  role?: "alert" | "status";
}>) {
  return (
    <div className={`feedback-state feedback-state-${tone}`} role={role}>
      <strong>{title}</strong>
      <span>{children}</span>
      {action ? <div className="feedback-state-action">{action}</div> : null}
    </div>
  );
}
