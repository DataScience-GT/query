import React from "react";
import type { EventConfig } from "../config";
import Rich from "./Rich";

export default function FAQSection({ event }: { event: EventConfig }) {
  const { faqs } = event;
  /** Half the list, in order. Two lists, not one grid: an open answer only
   *  pushes down its own column. */
  const half = Math.ceil(faqs.length / 2);
  const columns = [faqs.slice(0, half), faqs.slice(half)].filter((c) => c.length > 0);

  return (
    <section id="faqs" className="section-anchor relative">
      <div className="wrap py-12 md:py-24">
        <h2 className="section-title mb-10 md:mb-16">FAQ</h2>

        {/* Hairline disclosure rows. Native <details>, so every answer is in
            the page for search and find-in-page, and opens without JS. */}
        <div className="grid grid-cols-1 lg:grid-cols-2 lg:items-start gap-x-16">
          {columns.map((column, i) => (
            <div key={column[0].q} className={`border-rule lg:border-t ${i === 0 ? "border-t" : ""}`}>
              {column.map((item) => (
                <details key={item.q} className="group border-b border-rule">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-6 py-5 font-sans text-[17px] md:text-[19px] font-medium text-ink [&::-webkit-details-marker]:hidden">
                    {item.q}
                    <span
                      aria-hidden="true"
                      className="relative h-3 w-3 shrink-0 text-ink-3 not-group-open:group-hover:text-ink group-open:text-bloom"
                    >
                      <span className="absolute left-0 top-[5px] h-0.5 w-3 bg-current" />
                      <span className="absolute left-[5px] top-0 h-3 w-0.5 bg-current group-open:hidden" />
                    </span>
                  </summary>
                  <div className="font-sans text-[17px] text-ink-2 leading-[1.6] pb-6 max-w-[60ch]">
                    <Rich value={item.a} />
                  </div>
                </details>
              ))}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
