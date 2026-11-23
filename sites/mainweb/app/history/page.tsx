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
    "DS since 2020, one school year at a time: from the first hackathon to the member portal.",
  alternates: { canonical: "/history" },
  openGraph: {
    title: "History | DS@GT",
    description:
      "DS since 2020, one school year at a time: from the first hackathon to the member portal.",
  },
};

const YEARS: {
  year: string;
  note: string;
  photo?: { src: StaticImageData; alt: string };
}[] = [
  { year: "2020-2021", note: "Foundation year. First official hackathon." },
  { year: "2021-2022", note: "First major sponsorship partnerships secured." },
  { year: "2022-2023", note: "Expanded to include AI/ML workshops." },
  {
    year: "2023-2024",
    note: "Record-breaking member growth.",
    photo: {
      src: hacklytics2024,
      alt: "Attendees crowded under the HACKLYTICS 2024 balloon sign in the Klaus Advanced Computing Building atrium",
    },
  },
  {
    year: "2024-2025",
    note: "Innovation and community building.",
    photo: {
      src: hacklytics2025,
      alt: "Attendees applauding in a tiered lecture hall at Hacklytics 2025",
    },
  },
  {
    year: "2025-2026",
    note: "Hacklytics 2026, February 20-22. The member portal opens for dues, event check-in, and judging.",
    photo: {
      src: hacklytics2026,
      alt: "A packed crowd at Hacklytics 2026",
    },
  },
  {
    year: "2026-2027",
    note: `${VERIFIED_MEMBERS_LABEL} verified members, a weekly Python bootcamp, and member-run club projects.`,
  },
  { year: "Next", note: "Building toward Hacklytics 2027 and beyond." },
];

export default function HistoryPage() {
  return (
    <PublicPage
      title="History"
      lede="DS@GT since 2020, one school year at a time."
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
              <p className="text-xl leading-snug text-gray-200">{note}</p>
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
