"use client";

import { useState, useEffect } from "react";
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
}

const projects: Project[] = [
  {
    name: "Deep Learning Playground",
    lead: "Noah Iversen",
    description:
      "Deep Learning Playground is an innovative learning venture focused on making the process of training machine learning and deep learning models understandable and accessible. At its core, our project involves creating a user-friendly web application that teaches people the ropes of effectively training these models. Whether you're a seasoned developer or just starting out, our project provides hands-on experience in the intersection of web development and data science.",
    tech: [
      "AWS",
      "NextJs",
      "Docker",
      "React/Redux",
      "TypeScript",
      "Node.js",
      "Python",
      "PyTorch",
      "pandas",
      "NumPy",
      "scikit-learn",
      "Django",
    ],
  },
  {
    name: "AI-Driven Investment Platform",
    lead: "Aryan Hazra",
    description:
      "Using AI to conversationally help investors reach investing goals. The goal of this is to be a conversational tool that can adapt and change strategies based on information that the client provides, as opposed to a static input and output the way many robo investors do.",
    tech: [
      "Data Analytics",
      "Machine Learning",
      "Natural Language Processing",
      "Python",
    ],
  },
  {
    name: "Furnichanter",
    lead: "Jane Ivanova",
    description:
      "Furnichanter is an innovative project that seamlessly combines technology with interior design. It aims to empower users with a unique experience by enabling them to effortlessly search for furniture through images, generate custom pieces from text descriptions using advanced AI models, visualize furniture within their own spaces, and even explore the possibility of creating intricate 3D models for a truly immersive design journey.",
    tech: [
      "Python",
      "Machine Learning",
      "Deep Learning",
      "Natural Language Processing",
      "3D Modeling Concepts",
    ],
  },
  {
    name: "Kaggle CLEF",
    lead: "Anthony Miyaguchi",
    description:
      "A seminar-styled introduction to data science competitions, including Kaggle and CLEF 2025. Members will read, present, and discuss research, write an exploratory data analysis (EDA), and compete in an internal competition for prizes. Focused on building machine learning systems on real-world problems.",
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
    description:
      "The sports analysis project is a space for student to work on open-ended sports-related research projects. Members will learn data analysis and visualization, statistical modelling, and machine learning by taking a project through the entire data science life cycle. Cool things we have done include projecting NFL running back performances, building the perfect NBA roster, and exploiting odds differences across sport books.",
    tech: [
      "Python",
      "Machine Learning",
      "Data Science",
      "Algorithmic Development",
    ],
  },
];

const ProjectsPage: React.FC = () => {
  const [windowWidth, setWindowWidth] = useState<number>(
    typeof window !== "undefined" ? window.innerWidth : 1024
  );

  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  return (
    <div className="relative min-h-screen flex flex-col bg-gray-950 text-gray-300">
      <Background className="absolute inset-0 z-0 opacity-40" />
      <Navbar
        screen_width={windowWidth}
        className="fixed top-0 left-0 w-full z-30 bg-gray-950/90 backdrop-blur-sm shadow-lg shadow-indigo-900/10"
        page="other"
      />

      <main className="relative z-10 pt-[120px] pb-32 px-4 sm:px-8 md:px-16 space-y-16">
        <section className="text-center">
          <Major type="b" className="text-white text-5xl sm:text-6xl font-extrabold">
            DSGT Projects
          </Major>
          <Mini className="text-gray-300 max-w-2xl mx-auto pt-2 text-lg">
            Explore the variety of projects led by DSGT members, spanning machine learning, AI, data analysis, and hands-on real-world applications.
          </Mini>
        </section>

        <section className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-8">
          {projects.map((project, i) => (
            <div
              key={i}
              className="bg-gray-800/70 p-6 rounded-3xl shadow-xl border border-gray-700 hover:bg-gray-700/80 transition-all duration-300 flex flex-col h-full hover:-translate-y-1"
            >
              <div className="mb-4">
                <Major as="h3" compact className="text-white text-2xl font-bold">
                  {project.name}
                </Major>
              </div>

              <div className="mb-4">
                <Mini className="text-gray-300 leading-relaxed text-sm sm:text-base">
                  {project.description}
                </Mini>
              </div>

              <div className="mt-auto space-y-4">
                {/* Tech Stack Tags */}
                <div className="flex flex-wrap gap-2">
                  {project.tech.map((tech, t) => (
                    <span
                      key={t}
                      className="text-[10px] sm:text-xs bg-gray-900 text-gray-400 px-2 py-1 rounded border border-gray-700"
                    >
                      {tech}
                    </span>
                  ))}
                </div>

                {/* Lead Contact Info */}
                <div className="pt-4 border-t border-gray-700 text-sm">
                  <span className="text-gray-400">
                    Lead: <span className="text-white font-medium">{project.lead}</span>
                  </span>
                </div>
              </div>
            </div>
          ))}
        </section>
      </main>

      <Footer screen_width={windowWidth} className="relative z-10" />
    </div>
  );
};

export default ProjectsPage;