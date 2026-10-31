import React from "react";
import Link from "next/link";
import { INTEREST_URL } from "@/lib/links";

const faqItems: { q: string; a: React.ReactNode }[] = [
  {
    q: "Who can come?",
    a: "Any student currently enrolled at a university who is 18 or older. For discrepancies, reach out to our team.",
  },
  {
    q: "Is it free?",
    a: "Yes. Meals, snacks and swag during the event are covered.",
  },
  {
    q: "How long is it?",
    a: "36 hours, Friday evening Feb 26 to Sunday Feb 28, 2027.",
  },
  {
    q: "How many people come?",
    a: "There is room for 1,000+ hackers.",
  },
  {
    q: "What are the tracks?",
    a: "Finance, Sports Analytics, Healthcare and Entertainment. Sponsor challenges stack on top of a track.",
  },
  {
    q: "Team size?",
    a: "Maximum of four. Solo and smaller teams are fine.",
  },
  {
    q: "Where do I apply?",
    a: (
      <>
        Applications are not open yet.{" "}
        <Link
          href={INTEREST_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="text-link"
        >
          Get notified
        </Link>{" "}
        and we’ll tell you when they do.
      </>
    ),
  },
  {
    q: "Can you participate virtually?",
    a: "No. Hacklytics 2027 is fully in person at the Klaus Advanced Computing Building in Atlanta.",
  },
  {
    q: "What if I don’t have a team?",
    a: (
      <>
        Many people show up solo. We run a team-building session after opening
        ceremony to help you find teammates.
      </>
    ),
  },
  {
    q: "What is the MLH Code of Conduct?",
    a: (
      <>
        All participants follow the{" "}
        <Link
          href="https://static.mlh.io/docs/mlh-code-of-conduct.pdf"
          target="_blank"
          rel="noopener noreferrer"
          className="text-link"
        >
          MLH Code of Conduct
        </Link>
        . Harassment of any kind is not tolerated.
      </>
    ),
  },
];

/** Half the list, in order. Two lists, not one grid: an open answer only
 *  pushes down its own column. */
const COLUMNS = [faqItems.slice(0, 5), faqItems.slice(5)];

export default function FAQSection() {
  return (
    <section id="faqs" className="section-anchor relative">
      <div className="wrap py-12 md:py-24">
        <h2 className="section-title mb-10 md:mb-16">FAQ</h2>

        {/* Hairline disclosure rows. Native <details>, so every answer is in
            the page for search and find-in-page, and opens without JS. */}
        <div className="grid grid-cols-1 lg:grid-cols-2 lg:items-start gap-x-16">
          {COLUMNS.map((column, i) => (
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
                    {item.a}
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
