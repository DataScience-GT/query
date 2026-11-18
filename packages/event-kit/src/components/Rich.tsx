import React from "react";
import type { Rich as RichText } from "../config";

/**
 * A space beside a link is its own text node. Chrome sets each text node's
 * width separately, so folding the space into the words moves the link by a
 * fraction of a pixel and re-rasterizes its glyphs. This is the markup the
 * copy had when the space was a separate `{" "}` in JSX.
 */
function pieces(text: string, afterLink: boolean, beforeLink: boolean) {
  const lead = afterLink ? (/^\s+/.exec(text)?.[0] ?? "") : "";
  const rest = text.slice(lead.length);
  const trail = beforeLink ? (/\s+$/.exec(rest)?.[0] ?? "") : "";
  return [lead, rest.slice(0, rest.length - trail.length), trail].filter(Boolean);
}

/** Renders copy that may carry inline links. */
export default function Rich({ value }: { value: RichText }) {
  if (typeof value === "string") return <>{value}</>;
  return (
    <>
      {value.map((part, i) => {
        if (typeof part !== "string") {
          return (
            <a
              key={i}
              href={part.href}
              target={part.external ? "_blank" : undefined}
              rel={part.external ? "noopener noreferrer" : undefined}
              className="text-link"
            >
              {part.text}
            </a>
          );
        }
        const afterLink = i > 0 && typeof value[i - 1] !== "string";
        const beforeLink = i < value.length - 1 && typeof value[i + 1] !== "string";
        return <React.Fragment key={i}>{pieces(part, afterLink, beforeLink)}</React.Fragment>;
      })}
    </>
  );
}
