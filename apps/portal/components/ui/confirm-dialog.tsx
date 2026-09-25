"use client";

import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode, type RefObject } from "react";
import { Button } from "./button";
import { Dialog } from "./dialog";
import { Input } from "./field";
import { Notice } from "./notice";

/**
 * Confirmação de ação destrutiva ou que interrompe algo em andamento.
 *
 * O foco inicial fica na ação segura (ou no campo de confirmação, quando a ação
 * é irreversível), `Esc` equivale a cancelar e nada fecha enquanto a ação roda.
 * Com `confirmationText`, a ação só é liberada depois que a pessoa digita a
 * palavra exata.
 */
export function ConfirmDialog({
  open,
  title,
  description,
  children,
  confirmLabel,
  busyLabel,
  cancelLabel = "Cancelar",
  confirmationText,
  busy,
  error,
  onCancel,
  onConfirm,
  returnFocusRef,
}: Readonly<{
  open: boolean;
  title: ReactNode;
  description?: ReactNode | undefined;
  children?: ReactNode | undefined;
  confirmLabel: string;
  busyLabel: string;
  cancelLabel?: string | undefined;
  confirmationText?: string | undefined;
  busy: boolean;
  error: string | null;
  onCancel: () => void;
  onConfirm: () => void;
  returnFocusRef?: RefObject<HTMLElement | null> | undefined;
}>) {
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !busy) onCancel();
      }}
      title={title}
      description={description}
      returnFocusRef={returnFocusRef}
      className="max-w-lg"
    >
      {open ? (
        <ConfirmBody
          confirmLabel={confirmLabel}
          busyLabel={busyLabel}
          cancelLabel={cancelLabel}
          confirmationText={confirmationText}
          busy={busy}
          error={error}
          onCancel={onCancel}
          onConfirm={onConfirm}
        >
          {children}
        </ConfirmBody>
      ) : null}
    </Dialog>
  );
}

function ConfirmBody({
  children,
  confirmLabel,
  busyLabel,
  cancelLabel,
  confirmationText,
  busy,
  error,
  onCancel,
  onConfirm,
}: Readonly<{
  children?: ReactNode | undefined;
  confirmLabel: string;
  busyLabel: string;
  cancelLabel: string;
  confirmationText?: string | undefined;
  busy: boolean;
  error: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}>) {
  const inputId = useId();
  const [typed, setTyped] = useState("");
  const errorRef = useRef<HTMLDivElement>(null);
  const confirmed = !confirmationText || typed === confirmationText;

  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (confirmed && !busy) onConfirm();
  }

  return (
    <form className="space-y-5" onSubmit={submit}>
      {children ? <div className="space-y-3 text-sm text-fg-muted">{children}</div> : null}
      {confirmationText ? (
        <div className="space-y-2">
          <label className="block text-sm font-semibold" htmlFor={inputId}>
            Digite <strong className="font-mono text-danger">{confirmationText}</strong> para confirmar
          </label>
          <Input
            id={inputId}
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
            autoComplete="off"
            spellCheck={false}
            disabled={busy}
          />
        </div>
      ) : null}
      {error ? (
        <Notice ref={errorRef} tone="danger" role="alert">
          {error}
        </Notice>
      ) : null}
      <div className="flex flex-col-reverse gap-3 border-t border-line-soft pt-4 sm:flex-row sm:justify-end">
        <Button disabled={busy} onClick={onCancel}>
          {cancelLabel}
        </Button>
        <Button type="submit" variant="danger" disabled={!confirmed || busy}>
          {busy ? busyLabel : confirmLabel}
        </Button>
      </div>
    </form>
  );
}
