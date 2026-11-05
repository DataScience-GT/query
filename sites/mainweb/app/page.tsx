import type { Metadata } from "next";
import Image from "next/image";
import type { StaticImageData } from "next/image";
import Link from "next/link";

import {
  STATUS_CLASSES,
  STATUS_LABELS,
  groupClubProjects,
  isExternalJoin,
  joinHref,
  joinLabel,
} from "@/lib/club-projects";
import { loadClubProjects } from "@/lib/club-projects.server";
import { BOOTCAMP_CURRICULUM } from "@/lib/bootcamp-schedule";
import { loadBootcampSessions } from "@/lib/bootcamp-sessions.server";
import { splitByDay } from "@/lib/public-events";
import { currentTerm } from "@query/db/services/membership";
import { startOfEasternDay } from "@query/api/eastern-time";

import Navbar from "@/components/Navbar";
import Hero from "@/components/Hero";
import Section from "@/components/Section";
import Card from "@/components/Card";
import Footer from "@/components/Footer";
import ShareBar from "@/components/ShareBar";
import { classYears, majors } from "@/assets/Data/demographics";

import slide1 from "@/assets/images/slides/slide1.jpg";
import squad from "@/assets/images/2025/squad.jpg";
import slide6 from "@/assets/images/slides/slide6.jpg";
import arc from "@/assets/images/logos/arc-logo-v3.png";
import gtaa from "@/assets/images/logos/gtaa.png";
import stock from "@/assets/images/logos/stock.png";
import trading from "@/assets/images/logos/trading.png";

export const metadata: Metadata = { alternates: { canonical: "/" } };

export const revalidate = 300;

const BOOTCAMP_ARC = BOOTCAMP_CURRICULUM.reduce<
  { first: number; last: number; title: string }[]
>((arc, { week, title }) => {
  const prev = arc.at(-1);
  if (prev?.title === title) prev.last = week;
  else arc.push({ first: week, last: week, title });
  return arc;
}, []);

const PROJECT_LOGOS: Record<string, StaticImageData> = {
  arc,
  roboinvesting: stock,
  "sports-analytics": gtaa,
  "dsgt-website": trading,
};

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
      className="relative bg-[#1A1A1A] text-gray-400 selection:bg-[#00A8A8]/30 overflow-x-hidden"
    >
      <Navbar
        page="home"
        className="fixed top-0 z-50 border-b border-white/5 bg-[#1A1A1A]/80 backdrop-blur-md"
      />
      <Hero nextSession={upcoming[0] ?? null} />

      {/* ABOUT SECTION */}
      <Section
        id="about"
        className="pt-16 pb-12 md:pt-24 md:pb-20 relative z-10"
      >
        <div className="max-w-7xl mx-auto px-6 lg:px-12">
          <h2 className="max-w-5xl text-white text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold tracking-tighter leading-[1.05]">
            The largest student-run data science organization at Georgia Tech.
          </h2>
          <Image
            src={squad}
            alt="DSGT Executive Board"
            className="mt-10 md:mt-14 h-64 w-full rounded-lg object-cover object-[50%_40%] sm:h-80 lg:h-[28rem]"
            sizes="(min-width: 1280px) 1184px, 100vw"
            placeholder="blur"
          />
          <div className="mt-8 md:mt-10 flex flex-col gap-6 md:flex-row md:items-start md:justify-between md:gap-16">
            <p className="max-w-xl text-lg text-gray-300 leading-relaxed">
              We build technical skill through club projects, workshops, and
              guest speakers.
            </p>
            <div className="flex shrink-0 gap-x-8">
              <Link
                href="/team"
                className="inline-flex items-center min-h-11 md:min-h-0 text-[#00A8A8] font-mono text-xs uppercase tracking-[0.2em] border-b border-[#00A8A8]/30 pb-1 hover:text-white transition-colors"
              >
                Meet the Team →
              </Link>
              <Link
                href="/events"
                className="inline-flex items-center min-h-11 md:min-h-0 text-[#00A8A8] font-mono text-xs uppercase tracking-[0.2em] border-b border-[#00A8A8]/30 pb-1 hover:text-white transition-colors"
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
        className="py-14 md:py-20 border-y border-white/5 glass-section relative z-10"
      >
        <div className="max-w-7xl mx-auto px-6 lg:px-12">
          <div className="text-center mb-8 md:mb-12 space-y-3">
            <h2 className="text-white text-4xl md:text-5xl font-bold tracking-tight leading-none">
              Our club.
            </h2>
            <p className="font-mono text-xs text-[#00A8A8] uppercase tracking-[0.4em]">
              550+ Verified Members
            </p>
          </div>
          <div className="mx-auto grid max-w-5xl gap-12 lg:grid-cols-2 lg:gap-16">
            <ShareBar title="Class year" shares={classYears} />
            <ShareBar title="Major" shares={majors} />
          </div>
        </div>
      </Section>

      {/* BOOTCAMP SECTION */}
      <Section
        id="bootcamp"
        className="pt-16 pb-14 md:pt-24 md:pb-20 relative z-10"
      >
        <div className="max-w-7xl mx-auto px-6 lg:px-12 grid lg:grid-cols-[2fr_3fr] gap-10 lg:gap-24">
          <div className="space-y-5 md:space-y-6">
            <h2 className="text-white text-5xl md:text-6xl font-bold tracking-tighter leading-none">
              Bootcamp.
            </h2>
            <p className="max-w-md text-gray-300 leading-relaxed">
              One session a week, from data wrangling to deep learning. The last
              weeks are yours to spend on a project of your own.
            </p>
            <Link
              href="/bootcamp"
              className="inline-flex items-center min-h-11 md:min-h-0 text-[#00A8A8] font-mono text-xs uppercase tracking-[0.2em] border-b border-[#00A8A8]/30 pb-1 hover:text-white transition-colors"
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
                <span className="font-mono text-xs uppercase tracking-[0.2em] text-gray-400 tabular-nums">
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
        className="relative z-10 isolate flex min-h-[26rem] items-end overflow-hidden md:min-h-[34rem]"
      >
        <Image
          src={slide6}
          alt="Hacklytics 2024 attendees under the balloon sign"
          fill
          sizes="100vw"
          className="-z-10 object-cover object-[50%_25%]"
          placeholder="blur"
        />
        <div className="absolute inset-0 -z-10 bg-linear-to-t from-[#1A1A1A] via-[#1A1A1A]/70 to-[#1A1A1A]/20 md:bg-linear-to-r md:from-[#1A1A1A]/95 md:via-[#1A1A1A]/70 md:to-transparent" />
        <div className="relative mx-auto w-full max-w-7xl px-6 py-14 lg:px-12 md:py-20">
          <div className="max-w-md space-y-5">
            <h2 className="text-white text-5xl md:text-6xl font-bold tracking-tighter leading-none">
              Hacklytics.
            </h2>
            <p className="text-gray-200 leading-relaxed">
              Georgia Tech&apos;s premier{" "}
              <span className="text-white">36-hour datathon</span>. Hundreds of
              students, a weekend of data science challenges and workshops.
            </p>
            <Link
              href="/hacklytics"
              className="inline-flex items-center min-h-11 md:min-h-0 text-white font-mono text-xs uppercase tracking-[0.2em] border-b border-white/40 pb-1 hover:text-[#00A8A8] hover:border-[#00A8A8] transition-colors"
            >
              About Hacklytics →
            </Link>
          </div>
        </div>
      </section>

      {/* PROJECTS SECTION */}
      <Section
        id="projects"
        className="pt-24 pb-14 md:pt-36 md:pb-20 relative z-10"
      >
        <div className="max-w-7xl mx-auto px-6 lg:px-12">
          <h2 className="mb-8 md:mb-12 text-white text-5xl md:text-6xl font-bold tracking-tighter leading-none">
            Projects.
          </h2>

          {currentProjects.length === 0 ? (
            <p className="text-gray-300">
              The project roster is being updated —{" "}
              <Link
                href="/projects"
                className="text-[#00A8A8] hover:text-white transition-colors"
              >
                see all club projects
              </Link>
              .
            </p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {currentProjects.map((project) => {
                const logo = PROJECT_LOGOS[project.slug];
                const href = joinHref(project);
                const label = joinLabel(project);

                return (
                  <Card
                    key={project.id}
                    className="flex flex-col h-full bg-[#0a0a0a] border border-white/5 p-6 md:p-8 rounded-xl hover:border-[#00A8A8]/40 transition-all group shadow-2xl"
                  >
                    {logo && (
                      <div className="w-full flex justify-center mb-4 md:mb-6">
                        <div className="p-4 bg-white/5 rounded-xl group-hover:bg-[#00A8A8]/10 transition-all">
                          <Image
                            src={logo}
                            alt={project.name}
                            width={80}
                            height={80}
                            className="w-20 h-20 object-contain"
                            placeholder="blur"
                          />
                        </div>
                      </div>
                    )}
                    <h3 className="text-white text-xl font-bold text-center mb-2">
                      {project.name}
                    </h3>
                    <div className="flex justify-center mb-4">
                      <span
                        className={`px-2 py-0.5 text-[11px] font-mono rounded border uppercase tracking-widest ${STATUS_CLASSES[project.status]}`}
                      >
                        {STATUS_LABELS[project.status]}
                      </span>
                    </div>
                    <p className="text-sm text-gray-400 text-center mb-4 leading-relaxed">
                      {project.summary}
                    </p>
                    <p className="text-xs font-mono text-gray-400 text-center mb-6">
                      {project.leadName
                        ? `Lead: ${project.leadName}`
                        : "Lead: open"}
                    </p>
                    {isExternalJoin(project) ? (
                      <a
                        href={href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center justify-center min-h-11 md:min-h-0 text-[#00A8A8] font-mono text-xs uppercase mt-auto text-center hover:text-white transition-colors tracking-[0.2em]"
                      >
                        {label} →
                      </a>
                    ) : (
                      <Link
                        href={href}
                        className="inline-flex items-center justify-center min-h-11 md:min-h-0 text-[#00A8A8] font-mono text-xs uppercase mt-auto text-center hover:text-white transition-colors tracking-[0.2em]"
                      >
                        {label} →
                      </Link>
                    )}
                  </Card>
                );
              })}

              <Link
                href="/projects"
                className="bg-[#00A8A8] p-6 md:p-8 rounded-xl flex flex-col justify-between hover:bg-[#008f8f] transition-all shadow-xl shadow-[#00A8A8]/10 group"
              >
                <div className="space-y-4">
                  <h3 className="text-black text-2xl font-bold tracking-tight">
                    All projects.
                  </h3>
                  <p className="text-black/80 text-sm font-medium leading-relaxed">
                    Every project running this term, what each one needs, and
                    the archive of what members built before.
                  </p>
                </div>
                <span className="text-black font-mono text-[10px] uppercase tracking-[0.3em] pt-4 font-bold group-hover:translate-x-2 transition-transform">
                  Browse Projects →
                </span>
              </Link>
            </div>
          )}
        </div>
      </Section>

      {/* GET INVOLVED */}
      <Section
        id="getinvolved"
        className="pt-16 pb-14 md:pt-24 md:pb-20 bg-[#080808] relative z-10"
      >
        <div className="max-w-7xl mx-auto px-6 lg:px-12 grid items-center gap-10 lg:grid-cols-[3fr_2fr] lg:gap-20">
          <div>
            <h2 className="text-white text-5xl md:text-7xl font-bold tracking-tighter leading-none">
              Join DSGT.
            </h2>
            <p className="mt-5 max-w-md text-lg text-gray-300 leading-relaxed">
              Make an account to get weekly updates, sign up for the bootcamp,
              and find a club project.
            </p>
            <Link
              href="/login"
              className="mt-8 inline-flex min-h-14 w-full items-center justify-center rounded-sm bg-[#00A8A8] px-12 text-sm font-bold uppercase tracking-widest text-black transition-colors hover:bg-white sm:w-auto"
            >
              Join DSGT
            </Link>
            <ul className="mt-12 max-w-md divide-y divide-white/10 border-y border-white/10">
              {[
                {
                  href: "/team",
                  title: "Lead a team",
                  note: "Join the executive board.",
                },
                {
                  href: "/hacklytics",
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
                      className="text-[#00A8A8] transition-transform group-hover:translate-x-1"
                    >
                      →
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
          <Image
            src={slide1}
            alt="Members working on laptops at a DSGT workshop"
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
