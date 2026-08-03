"use client";
import React, { useState } from "react";
import Image from "next/image";
import SectionHead from "../SectionHead";

// ─── Grand prize plate ─────────────────────────────────────────────────────
const GrandPrize: React.FC<{
  rank: "1st" | "2nd" | "3rd";
  prize: string;
  image?: string;
  featured?: boolean;
}> = ({ rank, prize, image, featured }) => {
  // No art for this prize yet, or the file failed to load — show a numeral plate.
  const [failed, setFailed] = useState(false);
  const showPlate = !image || failed;

  return (
    <article className={`flex flex-col border ${featured ? "border-ink md:-mt-6" : "border-rule"}`}>
      <div className="mono-label flex items-center justify-between border-b border-inherit px-4 py-3">
        <span className={featured ? "text-gold-deep" : "text-ink-soft"}>{rank} place</span>
        {featured && <span>Grand</span>}
      </div>

      <div className="relative flex h-52 items-center justify-center overflow-hidden bg-paper-2 md:h-64">
        {showPlate ? (
          <span className={`display text-[8rem] leading-none ${featured ? "text-gold-deep" : "text-ink/15"}`}>
            {rank.replace(/\D/g, "")}
          </span>
        ) : (
          <Image
            src={image}
            alt={prize}
            fill
            className="object-contain p-8 mix-blend-multiply"
            onError={() => setFailed(true)}
          />
        )}
      </div>

      <div className="border-t border-inherit px-4 py-5">
        <p className="display text-xl md:text-2xl">{prize}</p>
      </div>
    </article>
  );
};

// ─── Main ──────────────────────────────────────────────────────────────────
export default function PrizeAndSpeakerSection() {
  // Drop a file in /public/prizes and set `image` to show art instead of the numeral plate.
  const grandPrizes = [
    { rank: "2nd" as const, prize: "Apple AirPods Max" },
    { rank: "1st" as const, prize: "Apple MacBook Air M4", featured: true },
    { rank: "3rd" as const, prize: "Samsung Odyssey G5 Monitor", image: "/prizes/samsung-monitor.jpg" },
  ];

  const trackPrizes = [
    { num: "01", trackName: "Finance", prizes: ["Nespresso Virtuo Next", "JBL Grip Speaker", "Clay Poker Set"] },
    { num: "02", trackName: "Sports Analytics", prizes: ["Apple Watch SE 3", "JBL Grip Speaker", "Pickleball Set"] },
    { num: "03", trackName: "Healthcare", prizes: ["Theragun Mini Gen 3", "Fitbit Inspire 3", "Owala Waterbottle"] },
    { num: "04", trackName: "Entertainment", prizes: ["Projector", "Karaoke Machine", "Vinyl Turntable"] },
    { num: "05", trackName: "Pure Imagination", prizes: ["Ninja CREAMi Soft Serve"] },
  ];

  const speakers = [
    { title: "Keynote", status: "Announcing Dec 2026" },
    { title: "Guest Speaker", status: "Announcing Dec 2026" },
    { title: "Workshop Lead", status: "Announcing Jan 2027" },
    { title: "Guest Speaker", status: "Announcing Jan 2027" },
  ];

  return (
    <section id="prizes" className="section-anchor relative bg-paper">
      <div className="wrap py-14 md:py-20">
        <SectionHead
          num="03"
          label="Winnings"
          title="Prizes"
          note="Three overall placements, plus first through third in every track. Judged Sunday morning, awarded Sunday afternoon."
        />

        {/* Grand */}
        <div className="mt-10 grid gap-6 md:mt-16 md:grid-cols-3 md:gap-8">
          {grandPrizes.map((p) => (
            <GrandPrize key={p.rank} {...p} />
          ))}
        </div>

        {/* Track table */}
        <div className="mt-20 md:mt-28">
          <div className="mono-label rule-heavy-b flex items-baseline justify-between pb-3 text-ink-soft">
            <span>By track</span>
            <span className="hidden sm:inline">1st / 2nd / 3rd</span>
          </div>

          <table className="w-full text-left">
            <caption className="sr-only">Prizes awarded per competition track</caption>
            <tbody>
              {trackPrizes.map(({ num, trackName, prizes }) => (
                <tr key={num} className="rule-b align-top">
                  <th scope="row" className="w-[42%] py-6 pr-4 md:w-[30%]">
                    <span className="mono-label mr-4 text-ink-soft">{num}</span>
                    <span className="display text-xl md:text-2xl">{trackName}</span>
                  </th>
                  <td className="py-6">
                    <ol className="flex flex-col gap-2 md:flex-row md:gap-8">
                      {prizes.map((p, i) => (
                        <li key={p} className="flex items-baseline gap-3 md:flex-1">
                          <span className="mono-label text-gold-deep">{["1st", "2nd", "3rd"][i]}</span>
                          <span className="text-sm md:text-base">{p}</span>
                        </li>
                      ))}
                    </ol>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Speakers */}
        <div className="mt-20 md:mt-28">
          <div className="mono-label rule-heavy-b flex items-baseline justify-between pb-3 text-ink-soft">
            <span>Speakers</span>
            <span className="hidden sm:inline">To be announced</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
            {speakers.map(({ title, status }, i) => (
              <div
                key={i}
                className="rule-b border-rule px-1 py-8 sm:odd:border-r lg:border-r lg:last:border-r-0"
              >
                <p className="display text-[5rem] leading-none text-paper-2">?</p>
                <p className="mt-4 text-base font-medium">{title}</p>
                <p className="mono-label mt-2 text-ink-soft">{status}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
