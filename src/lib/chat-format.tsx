import { Fragment, type ReactNode } from "react";

const URL_RE = /(https?:\/\/\S+|www\.\S+)/gi;

/** Strips trailing punctuation a sentence would leave glued to a URL ("...se.", "(see docs)"). */
function splitTrailingPunct(url: string): [string, string] {
  let end = url.length;
  while (end > 0) {
    const ch = url[end - 1];
    if (ch === ")") {
      // Only trim a trailing ")" if it has no matching "(" earlier in the URL.
      const opens = (url.slice(0, end).match(/\(/g) ?? []).length;
      const closes = (url.slice(0, end).match(/\)/g) ?? []).length;
      if (opens >= closes) break;
      end--;
      continue;
    }
    if (".,!?;:'\"]".includes(ch)) {
      end--;
      continue;
    }
    break;
  }
  return [url.slice(0, end), url.slice(end)];
}

/** Turns bare URLs in `text` into clickable links, leaving everything else as plain text. */
function linkifyText(text: string, keyPrefix: string): ReactNode[] {
  const parts = text.split(URL_RE);
  return parts.map((part, i) => {
    if (i % 2 === 1) {
      const [url, trailing] = splitTrailingPunct(part);
      const href = url.startsWith("www.") ? `https://${url}` : url;
      return (
        <Fragment key={`${keyPrefix}-${i}`}>
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            style={{ color: "inherit", textDecoration: "underline", wordBreak: "break-all" }}
          >
            {url}
          </a>
          {trailing}
        </Fragment>
      );
    }
    return <Fragment key={`${keyPrefix}-${i}`}>{part}</Fragment>;
  });
}

/** Renders `**bold**` spans and bare URLs (as clickable links) in an otherwise plain-text chat message. */
export function renderChatText(body: string): ReactNode[] {
  const parts = body.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    const match = part.match(/^\*\*([^*]+)\*\*$/);
    if (match) {
      return <strong key={i}>{linkifyText(match[1], `b${i}`)}</strong>;
    }
    return <Fragment key={i}>{linkifyText(part, `p${i}`)}</Fragment>;
  });
}
