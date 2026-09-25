"use client";

import * as RadixToast from "@radix-ui/react-toast";
import { AnimatePresence, motion } from "motion/react";
import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { softTransition } from "./motion";

type ToastTone = "success" | "info" | "danger";

type ToastInput = Readonly<{
  title: string;
  description?: string | undefined;
  tone?: ToastTone | undefined;
}>;

type ToastEntry = ToastInput & Readonly<{ id: number }>;

const ToastContext = createContext<((input: ToastInput) => void) | null>(null);

const toneClass: Readonly<Record<ToastTone, string>> = {
  success: "border-success/50",
  info: "border-info/50",
  danger: "border-danger/60",
};

const toneMark: Readonly<Record<ToastTone, string>> = {
  success: "bg-success",
  info: "bg-info",
  danger: "bg-danger",
};

/**
 * Resultado de uma ação concluída, anunciado por leitor de tela e visível por
 * alguns segundos. Erros de formulário continuam junto do formulário.
 */
export function ToastProvider({ children }: Readonly<{ children: ReactNode }>) {
  const [toasts, setToasts] = useState<readonly ToastEntry[]>([]);

  const push = useCallback((input: ToastInput) => {
    setToasts((current) => [...current.slice(-2), { ...input, id: Date.now() + Math.random() }]);
  }, []);

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={push}>
      <RadixToast.Provider swipeDirection="right" duration={5_000} label="Notificação">
        {children}
        <AnimatePresence initial={false}>
          {toasts.map((toast) => {
            const tone = toast.tone ?? "success";
            return (
              <RadixToast.Root
                key={toast.id}
                asChild
                forceMount
                type={tone === "danger" ? "foreground" : "background"}
                onOpenChange={(open) => {
                  if (!open) dismiss(toast.id);
                }}
              >
                <motion.li
                  layout
                  initial={{ opacity: 0, y: 16, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, x: 24, transition: { duration: 0.15 } }}
                  transition={softTransition}
                  className={cn(
                    "pointer-events-auto flex items-start gap-3 rounded-lg border bg-surface-2 p-4 shadow-md",
                    toneClass[tone],
                  )}
                >
                  <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", toneMark[tone])} aria-hidden="true" />
                  <div className="min-w-0 flex-1 space-y-1">
                    <RadixToast.Title className="text-sm font-semibold text-fg">{toast.title}</RadixToast.Title>
                    {toast.description ? (
                      <RadixToast.Description className="text-sm text-fg-muted">
                        {toast.description}
                      </RadixToast.Description>
                    ) : null}
                  </div>
                  <RadixToast.Close
                    className="-m-1 inline-flex size-8 shrink-0 items-center justify-center rounded-md text-fg-subtle hover:bg-surface-3 hover:text-fg focus-visible:outline-2 focus-visible:outline-focus"
                    aria-label="Fechar notificação"
                  >
                    <span aria-hidden="true">×</span>
                  </RadixToast.Close>
                </motion.li>
              </RadixToast.Root>
            );
          })}
        </AnimatePresence>
        <RadixToast.Viewport className="pointer-events-none fixed right-0 bottom-0 z-60 flex w-full max-w-sm flex-col gap-3 p-4 outline-none sm:p-6" />
      </RadixToast.Provider>
    </ToastContext.Provider>
  );
}

export function useToast(): (input: ToastInput) => void {
  const toast = useContext(ToastContext);
  if (!toast) throw new Error("useToast precisa estar dentro de ToastProvider.");
  return toast;
}
