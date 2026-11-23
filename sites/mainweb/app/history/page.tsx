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

type Year = {
  year: string;
  title: string;
  story: string;
  facts?: [label: string, value: string][];
  photo?: { src: StaticImageData; alt: string };
};

const YEARS: Year[] = [
  {
    year: "2016",
    title: "The club starts",
    story:
      "Data Science at Georgia Tech is established as a student club for anyone at Georgia Tech who wants to learn data science and use it on real problems.",
  },
  {
    year: "2020-2021",
    title: "Hacklytics goes worldwide",
    story:
      "Planning starts in the summer of 2020 for a datathon that can run fully online. Hacklytics 2021, “Building a Data-Driven World”, is a 36-hour event run with Major League Hacking, and the first to fold in the Georgia Tech Athletic Association's Sports Innovation Challenge.",
    facts: [
      ["When", "February 5-7, 2021, online"],
      ["Hackers", "349 students from 20 countries"],
      [
        "Tracks",
        "Stock data from Citadel, vaccine distribution from Anthem, and tennis, track and football challenges with Georgia Tech Athletics",
      ],
      [
        "Sponsors",
        "Anthem, Emerson, Citadel and Scheller's Business Analytics Center, with CREATE-X, the Athletic Association and the Student Foundation",
      ],
      [
        "Winners",
        "“Voices of the Vaccine” (Best Hack), “Wolf of Wall Street Bets” (Best Financial Hack)",
      ],
    ],
  },
  {
    year: "2021-2022",
    title: "Projects that outlast the weekend",
    story:
      "Hacklytics 2022 is remembered for what happened after it. One winning team's pitch visualization tool leads to work with Georgia Tech Baseball, and a credit card fraud analyzer built for Capital One goes into development after the event.",
    facts: [
      ["Sponsor", "Scheller's Business Analytics Center, for a second year"],
      [
        "After the event",
        "A pitch visualization tool used with Georgia Tech Baseball; a fraud analyzer taken into development at Capital One",
      ],
    ],
  },
  {
    year: "2022-2023",
    title: "A bigger club and A Starry Night",
    story:
      "The club reaches nearly 500 members by fall 2022 and runs a bootcamp every semester, covering Python, Pandas and machine learning basics. Club projects have worked with companies including Accenture, Amazon and State Farm, with Scheller and CREATE-X as partners. Hacklytics 2023, “A Starry Night”, fills the Klaus atrium.",
    facts: [
      ["When", "February 10-12, 2023, Klaus atrium, in person and online"],
      [
        "Turnout",
        "Nearly 1,300 applications, about 650 participants, 350+ in person",
      ],
      ["Tracks", "Sports, healthcare, energy and sustainability, finance"],
      [
        "Sponsors",
        "16, including the NSA, Google Cloud, AWS, Geico and Georgia Tech Athletics; the Business Analytics Center for a third year",
      ],
      ["Prizes", "More than $10,000"],
      ["Best Overall", "“Roster MD”"],
    ],
  },
  {
    year: "2023-2024",
    title: "Around the World",
    story:
      "Hacklytics 2024 takes a travel theme, “Around the World”, and moves into the Klaus Advanced Computing Building under a balloon sign that spells out the year. The event is free, and teams have one to four people.",
    facts: [
      ["When", "February 9-11, 2024, Klaus Advanced Computing Building"],
      ["Format", "36 hours, in person, free, teams of 1-4"],
      [
        "Sponsors",
        "Intel (platinum) and the NSA (gold), with Microsoft, D. E. Shaw, John Deere, Assurant and CREATE-X",
      ],
    ],
    photo: {
      src: hacklytics2024,
      alt: "Attendees crowded under the HACKLYTICS 2024 balloon sign in the Klaus Advanced Computing Building atrium",
    },
  },
  {
    year: "2024-2025",
    title: "Jurassic Age",
    story:
      "Hacklytics 2025 goes Jurassic, with a “Hacklytics Park” entrance built from balloons. Between hacking sessions, workshops and a generative AI panel fill tiered lecture halls.",
    facts: [
      ["Theme", "“Jurassic Age”"],
      ["Program", "Hacking, workshops, a generative AI panel and talks"],
    ],
    photo: {
      src: hacklytics2025,
      alt: "Attendees applauding in a tiered lecture hall at Hacklytics 2025",
    },
  },
  {
    year: "2025-2026",
    title: "Golden Byte and the member portal",
    story:
      "The fall opens with a kickoff, the org fair, a Databricks night, a Sphinx AI event and a lecture on Bayesian data analysis. In February, Hacklytics 2026 takes a Willy Wonka theme, handing out golden tickets to innovation, and a University of South Florida team, “Alleaf”, takes first place. The club also launches its own member portal for dues, event check-in and judging.",
    facts: [
      ["When", "February 20-22, 2026, Klaus Advanced Computing Building"],
      ["Sign-ups", "More than 1,200 students from over 200 universities"],
      [
        "Tracks",
        "Finance, Sports Analytics, Healthcare, Entertainment and Pure Imagination",
      ],
      ["Challenges", "Actian, Figma, Sphinx and Vultr"],
      [
        "Sponsors",
        "Intuit and Databricks (gold), Sphinx AI and Growth Factor (silver), Scale, Figma, D. E. Shaw, AT&T and Actian (bronze), plus NLP Logix, Cox, SafetyKit, Tractian and CREATE-X",
      ],
      ["Winner", "“Alleaf”, University of South Florida"],
    ],
    photo: {
      src: hacklytics2026,
      alt: "A packed crowd at Hacklytics 2026",
    },
  },
  {
    year: "2026-2027",
    title: "Digital Bloom",
    story: `${VERIFIED_MEMBERS_LABEL} verified members, a nine-week Python bootcamp that meets every Tuesday, and club projects run by members. Hacklytics 2027, “Digital Bloom”, is set for the end of February.`,
    facts: [
      [
        "Hacklytics 2027",
        "February 26-28, 2027, Klaus Advanced Computing Building",
      ],
      [
        "Format",
        "36 hours, in person, free, room for 1,000+ hackers, teams of up to 4",
      ],
    ],
  },
  {
    year: "Next",
    title: "Building toward Hacklytics 2027 and beyond",
    story:
      "Have a year we missed, a winning project or a number to add? Tell the board.",
  },
];

export default function HistoryPage() {
  return (
    <PublicPage
      title="History"
      lede="DS@GT since 2016, one school year at a time."
    >
      <ol className="max-w-4xl border-t border-white/10">
        {YEARS.map(({ year, title, story, facts, photo }) => (
          <li
            key={year}
            className="grid gap-x-12 gap-y-3 border-b border-white/10 py-10 sm:grid-cols-[11rem_1fr]"
          >
            <p className="text-dsgt-teal pt-1.5 font-mono text-sm tracking-[0.2em] uppercase">
              {year}
            </p>
            <div className="max-w-2xl">
              <h2 className="text-2xl font-semibold tracking-tight text-white">
                {title}
              </h2>
              <p className="mt-3 text-lg leading-relaxed text-neutral-300">
                {story}
              </p>
              {facts && (
                <dl className="mt-6 grid gap-x-6 gap-y-3 border-t border-white/10 pt-5 text-[15px] sm:grid-cols-[8.5rem_1fr]">
                  {facts.map(([label, value]) => (
                    <div key={label} className="contents">
                      <dt className="font-mono text-xs tracking-[0.15em] text-neutral-400 uppercase sm:pt-0.5">
                        {label}
                      </dt>
                      <dd className="mb-2 leading-relaxed text-neutral-200 sm:mb-0">
                        {value}
                      </dd>
                    </div>
                  ))}
                </dl>
              )}
              {photo && (
                <Image
                  src={photo.src}
                  alt={photo.alt}
                  className="mt-8 h-56 w-full rounded-lg object-cover sm:h-72"
                  sizes="(min-width: 768px) 672px, 100vw"
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
