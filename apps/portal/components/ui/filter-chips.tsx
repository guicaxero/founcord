import { cn } from "@/lib/cn";
import { Button } from "./button";

/**
 * Grupo de filtros mutuamente exclusivos. Cada botão anuncia o estado com
 * `aria-pressed`, e o contador opcional ajuda a escolher sem precisar clicar.
 */
export function FilterChips<T extends string>({
  label,
  value,
  options,
  onChange,
  className,
}: Readonly<{
  label: string;
  value: T;
  options: readonly Readonly<{ value: T; label: string; count?: number | undefined }>[];
  onChange: (value: T) => void;
  className?: string | undefined;
}>) {
  return (
    <div className={cn("flex flex-wrap gap-2", className)} role="group" aria-label={label}>
      {options.map((option) => (
        <Button
          key={option.value}
          size="sm"
          variant={value === option.value ? "primary" : "secondary"}
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
        >
          {option.label}
          {option.count !== undefined ? (
            <span
              className={cn(
                "rounded-full px-1.5 text-[0.7rem] tabular-nums",
                value === option.value ? "bg-fg-inverse/15" : "bg-surface-3 text-fg-subtle",
              )}
            >
              {option.count}
            </span>
          ) : null}
        </Button>
      ))}
    </div>
  );
}
