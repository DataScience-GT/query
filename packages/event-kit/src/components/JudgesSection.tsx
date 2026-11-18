import React from "react";
import type { ComponentType } from "react";
import type { EventConfig } from "../config";
import Rich from "./Rich";

/** `Plot` is the picture under the title, drawn inside a box that sets `--bed`, the art's scale. */
export default function JudgesSection({
  event,
  Plot,
}: {
  event: EventConfig;
  Plot?: ComponentType;
}) {
  const [lead, ...rest] = event.judges.body;
  const { people } = event.judges;
  return (
    <section id="judges" className="section-anchor relative">
      <div className="wrap py-12 md:py-24">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-16 gap-y-10">
          <div>
            <h2 className="section-title">Judges</h2>
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
            <a href={event.links.judgeApply} className="btn btn-bloom mt-8 inline-flex">
              Apply to judge
            </a>

            {people.length > 0 && (
              <ul className="mt-12 border-t border-rule">
                {people.map((p, i) => (
                  <li key={`${p.name}-${i}`} className="border-b border-rule py-4">
                    <p className="font-sans text-[17px] md:text-[19px] font-medium text-ink">{p.name}</p>
                    {(p.title || p.company) && (
                      <p className="font-sans text-[15px] text-ink-2 mt-1">
                        {[p.title, p.company].filter(Boolean).join(", ")}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
