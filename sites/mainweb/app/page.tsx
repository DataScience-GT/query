// src/app/page.tsx
"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import Image from "next/image";
import Link from "next/link";

import Background from "@/components/Background";
import Navbar from "@/components/Navbar";
import Hero from "@/components/Hero";
import Section from "@/components/Section";
import Card from "@/components/Card";
import Footer from "@/components/Footer";

import { Chart as ChartJS, ArcElement, Tooltip, Legend, TooltipItem } from "chart.js";
import dynamic from "next/dynamic";
import { ClassData, MajorData } from "@/assets/Data/demographics";

import slide1 from "@/assets/images/slides/slide1.jpg";
import squad from "@/assets/images/2025/squad.jpg";
import slide6 from "@/assets/images/slides/slide6.jpg";
import slide7 from "@/assets/images/slides/slide7.jpg";
import slide8 from "@/assets/images/slides/slide8.jpg";
import arc from "@/assets/images/logos/arc-logo-v3.png";
import gtaa from "@/assets/images/logos/gtaa.png";
import stock from "@/assets/images/logos/stock.png"
import trading from "@/assets/images/logos/trading.png"

const Pie = dynamic(() => import("react-chartjs-2").then(mod => mod.Pie), {
  ssr: false,
  loading: () => <div className="h-80 w-80 flex items-center justify-center text-gray-500 font-mono text-xs uppercase tracking-widest">Initializing Analytics...</div>
});

ChartJS.register(ArcElement, Tooltip, Legend);

type PieTooltipItem = TooltipItem<'pie'>;

const Home = () => {
  const [windowWidth, setWindowWidth] = useState<number>(1024);

  const handleResize = useCallback(() => {
    setWindowWidth(window.innerWidth);
  }, []);

  useEffect(() => {
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [handleResize]);

  const chartOptions = useMemo(() => ({
    responsive: true,
    maintainAspectRatio: false, // Changed to false to allow container to control size
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
        backgroundColor: 'rgba(10, 10, 10, 0.9)',
        titleFont: { family: 'monospace' },
        bodyFont: { family: 'monospace' },
        padding: 12,
        cornerRadius: 4,
      },
      legend: {
        position: 'bottom' as const,
        labels: {
          color: '#94a3b8',
          font: { family: 'monospace', size: 11 },
          padding: 15,
          boxWidth: 12
        }
      }
    },
    layout: {
      padding: {
        bottom: 10 // Extra room for the legend
      }
    }
  }), []);

  return (
    <div id="home-page" className="relative bg-[#050505] text-gray-400 selection:bg-indigo-500/30 overflow-x-hidden">
      <Background className="fixed inset-0 z-0 opacity-20" />
      <Navbar screen_width={windowWidth} page="home" className="fixed top-0 z-50 border-b border-white/5 bg-[#050505]/80 backdrop-blur-md" />
      <Hero screen_width={windowWidth} />

      {/* ABOUT SECTION */}
      <Section id="about" className="py-32">
        <div className="max-w-7xl mx-auto px-6 lg:px-12 grid lg:grid-cols-2 gap-16 items-center">
          <div className="space-y-8">
            <h2 className="text-white text-5xl md:text-6xl font-bold tracking-tighter italic">About Us.</h2>
            <p className="text-lg text-gray-300 leading-relaxed max-w-xl">
              As the <strong>largest student-run data science organization at Georgia Tech</strong>, we provide technical skill development via club projects, workshops, and guest speakers.
            </p>
            <Link href="/team" className="inline-block text-indigo-400 font-mono text-xs uppercase tracking-widest border-b border-indigo-400/30 pb-1">
              Meet the Team →
            </Link>
          </div>
          <div className="relative">
            <Image src={squad} alt="Team" className="rounded-xl border border-white/10" width={800} height={450} priority />
          </div>
        </div>
      </Section>

      {/* STATS SECTION - FIXED OVERFLOW */}
      <Section id="stats" className="py-32 border-y border-white/5">
        <div className="max-w-7xl mx-auto px-6 lg:px-12">
          <div className="text-center mb-20 space-y-4">
            <h2 className="text-white text-4xl font-bold tracking-tight italic">Our Ecosystem.</h2>
            <p className="font-mono text-xs text-indigo-500 uppercase tracking-[0.3em]">550+ Members</p>
          </div>
          <div className="grid lg:grid-cols-2 gap-8 max-w-6xl mx-auto items-stretch">
            {/* Class Card */}
            <div className="bg-[#0a0a0a] border border-white/5 p-8 sm:p-10 rounded-3xl flex flex-col items-center min-h-[500px]">
              <p className="text-[10px] font-mono text-gray-600 mb-10 uppercase tracking-widest border-b border-white/5 pb-2 w-full text-center">Class Year</p>
              <div className="flex-grow w-full relative flex items-center justify-center">
                <div className="w-full h-full max-h-[350px]">
                  <Pie data={ClassData} options={chartOptions} />
                </div>
              </div>
            </div>
            {/* Major Card - Fixed Cutting Off */}
            <div className="bg-[#0a0a0a] border border-white/5 p-8 sm:p-10 rounded-3xl flex flex-col items-center min-h-[500px]">
              <p className="text-[10px] font-mono text-gray-600 mb-10 uppercase tracking-widest border-b border-white/5 pb-2 w-full text-center">Major</p>
              <div className="flex-grow w-full relative flex items-center justify-center">
                <div className="w-full h-full max-h-[350px]">
                  <Pie data={MajorData} options={chartOptions} />
                </div>
              </div>
            </div>
          </div>
        </div>
      </Section>

      {/* BOOTCAMP SECTION */}
      <Section id="bootcamp" className="py-32">
        <div className="max-w-7xl mx-auto px-6 lg:px-12 grid lg:grid-cols-2 gap-16 items-center">
          <Image src={slide8} alt="Bootcamp" className="rounded-xl border border-white/10" width={600} height={400} />
          <div className="space-y-8">
            <h2 className="text-white text-5xl md:text-6xl font-bold tracking-tighter italic">Bootcamp.</h2>
            <p className="text-gray-300 leading-relaxed">
              Teaching core skills from <strong>data cleaning</strong> to <strong>model building</strong>. Learn <strong>Python</strong> and <strong>pandas</strong> through hands-on work.
            </p>
            <Link href="/bootcamp" className="inline-block bg-white text-black px-8 py-3 rounded-md font-bold text-xs hover:bg-gray-200 transition-all">
              Go to Bootcamp Site
            </Link>
          </div>
        </div>
      </Section>

      {/* HACKLYTICS SECTION */}
      <Section id="golden-byte" className="py-32 border-y border-white/5">
        <div className="max-w-7xl mx-auto px-6 lg:px-12 grid lg:grid-cols-2 gap-16 items-center">
          <div className="space-y-8">
            <h2 className="text-white text-5xl md:text-6xl font-bold tracking-tighter italic">Hacklytics.</h2>
            <p className="text-gray-300 leading-relaxed">
              Georgia Tech's premier <strong>36-hour datathon</strong>. Join hundreds of students for data science challenges and prizes.
            </p>
            <a href="https://hacklytics.io" target="_blank" className="inline-block border border-white/10 text-white px-8 py-3 rounded-md font-bold text-xs hover:bg-white/5 transition-all">
              Register for 2026
            </a>
          </div>
          <Image src={slide6} alt="Hacklytics" className="rounded-xl border border-white/10" width={600} height={400} />
        </div>
      </Section>

      {/* PROJECTS SECTION */}
      <Section id="projects" className="py-32">
        <div className="max-w-7xl mx-auto px-6 lg:px-12">
          <div className="mb-16">
            <h2 className="text-white text-5xl md:text-6xl font-bold tracking-tighter italic">Projects.</h2>
            <p className="font-mono text-xs text-indigo-500 uppercase tracking-widest mt-2">Hands-on Engineering</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <Card className="flex flex-col justify-between h-full bg-[#0a0a0a] border border-white/5 p-8 rounded-xl hover:border-indigo-500/40 transition-all">
              <div className="w-full flex justify-center mb-6"><div className="p-4 bg-white rounded-xl"><Image src={arc} alt="ARC" width={80} height={80} className="w-20 h-20 object-contain" /></div></div>
              <h3 className="text-white text-xl font-bold text-center mb-2">ARC Research</h3>
              <div className="flex justify-center mb-4"><span className="px-2 py-0.5 text-[10px] font-mono rounded bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 uppercase">Active</span></div>
              <p className="text-sm text-gray-400 text-center mb-6">ML competition group focusing on Kaggle and CLEF research.</p>
              <a href="https://dsgt-arc.org/" target="_blank" className="text-indigo-400 font-mono text-[10px] uppercase mt-auto">Learn More →</a>
            </Card>

            <Card className="flex flex-col justify-between h-full bg-[#0a0a0a] border border-white/5 p-8 rounded-xl hover:border-indigo-500/40 transition-all">
              <div className="w-full flex justify-center mb-6"><div className="p-4 bg-white rounded-xl"><Image src={stock} alt="Robo" width={80} height={80} className="w-20 h-20 object-contain" /></div></div>
              <h3 className="text-white text-xl font-bold text-center mb-2">Roboinvesting</h3>
              <div className="flex justify-center mb-4"><span className="px-2 py-0.5 text-[10px] font-mono rounded bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 uppercase">Active</span></div>
              <p className="text-sm text-gray-400 text-center mb-6">Trading simulation analyzing technical indicators for financial modeling.</p>
              <a href="mailto:bjmichaels.25@gmail.com" className="text-indigo-400 font-mono text-[10px] uppercase mt-auto">Contact Lead →</a>
            </Card>

            <Card className="flex flex-col justify-between h-full bg-[#0a0a0a] border border-white/5 p-8 rounded-xl hover:border-indigo-500/40 transition-all">
              <div className="w-full flex justify-center mb-6"><div className="p-4 bg-white rounded-xl"><Image src={trading} alt="AI" width={80} height={80} className="w-20 h-20 object-contain" /></div></div>
              <h3 className="text-white text-xl font-bold text-center mb-2">AI Trading Agent</h3>
              <div className="flex justify-center mb-4"><span className="px-2 py-0.5 text-[10px] font-mono rounded bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 uppercase">Active</span></div>
              <p className="text-sm text-gray-400 text-center mb-6">Conversational AI tool for real-time portfolio management using NLP.</p>
              <a href="mailto:wesleylu@gatech.edu" className="text-indigo-400 font-mono text-[10px] uppercase mt-auto">Contact Lead →</a>
            </Card>

            <Card className="flex flex-col justify-between h-full bg-[#0a0a0a] border border-white/5 p-8 rounded-xl opacity-80">
              <div className="w-full flex justify-center mb-6"><Image src={gtaa} alt="Sports" width={100} height={100} className="w-24 h-24 object-contain" /></div>
              <h3 className="text-white text-xl font-bold text-center mb-2">Sports Analytics</h3>
              <div className="flex justify-center mb-4"><span className="px-2 py-0.5 text-[10px] font-mono rounded bg-red-500/10 text-red-400 border border-red-500/20 uppercase">Closed</span></div>
              <p className="text-sm text-gray-500 text-center">Exploratory research including NFL projections and NBA roster optimization.</p>
            </Card>

            <Link href="/projects" className="bg-indigo-600 p-8 rounded-xl flex flex-col justify-between hover:bg-indigo-500 transition-all">
              <h3 className="text-white text-2xl font-bold tracking-tight italic">Past Archive</h3>
              <p className="text-indigo-100 text-sm my-4 font-medium leading-relaxed">View all engineering projects built by our members over the years.</p>
              <span className="text-white font-mono text-[10px] uppercase tracking-widest">Browse Archive →</span>
            </Link>
          </div>
        </div>
      </Section>

      {/* GET INVOLVED */}
      <Section id="getinvolved" className="py-32 bg-[#080808]">
        <div className="max-w-7xl mx-auto px-6 lg:px-12">
          <div className="text-center mb-20 space-y-4">
            <h2 className="text-white text-4xl font-bold italic tracking-tight">Get Involved.</h2>
            <p className="font-mono text-[10px] text-gray-600 uppercase tracking-widest font-bold underline decoration-indigo-500 underline-offset-8">Largest Technical Org at GT</p>
          </div>
          <div className="grid md:grid-cols-3 gap-6">
            {[
              { t: "Member", d: "Join the mailing list.", i: slide1, l: "https://member.datasciencegt.org/" },
              { t: "Leadership", d: "Join the executive teams.", i: slide7, l: "/tbd" },
              { t: "Hacklytics", d: "36-hour datathon. Feb 20-22.", i: slide6, l: "https://hacklytics.io/" }
            ].map((event, i) => (
              <div key={i} className="bg-[#0a0a0a] border border-white/5 rounded-xl overflow-hidden group hover:border-indigo-500/30 transition-all">
                <div className="h-48 overflow-hidden"><Image src={event.i} alt={event.t} className="w-full h-full object-cover group-hover:scale-105 transition-all duration-700" /></div>
                <div className="p-6 space-y-4">
                  <h4 className="text-white font-bold">{event.t}</h4>
                  <p className="text-xs text-gray-500 leading-relaxed">{event.d}</p>
                  {event.l.startsWith("http") ? (
                    <a href={event.l} target="_blank" rel="noopener noreferrer" className="block text-[10px] font-mono text-indigo-400 uppercase tracking-widest hover:text-indigo-300">Apply Now →</a>
                  ) : (
                    <Link href={event.l} className="block text-[10px] font-mono text-indigo-400 uppercase tracking-widest hover:text-indigo-300">Apply Now →</Link>
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

export default Home;