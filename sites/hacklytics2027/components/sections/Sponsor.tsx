"use client";
import React from "react";
import Link from "next/link";
import Image from "next/image";
import { PixelLabel } from "../pixel/PixelBits";

const goldSponsors    = [{ name: "Databricks", logo: "/sponsors/gold_databricks.png" }, { name: "Intuit", logo: "/sponsors/gold_intuit.png" }];
const silverSponsors  = [{ name: "Assurant", logo: "/sponsors/silver_assurant.png" }, { name: "Growth Factor", logo: "/sponsors/silver_growthfactor.svg" }, { name: "Sphinx AI", logo: "/sponsors/Silver_SphinxAI.svg" }];
const bronzeSponsors  = [{ name: "Actian", logo: "/sponsors/bronze_actian.png" }, { name: "AT&T", logo: "/sponsors/bronze_att.png" }, { name: "D.E. Shaw", logo: "/sponsors/bronze_deshaw.png" }, { name: "Figma", logo: "/sponsors/bronze_figma.svg" }, { name: "Scale AI", logo: "/sponsors/bronze_scale.png" }];
const miniSponsors    = [{ name: "Cox", logo: "/sponsors/MiniTier_Cox.png" }, { name: "NLP", logo: "/sponsors/MiniTier_NLP.png" }, { name: "Safety Kit", logo: "/sponsors/MiniTier_SafetyKit.svg" }, { name: "Tractian", logo: "/sponsors/MiniTier_Tractian.svg" }, { name: "X", logo: "/sponsors/MiniTier_X.png" }];

function SponsorLogo({ name, logo, size = "md" }: { name: string; logo: string; size?: "lg" | "md" | "sm" | "xs" }) {
  const dims = {
    lg: { card: "h-28 md:h-36 px-10", img: "w-44 h-14" },
    md: { card: "h-24 px-8",          img: "w-36 h-10" },
    sm: { card: "h-20 px-6",          img: "w-28 h-8" },
    xs: { card: "h-16 px-5",          img: "w-20 h-6" },
  }[size];
  return (
    <div className={`pixel-frame flex items-center justify-center bg-white/[0.03] transition-colors duration-200 ${dims.card}`}>
      <div className={`relative ${dims.img} opacity-50 hover:opacity-100 transition-opacity duration-500`}>
        <Image src={logo} alt={name} fill className="object-contain" />
      </div>
    </div>
  );
}

export default function SponsorsSection() {
  return (
    <section id="sponsors" className="relative text-white overflow-hidden">
      <div className="max-w-7xl mx-auto px-6 py-32 md:py-48">

        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-10 mb-24">
          <h2 className="font-sans font-medium text-5xl md:text-7xl lg:text-[8rem] leading-[0.9] tracking-[-0.03em] text-white">
            SPONSORS
          </h2>
          <div className="flex flex-col items-start md:items-end gap-6 max-w-sm">
            <p className="font-sans text-base text-white/40 leading-relaxed md:text-right">
              Empowering the next generation of data scientists and engineers.
            </p>
            <Link href="mailto:hello@hacklytics.io"
              className="pixel-btn inline-flex items-center justify-center px-6 py-3 font-pixel text-[10px]">
              Become a Partner
            </Link>
          </div>
        </div>

        {/* Sponsor tiers */}
        <div className="space-y-16">
          <div>
            <PixelLabel text="Gold" tint="lime" />
            <div className="flex flex-wrap gap-4">
              {goldSponsors.map(s => <SponsorLogo key={s.name} {...s} size="lg" />)}
            </div>
          </div>
          <div>
            <PixelLabel text="Silver" tint="cyan" />
            <div className="flex flex-wrap gap-4">
              {silverSponsors.map(s => <SponsorLogo key={s.name} {...s} size="md" />)}
            </div>
          </div>
          <div>
            <PixelLabel text="Bronze" tint="pink" />
            <div className="flex flex-wrap gap-4">
              {bronzeSponsors.map(s => <SponsorLogo key={s.name} {...s} size="sm" />)}
            </div>
          </div>
          <div>
            <PixelLabel text="Additional" tint="purple" />
            <div className="flex flex-wrap gap-4">
              {miniSponsors.map(s => <SponsorLogo key={s.name} {...s} size="xs" />)}
            </div>
          </div>
        </div>

        {/* Past sponsors link */}
        <div className="mt-24 pt-8 border-t border-white/5 flex justify-end">
          <Link href="https://2025.hacklytics.io/#sponsors" target="_blank" rel="noopener noreferrer"
            className="font-pixel text-[10px] text-white/35 hover:text-white transition-colors duration-200">
            View 2025 sponsors →
          </Link>
        </div>

      </div>
    </section>
  );
}

