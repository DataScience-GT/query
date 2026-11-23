import type { Metadata } from "next";
import type { StaticImageData } from "next/image";
import Image from "next/image";
import hacklytics2024 from "@/assets/images/photos/hacklytics-2024-sign.jpg";
import hacklytics2025 from "@/assets/images/photos/hacklytics-2025-hall.jpg";
import hacklytics2026 from "@/assets/images/photos/hacklytics-2026-crowd.jpg";
import PublicPage from "@/components/PublicPage";
import { VERIFIED_MEMBERS_LABEL } from "@query/core";

export const metadata: Metadata = {
  title: "History",
  description:
    "DS@GT since 2016, one school year at a time: from a student club to Hacklytics and the member portal.",
  alternates: { canonical: "/history" },
  openGraph: {
    title: "History | DS@GT",
    description:
      "DS@GT since 2016, one school year at a time: from a student club to Hacklytics and the member portal.",
  },
};

const YEARS: {
  year: string;
  note: string;
  photo?: { src: StaticImageData; alt: string };
}[] = [
  {
    year: "2016",
    note: "Data Science at Georgia Tech starts as a student club for anyone at Georgia Tech who wants to learn and use data science.",
  },
  {
    year: "2020-2021",
    note: "Hacklytics 2021, “Building a Data-Driven World”, runs online on February 5-7, 2021: a 36-hour datathon with 349 students from 20 countries, organized with Major League Hacking. Tracks cover stock data from Citadel, vaccine distribution from Anthem and sports challenges with Georgia Tech Athletics. “Voices of the Vaccine” wins Best Hack.",
  },
  {
    year: "2021-2022",
    note: "Hacklytics 2022. One winning team builds a pitch visualization tool and goes on to work with Georgia Tech Baseball, and a credit card fraud analyzer built for Capital One goes into development after the weekend.",
  },
  {
    year: "2022-2023",
    note: "Nearly 500 members by fall 2022, and a bootcamp every semester covering Python, Pandas and machine learning basics. Hacklytics 2023, “A Starry Night”, fills the Klaus atrium on February 10-12, 2023: nearly 1,300 applications, about 650 participants, 16 sponsors including the NSA, Google Cloud and AWS, four tracks and more than $10,000 in prizes.",
  },
  {
    year: "2023-2024",
    note: "Hacklytics 2024, “Around the World”, runs February 9-11, 2024 in the Klaus Advanced Computing Building, with Intel and the NSA as lead sponsors and Microsoft, D. E. Shaw, John Deere and Assurant among the rest.",
    photo: {
      src: hacklytics2024,
      alt: "Attendees crowded under the HACKLYTICS 2024 balloon sign in the Klaus Advanced Computing Building atrium",
    },
  },
  {
    year: "2024-2025",
    note: "Hacklytics 2025 takes a Jurassic theme, “Jurassic Age”, with workshops and talks that fill a tiered lecture hall.",
    photo: {
      src: hacklytics2025,
      alt: "Attendees applauding in a tiered lecture hall at Hacklytics 2025",
    },
  },
  {
    year: "2025-2026",
    note: "Hacklytics 2026, “Golden Byte”, runs February 20-22, 2026. More than 1,200 students from over 200 universities sign up across five tracks, and a University of South Florida team takes first place. The member portal opens for dues, event check-in and judging.",
    photo: {
      src: hacklytics2026,
      alt: "A packed crowd at Hacklytics 2026",
    },
  },
  {
    year: "2026-2027",
    note: `${VERIFIED_MEMBERS_LABEL} verified members, a weekly Python bootcamp and member-run club projects. Hacklytics 2027, “Digital Bloom”, is set for February 26-28, 2027 in the Klaus Advanced Computing Building.`,
  },
  { year: "Next", note: "Building toward Hacklytics 2027 and beyond." },
];

export default function HistoryPage() {
  return (
    <PublicPage
      title="History"
      lede="DS@GT since 2016, one school year at a time."
    >
      <ol className="max-w-4xl border-t border-white/10">
        {YEARS.map(({ year, note, photo }) => (
          <li
            key={year}
            className="grid gap-x-12 gap-y-1 border-b border-white/10 py-8 sm:grid-cols-[11rem_1fr] sm:items-baseline"
          >
            <h2 className="text-dsgt-teal font-mono text-sm tracking-[0.2em] uppercase">
              {year}
            </h2>
            <div>
              <p className="max-w-2xl text-lg leading-relaxed text-gray-200">{note}</p>
              {photo && (
                <Image
                  src={photo.src}
                  alt={photo.alt}
                  className="mt-6 h-40 w-full max-w-sm rounded-lg object-cover sm:h-44"
                  sizes="(min-width: 640px) 384px, 100vw"
                  quality={90}
                  placeholder="blur"
                />
              )}
            </div>
          </li>
        ))}
      </ol>
    </PublicPage>
  );
}
