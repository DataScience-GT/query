"use client";
import React from "react";
import Link from "next/link";
import { INTEREST_URL } from "@/lib/links";
import Eyebrow from "./Eyebrow";

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
        Notify me opens the DS@GT portal. This site has no form.{" "}
        <Link
          href={INTEREST_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="text-white underline underline-offset-4 hover:text-white"
        >
          Notify me
        </Link>
        .
      </>
    ),
  },
  {
    q: "Can you participate virtually?",
    a: "No — Hacklytics 2027 is fully in-person at Klaus Advanced Computing Building, Atlanta.",
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
          className="text-white underline underline-offset-4 hover:text-white"
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
          className="text-white underline underline-offset-4 hover:text-white"
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
    <section id="faqs" className="section-anchor text-white relative border-t border-white/[0.06]">
      <div className="section-wrap max-w-7xl mx-auto py-24 md:py-32 px-6">
        <Eyebrow>FAQ</Eyebrow>
        <h2 className="font-sans font-bold text-4xl sm:text-5xl md:text-6xl lg:text-7xl text-white leading-[0.95] tracking-[-0.03em] mb-12 md:mb-16">
          Ask us anything.
        </h2>

        <dl className="flex flex-col gap-10 max-w-3xl">
          {faqItems.map((item) => (
            <div key={item.q}>
              <dt className="font-sans font-bold text-lg md:text-xl text-white tracking-tight">
                {item.q}
              </dt>
              <dd className="font-sans text-base text-white/60 leading-[1.7] mt-2">
                {item.a}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
