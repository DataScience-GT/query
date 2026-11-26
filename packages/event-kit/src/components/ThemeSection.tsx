import React from "react";
import type { ComponentType } from "react";
import type { EventConfig } from "../config";
import Rich from "./Rich";

/**
 * Says what the edition's theme is and why, right under the hero. It renders
 * only when the config has `about.theme`. `Art` draws the picture beside the
 * words; its box is marked `data-bloom-watch` so a site script can start the
 * art the first time it is in view, and sets `--bed` so art can double its
 * scale from md.
 */
export default function ThemeSection({
  event,
  Art,
}: {
  event: EventConfig;
  Art?: ComponentType;
}) {
  const body = event.about.theme;
  if (!body) return null;
  const [lead, ...rest] = body;

  return (
    <section id="theme" aria-labelledby="theme-title" className="section-anchor relative">
      <div className="wrap pt-12 md:pt-24">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_26rem] gap-x-16 gap-y-10 lg:items-end">
          <div>
            <p className="kicker">The {event.year} theme</p>
            <h2 id="theme-title" className="section-title mt-3">
              {event.theme.name}
            </h2>
            <p className="font-sans text-[17px] md:text-[19px] text-ink leading-[1.55] max-w-[60ch] mt-6 md:mt-8">
              <Rich value={lead} />
            </p>
            {rest.map((paragraph, i) => (
              <p
                key={i}
                className="font-sans text-[17px] md:text-[19px] text-ink-2 leading-[1.55] max-w-[60ch] mt-4"
              >
                <Rich value={paragraph} />
              </p>
            ))}
          </div>

          {Art && (
            <div
              aria-hidden="true"
              data-bloom="off"
              data-bloom-watch=""
              className="flex items-end justify-center lg:justify-end gap-6 border-b border-sage [--bed:1] md:[--bed:2] [--step:400ms]"
            >
              <Art />
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
