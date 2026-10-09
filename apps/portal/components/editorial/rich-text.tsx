import { Fragment, type ReactNode } from "react";

/**
 * Markdown mínimo e seguro para textos vindos do portal e do Discord:
 * parágrafos (linha em branco), citações (`> `), **negrito**, *itálico* ou
 * _itálico_, __sublinhado__ e ~~riscado~~. Nada vira HTML cru.
 */
const INLINE = /(\*\*[^*\n]+?\*\*|__[^_\n]+?__|~~[^~\n]+?~~|\*[^*\n]+?\*|_[^_\n]+?_)/gu;

/** Caractere escapado com barra, como `\*` (o Discord escapa nomes assim). */
const ESCAPED = /\\([\\`*_{}[\]()<>#+.!|~-])/g;
/** Marcador de uso privado que guarda o lugar de um caractere escapado. */
const MARK = "";
const MARKED = new RegExp(`${MARK}(\\d+)${MARK}`, "g");

function inline(text: string, keyPrefix: string): ReactNode[] {
  // Caracteres escapados não abrem marcação: troca por um marcador e devolve depois.
  const escaped: string[] = [];
  const masked = text.replace(ESCAPED, (_match, character: string) => {
    escaped.push(character);
    return `${MARK}${escaped.length - 1}${MARK}`;
  });
  const restore = (value: string) => value.replace(MARKED, (_match, index: string) => escaped[Number(index)] ?? "");
  return masked.split(INLINE).map((part, index) => {
    const key = `${keyPrefix}-${index}`;
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
      return <strong key={key} className="font-semibold text-fg">{restore(part.slice(2, -2))}</strong>;
    }
    if (part.startsWith("__") && part.endsWith("__") && part.length > 4) {
      return <span key={key} className="underline">{restore(part.slice(2, -2))}</span>;
    }
    if (part.startsWith("~~") && part.endsWith("~~") && part.length > 4) {
      return <s key={key}>{restore(part.slice(2, -2))}</s>;
    }
    if (((part.startsWith("*") && part.endsWith("*")) || (part.startsWith("_") && part.endsWith("_"))) && part.length > 2) {
      return <em key={key}>{restore(part.slice(1, -1))}</em>;
    }
    return <Fragment key={key}>{restore(part)}</Fragment>;
  });
}

function lines(text: string, keyPrefix: string): ReactNode[] {
  return text.split("\n").flatMap((line, index) => [
    ...(index > 0 ? [<br key={`${keyPrefix}-br-${index}`} />] : []),
    ...inline(line, `${keyPrefix}-${index}`),
  ]);
}

/** Blocos do texto: parágrafos e citações, na ordem. */
export function RichText({ body, paragraphClassName }: Readonly<{ body: string; paragraphClassName?: string }>) {
  const blocks: { quote: boolean; lines: string[] }[] = [];
  for (const paragraph of body.replace(/\r\n/gu, "\n").split(/\n\s*\n/u)) {
    if (!paragraph.trim()) continue;
    // Dentro de um parágrafo, linhas seguidas com `>` viram uma citação.
    let current: { quote: boolean; lines: string[] } | null = null;
    for (const line of paragraph.split("\n")) {
      const quote = /^>\s?/u.test(line);
      if (!current || current.quote !== quote) {
        current = { quote, lines: [] };
        blocks.push(current);
      }
      current.lines.push(quote ? line.replace(/^>\s?/u, "") : line);
    }
  }
  return blocks.map((block, index) =>
    block.quote ? (
      <blockquote key={index} className="border-l-2 border-accent-line pl-4 italic">
        {lines(block.lines.join("\n"), `q${index}`)}
      </blockquote>
    ) : (
      <p key={index} className={paragraphClassName}>
        {lines(block.lines.join("\n"), `p${index}`)}
      </p>
    ),
  );
}

/**
 * Texto corrido sem marcações, para o resumo do cartão. Citações (como
 * "Escrito por …" das crônicas do Discord) ficam de fora do resumo.
 */
export function plainText(body: string): string {
  const withoutQuotes = body.replace(/^>.*$/gmu, "").trim();
  const escaped: string[] = [];
  return (withoutQuotes || body.replace(/^>\s?/gmu, ""))
    .replace(ESCAPED, (_match, character: string) => `${MARK}${escaped.push(character) - 1}${MARK}`)
    .replace(/(\*\*|__|~~)(.+?)\1/gu, "$2")
    .replace(/([*_])([^*_\n]+?)\1/gu, "$2")
    .replace(MARKED, (_match, index: string) => escaped[Number(index)] ?? "");
}
