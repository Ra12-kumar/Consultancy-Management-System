import type { ReactNode } from "react";

// A deliberately small Markdown subset for admin-edited pages, rendered as React elements (never as HTML, so no
// script or markup in the text can run): "## " and "### " headings, "- " lists, "1. " numbered lists, paragraphs
// separated by blank lines, **bold**, and [links](https://…) (https or site-relative only).

function inline(text: string, key: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /\*\*(.+?)\*\*|\[([^\]]+)\]\(((?:https:\/\/|\/)[^\s)]+)\)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    if (m[1] !== undefined) out.push(<strong key={`${key}-b${i++}`}>{m[1]}</strong>);
    else {
      const external = m[3]!.startsWith("https://");
      out.push(
        <a key={`${key}-a${i++}`} href={m[3]} className="font-semibold text-accent-text underline" {...(external && { target: "_blank", rel: "noopener noreferrer nofollow" })}>
          {m[2]}
        </a>,
      );
    }
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function SafeMarkdown({ text }: { text: string }) {
  const blocks = text.replace(/\r\n/g, "\n").split(/\n{2,}/);
  return (
    <div className="space-y-4 leading-relaxed">
      {blocks.map((block, b) => {
        const lines = block.split("\n").filter((l) => l.trim());
        if (!lines.length) return null;
        const key = `b${b}`;
        if (lines.length === 1 && lines[0]!.startsWith("### ")) return <h3 key={key} className="pt-2 text-lg font-semibold">{inline(lines[0]!.slice(4), key)}</h3>;
        if (lines.length === 1 && lines[0]!.startsWith("## ")) return <h2 key={key} className="pt-4 text-xl font-bold">{inline(lines[0]!.slice(3), key)}</h2>;
        if (lines.every((l) => /^\s*[-*] /.test(l))) {
          return (
            <ul key={key} className="list-disc space-y-1 pl-6">
              {lines.map((l, i) => (
                <li key={i}>{inline(l.replace(/^\s*[-*] /, ""), `${key}-${i}`)}</li>
              ))}
            </ul>
          );
        }
        if (lines.every((l) => /^\s*\d+\. /.test(l))) {
          return (
            <ol key={key} className="list-decimal space-y-1 pl-6">
              {lines.map((l, i) => (
                <li key={i}>{inline(l.replace(/^\s*\d+\. /, ""), `${key}-${i}`)}</li>
              ))}
            </ol>
          );
        }
        return (
          <p key={key}>
            {lines.map((l, i) => (
              <span key={i}>
                {i > 0 && <br />}
                {inline(l, `${key}-${i}`)}
              </span>
            ))}
          </p>
        );
      })}
    </div>
  );
}
