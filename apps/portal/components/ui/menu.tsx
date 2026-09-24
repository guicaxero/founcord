"use client";

import * as RadixMenu from "@radix-ui/react-dropdown-menu";
import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/cn";

const itemClass = [
  "flex min-h-10 cursor-pointer items-center gap-2 rounded-md px-3 text-sm",
  "text-fg-muted outline-none select-none",
  "data-[highlighted]:bg-surface-3 data-[highlighted]:text-fg",
].join(" ");

export function Menu({
  trigger,
  label,
  children,
  align = "end",
}: Readonly<{
  trigger: ReactNode;
  label: string;
  children: ReactNode;
  align?: "start" | "center" | "end";
}>) {
  return (
    <RadixMenu.Root>
      <RadixMenu.Trigger asChild aria-label={label}>
        {trigger}
      </RadixMenu.Trigger>
      <RadixMenu.Portal>
        <RadixMenu.Content
          align={align}
          sideOffset={8}
          className={cn(
            "z-50 min-w-56 rounded-lg border border-line bg-surface-2 p-1.5 shadow-md",
            "data-[state=open]:animate-pop-in data-[state=closed]:animate-pop-out",
            "motion-reduce:animate-none",
          )}
        >
          {children}
        </RadixMenu.Content>
      </RadixMenu.Portal>
    </RadixMenu.Root>
  );
}

export function MenuLabel({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <RadixMenu.Label className="px-3 py-2 text-xs font-extrabold tracking-wider text-fg-subtle uppercase">
      {children}
    </RadixMenu.Label>
  );
}

export function MenuSeparator() {
  return <RadixMenu.Separator className="my-1.5 h-px bg-line-soft" />;
}

export function MenuLink({
  href,
  children,
}: Readonly<{ href: string; children: ReactNode }>) {
  return (
    <RadixMenu.Item asChild>
      <Link className={itemClass} href={href}>
        {children}
      </Link>
    </RadixMenu.Item>
  );
}

/** Item que sai do App Router, como logout e início do OAuth. */
export function MenuAnchor({
  className,
  children,
  ...props
}: ComponentProps<"a"> & { children: ReactNode }) {
  return (
    <RadixMenu.Item asChild>
      <a className={cn(itemClass, className)} {...props}>
        {children}
      </a>
    </RadixMenu.Item>
  );
}

export function MenuButton({ className, ...props }: ComponentProps<"button">) {
  return (
    <RadixMenu.Item asChild>
      <button className={cn(itemClass, "w-full text-left", className)} type="button" {...props} />
    </RadixMenu.Item>
  );
}
