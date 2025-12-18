"use client";

import { useState, useEffect } from "react";
import Background from "@/components/Background";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import Major from "@/components/Text/Major";
import Mini from "@/components/Text/Mini";

const AccordionItem: React.FC<{ question: string; answer: string }> = ({ question, answer }) => {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-white/5 last:border-0">
      <button
        className="w-full text-left flex justify-between items-center py-5 group"
        onClick={() => setOpen(!open)}
      >
        <span className="text-gray-200 font-medium group-hover:text-indigo-400 transition-colors">{question}</span>
        <span className={`text-xs text-gray-500 transition-transform duration-300 ${open ? "rotate-180" : ""}`}>↓</span>
      </button>
      <div className={`overflow-hidden transition-all duration-300 ${open ? "max-h-40 opacity-100 mb-5" : "max-h-0 opacity-0"}`}>
        <p className="text-gray-400 text-sm leading-relaxed">{answer}</p>
      </div>
    </div>
  );
};

const BootcampPage: React.FC = () => {
  const [windowWidth, setWindowWidth] = useState<number>(typeof window !== "undefined" ? window.innerWidth : 1024);

  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  return (
    <div className="relative min-h-screen bg-[#050505] text-gray-400 font-sans selection:bg-indigo-500/30">
      <Background className="fixed inset-0 z-0 opacity-20" />
      <Navbar screen_width={windowWidth} page="other" className="fixed top-0 z-30 border-b border-white/5 bg-[#050505]/80 backdrop-blur-md" />

      <main className="relative z-10 pt-40 pb-32 max-w-7xl mx-auto px-6 lg:px-12">

        {/* HERO SECTION */}
        <section className="grid lg:grid-cols-2 gap-12 items-center mb-40">
          <div className="space-y-8">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-xs font-mono">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-2 rounded-full bg-indigo-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-indigo-500"></span>
              </span>
              Spring 2025 Registration Open
            </div>
            <h1 className="text-white text-6xl md:text-8xl font-bold tracking-tight leading-[0.9]">
              DSGT <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-gray-200 to-gray-500">Bootcamp.</span>
            </h1>
            <p className="text-lg text-gray-400 max-w-md leading-relaxed">
              Bridging the gap between curiosity and engineering. A semester-long, mentor-led program for Georgia Tech students.
            </p>
            <div className="flex flex-wrap gap-4">
              <a href="https://member.datasciencegt.org" target="_blank" rel="noopener noreferrer" className="bg-white text-black px-8 py-3 rounded-md font-bold hover:bg-gray-200 transition-all text-sm shadow-lg active:scale-95">
                Register for $20
              </a>
              <a href="#curriculum" className="px-8 py-3 rounded-md font-bold text-gray-300 border border-white/10 hover:bg-white/5 transition-all text-sm active:scale-95">
                The Curriculum
              </a>
            </div>
          </div>

          {/* THE CODE ICON / CLASS COMPONENT */}
          <div className="hidden lg:block relative">
            <div className="absolute -inset-1 bg-gradient-to-r from-indigo-500 to-cyan-500 rounded-lg blur opacity-20"></div>
            <div className="relative bg-[#0a0a0a] border border-white/10 p-6 rounded-lg font-mono text-sm shadow-2xl">
              <p className="text-indigo-400">class DSGTBootcamp:</p>
              <p className="pl-4 text-gray-500">def __init__(self, student):</p>
              <p className="pl-8 text-gray-300">self.experience = 0</p>
              <p className="pl-8 text-gray-300">self.goals = ["Python", "Pandas", "ML"]</p>
              <p className="pl-4 text-gray-500">def graduate(self):</p>
              <p className="pl-8 text-indigo-400">return "Data Scientist"</p>
            </div>
          </div>
        </section>

        {/* METRICS BAR */}
        <section className="grid md:grid-cols-3 gap-1 border-y border-white/5 mb-40">
          {[
            { label: "Community", val: "550+", sub: "Active DSGT Members" },
            { label: "Duration", val: "10 Weeks", sub: "Intensive Workshops" },
            { label: "Pricing", val: "$20", sub: "One-time materials fee" }
          ].map((stat, i) => (
            <div key={i} className="py-12 md:px-8 first:pl-0">
              <p className="text-xs font-mono uppercase tracking-widest text-indigo-500 mb-2">{stat.label}</p>
              <p className="text-4xl text-white font-bold mb-1">{stat.val}</p>
              <p className="text-sm text-gray-500">{stat.sub}</p>
            </div>
          ))}
        </section>

        {/* BENTO CONTENT BOXES */}
        <section className="grid grid-cols-1 md:grid-cols-12 gap-4 mb-40">
          <div className="md:col-span-8 bg-[#0a0a0a] border border-white/5 p-10 rounded-2xl">
            <h2 className="text-white text-2xl font-bold mb-4 italic">The Foundation</h2>
            <p className="text-gray-400 leading-relaxed max-w-2xl">
              We realized most students want to learn Data Science but don't know where to start. This is the bridge.
              A semester-long program that focuses on Python fundamentals, data manipulation, and actual machine learning
              implementation. No prerequisite classes required.
            </p>
          </div>
          <div className="md:col-span-4 bg-gradient-to-br from-indigo-600 to-indigo-800 p-10 rounded-2xl text-white">
            <h3 className="font-bold text-xl mb-4 leading-tight">Join Georgia Tech's largest DS community.</h3>
            <p className="text-indigo-100 text-sm mb-8">Access to DSGT projects, networking events, and career panels.</p>
            <div className="h-px bg-white/20 w-full mb-8"></div>
            <p className="text-xs font-mono">EST. 2021</p>
          </div>
        </section>

        {/* CURRICULUM SECTION */}
        <section id="curriculum" className="grid lg:grid-cols-12 gap-16 mb-40">
          <div className="lg:col-span-4">
            <h2 className="text-white text-3xl font-bold mb-4 tracking-tight leading-tight">The <br/>Curriculum</h2>
            <p className="text-gray-500 text-sm leading-relaxed">
              Our curriculum is updated every semester to reflect industry standards.
              Expect deep-dives into Python, NumPy, Pandas, and Scikit-Learn.
            </p>
          </div>
          <div className="lg:col-span-8 grid sm:grid-cols-2 gap-4">
            {[
              { w: "1-4", t: "Python Basics", d: "Syntax, logic, and functional programming basics." },
              { w: "5-8", t: "Data Analysis", d: "Cleaning and exploring with Pandas and NumPy." },
              { w: "9-12", t: "Machine Learning", d: "Supervised learning and model evaluation." },
              { w: "13-16", t: "Capstone", d: "Final projects presented to the GT community." }
            ].map((item, i) => (
              <div key={i} className="p-6 bg-[#0a0a0a] border border-white/5 rounded-lg hover:border-indigo-500/30 transition-all group">
                <p className="text-xs font-mono text-gray-600 mb-2 group-hover:text-indigo-400">Weeks {item.w}</p>
                <h4 className="text-white font-bold mb-1">{item.t}</h4>
                <p className="text-xs text-gray-500">{item.d}</p>
              </div>
            ))}
          </div>
        </section>

        {/* FAQ SECTION */}
        <section className="max-w-3xl mb-40">
          <h2 className="text-white text-2xl font-bold mb-8 italic">Support & FAQ</h2>
          <div className="border-t border-white/5">
            {[
              { q: "Prior programming experience?", a: "None. We designed this specifically for beginners." },
              { q: "Time commitment?", a: "Plan for 4-6 hours per week: workshops and mentor meetings." },
              { q: "Materials cost?", a: "The $20 fee covers materials and social events. Self-paced access is free." },
              { q: "Community access?", a: "Graduates get priority access to lead DSGT research and projects." }
            ].map((item, i) => <AccordionItem key={i} question={item.q} answer={item.a} />)}
          </div>
        </section>

        {/* FINAL CALL TO ACTION */}
        <section className="border border-indigo-500/30 bg-indigo-500/5 p-12 rounded-2xl text-center relative overflow-hidden">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-64 h-64 bg-indigo-500/10 blur-[100px] pointer-events-none"></div>
          <h2 className="text-white text-3xl font-bold mb-6 tracking-tight">Start learning this Spring.</h2>
          <p className="text-gray-400 max-w-sm mx-auto mb-8 text-sm">
            Join the Spring 2025 cohort and get your certificate in Data Science.
          </p>
          <a
            href="https://member.datasciencegt.org"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block bg-white text-black px-10 py-4 rounded-md font-bold hover:bg-indigo-50 hover:shadow-[0_0_20px_rgba(255,255,255,0.3)] transition-all duration-300 active:scale-95"
          >
            Apply Now
          </a>
        </section>

      </main>

      <Footer screen_width={windowWidth} className="relative z-10 border-t border-white/5" />
    </div>
  );
};

export default BootcampPage;