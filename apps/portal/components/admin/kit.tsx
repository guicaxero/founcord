"use client";

import { motion } from "motion/react";
import { useId, type ReactNode } from "react";
import { Avatar } from "@/components/ui/avatar";
import { Card, Eyebrow, Skeleton } from "@/components/ui/surface";
import { staggerList, listItem } from "@/components/ui/motion";
import { cn } from "@/lib/cn";

/** Cabeçalho de um bloco dentro de uma área do painel. */
export function PanelHeader({
  eyebrow,
  title,
  description,
  actions,
  id,
  as: Heading = "h2",
}: Readonly<{
  eyebrow?: string | undefined;
  title: ReactNode;
  description?: ReactNode | undefined;
  actions?: ReactNode | undefined;
  id?: string | undefined;
  as?: "h2" | "h3" | undefined;
}>) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0 max-w-[68ch] space-y-1">
        {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
        <Heading className="font-display text-xl leading-tight sm:text-2xl" id={id}>
          {title}
        </Heading>
        {description ? <p className="text-sm text-fg-muted">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}

/** Números de apoio no topo de uma área. */
export function Stats({
  label,
  items,
}: Readonly<{
  label: string;
  items: readonly Readonly<{ label: string; value: ReactNode; hint?: string | undefined }>[];
}>) {
  return (
    <motion.dl
      aria-label={label}
      className="grid grid-cols-2 gap-3 sm:grid-cols-3"
      variants={staggerList}
      initial="hidden"
      animate="visible"
    >
      {items.map((item) => (
        <motion.div
          key={item.label}
          variants={listItem}
          className="rounded-lg border border-line-soft bg-surface p-4 last:odd:col-span-2 sm:last:odd:col-span-1"
        >
          <dt className="text-xs font-bold tracking-wide text-fg-subtle uppercase">{item.label}</dt>
          <dd className="mt-1 font-display text-3xl leading-none tabular-nums">{item.value}</dd>
          {item.hint ? <dd className="mt-2 text-xs text-fg-subtle">{item.hint}</dd> : null}
        </motion.div>
      ))}
    </motion.dl>
  );
}

/** Campo de busca das listas de gestão. */
export function SearchField({
  label,
  value,
  onChange,
  placeholder,
  className,
}: Readonly<{
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string | undefined;
  className?: string | undefined;
}>) {
  const id = useId();
  return (
    <div className={cn("min-w-0 flex-1 space-y-2 sm:min-w-56", className)}>
      <label className="block text-sm font-semibold text-fg-muted" htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        autoComplete="off"
        className="min-h-11 w-full rounded-md border border-line bg-surface-sunken px-3 text-fg placeholder:text-fg-subtle hover:border-line-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
      />
    </div>
  );
}

/** Placeholder de carregamento com texto para leitores de tela. */
export function PanelLoading({ label, rows = 3 }: Readonly<{ label: string; rows?: number }>) {
  return (
    <div className="space-y-3" role="status" aria-live="polite">
      <span className="sr-only">{label}</span>
      {Array.from({ length: rows }, (_, index) => (
        <Skeleton key={index} className="h-20 w-full" />
      ))}
    </div>
  );
}

/** Nota lateral para quem não tem a permissão de agir numa área. */
export function PermissionNote({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <Card padding="sm" className="border-dashed bg-transparent text-sm text-fg-muted shadow-none">
      {children}
    </Card>
  );
}

/** Lista de pares rótulo/valor, usada em cartões de detalhes. */
export function DetailList({
  items,
  className,
}: Readonly<{
  items: readonly Readonly<{ label: string; value: ReactNode }>[];
  className?: string | undefined;
}>) {
  return (
    <dl className={cn("grid gap-3 sm:grid-cols-3", className)}>
      {items.map((item) => (
        <div key={item.label} className="min-w-0 rounded-md bg-surface-2 px-3 py-2">
          <dt className="text-[0.7rem] font-bold tracking-wide text-fg-subtle uppercase">{item.label}</dt>
          <dd className="truncate text-sm font-medium" title={typeof item.value === "string" ? item.value : undefined}>
            {item.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** Foto do Discord da pessoa, ou a inicial do nome quando não houver. */
export function Initial({
  name,
  avatarUrl,
  className,
}: Readonly<{ name: string; avatarUrl?: string | null | undefined; className?: string | undefined }>) {
  return <Avatar name={name} src={avatarUrl} className={cn("size-10 text-lg", className)} />;
}
