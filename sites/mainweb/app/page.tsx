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
import slide9 from "@/assets/images/slides/slide9.jpg";
import arc from "@/assets/images/logos/arc-logo-v3.png";
import gtaa from "@/assets/images/logos/gtaa.png";
import stock from "@/assets/images/logos/stock.png";
import trading from "@/assets/images/logos/trading.png";

const Pie = dynamic(() => import("react-chartjs-2").then(mod => mod.Pie), {
  ssr: false,
  loading: () => <div className="h-64 w-64 flex items-center justify-center text-gray-500 font-mono text-xs uppercase tracking-widest">Initializing Analytics...</div>
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
        backgroundColor: 'rgba(5, 5, 5, 0.95)',
        borderColor: '#00A8A8',
        borderWidth: 1,
        titleFont: { family: 'monospace' },
        bodyFont: { family: 'monospace' },
        padding: 12,
        cornerRadius: 4,
      },
      legend: {
        position: 'bottom' as const,
        labels: {
          color: '#94a3b8',
          font: { family: 'monospace', size: windowWidth < 640 ? 10 : 11 },
          padding: windowWidth < 640 ? 10 : 15,
          boxWidth: windowWidth < 640 ? 8 : 12,
        }
      }
    },
  }), [windowWidth]);

  return (
    <div id="home-page" className="relative bg-[#050505] text-gray-400 selection:bg-[#00A8A8]/30 overflow-x-hidden">
      {/* FIX: Reduced Background opacity to prevent monotone overlay feel */}
      <Background className="fixed inset-0 z-0 opacity-[0.05]" />

      <Navbar screen_width={windowWidth} page="home" className="fixed top-0 z-50 border-b border-white/5 bg-[#050505]/80 backdrop-blur-md" />
      <Hero screen_width={windowWidth} />

      {/* ABOUT SECTION */}
      <Section id="about" className="py-32 relative z-10">
        <div className="max-w-7xl mx-auto px-6 lg:px-12 grid lg:grid-cols-2 gap-16 items-center">
          <div className="space-y-8">
            <h2 className="text-white text-5xl md:text-6xl font-bold tracking-tighter italic leading-none uppercase">About Us.</h2>
            <p className="text-lg text-gray-300 leading-relaxed max-w-xl italic border-l-2 border-[#00A8A8]/20 pl-6">
              As the <strong className="text-white">largest student-run data science organization at Georgia Tech</strong>, we provide technical skill development via club projects, workshops, and guest speakers.
            </p>
            <Link href="/team" className="inline-block text-[#00A8A8] font-mono text-xs uppercase tracking-[0.2em] border-b border-[#00A8A8]/30 pb-1 hover:text-white transition-colors">
              Meet the Team →
            </Link>
          </div>
          <div className="relative group">
            <div className="absolute -inset-1 bg-[#00A8A8]/20 rounded-xl blur-lg opacity-0 group-hover:opacity-100 transition duration-500"></div>
            {/* FIX: Removed grayscale by default to restore image color */}
            <Image src={squad} alt="DSGT Executive Board" className="relative rounded-xl border border-white/10 shadow-2xl transition-all duration-700" width={800} height={450} priority />
          </div>
        </div>
      </Section>

      {/* STATS SECTION */}
      <Section id="stats" className="py-32 border-y border-white/5 bg-white/[0.01] relative z-10">
        <div className="max-w-7xl mx-auto px-6 lg:px-12">
          <div className="text-center mb-20 space-y-4">
            <h2 className="text-white text-4xl md:text-5xl font-bold tracking-tight italic leading-none uppercase">Our Club.</h2>
            <p className="font-mono text-xs text-[#00A8A8] uppercase tracking-[0.4em]">550+ Verified Members</p>
          </div>
          <div className="grid lg:grid-cols-2 gap-8 max-w-6xl mx-auto items-stretch">
            <div className="bg-[#0a0a0a] border border-white/5 p-6 sm:p-10 rounded-3xl flex flex-col items-center hover:border-[#00A8A8]/30 transition-colors group shadow-2xl">
              <p className="text-[10px] font-mono text-gray-500 mb-10 uppercase tracking-widest border-b border-white/5 pb-2 w-full text-center group-hover:text-[#00A8A8] transition-colors">Class Year Distribution</p>
              <div className="w-full relative flex items-center justify-center min-h-[300px] sm:min-h-[400px]">
                <div className="w-full h-full max-w-[320px] aspect-square">
                  <Pie data={ClassData} options={chartOptions} />
                </div>
              </div>
            </div>
            <div className="bg-[#0a0a0a] border border-white/5 p-6 sm:p-10 rounded-3xl flex flex-col items-center hover:border-[#00A8A8]/30 transition-colors group shadow-2xl">
              <p className="text-[10px] font-mono text-gray-500 mb-10 uppercase tracking-widest border-b border-white/5 pb-2 w-full text-center group-hover:text-[#00A8A8] transition-colors">Academic Major Split</p>
              <div className="w-full relative flex items-center justify-center min-h-[300px] sm:min-h-[400px]">
                <div className="w-full h-full max-w-[320px] aspect-square">
                  <Pie data={MajorData} options={chartOptions} />
                </div>
              </div>
            </div>
          </div>
        </div>
      </Section>

      {/* BOOTCAMP SECTION */}
      <Section id="bootcamp" className="py-32 relative z-10">
        <div className="max-w-7xl mx-auto px-6 lg:px-12 grid lg:grid-cols-2 gap-20 items-center">
          <div className="order-2 lg:order-1 relative">
            <Image src={slide9} alt="Bootcamp Session" className="rounded-xl border border-white/10 shadow-xl transition-all duration-700" width={600} height={400} />
          </div>
          <div className="space-y-8 order-1 lg:order-2">
            <h2 className="text-white text-5xl md:text-6xl font-bold tracking-tighter italic leading-none uppercase">Bootcamp.</h2>
            <p className="text-gray-300 leading-relaxed italic border-l-2 border-[#00A8A8]/20 pl-6">
              Teaching core skills from <span className="text-white">data cleaning</span> to <span className="text-white">model building</span>. Learn Python and pandas through hands-on project work.
            </p>
            <Link href="/bootcamp" className="inline-block bg-white text-black px-8 py-4 rounded-sm font-black text-[10px] uppercase tracking-widest hover:bg-[#00A8A8] hover:text-white transition-all shadow-lg shadow-white/5">
              Initialize Bootcamp
            </Link>
          </div>
        </div>
      </Section>

      {/* HACKLYTICS SECTION */}
      <Section id="golden-byte" className="py-32 border-y border-white/5 relative z-10">
        <div className="max-w-7xl mx-auto px-6 lg:px-12 grid lg:grid-cols-2 gap-20 items-center">
          <div className="space-y-8">
            <h2 className="text-white text-5xl md:text-6xl font-bold tracking-tighter italic leading-none uppercase">Hacklytics.</h2>
            <p className="text-gray-300 leading-relaxed italic border-l-2 border-amber-500/20 pl-6">
              Georgia Tech&apos;s premier <span className="text-white">36-hour datathon</span>. Join hundreds of students for a weekend of data science challenges and workshops.
            </p>
            <a href="https://hacklytics.io" target="_blank" className="inline-block border border-amber-500/30 text-amber-500 px-8 py-4 rounded-sm font-black text-[10px] uppercase tracking-widest hover:bg-amber-500 hover:text-black transition-all">
              Register for 2026
            </a>
          </div>
          <div className="relative">
             <Image src={slide6} alt="Hacklytics Event" className="rounded-xl border border-white/10 shadow-xl transition-all duration-700" width={600} height={400} />
          </div>
        </div>
      </Section>

      {/* PROJECTS SECTION */}
      <Section id="projects" className="py-32 relative z-10">
        <div className="max-w-7xl mx-auto px-6 lg:px-12">
          <div className="mb-16 space-y-2">
            <h2 className="text-white text-5xl md:text-6xl font-bold tracking-tighter italic leading-none uppercase">Projects.</h2>
            <p className="font-mono text-[10px] text-[#00A8A8] uppercase tracking-[0.4em]">Protocol: Member_Initiatives</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <Card className="flex flex-col justify-between h-full bg-[#0a0a0a] border border-white/5 p-8 rounded-xl hover:border-[#00A8A8]/40 transition-all group shadow-2xl">
              <div className="w-full flex justify-center mb-6">
                <div className="p-4 bg-white/5 rounded-xl group-hover:bg-[#00A8A8]/10 transition-all">
                  <Image src={arc} alt="ARC" width={80} height={80} className="w-20 h-20 object-contain" />
                </div>
              </div>
              <h3 className="text-white text-xl font-bold text-center mb-2">ARC Research</h3>
              <div className="flex justify-center mb-4"><span className="px-2 py-0.5 text-[9px] font-mono rounded bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 uppercase tracking-widest">Active</span></div>
              <p className="text-sm text-gray-400 text-center mb-6 leading-relaxed italic">ML competition group focusing on Kaggle and TREC research tracks.</p>
              <a href="https://dsgt-arc.org/" target="_blank" className="text-[#00A8A8] font-mono text-[10px] uppercase tracking-widest mt-auto text-center hover:text-white transition-colors tracking-[0.2em]">View Club →</a>
            </Card>

            <Card className="flex flex-col justify-between h-full bg-[#0a0a0a] border border-white/5 p-8 rounded-xl hover:border-[#00A8A8]/40 transition-all group shadow-2xl">
              <div className="w-full flex justify-center mb-6">
                <div className="p-4 bg-white/5 rounded-xl group-hover:bg-[#00A8A8]/10 transition-all">
                  <Image src={stock} alt="Robo" width={80} height={80} className="w-20 h-20 object-contain" />
                </div>
              </div>
              <h3 className="text-white text-xl font-bold text-center mb-2">Roboinvesting</h3>
              <div className="flex justify-center mb-4"><span className="px-2 py-0.5 text-[9px] font-mono rounded bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 uppercase tracking-widest">Active</span></div>
              <p className="text-sm text-gray-400 text-center mb-6 leading-relaxed italic">ML-driven trading simulations analyzing technical indicators.</p>
              <a href="mailto:bjmichaels.25@gmail.com" className="text-[#00A8A8] font-mono text-[10px] uppercase tracking-widest mt-auto text-center hover:text-white transition-colors tracking-[0.2em]">Contact Team →</a>
            </Card>

            <Card className="flex flex-col justify-between h-full bg-[#0a0a0a] border border-white/5 p-8 rounded-xl hover:border-[#00A8A8]/40 transition-all group shadow-2xl">
              <div className="w-full flex justify-center mb-6">
                <div className="p-4 bg-white/5 rounded-xl group-hover:bg-[#00A8A8]/10 transition-all">
                  <Image src={trading} alt="AI" width={80} height={80} className="w-20 h-20 object-contain" />
                </div>
              </div>
              <h3 className="text-white text-xl font-bold text-center mb-2">AI Trading Agent</h3>
              <div className="flex justify-center mb-4"><span className="px-2 py-0.5 text-[9px] font-mono rounded bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 uppercase tracking-widest">Active</span></div>
              <p className="text-sm text-gray-400 text-center mb-6 leading-relaxed italic">Conversational AI tools for real-time portfolio management.</p>
              <a href="mailto:wesleylu@gatech.edu" className="text-[#00A8A8] font-mono text-[10px] uppercase tracking-widest mt-auto text-center hover:text-white transition-colors tracking-[0.2em]">Contact Team →</a>
            </Card>

            <Card className="flex flex-col justify-between h-full bg-[#0a0a0a] border border-white/5 p-8 rounded-xl group shadow-2xl">
              <div className="w-full flex justify-center mb-6"><Image src={gtaa} alt="Sports" width={100} height={100} className="w-24 h-24 object-contain opacity-50" /></div>
              <h3 className="text-white text-xl font-bold text-center mb-2">Sports Analytics</h3>
              <div className="flex justify-center mb-4"><span className="px-2 py-0.5 text-[9px] font-mono rounded bg-red-500/10 text-red-400 border border-red-500/20 uppercase tracking-widest">Closed</span></div>
              <p className="text-sm text-gray-500 text-center leading-relaxed italic">NFL projections and NBA roster optimization using advanced stats.</p>
            </Card>

            <Link href="/projects" className="bg-[#00A8A8] p-8 rounded-xl flex flex-col justify-between hover:bg-[#008f8f] transition-all shadow-xl shadow-[#00A8A8]/10 group">
              <div className="space-y-4">
                <h3 className="text-black text-2xl font-bold tracking-tight italic uppercase">Past Archive.</h3>
                <p className="text-black/80 text-sm font-medium leading-relaxed italic">Explore five years of machine learning projects built by DSGT members.</p>
              </div>
              <span className="text-black font-mono text-[10px] uppercase tracking-[0.3em] pt-4 font-bold group-hover:translate-x-2 transition-transform">Access Database →</span>
            </Link>
          </div>
        </div>
      </Section>

      {/* GET INVOLVED */}
      <Section id="getinvolved" className="py-32 bg-[#080808] relative z-10">
        <div className="max-w-7xl mx-auto px-6 lg:px-12">
          <div className="text-center mb-20 space-y-4">
            <h2 className="text-white text-4xl md:text-5xl font-bold italic tracking-tight leading-none uppercase">Get Involved.</h2>
            <p className="font-mono text-[10px] text-gray-500 uppercase tracking-[0.4em] font-bold underline decoration-[#00A8A8] underline-offset-8">Georgia Tech Primary Data Science Organization </p>
          </div>
          <div className="grid md:grid-cols-3 gap-8">
            {[
              { t: "Member", d: "Join the mailing list for weekly updates.", i: slide1, l: "https://member.datasciencegt.org/" },
              { t: "Leadership", d: "Join the executive board and lead teams.", i: slide7, l: "/team" },
              { t: "Hacklytics", d: "Attend our 36-hour flagship datathon.", i: slide6, l: "https://hacklytics.io/" }
            ].map((event, i) => (
              <div key={i} className="bg-[#0a0a0a] border border-white/5 rounded-2xl overflow-hidden group hover:border-[#00A8A8]/30 transition-all shadow-2xl">
                <div className="h-56 overflow-hidden relative">
                  <div className="absolute inset-0 bg-[#00A8A8]/10 z-10 opacity-0 group-hover:opacity-100 transition-opacity" />
                  <Image src={event.i} alt={event.t} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" />
                </div>
                <div className="p-8 space-y-4">
                  <h4 className="text-white text-lg font-bold uppercase italic tracking-tight">{event.t}</h4>
                  <p className="text-xs text-gray-500 leading-relaxed italic">{event.d}</p>
                  {event.l.startsWith("http") ? (
                    <a href={event.l} target="_blank" rel="noopener noreferrer" className="inline-block text-[10px] font-mono text-[#00A8A8] uppercase tracking-[0.2em] hover:text-white transition-colors">Initialize Connection →</a>
                  ) : (
                    <Link href={event.l} className="inline-block text-[10px] font-mono text-[#00A8A8] uppercase tracking-[0.2em] hover:text-white transition-colors">Request Access →</Link>
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