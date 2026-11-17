const URL_RE = /https?:\/\/[^\s<>"']+/g;

/** 평문에서 http, https 링크만 `<a>`로 바꾼다. HTML은 그대로 그리지 않는다 (plan.md 14.4). */
export function Linkified({ text }: { text: string }) {
  const parts: (string | { url: string })[] = [];
  let last = 0;
  for (const m of text.matchAll(URL_RE)) {
    const url = m[0].replace(/[),.!?]+$/, "");
    parts.push(text.slice(last, m.index));
    parts.push({ url });
    last = m.index + url.length;
  }
  parts.push(text.slice(last));
  return (
    <>
      {parts.map((p, i) =>
        typeof p === "string" ? (
          p
        ) : (
          <a key={i} href={p.url} target="_blank" rel="noopener noreferrer nofollow" className="text-accent-ink underline underline-offset-2" onClick={(e) => e.stopPropagation()}>
            {p.url}
          </a>
        ),
      )}
    </>
  );
}

export function firstUrl(text: string): string | null {
  const m = text.match(URL_RE);
  return m ? m[0].replace(/[),.!?]+$/, "") : null;
}
