"use client";

import { AnimatePresence, motion } from "motion/react";
import { useMemo, useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { softTransition } from "./motion";

export type DataColumn<Row> = Readonly<{
  id: string;
  header: string;
  cell: (row: Row) => ReactNode;
  /** Valor usado na ordenação; sem ele a coluna não é ordenável. */
  sortValue?: ((row: Row) => string | number) | undefined;
  /** Esconde o rótulo da coluna no cartão do celular (ex.: título, ações). */
  hideLabelOnMobile?: boolean | undefined;
  className?: string | undefined;
}>;

type SortState = Readonly<{ column: string; direction: "ascending" | "descending" }>;

/**
 * Tabela de gestão. Em telas largas é uma tabela real, com cabeçalhos
 * ordenáveis por teclado e `aria-sort`; abaixo de `md` cada linha vira um
 * cartão, sem rolagem horizontal, mantendo a semântica de tabela.
 */
export function DataTable<Row>({
  caption,
  columns,
  rows,
  rowKey,
  initialSort,
  empty,
}: Readonly<{
  caption: string;
  columns: readonly DataColumn<Row>[];
  rows: readonly Row[];
  rowKey: (row: Row) => string;
  initialSort?: SortState | undefined;
  empty?: ReactNode | undefined;
}>) {
  const [sort, setSort] = useState<SortState | null>(initialSort ?? null);

  const sorted = useMemo(() => {
    const column = sort ? columns.find((candidate) => candidate.id === sort.column) : undefined;
    if (!sort || !column?.sortValue) return rows;
    const factor = sort.direction === "ascending" ? 1 : -1;
    return [...rows].sort((left, right) => {
      const a = column.sortValue!(left);
      const b = column.sortValue!(right);
      if (typeof a === "number" && typeof b === "number") return (a - b) * factor;
      return String(a).localeCompare(String(b), "pt-BR") * factor;
    });
  }, [columns, rows, sort]);

  if (rows.length === 0 && empty) return <>{empty}</>;

  return (
    <div className="overflow-hidden rounded-lg border border-line-soft bg-surface max-md:border-0 max-md:bg-transparent">
      {/* Papéis explícitos: `display: block` no celular apagaria a semântica de tabela. */}
      <table role="table" className="w-full border-collapse text-left text-sm max-md:block">
        <caption className="sr-only">{caption}</caption>
        {/* eslint-disable-next-line jsx-a11y/no-redundant-roles -- papel mantido de propósito (ver acima). */}
        <thead role="rowgroup" className="border-b border-line-soft bg-surface-2 max-md:sr-only">
          <tr role="row">
            {columns.map((column) => {
              const active = sort?.column === column.id;
              return (
                <th
                  key={column.id}
                  scope="col"
                  role="columnheader"
                  aria-sort={active ? sort.direction : column.sortValue ? "none" : undefined}
                  className={cn("px-4 py-3 text-xs font-bold tracking-wide text-fg-subtle uppercase", column.className)}
                >
                  {column.sortValue ? (
                    <button
                      type="button"
                      className="-mx-2 inline-flex min-h-9 items-center gap-1.5 rounded-md px-2 uppercase hover:bg-surface-3 hover:text-fg focus-visible:outline-2 focus-visible:outline-focus"
                      onClick={() =>
                        setSort({
                          column: column.id,
                          direction: active && sort.direction === "ascending" ? "descending" : "ascending",
                        })
                      }
                    >
                      {column.header}
                      <span aria-hidden="true" className={cn("text-[0.65rem]", active ? "text-accent" : "opacity-40")}>
                        {active ? (sort.direction === "ascending" ? "▲" : "▼") : "↕"}
                      </span>
                    </button>
                  ) : (
                    column.header
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        {/* eslint-disable-next-line jsx-a11y/no-redundant-roles -- papel mantido de propósito (ver acima). */}
        <tbody role="rowgroup" className="max-md:grid max-md:gap-3">
          <AnimatePresence initial={false}>
            {sorted.map((row) => (
              <motion.tr
                key={rowKey(row)}
                role="row"
                layout="position"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={softTransition}
                className="border-b border-line-soft last:border-b-0 hover:bg-surface-2/60 max-md:block max-md:space-y-3 max-md:rounded-lg max-md:border max-md:bg-surface max-md:p-4 max-md:last:border-b"
              >
                {columns.map((column) => (
                  <td
                    key={column.id}
                    // eslint-disable-next-line jsx-a11y/no-interactive-element-to-noninteractive-role -- `cell` é o papel nativo da célula.
                    role="cell"
                    data-label={column.hideLabelOnMobile ? undefined : column.header}
                    className={cn(
                      "px-4 py-3 align-top max-md:block max-md:p-0",
                      !column.hideLabelOnMobile &&
                        "max-md:before:mb-1 max-md:before:block max-md:before:text-xs max-md:before:font-bold max-md:before:text-fg-subtle max-md:before:uppercase max-md:before:content-[attr(data-label)]",
                      column.className,
                    )}
                  >
                    {column.cell(row)}
                  </td>
                ))}
              </motion.tr>
            ))}
          </AnimatePresence>
        </tbody>
      </table>
    </div>
  );
}

/** Ações de uma linha: quebram linha em vez de estourar a largura. */
export function RowActions({ children }: Readonly<{ children: ReactNode }>) {
  return <div className="flex flex-wrap justify-end gap-2 max-md:justify-start">{children}</div>;
}
