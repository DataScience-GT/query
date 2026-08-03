"use client";
import React from "react";
import Link from "next/link";
import SectionHead from "../SectionHead";

const linkStyle = "border-b border-ink pb-[1px] hover:bg-ink hover:text-paper";

const faqItems: { q: string; a: React.ReactNode }[] = [
  {
    q: "What is a data science hackathon?",
    a: "A datathon focuses on data science and machine learning. You can use any datasets, languages, APIs, or algorithms to create visualizations, develop models, or derive actionable insights.",
  },
  {
    q: "Who can register?",
    a: "Any student currently enrolled at a university who is 18 or older. For any discrepancies, reach out to our team.",
  },
  {
    q: "How many people per team?",
    a: "Maximum of 4 members. You're also allowed to work solo or with fewer members.",
  },
  {
    q: "Is the event free?",
    a: "100% free. We provide all meals, snacks, caffeine, swag, and cloud credits during the event.",
  },
  {
    q: "Can you participate virtually?",
    a: "No — Hacklytics 2027 is fully in-person. Sponsors want to see you build and innovate in real time!",
  },
  {
    q: "What if I don't have a team?",
    a: "Many participants come without teams. We host a team-building event right after the opening ceremony, and you can find teammates on our Discord.",
  },
  {
    q: "What if I forgot to register?",
    a: "We will have a limited number of walk-ins starting at 6:00 PM on the first day. First come, first served.",
  },
  {
    q: "What information does registration collect?",
    a: (
      <>
        Name, age (18+), phone, school, level of study, country, graduation year, major, gender, and race/ethnicity. You&apos;ll also agree to the{" "}
        <Link href="https://static.mlh.io/docs/mlh-code-of-conduct.pdf" target="_blank" className={linkStyle}>
          MLH Code of Conduct
        </Link>{" "}
        and{" "}
        <Link href="https://mlh.io/privacy" target="_blank" className={linkStyle}>
          MLH Privacy Policy
        </Link>.
      </>
    ),
  },
  {
    q: "What is the MLH Code of Conduct?",
    a: (
      <>
        All participants are expected to follow the{" "}
        <Link href="https://static.mlh.io/docs/mlh-code-of-conduct.pdf" target="_blank" className={linkStyle}>
          MLH Code of Conduct
        </Link>. Harassment of any kind is not tolerated. Contact MLH at incidents@mlh.io or +1 409 202 6060.
      </>
    ),
  },
];

export default function FAQSection() {
  return (
    <section id="faqs" className="section-anchor relative bg-paper">
      <div className="wrap py-14 md:py-20">
        <SectionHead
          num="05"
          label="Reference"
          title="FAQ"
          note={
            <>
              Still stuck? Ask in{" "}
              <Link href="https://discord.gg/hacklytics" target="_blank" className={linkStyle}>
                our Discord
              </Link>{" "}
              — organizers answer daily.
            </>
          }
        />

        <div className="rule-heavy-t mt-10 md:mt-14">
          {faqItems.map((item, i) => (
            <details key={i} name="faq" className="group rule-b">
              <summary className="grid cursor-pointer list-none grid-cols-[2.5rem_1fr_1.5rem] items-baseline gap-3 py-6 md:grid-cols-[4rem_1fr_2rem] md:gap-6">
                <span className="mono-label text-ink-soft">{String(i + 1).padStart(2, "0")}</span>
                <h3 className="text-lg font-medium leading-snug tracking-tight md:text-2xl">{item.q}</h3>
                <span className="mono-label text-right text-ink-soft group-open:hidden">+</span>
                <span className="mono-label hidden text-right text-ink-soft group-open:block">−</span>
              </summary>
              <div className="grid grid-cols-[2.5rem_1fr] gap-3 pb-8 md:grid-cols-[4rem_1fr] md:gap-6">
                <span aria-hidden />
                <div className="max-w-[68ch] text-[0.9375rem] leading-[1.7] text-ink-soft md:text-base">
                  {item.a}
                </div>
              </div>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
