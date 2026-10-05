"use client";
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
    a: "Yes. Meals, snacks, swag, and cloud credits during the event are covered.",
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
        ceremony, and you can find teammates on{" "}
        <Link
          href="https://discord.gg/hacklytics"
          target="_blank"
          rel="noopener noreferrer"
          className="text-link"
        >
          Discord
        </Link>
        .
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

export default function FAQSection() {
  return (
    <section id="faqs" className="section-anchor relative border-t border-rule">
      <div className="wrap py-24 md:py-32">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-16">
          <h2 className="lg:col-span-5 section-title">FAQ</h2>

          {/* Hairline disclosure rows. Native <details>, so every answer is
              in the page for search and find-in-page, and opens without JS. */}
          <div className="lg:col-span-7 border-t border-rule">
            {faqItems.map((item) => (
              <details key={item.q} className="group border-b border-rule">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-6 py-5 font-sans text-[17px] md:text-[19px] font-semibold text-ink [&::-webkit-details-marker]:hidden">
                  {item.q}
                  <span
                    aria-hidden="true"
                    className="relative h-3 w-3 shrink-0 text-ink-3 group-hover:text-ink"
                  >
                    <span className="absolute left-0 top-1/2 h-px w-3 -translate-y-1/2 bg-current" />
                    <span className="absolute left-1/2 top-0 h-3 w-px -translate-x-1/2 bg-current group-open:hidden" />
                  </span>
                </summary>
                <div className="font-sans text-[17px] text-ink-2 leading-[1.6] pb-6 max-w-[60ch]">
                  {item.a}
                </div>
              </details>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
