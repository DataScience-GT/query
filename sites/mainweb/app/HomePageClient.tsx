"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import Image from "next/image";
import Link from "next/link";

import Navbar from "@/components/Navbar";
import Hero from "@/components/Hero";
import Section from "@/components/Section";
import Card from "@/components/Card";
import Footer from "@/components/Footer";

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
    <div className="h-64 w-64 flex items-center justify-center text-gray-500 font-mono text-xs">
      Loading charts…
    </div>
  ),
});

type PieTooltipItem = {
  label: string;
  parsed: number | null;
  dataset: { data: number[] };
};

const HomePageClient = () => {
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
          backgroundColor: "rgba(5, 5, 5, 0.95)",
          borderColor: "#00A8A8",
          borderWidth: 1,
          titleFont: { family: "IBM Plex Mono" },
          bodyFont: { family: "IBM Plex Mono" },
          padding: 12,
          cornerRadius: 0,
        },
        legend: {
          position: "bottom" as const,
          labels: {
            color: "#94a3b8",
            font: { family: "Source Sans 3", size: windowWidth < 640 ? 11 : 13 },
            padding: windowWidth < 640 ? 10 : 15,
            boxWidth: windowWidth < 640 ? 8 : 12,
          },
        },
      },
    }),
    [windowWidth],
  );

  return (
    <div
      id="home-page"
      className="site-shell selection:bg-[#00A8A8]/30 overflow-x-hidden"
    >
      <Navbar
        screen_width={windowWidth}
        page="home"
        className="fixed top-0 z-50"
      />
      <Hero screen_width={windowWidth} />

      <Section id="about" className="py-24 relative z-10">
        <div className="max-w-7xl mx-auto px-6 lg:px-12 grid lg:grid-cols-2 gap-16 items-center">
          <div className="space-y-6">
            <h2 className="page-title text-4xl md:text-5xl">About us</h2>
            <p className="page-lede border-l-2 border-[#00A8A8]/40 pl-5">
              As the{" "}
              <strong className="text-white font-semibold">
                largest student-run data science organization at Georgia Tech
              </strong>
              , we teach through club projects, workshops, and guest speakers —
              the same skills members later take into research and internships.
            </p>
            <Link href="/team" className="link-measure">
              Meet the team
            </Link>
          </div>
          <div className="relative">
            <Image
              src={squad}
              alt="DSGT Executive Board"
              className="relative border border-white/10"
              width={800}
              height={450}
              priority
              placeholder="blur"
            />
          </div>
        </div>
      </Section>

      <Section id="stats" className="py-24 relative z-10">
        <div className="max-w-7xl mx-auto px-6 lg:px-12">
          <div className="mb-14 space-y-3">
            <h2 className="page-title text-4xl md:text-5xl">Who shows up</h2>
            <p className="page-kicker">550+ verified members</p>
          </div>
          <div className="grid lg:grid-cols-2 gap-8 max-w-6xl mx-auto items-stretch">
            <div className="figure-card p-6 sm:p-10 flex flex-col items-center">
              <p className="text-sm text-white/60 mb-8 w-full text-center border-b border-white/10 pb-2">
                Class year
              </p>
              <div className="w-full relative flex items-center justify-center min-h-[300px] sm:min-h-[400px]">
                <div className="w-full h-full max-w-[320px] aspect-square">
                  {chartsReady ? (
                    <Pie data={ClassData} options={chartOptions} />
                  ) : (
                    <div className="h-full flex items-center justify-center text-gray-500 font-mono text-xs">
                      Loading charts…
                    </div>
                  )}
                </div>
              </div>
            </div>
            <div className="figure-card p-6 sm:p-10 flex flex-col items-center">
              <p className="text-sm text-white/60 mb-8 w-full text-center border-b border-white/10 pb-2">
                Major
              </p>
              <div className="w-full relative flex items-center justify-center min-h-[300px] sm:min-h-[400px]">
                <div className="w-full h-full max-w-[320px] aspect-square">
                  {chartsReady ? (
                    <Pie data={MajorData} options={chartOptions} />
                  ) : (
                    <div className="h-full flex items-center justify-center text-gray-500 font-mono text-xs">
                      Loading charts…
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </Section>

      <Section id="bootcamp" className="py-24 relative z-10">
        <div className="max-w-7xl mx-auto px-6 lg:px-12 grid lg:grid-cols-2 gap-20 items-center">
          <div className="order-2 lg:order-1 relative">
            <Image
              src={slide9}
              alt="Bootcamp Session"
              className="border border-white/10"
              width={600}
              height={400}
              placeholder="blur"
            />
          </div>
          <div className="space-y-6 order-1 lg:order-2">
            <h2 className="page-title text-4xl md:text-5xl">Bootcamp</h2>
            <p className="page-lede border-l-2 border-[#00A8A8]/40 pl-5">
              Twelve weeks from data cleaning to model building. Python and
              pandas, taught through project work rather than slides.
            </p>
            <Link href="/bootcamp" className="btn-solid">
              See this year&apos;s bootcamp
            </Link>
          </div>
        </div>
      </Section>

      <Section id="golden-byte" className="py-24 relative z-10">
        <div className="max-w-7xl mx-auto px-6 lg:px-12 grid lg:grid-cols-2 gap-20 items-center">
          <div className="space-y-6">
            <h2 className="page-title text-4xl md:text-5xl">Hacklytics</h2>
            <p className="page-lede border-l-2 border-[#00A8A8]/40 pl-5">
              Georgia Tech&apos;s 36-hour datathon. Hundreds of students, a
              weekend of data science challenges, and workshops that run all
              night.
            </p>
            <a
              href="https://hacklytics-2025.devpost.com/"
              target="_blank"
              rel="noopener noreferrer"
              className="btn-line"
            >
              View last year&apos;s Devpost
            </a>
          </div>
          <div className="relative">
            <Image
              src={slide6}
              alt="Hacklytics Event"
              className="border border-white/10"
              width={600}
              height={400}
              placeholder="blur"
            />
          </div>
        </div>
      </Section>

      <Section id="projects" className="py-24 relative z-10">
        <div className="max-w-7xl mx-auto px-6 lg:px-12">
          <div className="mb-12 space-y-2">
            <h2 className="page-title text-4xl md:text-5xl">Projects</h2>
            <p className="page-kicker">What members are building</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <Card className="figure-card flex flex-col justify-between h-full p-8">
              <div className="w-full flex justify-center mb-6">
                <Image
                  src={arc}
                  alt="ARC"
                  width={80}
                  height={80}
                  className="w-20 h-20 object-contain"
                  placeholder="blur"
                />
              </div>
              <h3 className="text-white text-xl font-display text-center mb-2">
                ARC Research
              </h3>
              <div className="flex justify-center mb-4">
                <span className="px-2 py-0.5 text-xs font-mono text-[#00A8A8] border border-[#00A8A8]/30">
                  Active
                </span>
              </div>
              <p className="text-sm text-gray-400 text-center mb-6 leading-relaxed">
                ML competition group focusing on Kaggle and TREC research
                tracks.
              </p>
              <a
                href="https://dsgt-arc.org/"
                target="_blank"
                rel="noopener noreferrer"
                className="link-measure mt-auto text-center"
              >
                Visit ARC
              </a>
            </Card>

            <Card className="figure-card flex flex-col justify-between h-full p-8">
              <div className="w-full flex justify-center mb-6">
                <Image
                  src={stock}
                  alt="Robo"
                  width={80}
                  height={80}
                  className="w-20 h-20 object-contain"
                  placeholder="blur"
                />
              </div>
              <h3 className="text-white text-xl font-display text-center mb-2">
                Roboinvesting
              </h3>
              <div className="flex justify-center mb-4">
                <span className="px-2 py-0.5 text-xs font-mono text-[#00A8A8] border border-[#00A8A8]/30">
                  Active
                </span>
              </div>
              <p className="text-sm text-gray-400 text-center mb-6 leading-relaxed">
                ML-driven trading simulations analyzing technical indicators.
              </p>
              <a
                href="mailto:bjmichaels.25@gmail.com"
                className="link-measure mt-auto text-center"
              >
                Contact the team
              </a>
            </Card>

            <Card className="figure-card flex flex-col justify-between h-full p-8">
              <div className="w-full flex justify-center mb-6">
                <Image
                  src={trading}
                  alt="AI"
                  width={80}
                  height={80}
                  className="w-20 h-20 object-contain"
                  placeholder="blur"
                />
              </div>
              <h3 className="text-white text-xl font-display text-center mb-2">
                AI Trading Agent
              </h3>
              <div className="flex justify-center mb-4">
                <span className="px-2 py-0.5 text-xs font-mono text-[#00A8A8] border border-[#00A8A8]/30">
                  Active
                </span>
              </div>
              <p className="text-sm text-gray-400 text-center mb-6 leading-relaxed">
                Conversational AI tools for real-time portfolio management.
              </p>
              <a
                href="mailto:wesleylu@gatech.edu"
                className="link-measure mt-auto text-center"
              >
                Contact the team
              </a>
            </Card>

            <Card className="figure-card flex flex-col justify-between h-full p-8 opacity-80">
              <div className="w-full flex justify-center mb-6">
                <Image
                  src={gtaa}
                  alt="Sports"
                  width={100}
                  height={100}
                  className="w-24 h-24 object-contain"
                  placeholder="blur"
                />
              </div>
              <h3 className="text-white text-xl font-display text-center mb-2">
                Sports Analytics
              </h3>
              <div className="flex justify-center mb-4">
                <span className="px-2 py-0.5 text-xs font-mono text-red-400 border border-red-500/30">
                  Closed
                </span>
              </div>
              <p className="text-sm text-gray-500 text-center leading-relaxed">
                NFL projections and NBA roster optimization using advanced
                stats.
              </p>
            </Card>

            <Link
              href="/projects"
              className="bg-[#00A8A8] p-8 flex flex-col justify-between hover:bg-[#008f8f] transition-ui group"
            >
              <div className="space-y-4">
                <h3 className="text-black text-2xl font-display tracking-tight">
                  Past archive
                </h3>
                <p className="text-black/80 text-sm leading-relaxed">
                  Five years of machine learning projects built by DSGT members.
                </p>
              </div>
              <span className="text-black text-sm pt-4 font-semibold">
                Browse past projects
              </span>
            </Link>
          </div>
        </div>
      </Section>

      <Section id="getinvolved" className="py-24 relative z-10">
        <div className="max-w-7xl mx-auto px-6 lg:px-12">
          <div className="mb-14 space-y-3">
            <h2 className="page-title text-4xl md:text-5xl">Get involved</h2>
            <p className="page-kicker">
              Georgia Tech&apos;s primary data science organization
            </p>
          </div>
          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                t: "Member",
                d: "Join the mailing list for weekly updates.",
                i: slide1,
                l: "/login",
                a: "Join here",
              },
              {
                t: "Leadership",
                d: "Join the executive board and lead teams.",
                i: slide7,
                l: "/team",
                a: "Meet the team",
              },
              {
                t: "Hacklytics",
                d: "Attend our 36-hour flagship datathon.",
                i: slide6,
                l: "https://hacklytics-2025.devpost.com/",
                a: "View Devpost",
              },
            ].map((event) => (
              <div key={event.t} className="figure-card overflow-hidden">
                <div className="h-56 overflow-hidden relative">
                  <Image
                    src={event.i}
                    alt={event.t}
                    className="w-full h-full object-cover"
                    placeholder="blur"
                  />
                </div>
                <div className="p-8 space-y-3">
                  <h3 className="text-white text-xl font-display">{event.t}</h3>
                  <p className="text-sm text-gray-400 leading-relaxed">
                    {event.d}
                  </p>
                  {event.l.startsWith("http") ? (
                    <a
                      href={event.l}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="link-measure"
                    >
                      {event.a}
                    </a>
                  ) : (
                    <Link href={event.l} className="link-measure">
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
  );
};

export default HomePageClient;
