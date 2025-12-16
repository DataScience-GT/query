"use client";

import { useState, useEffect } from "react";
import Background from "@/components/Background";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import Major from "@/components/Text/Major";
import Mini from "@/components/Text/Mini";

const CodeIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg {...props} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 6.75 14.25 12l3 5.25m-1.5-8.625 2.25 2.25M17.25 6.75l-4.25 4.25m4.25-4.25 4.25 4.25M7.75 6.75l3 5.25-3 5.25m1.5-8.625-2.25 2.25m-1.5 1.5 4.25 4.25M6.75 17.25l-4.25-4.25m4.25 4.25-4.25 4.25" />
  </svg>
);

const BookOpenIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg {...props} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 0 0 6 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 0 1 6 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 0 1 6-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0 0 18 18a8.967 8.967 0 0 0-6 2.292m0-14.25v14.25" />
  </svg>
);

const UsersIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg {...props} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 0 0 3.741-.479 3 3 0 0 0-4.682-2.72m.94 3.198.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0 1 12 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 0 1 6 18.719m12 0a5.971 5.971 0 0 0-.941-3.197m0 0A5.995 5.995 0 0 0 12 12.75a5.995 5.995 0 0 0-5.058 2.772m0 0a3 3 0 0 0-4.681 2.72 8.986 8.986 0 0 0 3.74.477m.94-3.197a5.971 5.971 0 0 0-.94 3.197M15 6.75a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm6 3a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Zm-13.5 0a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Z" />
  </svg>
);

const LightBulbIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg {...props} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 18v-5.25m0 0a6.01 6.01 0 0 0 1.5-.189m-1.5.189a6.01 6.01 0 0 1-1.5-.189m3.75 7.478a12.06 12.06 0 0 1-4.5 0m3.75 2.383a14.406 14.406 0 0 1-3 0M14.25 18v-.192c0-.983.658-1.823 1.508-2.316a7.5 7.5 0 1 0-7.517 0c.85.493 1.509 1.333 1.509 2.316V18" />
  </svg>
);

const AccordionItem: React.FC<{ question: string; answer: string }> = ({ question, answer }) => {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-gray-700">
      <button
        className="w-full text-left flex justify-between items-center py-3 text-indigo-400 font-semibold hover:text-indigo-300 transition-colors duration-300"
        onClick={() => setOpen(!open)}
      >
        {question}
        <span className={`transition-transform duration-300 ${open ? "rotate-180" : ""}`}>▼</span>
      </button>
      {open && <div className="text-gray-300 pb-3 transition-opacity duration-300">{answer}</div>}
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

  const faq = [
    { q: "Do I need prior programming experience?", a: "No! The bootcamp is designed for complete beginners." },
    { q: "How much time should I commit each week?", a: "Plan for 4-6 hours per week: workshops, mentor meetings, and projects." },
    { q: "What if I miss a workshop?", a: "All workshops are recorded for later viewing." },
    { q: "How much does the bootcamp cost?", a: "The bootcamp costs $20 as a one-time fee to cover materials. Self-paced online access is free." },
    { q: "What do I get for completing the bootcamp?", a: "A portfolio of projects, Python and ML skills, and DSGT community access." },
    { q: "Can I still join DSGT projects after the bootcamp?", a: "Yes! Graduates can lead and contribute to DSGT projects." },
  ];

  return (
    <div className="relative min-h-screen flex flex-col bg-gray-950 text-gray-300">
      <Background className="absolute inset-0 z-0 opacity-40" />
      <Navbar
        screen_width={windowWidth}
        className="fixed top-0 left-0 w-full z-30 bg-gray-950/90 backdrop-blur-sm shadow-lg shadow-indigo-900/10"
        page="other"
      />

      <main className="relative z-10 pt-[120px] pb-32 px-4 sm:px-8 md:px-16 space-y-32">

        {/* HERO */}
        <section className="text-center space-y-6">
          <Major type="b" className="text-white text-5xl sm:text-6xl font-extrabold tracking-tight animate-fadeIn">
            DSGT Bootcamp
          </Major>
          <Major type="b" className="bg-gradient-to-r from-indigo-400 to-cyan-400 bg-clip-text text-transparent text-3xl sm:text-4xl font-bold animate-fadeIn delay-100">
            Learn Data Science from Scratch
          </Major>
          <Mini className="text-gray-300 max-w-2xl mx-auto pt-2 text-lg animate-fadeIn delay-200">
            A beginner-friendly program teaching Python, pandas, machine learning, and more. Build real projects and join Georgia Tech's largest data science community.
          </Mini>

          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center pt-6">
            <a href="https://member.datasciencegt.org" target="_blank" rel="noopener noreferrer"
               className="px-8 py-4 bg-gradient-to-r from-indigo-600 to-indigo-500 text-white font-bold rounded-lg shadow-xl transition-transform duration-300 hover:scale-105 hover:shadow-indigo-500/50">
              Register for Spring 2025 ($20)
            </a>
            <a href="#curriculum"
               className="px-8 py-4 bg-gray-700 hover:bg-gray-600 text-white font-bold rounded-lg shadow-xl transition-transform duration-300 hover:scale-105 hover:shadow-gray-500/50">
              View Curriculum
            </a>
          </div>
        </section>

        {/* WHAT IS BOOTCAMP */}
        <section className="max-w-4xl mx-auto space-y-8 bg-gray-900/60 p-8 rounded-3xl shadow-2xl border border-indigo-700/50">
          <Major type="b" className="text-indigo-400 text-3xl border-b border-indigo-400/30 pb-3">
            What is the DSGT Bootcamp?
          </Major>
          <Mini className="text-gray-300 leading-relaxed text-lg">
            The DSGT Bootcamp is a <strong>semester-long program</strong> designed to teach students data science fundamentals...
          </Mini>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-4">
            <div className="text-center">
              <div className="text-indigo-400 text-4xl font-bold mb-2">550+</div>
              <Mini className="text-gray-400">DSGT Members</Mini>
            </div>
            <div className="text-center">
              <div className="text-cyan-400 text-4xl font-bold mb-2">8-10</div>
              <Mini className="text-gray-400">Weeks of Training</Mini>
            </div>
            <div className="text-center">
              <div className="text-purple-400 text-4xl font-bold mb-2">$20</div>
              <Mini className="text-gray-400">One-Time Fee (Cost)</Mini>
            </div>
          </div>
        </section>

        {/* WHY JOIN */}
        <section className="max-w-6xl mx-auto space-y-12">
          <Major type="b" className="text-white text-4xl text-center font-bold">Why Join the Bootcamp?</Major>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {[
              { icon: <LightBulbIcon className="h-12 w-12 text-yellow-400 mb-4"/>, title: "No Experience Needed", desc: "Start from zero. Our curriculum walks you through every concept step-by-step." },
              { icon: <UsersIcon className="h-12 w-12 text-indigo-500 mb-4"/>, title: "Personal Mentorship", desc: "Work with experienced mentors who provide guidance and support throughout the program." },
              { icon: <CodeIcon className="h-12 w-12 text-cyan-500 mb-4"/>, title: "Hands-On Projects", desc: "Build a portfolio-worthy capstone project to demonstrate your skills." },
              { icon: <BookOpenIcon className="h-12 w-12 text-green-500 mb-4"/>, title: "Industry-Relevant Skills", desc: "Learn tools and techniques used by top tech companies and research labs." },
              { icon: <UsersIcon className="h-12 w-12 text-purple-500 mb-4"/>, title: "Community & Networking", desc: "Join a community of 550+ students passionate about data science." },
              { icon: <CodeIcon className="h-12 w-12 text-pink-500 mb-4"/>, title: "Portfolio Projects", desc: "Build real projects you can showcase on your resume and GitHub." },
            ].map((item, i) => (
              <div key={i} className="bg-gray-800/70 p-8 rounded-3xl shadow-xl border border-gray-700 hover:bg-gray-700/80 transition-all duration-500 hover:-translate-y-1 hover:scale-[1.02]">
                {item.icon}
                <Major as="h3" compact className="text-white text-xl mb-3">{item.title}</Major>
                <Mini className="text-gray-300 leading-relaxed">{item.desc}</Mini>
              </div>
            ))}
          </div>
        </section>

        {/* CURRICULUM */}
        <section id="curriculum" className="max-w-6xl mx-auto space-y-12">
          <Major type="b" className="text-white text-4xl text-center font-bold">What You'll Learn</Major>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              { title: "Python Fundamentals", color: "yellow-500", desc: "Variables, data types, functions, loops, and OOP basics." },
              { title: "Data Manipulation", color: "blue-500", desc: "Clean, transform, and analyze data using pandas and NumPy." },
              { title: "Data Visualization", color: "green-500", desc: "Create insightful charts with matplotlib and seaborn." },
              { title: "Machine Learning", color: "purple-500", desc: "Intro to supervised learning, regression, classification with scikit-learn." },
            ].map((item, i) => (
              <div key={i} className="bg-gray-800/70 p-6 rounded-3xl shadow-xl border border-gray-700 hover:bg-gray-700/80 transition duration-300 transform hover:scale-[1.02]">
                <CodeIcon className={`h-8 w-8 text-${item.color} mb-3`} />
                <Major as="h3" compact className="text-white text-xl mb-2">{item.title}</Major>
                <Mini className="text-gray-400 text-sm leading-relaxed">{item.desc}</Mini>
              </div>
            ))}
          </div>

          <div className="bg-gray-800/60 p-8 rounded-3xl border border-gray-700">
            <Major type="b" className="text-cyan-400 text-2xl mb-6">Weekly Topics</Major>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[
                'Week 1-2: Python Basics & Programming Fundamentals',
                'Week 3-4: Data Structures & File Handling',
                'Week 5-6: NumPy Arrays & Mathematical Operations',
                'Week 7-8: Pandas DataFrames & Data Cleaning',
                'Week 9-10: Data Visualization & Exploratory Analysis',
                'Week 11-12: Introduction to Machine Learning',
                'Week 13-14: Model Building & Evaluation',
                'Week 15-16: Capstone Project Presentations',
              ].map((week, i) => (
                <div key={i} className="flex items-start gap-3 p-3 bg-gray-900/50 rounded-lg transition duration-300 hover:bg-gray-900/70">
                  <span className="text-indigo-400 font-bold">→</span>
                  <Mini className="text-gray-300">{week}</Mini>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section className="max-w-4xl mx-auto space-y-8 bg-gray-900/60 p-8 rounded-3xl shadow-2xl border border-gray-700">
          <Major type="b" className="text-white text-3xl text-center mb-6">Frequently Asked Questions</Major>
          {faq.map((item, i) => <AccordionItem key={i} question={item.q} answer={item.a} />)}
        </section>

        {/* FINAL CTA */}
        <section className="max-w-3xl mx-auto text-center space-y-6 bg-gradient-to-r from-indigo-900/50 to-cyan-900/50 p-12 rounded-3xl border border-indigo-500/50">
          <Major type="b" className="text-white text-3xl">Ready to Start Your Data Science Journey?</Major>
          <Mini className="text-gray-300 text-lg leading-relaxed">Join hundreds of Georgia Tech students who have launched their careers through the DSGT Bootcamp.</Mini>
          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center pt-4">
            <a href="https://member.datasciencegt.org" target="_blank" rel="noopener noreferrer"
               className="px-8 py-4 bg-gradient-to-r from-indigo-600 to-indigo-500 text-white font-bold rounded-lg shadow-xl transition-transform duration-300 hover:scale-105 hover:shadow-indigo-500/50">
              Register Now ($20)
            </a>
          </div>
        </section>

      </main>

      <Footer screen_width={windowWidth} className="relative z-10" />
    </div>
  );
};

export default BootcampPage;