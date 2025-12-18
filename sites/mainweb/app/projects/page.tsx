"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Background from "@/components/Background";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import Major from "@/components/Text/Major";
import Mini from "@/components/Text/Mini";

interface Project {
  name: string;
  lead: string;
  description: string;
  tech: string[];
  category: "Deep Learning" | "Finance" | "Sports" | "General DS";
}

const projects: Project[] = [
  {
    name: "Deep Learning Playground",
    lead: "Noah Iversen",
    category: "Deep Learning",
    description: "An interactive web application designed to demystify neural network training. At its core, the project allows users to visualize backpropagation and architecture tweaks in real-time.",
    tech: ["AWS", "Docker", "PyTorch", "TypeScript", "NextJs", "Django"],
  },
  {
    name: "AI-Driven Investment Platform",
    lead: "Aryan Hazra",
    category: "Finance",
    description: "Using NLP to conversationally help investors reach goals. It adapts strategies based on client information rather than static robo-investing inputs.",
    tech: ["NLP", "Machine Learning", "Python", "Data Analytics"],
  },
  {
    name: "Furnichanter",
    lead: "Jane Ivanova",
    category: "Deep Learning",
    description: "Seamlessly combining computer vision with interior design. Users can search for furniture via images and generate custom 3D models using text descriptions.",
    tech: ["Deep Learning", "3D Modeling", "Python", "Computer Vision"],
  },
  {
    name: "Kaggle CLEF",
    lead: "Anthony Miyaguchi",
    category: "General DS",
    description: "A seminar-styled introduction to data science competitions. Members build ML systems for real-world problems like the CLEF 2025 competition.",
    tech: ["Python", "Machine Learning", "Data Science", "Algorithmic Development"],
  },
  {
    name: "Sports Analysis Project",
    lead: "Casper Guo",
    category: "Sports",
    description: "Open-ended sports research. Projects include projecting NFL performance, building 'perfect' NBA rosters, and exploiting betting odds differences.",
    tech: ["Python", "Machine Learning", "Data Science", "Statistical Modeling"],
  },
];

const ProjectsPage: React.FC = () => {
  const [windowWidth, setWindowWidth] = useState<number>(typeof window !== "undefined" ? window.innerWidth : 1024);
  const categories: Project["category"][] = ["Deep Learning", "Finance", "Sports", "General DS"];

  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  return (
    <div className="relative min-h-screen bg-[#050505] text-gray-400 font-sans selection:bg-indigo-500/30">
      <Background className="fixed inset-0 z-0 opacity-20" />

      <Navbar
        screen_width={windowWidth}
        page="other"
        className="fixed top-0 z-30 border-b border-white/5 bg-[#050505]/80 backdrop-blur-md"
      />

      <main className="relative z-10 pt-44 pb-32 max-w-7xl mx-auto px-6 lg:px-12">

        {/* BREADCRUMB NAVIGATION */}
        <nav className="flex items-center gap-2 mb-8 text-[10px] font-mono tracking-widest uppercase">
          <Link href="/" className="hover:text-indigo-400 transition-colors">Home</Link>
          <span className="text-gray-700">/</span>
          <span className="text-gray-200">Archive</span>
        </nav>

        {/* HERO SECTION - Fixed the Tag Mismatch */}
        <section className="max-w-3xl mb-24 space-y-6">
          <h1 className="text-white text-6xl md:text-7xl font-bold tracking-tight leading-none">
            Project <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-gray-200 to-gray-500 font-black italic">Archive.</span>
          </h1>
          <p className="text-lg text-gray-400 leading-relaxed max-w-xl font-medium">
            A technical directory of past engineering ventures led by DSGT members. Organized by domain expertise and technical stack.
          </p>
        </section>

        {/* ORGANIZED CATEGORIES */}
        <div className="space-y-32">
          {categories.map((cat) => (
            <section key={cat} id={cat.replace(/\s+/g, '-').toLowerCase()} className="scroll-mt-32">
              <div className="flex items-center gap-4 mb-12">
                <h2 className="text-white text-2xl font-bold tracking-tight shrink-0 italic">{cat}</h2>
                <div className="h-px bg-white/5 w-full"></div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {projects
                  .filter((p) => p.category === cat)
                  .map((project, i) => (
                    <div key={i} className="group bg-[#0a0a0a] border border-white/5 p-8 rounded-xl hover:border-indigo-500/30 transition-all duration-300">
                      <div className="flex justify-between items-start mb-6">
                        <h3 className="text-white text-xl font-bold group-hover:text-indigo-400 transition-colors">
                          {project.name}
                        </h3>
                        <span className="text-[10px] font-mono text-gray-600">Lead: {project.lead}</span>
                      </div>

                      <p className="text-sm text-gray-400 leading-relaxed mb-8">
                        {project.description}
                      </p>

                      <div className="flex flex-wrap gap-2">
                        {project.tech.map((t, index) => (
                          <span key={index} className="text-[10px] font-mono text-gray-500 bg-white/5 border border-white/5 px-2 py-1 rounded">
                            {t}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
              </div>
            </section>
          ))}
        </div>

        {/* NAVIGATION FOOTER */}
        <section className="mt-40 border-t border-white/5 pt-20 text-center">
          <h2 className="text-white text-2xl font-bold mb-8 italic italic-title">Back to the present?</h2>
          <div className="flex justify-center gap-12">
            <Link href="/" className="text-[10px] font-mono text-gray-500 hover:text-indigo-400 transition-colors uppercase tracking-[0.2em] flex items-center gap-2">
              <span className="text-lg">←</span> Return Home
            </Link>
            <Link href="/bootcamp" className="text-[10px] font-mono text-gray-500 hover:text-indigo-400 transition-colors uppercase tracking-[0.2em] flex items-center gap-2">
              Join Bootcamp <span className="text-lg">→</span>
            </Link>
          </div>
        </section>
      </main>

      <Footer screen_width={windowWidth} className="relative z-10 border-t border-white/5" />
    </div>
  );
};

export default ProjectsPage;