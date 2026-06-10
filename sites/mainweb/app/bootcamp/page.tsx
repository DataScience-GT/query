"use client";

import { useState, useEffect } from "react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

const curriculum = [
  {
    week: 1,
    title: "Python Basics & Setup",
    desc: "Variables, data types, and environment configuration.",
  },
  {
    week: 2,
    title: "Control Flow & Structures",
    desc: "Loops, conditionals, lists, and dictionaries.",
  },
  {
    week: 3,
    title: "Functions & Modules",
    desc: "Writing reusable code and organizing projects.",
  },
  {
    week: 4,
    title: "Object-Oriented Programming",
    desc: "Classes, inheritance, and Pythonic design.",
  },
  {
    week: 5,
    title: "File Handling & APIs",
    desc: "Reading files, writing data, and making web requests.",
  },
  {
    week: 6,
    title: "Pandas & NumPy",
    desc: "Introduction to fast numerical computing and DataFrames.",
  },
  {
    week: 7,
    title: "Data Cleaning",
    desc: "Handling missing values, merging, and data transformations.",
  },
  {
    week: 8,
    title: "Exploratory Data Analysis",
    desc: "Extracting insights and statistical summaries from data.",
  },
  {
    week: 9,
    title: "Data Visualization",
    desc: "Creating stunning charts using Matplotlib and Seaborn.",
  },
  {
    week: 10,
    title: "Intro to Machine Learning",
    desc: "Core concepts, train/test splits, and Scikit-Learn.",
  },
  {
    week: 11,
    title: "Supervised Learning",
    desc: "Linear regression, logistic regression, and decision trees.",
  },
  {
    week: 12,
    title: "Capstone Project",
    desc: "Build an end-to-end data science portfolio piece.",
  },
];

export default function BootcampPage() {
  const [windowWidth, setWindowWidth] = useState<number>(1024);

  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    setWindowWidth(window.innerWidth);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  return (
    <div className="relative min-h-screen bg-[#050505] text-gray-400 font-sans selection:bg-[#00A8A8]/30">
      <Navbar
        screen_width={windowWidth}
        page="bootcamp"
        className="fixed top-0 z-50 border-b border-white/5 bg-[#050505]/80 backdrop-blur-md"
      />

      <main className="relative z-10 pt-40 pb-20 px-6 lg:px-12 max-w-7xl mx-auto text-center">
        <div className="space-y-6 mb-16">
          <h1 className="text-white text-5xl md:text-7xl font-bold tracking-tighter italic uppercase">
            Python Data Science <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#00A8A8] to-[#006e6e] not-italic">
              Bootcamp.
            </span>
          </h1>
          <p className="text-lg text-gray-400 leading-relaxed max-w-2xl mx-auto italic">
            Master Python for data science in 12 weeks. From the fundamentals to
            machine learning, build the skills you need to succeed.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 text-left">
          {curriculum.map((item, index) => (
            <div
              key={index}
              className="group relative p-[1px] rounded-xl bg-gradient-to-b from-white/10 to-transparent hover:from-[#00A8A8]/50 transition-colors duration-500 overflow-hidden"
            >
              <div className="absolute inset-0 bg-gradient-to-br from-[#00A8A8]/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
              <div className="relative h-full bg-[#0a0a0a] rounded-xl p-6 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-xs font-mono text-[#00A8A8] bg-[#00A8A8]/10 px-3 py-1 rounded-full border border-[#00A8A8]/20">
                      Week {item.week}
                    </span>
                    <span className="text-white/10 text-4xl font-black italic">
                      {item.week.toString().padStart(2, "0")}
                    </span>
                  </div>
                  <h3 className="text-xl font-bold text-white mb-2 group-hover:text-[#00A8A8] transition-colors duration-300">
                    {item.title}
                  </h3>
                  <p className="text-sm text-gray-500 leading-relaxed">
                    {item.desc}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-20">
          <button className="px-8 py-4 bg-[#00A8A8] hover:bg-[#008f8f] text-white font-semibold rounded-lg transition-colors duration-300 transform hover:scale-105 active:scale-95">
            Apply for Next Cohort
          </button>
          <p className="mt-4 text-xs text-gray-600 font-mono uppercase tracking-widest">
            Spots are extremely limited
          </p>
        </div>
      </main>

      <Footer
        screen_width={windowWidth}
        className="fixed bottom-0 z-10 mt-20"
      />
    </div>
  );
}
