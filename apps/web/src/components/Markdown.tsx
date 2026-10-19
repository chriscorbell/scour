// The agent's replies are short markdown: paragraphs, bullets, numbered lists, bold, italics, links and
// inline code. This renders that subset to React elements (no HTML strings), and keeps a reply that is still
// streaming from flashing raw markers: an unclosed ** at the end is shown bold, a half-written link as text.
import type { ReactNode } from "react";
import { cn } from "../lib/cn.ts";

type Block =
  | { kind: "p"; lines: string[] }
  | { kind: "h"; text: string }
  | { kind: "quote"; lines: string[] }
  | { kind: "ul" | "ol"; items: { text: string; depth: number; n: number }[] };

const UL = /^(\s*)[-*+]\s+(.*)$/;
const OL = /^(\s*)(\d+)[.)]\s+(.*)$/;
const HEADING = /^#{1,6}\s+(.*)$/;
const QUOTE = /^>\s?(.*)$/;
const RULE = /^\s*([-*_])(\s*\1){2,}\s*$/;

function parseBlocks(text: string): Block[] {
  const blocks: Block[] = [];
  let cur = null as Block | null;
  const flush = () => {
    if (cur) blocks.push(cur);
    cur = null;
  };

  for (const raw of text.replace(/\r/g, "").split("\n")) {
    const line = raw.replace(/\s+$/, "");
    if (line.trim() === "" || RULE.test(line)) {
      flush();
      continue;
    }
    let m: RegExpMatchArray | null;
    if ((m = line.match(HEADING))) {
      flush();
      blocks.push({ kind: "h", text: m[1]! });
      continue;
    }
    if ((m = line.match(UL)) || (m = line.match(OL))) {
      const ordered = m.length === 4;
      const kind = ordered ? "ol" : "ul";
      const depth = Math.min(2, Math.floor(m[1]!.length / 2));
      const item = { text: ordered ? m[3]! : m[2]!, depth, n: ordered ? Number(m[2]) : 0 };
      if (cur?.kind === kind || (cur && (cur.kind === "ul" || cur.kind === "ol") && depth > 0)) cur.items.push(item);
      else {
        flush();
        cur = { kind, items: [item] };
      }
      continue;
    }
    if ((m = line.match(QUOTE))) {
      if (cur?.kind === "quote") cur.lines.push(m[1]!);
      else {
        flush();
        cur = { kind: "quote", lines: [m[1]!] };
      }
      continue;
    }
    // A continuation line of a list item.
    if ((cur?.kind === "ul" || cur?.kind === "ol") && /^\s{2,}/.test(raw)) {
      const last = cur.items[cur.items.length - 1]!;
      last.text += ` ${line.trim()}`;
      continue;
    }
    if (cur?.kind === "p") cur.lines.push(line);
    else {
      flush();
      cur = { kind: "p", lines: [line] };
    }
  }
  flush();
  return blocks;
}

const INLINE =
  /\*\*(.+?)\*\*|__(.+?)__|\[([^\]]+)\]\(([^)\s]+)\)|`([^`]+)`|(https?:\/\/[^\s<>()]*[^\s<>().,;:!?'"*])|(?<![\w*])\*(?![\s*])(.+?)(?<![\s*])\*(?![\w*])|(?<![\w_])_(?![\s_])(.+?)(?<![\s_])_(?![\w_])/g;

const safeHref = (url: string) => (/^(https?:|mailto:)/i.test(url) ? url : null);

/** "ebay.com/itm/1234…" for a bare URL. */
const shortUrl = (url: string) => {
  const s = url.replace(/^https?:\/\/(www\.)?/, "");
  return s.length > 42 ? `${s.slice(0, 40)}…` : s;
};

function Link({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-ink underline decoration-ink-3/60 underline-offset-[3px] transition-colors hover:decoration-ink"
    >
      {children}
    </a>
  );
}

function inline(text: string, open: boolean): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  let k = 0;
  for (const m of text.matchAll(INLINE)) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const key = k++;
    if (m[1] != null || m[2] != null) {
      out.push(
        <strong key={key} className="font-semibold text-ink">
          {inline(m[1] ?? m[2]!, false)}
        </strong>,
      );
    } else if (m[3] != null) {
      const href = safeHref(m[4]!);
      out.push(href ? <Link key={key} href={href}>{inline(m[3], false)}</Link> : m[3]);
    } else if (m[5] != null) {
      out.push(
        <code key={key} className="rounded-md bg-raised px-1.5 py-0.5 font-mono text-[0.88em] text-ink">
          {m[5]}
        </code>,
      );
    } else if (m[6] != null) {
      out.push(
        <Link key={key} href={m[6]}>
          {shortUrl(m[6])}
        </Link>,
      );
    } else if (m[7] != null || m[8] != null) {
      out.push(<em key={key}>{m[7] ?? m[8]}</em>);
    }
    last = m.index + m[0].length;
  }
  let rest = text.slice(last);
  if (open) {
    // Still being written: hide markers that haven't closed yet.
    const link = rest.match(/\[([^\]]*)(\]\([^)]*)?$/);
    if (link) rest = rest.slice(0, link.index) + link[1];
    const bold = rest.lastIndexOf("**");
    if (bold !== -1) {
      out.push(rest.slice(0, bold));
      out.push(
        <strong key="open" className="font-semibold text-ink">
          {rest.slice(bold + 2)}
        </strong>,
      );
      return out;
    }
  }
  if (rest) out.push(rest);
  return out;
}

interface MarkdownProps {
  text: string;
  /** The text is still streaming in: soften unfinished markers and show a caret. */
  streaming?: boolean;
  className?: string;
}

export function Markdown({ text, streaming = false, className }: MarkdownProps) {
  const blocks = parseBlocks(text);
  const caret = streaming ? <span className="ml-0.5 inline-block h-[1.05em] w-[2px] translate-y-[3px] animate-caret bg-accent" aria-hidden /> : null;

  return (
    <div className={cn("flex flex-col gap-3 text-[14.5px] leading-[1.6] text-ink", className)}>
      {blocks.map((b, i) => {
        const isLast = i === blocks.length - 1;
        const open = streaming && isLast;
        const end = isLast ? caret : null;
        switch (b.kind) {
          case "h":
            return (
              <p key={i} className="font-semibold text-ink">
                {inline(b.text, open)}
                {end}
              </p>
            );
          case "quote":
            return (
              <blockquote key={i} className="border-l-2 border-line-strong pl-3 text-ink-2">
                {b.lines.map((l, j) => (
                  <span key={j}>
                    {j > 0 && <br />}
                    {inline(l, open && j === b.lines.length - 1)}
                  </span>
                ))}
                {end}
              </blockquote>
            );
          case "ul":
          case "ol": {
            const List = b.kind === "ul" ? "ul" : "ol";
            return (
              <List
                key={i}
                start={b.kind === "ol" ? b.items[0]?.n || 1 : undefined}
                className={cn(
                  "flex flex-col gap-1.5 pl-5 marker:text-ink-3",
                  b.kind === "ul" ? "list-disc" : "list-decimal marker:tnum",
                )}
              >
                {b.items.map((item, j) => (
                  <li key={j} className={cn("pl-1", item.depth > 0 && "ml-4 list-[circle]")}>
                    {inline(item.text, open && j === b.items.length - 1)}
                    {j === b.items.length - 1 && end}
                  </li>
                ))}
              </List>
            );
          }
          case "p":
            return (
              <p key={i}>
                {b.lines.map((l, j) => (
                  <span key={j}>
                    {j > 0 && <br />}
                    {inline(l, open && j === b.lines.length - 1)}
                  </span>
                ))}
                {end}
              </p>
            );
        }
      })}
      {blocks.length === 0 && caret}
    </div>
  );
}
