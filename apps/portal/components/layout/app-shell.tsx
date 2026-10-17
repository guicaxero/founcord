"use client";

import { useQuery } from "@tanstack/react-query";
import type { CurrentUserResponse } from "@ordem/contracts";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { Menu, MenuLink } from "@/components/ui/menu";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { apiFetch } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";
import { AccountMenu } from "./account-menu";
import { canManage, isCurrent, playerNavigation, visiblePublicNavigation } from "./navigation";

/**
 * Moldura de todas as telas: pular para o conteúdo, cabeçalho fixo com a
 * navegação consciente de papel, área principal e rodapé.
 */
export function AppShell({ children }: Readonly<{ children: ReactNode }>) {
  const pathname = usePathname();
  const me = useQuery({
    queryKey: queryKeys.me,
    queryFn: () => apiFetch<CurrentUserResponse>("/api/me"),
    staleTime: 60_000,
  });
  const authenticated = me.data?.authenticated === true;
  const items = [
    ...visiblePublicNavigation(me.data),
    ...(authenticated ? playerNavigation : []),
    ...(canManage(me.data) ? [{ href: "/dashboard", label: "Gestão", hint: "Painel da campanha" }] : []),
  ];

  return (
    <div className="flex min-h-dvh flex-col bg-canvas">
      <a
        href="#main-content"
        className="sr-only rounded-md bg-accent px-4 py-2 font-semibold text-fg focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-60"
      >
        Pular para o conteúdo
      </a>

      <SiteHeader items={items} pathname={pathname} />

      <main id="main-content" className="flex-1">
        {children}
      </main>

      <SiteFooter />
    </div>
  );
}

function SiteHeader({
  items,
  pathname,
}: Readonly<{ items: readonly { href: string; label: string; hint?: string }[]; pathname: string }>) {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={cn(
        "sticky top-0 z-40 border-b transition-colors duration-200",
        scrolled
          ? "border-line-soft bg-canvas/85 backdrop-blur-md"
          : "border-transparent bg-transparent",
      )}
    >
      <div className="mx-auto flex h-18 max-w-7xl items-center gap-4 px-4 sm:px-6">
        <Link
          href="/"
          className="flex shrink-0 items-center gap-3 rounded-md focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-focus"
        >
          {/* Braseiro da Ordem, o mesmo emblema do ícone da aba e da imagem de compartilhamento. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/brand-mark.png"
            alt=""
            aria-hidden="true"
            width={40}
            height={40}
            className="size-10 rounded-lg border border-accent-line"
          />
          <span className="hidden leading-tight sm:block">
            <span className="block text-xs tracking-[0.18em] text-fg-subtle uppercase">
              Ordem da
            </span>
            <strong className="block font-display text-lg">Última Luz</strong>
          </span>
        </Link>

        <nav aria-label="Navegação principal" className="ml-auto hidden xl:block">
          <ul className="flex items-center gap-1">
            {items.map((item) => {
              const current = isCurrent(pathname, item.href);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={current ? "page" : undefined}
                    className={cn(
                      "relative flex min-h-11 items-center rounded-md px-3 text-sm font-medium whitespace-nowrap transition-colors duration-150",
                      current ? "text-fg" : "text-fg-muted hover:text-fg",
                    )}
                  >
                    {item.label}
                    <span
                      aria-hidden="true"
                      className={cn(
                        "absolute inset-x-3 -bottom-px h-0.5 rounded-full bg-accent transition-transform duration-200",
                        current ? "scale-x-100" : "scale-x-0",
                      )}
                    />
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="ml-auto flex items-center gap-2 xl:ml-0">
          <div className="xl:hidden">
            <Menu
              label="Abrir navegação"
              align="end"
              trigger={
                <Button variant="ghost" size="icon" aria-label="Abrir navegação">
                  <span aria-hidden="true" className="space-y-1">
                    <span className="block h-0.5 w-5 rounded-full bg-current" />
                    <span className="block h-0.5 w-5 rounded-full bg-current" />
                    <span className="block h-0.5 w-5 rounded-full bg-current" />
                  </span>
                </Button>
              }
            >
              {items.map((item) => (
                <MenuLink href={item.href} key={item.href}>
                  <span className="flex flex-col py-1">
                    <span className="font-semibold text-fg">{item.label}</span>
                    {item.hint ? <span className="text-xs text-fg-subtle">{item.hint}</span> : null}
                  </span>
                </MenuLink>
              ))}
            </Menu>
          </div>
          <AccountMenu />
        </div>
      </div>
    </header>
  );
}

function SiteFooter() {
  return (
    <footer className="border-t border-line-soft bg-surface-sunken">
      <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-8 text-sm text-fg-subtle sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <p>
          Ordem da Última Luz — campanha de Shadow of the Demon Lord.
        </p>
        <nav aria-label="Links do rodapé">
          <ul className="flex flex-wrap gap-x-5 gap-y-2">
            <li>
              <Link className="hover:text-fg" href="/ordem">
                Código da Ordem
              </Link>
            </li>
            <li>
              <Link className="hover:text-fg" href="/missoes">
                Missões
              </Link>
            </li>
            <li>
              <Link className="hover:text-fg" href="/lojista">
                Lojista
              </Link>
            </li>
          </ul>
        </nav>
      </div>
    </footer>
  );
}
