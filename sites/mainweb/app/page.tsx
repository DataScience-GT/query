import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { classYears, majors } from "@/assets/Data/demographics";
import hacklyticsCrowd from "@/assets/images/2026/hacklytics-crowd.jpg";
import hacklyticsTeam from "@/assets/images/2026/hacklytics-team.jpg";
import slide6 from "@/assets/images/slides/slide6.jpg";
import Footer from "@/components/Footer";
import Hero from "@/components/Hero";
import Navbar from "@/components/Navbar";
import ProjectCard from "@/components/ProjectCard";
import Section from "@/components/Section";
import ShareBar from "@/components/ShareBar";
import { BOOTCAMP_CURRICULUM } from "@/lib/bootcamp-schedule";
import { loadBootcampSessions } from "@/lib/bootcamp-sessions.server";
import { groupClubProjects } from "@/lib/club-projects";
import { loadClubProjects } from "@/lib/club-projects.server";
import { splitByDay } from "@/lib/public-events";

import { startOfEasternDay } from "@query/api/eastern-time";
import { HACKLYTICS_URL, VERIFIED_MEMBERS_LABEL } from "@query/core";
import { currentTerm } from "@query/db/services/membership";

export const metadata: Metadata = {
  description:
    "DS@GT is the largest student-run data science organization at Georgia Tech: a weekly bootcamp, club projects, and Hacklytics, our annual datathon.",
  alternates: { canonical: "/" },
  openGraph: {
    title: "DS@GT | Data Science at Georgia Tech",
    description:
      "The largest student-run data science organization at Georgia Tech: a weekly bootcamp, club projects, and Hacklytics.",
  },
};

export const revalidate = 300;

const BOOTCAMP_ARC = BOOTCAMP_CURRICULUM.reduce<
  { first: number; last: number; title: string }[]
>((arc, { week, title }) => {
  const prev = arc.at(-1);
  if (prev?.title === title) prev.last = week;
  else arc.push({ first: week, last: week, title });
  return arc;
}, []);

export default async function HomePage() {
  const [projects, sessions] = await Promise.all([
    loadClubProjects(),
    loadBootcampSessions(currentTerm()),
  ]);
  // oxlint-disable-next-line react/purity
  const { upcoming } = splitByDay(sessions, startOfEasternDay(new Date()));
  const { current: currentProjects } = groupClubProjects(projects);

  return (
    <div
      id="home-page"
      className="selection:bg-dsgt-teal/30 relative overflow-x-hidden bg-[#050505] text-gray-400"
    >
      <Navbar />
      <Hero nextSession={upcoming[0] ?? null} />

      {/* ABOUT SECTION */}
      <Section
        id="about"
        className="relative z-10 scroll-mt-20 pt-16 pb-12 md:scroll-mt-0 md:pt-24 md:pb-20"
      >
        <div className="mx-auto max-w-7xl px-6 lg:px-12">
          <h2 className="max-w-5xl text-5xl leading-[1.05] font-bold tracking-tighter text-white md:text-6xl">
            Learn it in the bootcamp. Build it in a club project. Ship it at
            Hacklytics.
          </h2>
          <Image
            src={hacklyticsTeam}
            alt="DS@GT executive board at Hacklytics 2026"
            className="mt-10 h-64 w-full rounded-lg object-cover object-[50%_50%] sm:h-80 md:mt-14 lg:h-[28rem]"
            sizes="(min-width: 1280px) 1184px, 100vw"
            placeholder="blur"
          />
          <div className="mt-8 flex flex-col gap-6 md:mt-10 md:flex-row md:items-start md:justify-between md:gap-16">
            <p className="max-w-xl text-lg leading-relaxed text-gray-300">
              We build technical skill through club projects, workshops, and
              guest speakers.
            </p>
            <div className="flex shrink-0 gap-x-8">
              <Link
                href="/team"
                className="text-dsgt-teal border-dsgt-teal/30 inline-flex min-h-11 items-center border-b pb-1 font-mono text-xs tracking-[0.2em] uppercase transition-colors hover:text-white md:min-h-0"
              >
                Meet the Team →
              </Link>
              <Link
                href="/events"
                className="text-dsgt-teal border-dsgt-teal/30 inline-flex min-h-11 items-center border-b pb-1 font-mono text-xs tracking-[0.2em] uppercase transition-colors hover:text-white md:min-h-0"
              >
                Club events →
              </Link>
            </div>
          </div>
        </div>
      </Section>

      {/* STATS SECTION */}
      <Section
        id="stats"
        className="relative z-10 border-y border-white/5 py-14 md:py-20"
      >
        <div className="mx-auto max-w-7xl px-6 lg:px-12">
          <div className="mb-8 space-y-3 md:mb-12">
            <h2 className="text-5xl leading-none font-bold tracking-tighter text-white md:text-6xl">
              Our club.
            </h2>
            <p className="text-dsgt-teal font-mono text-xs tracking-[0.4em] uppercase">
              {VERIFIED_MEMBERS_LABEL} Verified Members
            </p>
          </div>
          <div className="grid max-w-5xl gap-12 lg:grid-cols-2 lg:gap-16">
            <ShareBar title="Class year" shares={classYears} />
            <ShareBar title="Major" shares={majors} />
          </div>
        </div>
      </Section>

      {/* BOOTCAMP SECTION */}
      <Section
        id="bootcamp"
        className="relative z-10 scroll-mt-20 pt-16 pb-14 md:scroll-mt-0 md:pt-24 md:pb-20"
      >
        <div className="mx-auto grid max-w-7xl gap-10 px-6 lg:grid-cols-[2fr_3fr] lg:gap-24 lg:px-12">
          <div className="space-y-5 md:space-y-6">
            <h2 className="text-5xl leading-none font-bold tracking-tighter text-white md:text-6xl">
              Bootcamp.
            </h2>
            <p className="max-w-md leading-relaxed text-gray-300">
              One session a week, from data wrangling to deep learning. The last
              weeks are yours to spend on a project of your own.
            </p>
            <Link
              href="/bootcamp"
              className="text-dsgt-teal border-dsgt-teal/30 inline-flex min-h-11 items-center border-b pb-1 font-mono text-xs tracking-[0.2em] uppercase transition-colors hover:text-white md:min-h-0"
            >
              See the bootcamp →
            </Link>
          </div>
          <ol className="divide-y divide-white/10 border-y border-white/10">
            {BOOTCAMP_ARC.map((step) => (
              <li
                key={step.first}
                className="grid grid-cols-[4.5rem_1fr] items-baseline gap-x-4 py-3.5 md:py-4"
              >
                <span className="font-mono text-xs tracking-[0.2em] text-gray-400 uppercase tabular-nums">
                  {step.first === step.last
                    ? `Wk ${step.first}`
                    : `Wk ${step.first}–${step.last}`}
                </span>
                <span className="text-white md:text-lg">{step.title}</span>
              </li>
            ))}
          </ol>
        </div>
      </Section>

      {/* HACKLYTICS SECTION */}
      <section
        id="golden-byte"
        className="relative isolate z-10 flex min-h-[26rem] scroll-mt-20 items-end overflow-hidden md:min-h-[34rem]"
      >
        <Image
          src={slide6}
          alt="Hacklytics attendees under the balloon sign"
          fill
          sizes="100vw"
          className="-z-10 object-cover object-[50%_25%]"
          placeholder="blur"
        />
        <div className="absolute inset-0 -z-10 bg-linear-to-t from-[#050505] via-[#050505]/70 to-[#050505]/20 md:bg-linear-to-r md:from-[#050505]/95 md:via-[#050505]/70 md:to-transparent" />
        <div className="relative mx-auto w-full max-w-7xl px-6 py-14 md:py-20 lg:px-12">
          <div className="max-w-md space-y-5">
            <h2 className="text-5xl leading-none font-bold tracking-tighter text-white md:text-6xl">
              Hacklytics.
            </h2>
            <p className="leading-relaxed text-gray-200">
              Georgia Tech&apos;s premier{" "}
              <span className="text-white">36-hour datathon</span>. Hundreds of
              students, a weekend of data science challenges and workshops.
            </p>
            <Link
              href={HACKLYTICS_URL}
              className="hover:text-dsgt-teal hover:border-dsgt-teal inline-flex min-h-11 items-center border-b border-white/40 pb-1 font-mono text-xs tracking-[0.2em] text-white uppercase transition-colors md:min-h-0"
            >
              About Hacklytics →
            </Link>
          </div>
        </div>
      </section>

      {/* PROJECTS SECTION */}
      <Section
        id="projects"
        className="relative z-10 scroll-mt-20 pt-24 pb-14 md:scroll-mt-0 md:pt-36 md:pb-20"
      >
        <div className="mx-auto max-w-7xl px-6 lg:px-12">
          <div className="mb-8 flex flex-wrap items-end justify-between gap-x-8 gap-y-4 md:mb-12">
            <h2 className="text-5xl leading-none font-bold tracking-tighter text-white md:text-6xl">
              Projects.
            </h2>
            <Link
              href="/projects"
              className="text-dsgt-teal border-dsgt-teal/30 inline-flex min-h-11 items-center border-b pb-1 font-mono text-xs tracking-[0.2em] uppercase transition-colors hover:text-white md:min-h-0"
            >
              All club projects →
            </Link>
          </div>

          {currentProjects.length === 0 ? (
            <p className="text-gray-300">
              The project roster is being updated —{" "}
              <Link
                href="/projects"
                className="text-dsgt-teal transition-colors hover:text-white"
              >
                see all club projects
              </Link>
              .
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              {currentProjects.map((project) => (
                <ProjectCard key={project.id} project={project} />
              ))}
            </div>
          )}
        </div>
      </Section>

      {/* GET INVOLVED */}
      <Section
        id="getinvolved"
        className="relative z-10 scroll-mt-20 pt-16 pb-14 md:scroll-mt-0 md:pt-24 md:pb-20"
      >
        <div className="mx-auto grid max-w-7xl items-center gap-10 px-6 lg:grid-cols-[3fr_2fr] lg:gap-20 lg:px-12">
          <div>
            <h2 className="text-5xl leading-none font-bold tracking-tighter text-white md:text-6xl">
              Join DS@GT.
            </h2>
            <p className="mt-5 max-w-md text-lg leading-relaxed text-gray-300">
              Make an account to get weekly updates, sign up for the bootcamp,
              and find a club project.
            </p>
            <Link
              href="/login"
              className="bg-dsgt-teal mt-8 inline-flex min-h-14 w-full items-center justify-center rounded-sm px-12 text-sm font-bold tracking-widest text-black uppercase transition-colors hover:bg-white sm:w-auto"
            >
              Join DS@GT
            </Link>
            <ul className="mt-12 max-w-md divide-y divide-white/10 border-y border-white/10">
              {[
                {
                  href: "/team",
                  title: "Lead a team",
                  note: "Join the executive board.",
                },
                {
                  href: HACKLYTICS_URL,
                  title: "Attend Hacklytics",
                  note: "Our 36-hour flagship datathon.",
                },
              ].map((path) => (
                <li key={path.href}>
                  <Link
                    href={path.href}
                    className="group flex min-h-14 items-center justify-between gap-4 py-3 text-gray-300 transition-colors hover:text-white"
                  >
                    <span>
                      <span className="block font-semibold text-white">
                        {path.title}
                      </span>
                      <span className="block text-sm text-gray-400">
                        {path.note}
                      </span>
                    </span>
                    <span
                      aria-hidden
                      className="text-dsgt-teal transition-transform group-hover:translate-x-1"
                    >
                      →
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
          <Image
            src={hacklyticsCrowd}
            alt="A packed lecture hall at Hacklytics 2026"
            className="h-56 w-full rounded-lg object-cover sm:h-72 lg:h-[30rem]"
            sizes="(min-width: 1024px) 480px, 100vw"
            placeholder="blur"
          />
        </div>
      </Section>

      <Footer />
    </div>
  );
}
