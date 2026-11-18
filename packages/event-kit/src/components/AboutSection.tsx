import React from "react";
import type { EventConfig } from "../config";
import Rich from "./Rich";

export default function AboutSection({ event }: { event: EventConfig }) {
  const [lead, ...rest] = event.about.body;
  return (
    <section id="about" className="section-anchor relative">
      <div className="wrap py-12 md:py-24">
        <h2 className="display -ml-[0.125em] text-[32px] md:text-[48px] xl:text-[64px] leading-[1.05] text-balance">
          {event.about.heading}
        </h2>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-16 gap-y-5 mt-8 md:mt-12">
          <p className="font-sans text-[17px] md:text-[19px] text-ink leading-[1.55] max-w-[60ch]">
            <Rich value={lead} />
          </p>
          {rest.map((paragraph, i) => (
            <p
              key={i}
              className="font-sans text-[17px] md:text-[19px] text-ink-2 leading-[1.55] max-w-[60ch]"
            >
              <Rich value={paragraph} />
            </p>
          ))}
        </div>
      </div>
    </section>
  );
}
