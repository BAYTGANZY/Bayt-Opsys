import { Fragment, type ReactNode } from "react";

/** Renders `**bold**` spans in an otherwise plain-text chat message. */
export function renderChatText(body: string): ReactNode[] {
  const parts = body.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    const match = part.match(/^\*\*([^*]+)\*\*$/);
    if (match) {
      return <strong key={i}>{match[1]}</strong>;
    }
    return <Fragment key={i}>{part}</Fragment>;
  });
}
