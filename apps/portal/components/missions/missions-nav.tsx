"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

const sections = [
  { href: "/missoes", label: "Chamados abertos" },
  { href: "/missoes/registro", label: "Registro de missões" },
] as const;

/** Alterna entre o quadro de inscrições e o arquivo das aventuras. */
export function MissionsNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Seções de Missões" className="border-b border-line-soft">
      <ul className="-mb-px flex gap-1 overflow-x-auto">
        {sections.map((section) => {
          const current = pathname === section.href;
          return (
            <li key={section.href} className="shrink-0">
              <Link
                href={section.href}
                aria-current={current ? "page" : undefined}
                className={cn(
                  "flex min-h-11 items-center border-b-2 px-4 text-sm font-semibold transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
                  current
                    ? "border-accent text-fg"
                    : "border-transparent text-fg-muted hover:border-line-strong hover:text-fg",
                )}
              >
                {section.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
