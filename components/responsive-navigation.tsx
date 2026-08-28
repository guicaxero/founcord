import Link from "next/link";

export type NavigationItem = Readonly<{
  href: string;
  label: string;
  current?: boolean;
}>;

export function ResponsiveNavigation({
  label,
  items,
  menuLabel = "Explorar",
}: Readonly<{
  label: string;
  items: readonly NavigationItem[];
  menuLabel?: string;
}>) {
  return (
    <>
      <nav className="responsive-navigation-wide" aria-label={label}>
        <NavigationList items={items} />
      </nav>
      <details className="responsive-navigation-compact">
        <summary>
          <span>{menuLabel}</span>
          <span aria-hidden="true">⌄</span>
        </summary>
        <nav aria-label={`${label} — menu compacto`}>
          <NavigationList items={items} />
        </nav>
      </details>
    </>
  );
}

function NavigationList({ items }: Readonly<{ items: readonly NavigationItem[] }>) {
  return (
    <ul>
      {items.map((item) => (
        <li key={`${item.href}-${item.label}`}>
          {item.href.startsWith("#") ? (
            <a href={item.href} aria-current={item.current ? "page" : undefined}>
              {item.label}
            </a>
          ) : (
            <Link href={item.href} aria-current={item.current ? "page" : undefined}>
              {item.label}
            </Link>
          )}
        </li>
      ))}
    </ul>
  );
}
