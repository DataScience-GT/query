import React from "react";
import type { ComponentType } from "react";
import type { EventConfig } from "../config";
import Rich from "./Rich";

/**
 * Who the weekend needs and how to offer, laid out like Judges. Drawn only
 * when the config sets `volunteers`, so an edition without it has no section.
 * `Plot` is the picture under the title, in a box that sets `--bed`, the art's
 * scale, and is marked `data-bloom-watch` so a site script can open the plants
 * the first time the box is in view.
 */
export default function VolunteersSection({
  event,
  Plot,
}: {
  event: EventConfig;
  Plot?: ComponentType;
}) {
  if (!event.volunteers) return null;
  const { cta } = event.volunteers;
  const [lead, ...rest] = event.volunteers.body;

  return (
    <section id="volunteers" className="section-anchor relative">
      <div className="wrap py-12 md:py-24">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-16 gap-y-10">
          <div>
            <h2 className="section-title">Volunteers</h2>
            {Plot && (
              <div
                aria-hidden="true"
                data-bloom="off"
                data-bloom-watch=""
                className="flex h-20 sm:h-36 items-end justify-around border-b border-sage mt-8 [--bed:1] sm:[--bed:2] [--step:150ms]"
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
            {cta && (
              <a href={cta.href} className="btn btn-bloom mt-8 inline-flex">
                {cta.label}
              </a>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
