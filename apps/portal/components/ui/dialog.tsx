"use client";

import * as RadixDialog from "@radix-ui/react-dialog";
import { AnimatePresence, motion } from "motion/react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { dialogContent, softTransition } from "./motion";

/**
 * Diálogo modal do portal. O Radix cuida de foco preso, retorno do foco ao
 * acionador, `Esc` e rótulos; a animação é só a camada de apresentação.
 */
export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  className,
}: Readonly<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
}>) {
  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <AnimatePresence>
        {open ? (
          <RadixDialog.Portal forceMount>
            <RadixDialog.Overlay asChild forceMount>
              <motion.div
                className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={softTransition}
              />
            </RadixDialog.Overlay>
            <RadixDialog.Content asChild forceMount>
              <motion.div
                className={cn(
                  "fixed inset-x-4 top-1/2 z-50 mx-auto w-auto max-w-2xl -translate-y-1/2",
                  "max-h-[calc(100dvh-2rem)] overflow-y-auto overscroll-contain",
                  "rounded-xl border border-line bg-surface p-6 shadow-lg sm:p-8",
                  className,
                )}
                variants={dialogContent}
                initial="hidden"
                animate="visible"
                exit="exit"
              >
                <div className="mb-6 space-y-2">
                  <RadixDialog.Title className="m-0 font-display text-2xl leading-tight">
                    {title}
                  </RadixDialog.Title>
                  {description ? (
                    <RadixDialog.Description className="m-0 text-sm text-fg-muted">
                      {description}
                    </RadixDialog.Description>
                  ) : null}
                </div>
                {children}
                {footer ? (
                  <div className="mt-8 flex flex-col-reverse gap-3 border-t border-line-soft pt-4 sm:flex-row sm:justify-end">
                    {footer}
                  </div>
                ) : null}
              </motion.div>
            </RadixDialog.Content>
          </RadixDialog.Portal>
        ) : null}
      </AnimatePresence>
    </RadixDialog.Root>
  );
}

export const DialogClose = RadixDialog.Close;
