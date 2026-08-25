"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

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
    description:
      "An interactive web application designed to demystify neural network training. At its core, the project allows users to visualize backpropagation and architecture tweaks in real-time.",
    tech: ["AWS", "Docker", "PyTorch", "TypeScript", "NextJs", "Django"],
  },
  {
    name: "AI-Driven Investment Platform",
    lead: "Aryan Hazra",
    category: "Finance",
    description:
      "Using NLP to conversationally help investors reach goals. It adapts strategies based on client information rather than static robo-investing inputs.",
    tech: ["NLP", "Machine Learning", "Python", "Data Analytics"],
  },
  {
    name: "Furnichanter",
    lead: "Jane Ivanova",
    category: "Deep Learning",
    description:
      "Seamlessly combining computer vision with interior design. Users can search for furniture via images and generate custom 3D models using text descriptions.",
    tech: ["Deep Learning", "3D Modeling", "Python", "Computer Vision"],
  },
  {
    name: "Kaggle CLEF",
    lead: "Anthony Miyaguchi",
    category: "General DS",
    description:
      "A seminar-styled introduction to data science competitions. Members build ML systems for real-world problems like the CLEF 2025 competition.",
    tech: [
      "Python",
      "Machine Learning",
      "Data Science",
      "Algorithmic Development",
    ],
  },
  {
    name: "Sports Analysis Project",
    lead: "Casper Guo",
    category: "Sports",
    description:
      "Open-ended sports research. Projects include projecting NFL performance, building 'perfect' NBA rosters, and exploiting betting odds differences.",
    tech: [
      "Python",
      "Machine Learning",
      "Data Science",
      "Statistical Modeling",
    ],
  },
];

export default function ProjectsPage() {
  const [windowWidth, setWindowWidth] = useState<number>(
    typeof window !== "undefined" ? window.innerWidth : 1024,
  );
  const categories: Project["category"][] = [
    "Deep Learning",
    "Finance",
    "Sports",
    "General DS",
  ];

  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  return (
    <div className="site-shell selection:bg-[#00A8A8]/30 overflow-x-hidden">
      <Navbar
        screen_width={windowWidth}
        page="other"
        className="fixed top-0 z-30"
      />
      <main className="relative z-10 pt-44 pb-32 max-w-7xl mx-auto px-6 lg:px-12">
        <nav className="flex items-center gap-2 mb-8 text-sm">
          <Link href="/" className="link-measure">
            Home
          </Link>
          <span className="text-gray-600">/</span>
          <span className="text-gray-400">Projects</span>
        </nav>

        <section className="max-w-3xl mb-20 space-y-5">
          <h1 className="page-title text-5xl md:text-7xl">Project archive</h1>
          <p className="page-lede border-l-2 border-[#00A8A8]/40 pl-5">
            Past engineering work led by DSGT members, grouped by domain.
          </p>
        </section>

        <div className="space-y-24">
          {categories.map((cat) => (
            <section
              key={cat}
              id={cat.replace(/\s+/g, "-").toLowerCase()}
              className="scroll-mt-32 relative"
            >
              <div className="flex items-center gap-4 mb-10">
                <h2 className="page-title text-2xl shrink-0">{cat}</h2>
                <div className="h-px bg-[#00A8A8]/30 w-full" />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {projects
                  .filter((p) => p.category === cat)
                  .map((project) => (
                    <div key={project.name} className="figure-card p-8">
                      <div className="flex justify-between items-start mb-4 gap-4">
                        <h3 className="text-white text-xl font-display">
                          {project.name}
                        </h3>
                        <span className="text-xs text-gray-500 shrink-0">
                          Lead: {project.lead}
                        </span>
                      </div>

                      <p className="text-sm text-gray-400 leading-relaxed mb-6">
                        {project.description}
                      </p>

                      <div className="flex flex-wrap gap-2">
                        {project.tech.map((t) => (
                          <span
                            key={t}
                            className="text-xs font-mono text-[#00A8A8] border border-[#00A8A8]/20 px-2 py-1"
                          >
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

        <section className="mt-32 border-t border-white/10 pt-16 flex flex-col sm:flex-row justify-center items-center gap-8">
          <Link href="/" className="link-measure">
            ← Home
          </Link>
          <Link href="/bootcamp" className="link-measure">
            Join bootcamp →
          </Link>
        </section>
      </main>
      <Footer screen_width={windowWidth} className="relative z-10" />
    </div>
  );
}
