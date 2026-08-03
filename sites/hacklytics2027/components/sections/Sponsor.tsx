"use client";
import React from "react";
import Link from "next/link";
import Image from "next/image";
import SectionHead from "../SectionHead";

const goldSponsors    = [{ name: "Databricks", logo: "/sponsors/gold_databricks.png" }, { name: "Intuit", logo: "/sponsors/gold_intuit.png" }];
const silverSponsors  = [{ name: "Assurant", logo: "/sponsors/silver_assurant.png" }, { name: "Growth Factor", logo: "/sponsors/silver_growthfactor.svg" }, { name: "Sphinx AI", logo: "/sponsors/Silver_SphinxAI.svg" }];
const bronzeSponsors  = [{ name: "Actian", logo: "/sponsors/bronze_actian.png" }, { name: "AT&T", logo: "/sponsors/bronze_att.png" }, { name: "D.E. Shaw", logo: "/sponsors/bronze_deshaw.png" }, { name: "Figma", logo: "/sponsors/bronze_figma.svg" }, { name: "Scale AI", logo: "/sponsors/bronze_scale.png" }];
const miniSponsors    = [{ name: "Cox", logo: "/sponsors/MiniTier_Cox.png" }, { name: "NLP", logo: "/sponsors/MiniTier_NLP.png" }, { name: "Safety Kit", logo: "/sponsors/MiniTier_SafetyKit.svg" }, { name: "Tractian", logo: "/sponsors/MiniTier_Tractian.svg" }, { name: "X", logo: "/sponsors/MiniTier_X.png" }];

// These logos are white artwork — they need an ink plate to be visible on paper.
const LIGHT_LOGOS = new Set(["/sponsors/silver_assurant.png", "/sponsors/bronze_deshaw.png"]);

function Tier({
  label,
  sponsors,
  cols,
  height,
}: {
  label: string;
  sponsors: { name: string; logo: string }[];
  cols: string;
  height: string;
}) {
  return (
    <div className="mt-12 first:mt-0">
      <div className="mono-label rule-heavy-b flex items-baseline justify-between pb-3">
        <span>{label}</span>
        <span className="text-ink-soft">{String(sponsors.length).padStart(2, "0")}</span>
      </div>
      <div className={`grid ${cols} border-l border-rule`}>
        {sponsors.map(({ name, logo }) => {
          const light = LIGHT_LOGOS.has(logo);
          return (
            <div
              key={name}
              className={`flex ${height} items-center justify-center border-b border-r border-rule px-6 ${light ? "bg-ink" : ""}`}
            >
              <div className="relative h-full w-full py-4">
                <Image
                  src={logo}
                  alt={name}
                  fill
                  className={`object-contain grayscale transition duration-200 hover:grayscale-0 ${light ? "" : "mix-blend-multiply"}`}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function SponsorsSection() {
  return (
    <section id="sponsors" className="section-anchor relative bg-paper">
      <div className="wrap py-14 md:py-20">
        <SectionHead
          num="06"
          label="Backers"
          title="Sponsors"
          note={
            <>
              Hiring data people? Put your name on the weekend —{" "}
              <Link href="mailto:hello@hacklytics.io" className="border-b border-ink pb-[1px] hover:bg-ink hover:text-paper">
                hello@hacklytics.io
              </Link>
            </>
          }
        />

        <div className="mt-10 md:mt-14">
          <Tier label="Gold" sponsors={goldSponsors} cols="grid-cols-1 sm:grid-cols-2" height="h-40 md:h-48" />
          <Tier label="Silver" sponsors={silverSponsors} cols="grid-cols-2 sm:grid-cols-3" height="h-28 md:h-36" />
          <Tier label="Bronze" sponsors={bronzeSponsors} cols="grid-cols-2 sm:grid-cols-3 lg:grid-cols-5" height="h-24 md:h-28" />
          <Tier label="Additional" sponsors={miniSponsors} cols="grid-cols-2 sm:grid-cols-3 lg:grid-cols-5" height="h-20 md:h-24" />
        </div>

        <div className="rule-t mt-12 flex items-center justify-between pt-4">
          <Link
            href="mailto:hello@hacklytics.io"
            className="mono-label invert-hover border border-ink px-6 py-4"
          >
            Become a partner →
          </Link>
          <Link
            href="https://2025.hacklytics.io/#sponsors"
            target="_blank"
            rel="noopener noreferrer"
            className="mono-label text-ink-soft hover:text-ink"
          >
            2025 sponsors ↗
          </Link>
        </div>
      </div>
    </section>
  );
}
