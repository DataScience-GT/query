import React from "react";
import type { ComponentType } from "react";
import type { EventConfig, Sponsor } from "../config";
import Rich from "./Rich";

function SponsorMark({ sponsor: s }: { sponsor: Sponsor }) {
  // Logos are drawn for a light ground, so they sit on a --logo-tile tile in either theme.
  const mark = s.logo ? (
    <img src={s.logo} alt={s.name} className="h-10 w-auto max-w-[9rem] object-contain" />
  ) : (
    s.name
  );
  const tile = s.logo
    ? "inline-flex h-16 items-center rounded-lg bg-logo-tile px-4"
    : "font-sans text-[17px] text-ink";
  if (!s.url) return <span className={tile}>{mark}</span>;
  return (
    <a
      href={s.url}
      target="_blank"
      rel="noopener noreferrer"
      className={s.logo ? tile : `${tile} text-link`}
    >
      {mark}
    </a>
  );
}

/** `Plot` is the picture under the title, drawn inside a box that sets `--bed`, the art's scale. */
export default function SponsorsSection({
  event,
  Plot,
}: {
  event: EventConfig;
  Plot?: ComponentType;
}) {
  const [lead, ...rest] = event.sponsors.body;
  const { tiers } = event.sponsors;
  return (
    <section id="sponsors" className="section-anchor relative">
      <div className="wrap py-12 md:py-24">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-16 gap-y-10">
          <div>
            <h2 className="section-title">Sponsors</h2>
            {Plot && (
              <div
                aria-hidden="true"
                className="flex h-20 sm:h-36 items-end justify-around border-b border-sage mt-8 [--bed:1] sm:[--bed:2]"
              >
                <Plot />
              </div>
            )}
          </div>

          <div>
            <p className="font-sans text-[17px] md:text-[19px] text-ink leading-[1.55] max-w-[55ch]">
              <Rich value={lead} />
            </p>
            {rest.map((paragraph, i) => (
              <p
                key={i}
                className="font-sans text-[17px] md:text-[19px] text-ink-2 leading-[1.55] max-w-[55ch] mt-5"
              >
                <Rich value={paragraph} />
              </p>
            ))}

            {tiers.map((tier) => (
              <div key={tier.name} className="mt-10">
                <h3 className="font-display -ml-[0.125em] text-[16px] text-ink">{tier.name}</h3>
                <ul className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-4">
                  {tier.sponsors.map((s) => (
                    <li key={s.name}>
                      <SponsorMark sponsor={s} />
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
