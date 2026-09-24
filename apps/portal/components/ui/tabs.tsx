"use client";

import * as RadixTabs from "@radix-ui/react-tabs";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export type TabDefinition = Readonly<{
  value: string;
  label: string;
  content: ReactNode;
}>;

/**
 * Abas com o valor refletido na query string, de modo que recarregar a página,
 * compartilhar o endereço ou voltar pelo histórico preserve a aba escolhida.
 */
export function UrlTabs({
  tabs,
  label,
  paramName = "aba",
}: Readonly<{ tabs: readonly TabDefinition[]; label: string; paramName?: string }>) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const fallback = tabs[0]?.value ?? "";
  const requested = searchParams.get(paramName);
  const value = tabs.some((tab) => tab.value === requested) ? requested! : fallback;

  return (
    <RadixTabs.Root
      value={value}
      onValueChange={(next) => {
        const params = new URLSearchParams(searchParams.toString());
        if (next === fallback) params.delete(paramName);
        else params.set(paramName, next);
        const query = params.toString();
        router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
      }}
    >
      <RadixTabs.List
        aria-label={label}
        className="flex w-full gap-1 rounded-lg border border-line-soft bg-surface p-1.5"
      >
        {tabs.map((tab) => (
          <RadixTabs.Trigger
            key={tab.value}
            value={tab.value}
            className={cn(
              // No celular as abas dividem a largura e quebram linha: nenhuma fica escondida.
              "min-h-11 flex-1 rounded-md px-3 text-sm leading-tight font-semibold text-balance sm:flex-none sm:px-4 sm:whitespace-nowrap",
              "text-fg-muted transition-colors duration-150 hover:text-fg",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
              "data-[state=active]:bg-surface-3 data-[state=active]:text-fg",
            )}
          >
            {tab.label}
          </RadixTabs.Trigger>
        ))}
      </RadixTabs.List>
      {tabs.map((tab) => (
        <RadixTabs.Content
          key={tab.value}
          value={tab.value}
          className="mt-8 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        >
          {tab.content}
        </RadixTabs.Content>
      ))}
    </RadixTabs.Root>
  );
}
