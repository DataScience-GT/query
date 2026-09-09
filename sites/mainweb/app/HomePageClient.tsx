"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import Image from "next/image";
import Link from "next/link";

import {
  STATUS_CLASSES,
  STATUS_LABELS,
  groupClubProjects,
  isExternalJoin,
  joinHref,
  joinLabel,
} from "@/lib/club-projects";
import type { ClubProjectCard } from "@/lib/club-projects";

import Navbar from "@/components/Navbar";
import Hero from "@/components/Hero";
import Section from "@/components/Section";
import Card from "@/components/Card";
import Footer from "@/components/Footer";
import PublicFrame from "@/components/PublicFrame";

import dynamic from "next/dynamic";
import { ClassData, MajorData } from "@/assets/Data/demographics";

import slide1 from "@/assets/images/slides/slide1.jpg";
import squad from "@/assets/images/2025/squad.jpg";
import slide6 from "@/assets/images/slides/slide6.jpg";
import slide7 from "@/assets/images/slides/slide7.jpg";
import slide9 from "@/assets/images/slides/slide9.jpg";
import arc from "@/assets/images/logos/arc-logo-v3.png";
import gtaa from "@/assets/images/logos/gtaa.png";
import stock from "@/assets/images/logos/stock.png";
import trading from "@/assets/images/logos/trading.png";

const Pie = dynamic(() => import("react-chartjs-2").then((mod) => mod.Pie), {
  ssr: false,
  loading: () => (
    <div className="h-64 w-64 flex items-center justify-center text-[var(--muted)] font-mono text-xs uppercase tracking-widest">
      Loading charts…
    </div>
  ),
});

type PieTooltipItem = {
  label: string;
  parsed: number | null;
  dataset: { data: number[] };
};

const PROJECT_LOGOS: Record<string, string> = {
  arc,
  roboinvesting: stock,
  "sports-analytics": gtaa,
  "dsgt-website": trading,
};

const HomePageClient = ({ projects }: { projects: ClubProjectCard[] }) => {
  const [windowWidth, setWindowWidth] = useState<number>(1024);
  const [chartsReady, setChartsReady] = useState(false);

  useEffect(() => {
    import("chart.js").then(({ Chart, ArcElement, Tooltip, Legend }) => {
      Chart.register(ArcElement, Tooltip, Legend);
      setChartsReady(true);
    });
  }, []);

  const handleResize = useCallback(() => {
    setWindowWidth(window.innerWidth);
  }, []);

  useEffect(() => {
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [handleResize]);

  const chartOptions = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: true,
      plugins: {
        tooltip: {
          callbacks: {
            label: (context: PieTooltipItem) => {
              const data = context.dataset.data as number[];
              const sum = data.reduce((a, b) => a + b, 0);
              const value = context.parsed;
              if (value === null) return `${context.label}: N/A`;
              const percent = Math.round((value * 1000) / sum) / 10;
              return ` ${context.label}: ${value} (${percent}%)`;
            },
          },
          backgroundColor: "#1c2433",
          borderColor: "#f5c400",
          borderWidth: 1,
          titleFont: { family: "monospace" },
          bodyFont: { family: "monospace" },
          padding: 12,
          cornerRadius: 0,
        },
        legend: {
          position: "bottom" as const,
          labels: {
            color: "#3a4454",
            font: { family: "monospace", size: windowWidth < 640 ? 10 : 11 },
            padding: windowWidth < 640 ? 10 : 15,
            boxWidth: windowWidth < 640 ? 8 : 12,
          },
        },
      },
    }),
    [windowWidth],
  );

  const { current: currentProjects } = groupClubProjects(projects);

  return (
    <PublicFrame note="n = 550+ · Fall 2026">
      <div id="home-page" className="relative overflow-x-hidden">
        <Navbar screen_width={windowWidth} page="home" />
        <Hero screen_width={windowWidth} />

        <Section id="about" className="py-28 relative z-10">
          <div className="max-w-7xl mx-auto px-2 lg:px-4 grid lg:grid-cols-2 gap-16 items-center">
            <div className="space-y-8">
              <p className="public-kicker">Who we are</p>
              <h2 className="public-display text-4xl md:text-6xl">
                A lab that meets after class.
              </h2>
              <p className="public-lede max-w-xl">
                As the{" "}
                <strong className="text-[var(--ink)] font-semibold">
                  largest student-run data science organization at Georgia Tech
                </strong>
                , we teach by shipping: club projects, workshops, and speakers
                who still have chalk on their sleeves.
              </p>
              <Link
                href="/team"
                className="public-link inline-flex items-center min-h-11"
              >
                Meet the team →
              </Link>
            </div>
            <div className="relative">
              <Image
                src={squad}
                alt="DSGT Executive Board"
                className="relative border border-[var(--rule)]"
                width={800}
                height={450}
                priority
                placeholder="blur"
              />
            </div>
          </div>
        </Section>

        <Section id="stats" className="py-28 relative z-10">
          <div className="max-w-7xl mx-auto px-2 lg:px-4">
            <div className="mb-16 space-y-4 max-w-2xl">
              <p className="public-kicker">The room</p>
              <h2 className="public-display text-4xl md:text-5xl">
                550+ verified members, plotted.
              </h2>
            </div>
            <div className="grid lg:grid-cols-2 gap-8 max-w-6xl items-stretch">
              <div className="public-card p-6 sm:p-10 flex flex-col items-center">
                <p className="public-kicker mb-10 w-full text-center">
                  Class year
                </p>
                <div className="w-full relative flex items-center justify-center min-h-[300px] sm:min-h-[400px]">
                  <div className="w-full h-full max-w-[320px] aspect-square">
                    {chartsReady ? (
                      <Pie data={ClassData} options={chartOptions} />
                    ) : (
                      <div className="h-full flex items-center justify-center text-[var(--muted)] font-mono text-xs uppercase tracking-widest">
                        Loading charts…
                      </div>
                    )}
                  </div>
                </div>
              </div>
              <div className="public-card p-6 sm:p-10 flex flex-col items-center">
                <p className="public-kicker mb-10 w-full text-center">
                  Academic major
                </p>
                <div className="w-full relative flex items-center justify-center min-h-[300px] sm:min-h-[400px]">
                  <div className="w-full h-full max-w-[320px] aspect-square">
                    {chartsReady ? (
                      <Pie data={MajorData} options={chartOptions} />
                    ) : (
                      <div className="h-full flex items-center justify-center text-[var(--muted)] font-mono text-xs uppercase tracking-widest">
                        Loading charts…
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </Section>

        <Section id="bootcamp" className="py-28 relative z-10">
          <div className="max-w-7xl mx-auto px-2 lg:px-4 grid lg:grid-cols-2 gap-20 items-center">
            <div className="order-2 lg:order-1">
              <Image
                src={slide9}
                alt="Bootcamp Session"
                className="border border-[var(--rule)]"
                width={600}
                height={400}
                placeholder="blur"
              />
            </div>
            <div className="space-y-8 order-1 lg:order-2">
              <p className="public-kicker">Twelve weeks</p>
              <h2 className="public-display text-4xl md:text-6xl">
                Bootcamp is a notebook you finish.
              </h2>
              <p className="public-lede">
                Core skills from data cleaning to model building. Python and
                pandas, taught through work you can put in a repo.
              </p>
              <Link href="/bootcamp" className="public-btn">
                Open bootcamp
              </Link>
            </div>
          </div>
        </Section>

        <Section id="golden-byte" className="py-28 relative z-10">
          <div className="max-w-7xl mx-auto px-2 lg:px-4 grid lg:grid-cols-2 gap-20 items-center">
            <div className="space-y-8">
              <p className="public-kicker">36 hours</p>
              <h2 className="public-display text-4xl md:text-6xl">
                Hacklytics is the loud weekend.
              </h2>
              <p className="public-lede">
                Georgia Tech&apos;s premier{" "}
                <span className="text-[var(--ink)] font-semibold">
                  36-hour datathon
                </span>
                . Hundreds of students, one weekend of data science challenges
                and workshops.
              </p>
              <a
                href="https://hacklytics-2025.devpost.com/"
                target="_blank"
                rel="noopener noreferrer"
                className="public-btn-ghost text-[var(--ink)]"
              >
                View Devpost
              </a>
            </div>
            <Image
              src={slide6}
              alt="Hacklytics Event"
              className="border border-[var(--rule)]"
              width={600}
              height={400}
              placeholder="blur"
            />
          </div>
        </Section>

        <Section id="projects" className="py-28 relative z-10">
          <div className="max-w-7xl mx-auto px-2 lg:px-4">
            <div className="mb-16 space-y-3">
              <p className="public-kicker">On the bench</p>
              <h2 className="public-display text-4xl md:text-6xl">Projects</h2>
            </div>

            {currentProjects.length === 0 ? (
              <p className="public-lede">
                The project roster is being updated —{" "}
                <Link href="/projects" className="public-link">
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
                      className="public-card flex flex-col h-full p-8"
                    >
                      {logo && (
                        <div className="w-full flex justify-center mb-6">
                          <Image
                            src={logo}
                            alt={project.name}
                            width={80}
                            height={80}
                            className="w-20 h-20 object-contain"
                            placeholder="blur"
                          />
                        </div>
                      )}
                      <h3 className="public-display text-xl text-center mb-2">
                        {project.name}
                      </h3>
                      <div className="flex justify-center mb-4">
                        <span
                          className={`public-chip ${STATUS_CLASSES[project.status]}`}
                        >
                          {STATUS_LABELS[project.status]}
                        </span>
                      </div>
                      <p className="text-sm text-center mb-4 leading-relaxed">
                        {project.summary}
                      </p>
                      <p className="public-kicker text-center mb-6 !normal-case tracking-widest">
                        {project.leadName
                          ? `Lead · ${project.leadName}`
                          : "Lead · Open"}
                      </p>
                      {isExternalJoin(project) ? (
                        <a
                          href={href}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="public-link inline-flex items-center justify-center min-h-11 mt-auto text-center"
                        >
                          {label} →
                        </a>
                      ) : (
                        <Link
                          href={href}
                          className="public-link inline-flex items-center justify-center min-h-11 mt-auto text-center"
                        >
                          {label} →
                        </Link>
                      )}
                    </Card>
                  );
                })}

                <Link
                  href="/projects"
                  className="bg-[var(--navy)] p-8 flex flex-col justify-between min-h-[280px] group"
                >
                  <div className="space-y-4">
                    <h3 className="public-display public-display-invert text-2xl">
                      All projects
                    </h3>
                    <p className="public-lede-invert text-sm leading-relaxed">
                      Every project running this term, what each one needs, and
                      the archive of what members built before.
                    </p>
                  </div>
                  <span className="public-ui text-[var(--buzz)] pt-4">
                    Browse projects →
                  </span>
                </Link>
              </div>
            )}
          </div>
        </Section>

        <Section id="getinvolved" className="py-28 relative z-10">
          <div className="max-w-7xl mx-auto px-2 lg:px-4">
            <div className="mb-16 space-y-3">
              <p className="public-kicker">Three doors in</p>
              <h2 className="public-display text-4xl md:text-5xl">
                Get involved
              </h2>
            </div>
            <div className="grid md:grid-cols-3 gap-8">
              {[
                {
                  t: "Member",
                  d: "Join the mailing list for weekly updates.",
                  i: slide1,
                  l: "/login",
                  a: "Join here →",
                },
                {
                  t: "Leadership",
                  d: "Join the executive board and lead teams.",
                  i: slide7,
                  l: "/team",
                  a: "Meet the team →",
                },
                {
                  t: "Hacklytics",
                  d: "Attend our 36-hour flagship datathon.",
                  i: slide6,
                  l: "https://hacklytics-2025.devpost.com/",
                  a: "View Devpost →",
                },
              ].map((event) => (
                <div key={event.t} className="public-card overflow-hidden">
                  <div className="h-56 overflow-hidden relative">
                    <Image
                      src={event.i}
                      alt={event.t}
                      className="w-full h-full object-cover"
                      placeholder="blur"
                    />
                  </div>
                  <div className="p-8 space-y-4">
                    <h3 className="public-display text-xl">{event.t}</h3>
                    <p className="text-sm leading-relaxed">{event.d}</p>
                    {event.l.startsWith("http") ? (
                      <a
                        href={event.l}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="public-link inline-flex items-center min-h-11"
                      >
                        {event.a}
                      </a>
                    ) : (
                      <Link
                        href={event.l}
                        className="public-link inline-flex items-center min-h-11"
                      >
                        {event.a}
                      </Link>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Section>

        <Footer screen_width={windowWidth} />
      </div>
    </PublicFrame>
  );
};

export default HomePageClient;
