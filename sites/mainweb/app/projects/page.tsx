"use client";

import { useState, useEffect } from "react";
import Background from "@/components/Background";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import Major from "@/components/Text/Major";
import Mini from "@/components/Text/Mini";

const projects = [
  {
    name: "Roboinvesting",
    description:
      "Using Machine Learning to simulate profitable trading decisions. The goal of this project is to build a machine learning pipeline to analyze technical indicators, macroeconomic data, and calculate risk, to generate trading signals for our AI system to order. This is for educational purposes only and for the experience.",
  },
  {
    name: "ARC: Applied Research and Competitions seminar",
    description:
      "This seminar prepares students for original research contributions at evaluation-focused venues like CLEF. Participants analyze the AI/ML/IR applied research landscape, identify viable tasks, and develop ML/IR pipelines using PyTorch and Hugging Face.",
  },
  {
    name: "Sports Analysis Project",
    description:
      "A space for students to work on open-ended sports-related research projects. Members learn data analysis, visualization, statistical modelling, and machine learning by taking a project through the entire data science life cycle.",
  },
  {
    name: "Real-Time AI Trading Agent",
    description:
      "An end-to-end systems and machine learning project focused on building an autonomous trading pipeline. Team members work across data ingestion, feature engineering, time-series forecasting, and simulated trade execution.",
  },
  {
    name: "Deep Learning Playground",
    description:
      "An innovative learning venture focused on making the process of training machine learning and deep learning models understandable and accessible via a user-friendly web application.",
  },
  {
    name: "AI-Driven Investment Platform",
    description:
      "Using AI to conversationally help investors reach investing goals. The tool adapts and changes strategies based on information provided by the client.",
  },
  {
    name: "Furnichanter",
    description:
      "A project combining technology with interior design. Users can search for furniture through images, generate custom pieces from text, visualize furniture in their spaces, and explore 3D modeling.",
  },
  {
    name: "Kaggle CLEF",
    description:
      "A seminar-styled introduction to data science competitions, including Kaggle and CLEF 2025. Members read, present, discuss research, write exploratory data analyses, and compete internally.",
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

        <section className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-8">
          {projects.map((project, i) => (
            <div
              key={i}
              className="bg-gray-800/70 p-6 rounded-3xl shadow-xl border border-gray-700 hover:bg-gray-700/80 transition-all duration-300 hover:-translate-y-1"
            >
              <Major as="h3" compact className="text-white text-2xl mb-3">
                {project.name}
              </Major>
              <Mini className="text-gray-300 leading-relaxed">{project.description}</Mini>
            </div>
          ))}
        </section>
      </main>

      <Footer screen_width={windowWidth} className="relative z-10" />
    </div>
  );
};

export default ProjectsPage;
