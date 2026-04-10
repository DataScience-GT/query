"use client";

import { useState, useEffect } from "react";
import Background from "@/components/Background";
import Footer from "@/components/Footer";
import Navbar from "@/components/Navbar";
import Section from "@/components/Section";
import TeamCard from "@/components/TeamCard";

// Asset imports
import President from "@/assets/images/2025/aditi.jpg";
import ViceP from "@/assets/images/2025/nitika.jpg";
import Logistics1 from "@/assets/images/2025/alysha.jpg";
import Logistics2 from "@/assets/images/2025/diya.jpeg";
import Events from "@/assets/images/2025/aryan.jpeg"
import Marketing from "@/assets/images/2025/smera.png"
import Tech from "@/assets/images/2025/aamogh.png";
import Content1 from "@/assets/images/2025/anushka.jpg"
import Content2 from "@/assets/images/2025/glenne.png"

import External2 from "@/assets/images/2025/vidhi.jpeg"
import Project from "@/assets/images/2025/anika.jpg"
import Advisor from "@/assets/images/2025/jake.png"

const Team = () => {
  const [windowWidth, setWindowWidth] = useState<number>(
    typeof window !== "undefined" ? window.innerWidth : 1024
  );

  useEffect(() => {
    document.body.style.overflow = "auto";
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  return (
    <div id="team-page" className="relative min-h-screen bg-[#1A1A1A] text-gray-400 font-sans selection:bg-indigo-500/30">
      {/* Background with low opacity to match other pages */}
      <Background className="fixed inset-0 z-0 opacity-20" />

      {/* Navbar fixed with glassmorphism */}
      <Navbar
        screen_width={windowWidth}
        className="fixed top-0 left-0 w-full z-30 border-b border-white/5 bg-[#1A1A1A]/80 backdrop-blur-md"
        page="team"
      />

      <main className="relative z-10 pt-40 pb-32">
        {/* Simplified Header Section */}
        <div className="max-w-7xl mx-auto px-6 lg:px-12 mb-20 space-y-4">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-[#74b1aa] text-[10px] font-mono uppercase tracking-[0.2em]">
            Executive Board 2025-2026
          </div>
          <h1 className="text-white text-6xl md:text-7xl font-bold tracking-tight leading-none italic">
            Meet the <span className="text-transparent bg-clip-text bg-gradient-to-r from-gray-200 to-gray-500 not-italic">Team.</span>
          </h1>
          <p className="text-lg text-gray-400 max-w-2xl leading-relaxed">
            The engineers, designers, and organizers behind the largest student-run data science organization at Georgia Tech.
          </p>
        </div>

        {/* IDEaS Lab Banner */}
        <div className="max-w-7xl mx-auto px-6 lg:px-12 mb-12">
          <a
            href="https://ideas.gatech.edu"
            target="_blank"
            rel="noopener noreferrer"
            id="ideas-card"
            className="group relative flex flex-col sm:flex-row items-center gap-6 w-full rounded-2xl border border-white/10 bg-[#0a0a0a] p-8 overflow-hidden transition-all duration-500 hover:border-[#B3A369]/40 hover:shadow-[0_0_40px_rgba(179,163,105,0.12)] no-underline"
          >
            {/* Background glow */}
            <div className="absolute inset-0 bg-gradient-to-br from-[#003057]/20 via-transparent to-[#B3A369]/10 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />
            {/* GT Navy + Gold corner accent */}
            <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-bl from-[#B3A369]/10 to-transparent rounded-bl-full pointer-events-none" />

            {/* Icon */}
            <div className="relative flex-shrink-0 w-20 h-20 rounded-xl border border-[#B3A369]/30 bg-[#050505] flex items-center justify-center shadow-2xl">
              <svg viewBox="0 0 48 48" fill="none" className="w-10 h-10" aria-hidden="true">
                <path d="M24 4L6 14v12c0 9.94 7.74 19.24 18 21.6C34.26 45.24 42 35.94 42 26V14L24 4z" fill="#003057" stroke="#B3A369" strokeWidth="2" />
                <text x="24" y="30" textAnchor="middle" fontSize="13" fontWeight="bold" fill="#B3A369" fontFamily="monospace">IDEaS</text>
              </svg>
            </div>

            {/* Text */}
            <div className="flex flex-col gap-2 flex-1 text-center sm:text-left">
              <div className="inline-flex items-center justify-center sm:justify-start gap-2">
                <span className="px-3 py-1 rounded-full bg-[#B3A369]/10 border border-[#B3A369]/25 text-[#B3A369] text-[10px] font-mono uppercase tracking-[0.2em]">
                  Supervising Lab
                </span>
              </div>
              <h2 className="text-white text-xl font-bold tracking-tight">
                Institute for Data Engineering and Science
              </h2>
              <p className="text-sm text-gray-400 leading-relaxed max-w-2xl">
                IDEaS is the Georgia Tech research institute that oversees and supports DS@GT. It connects government, industry, and academia to advance foundational data science research, and provides the resources and faculty expertise that power our club&rsquo;s mission.
              </p>
            </div>

            {/* Arrow */}
            <div className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-all duration-300 translate-x-2 group-hover:translate-x-0">
              <svg viewBox="0 0 24 24" fill="none" stroke="#B3A369" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
                <path d="M5 12h14M13 6l6 6-6 6" />
              </svg>
            </div>
          </a>
        </div>

        {/* Team Grid Section */}
        <Section id="teams" className="px-6 lg:px-12">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 max-w-7xl mx-auto">

            <TeamCard name="Aditi Koratpallikar" title="President" img={President}>
              Aditi oversees all operations of DSGT, leading the executive board and coordinating with faculty and industry partners to shape the future of data science at GT.
            </TeamCard>

            <TeamCard name="Nikita Agnihotri" title="Vice President" img={ViceP}>
              Nikita leads <strong>Hacklytics</strong>, DSGT's flagship datathon. She manages corporate sponsorships, event organization, and networking initiatives.
            </TeamCard>

            <TeamCard name="Alysha Irvin" title="Co-Director of Logistics" img={Logistics1}>
              Alysha coordinates logistics for club events and Hacklytics, managing smooth operations and collaborating with external sponsors.
            </TeamCard>

            <TeamCard name="Diya Kaimal" title="Co-Director of Logistics" img={Logistics2}>
              Diya focuses on event management, Hacklytics logistic coordination, and logistics operations, ensuring a seamless experience for members and corporate partners.
            </TeamCard>

            <TeamCard name="Aamogh Sawant" title="Director of Technology" img={Tech}>
              Aamogh leads the Tech Team, managing frontend and backend systems for DSGT's digital infrastructure, including the Membership Portal.
            </TeamCard>

            <TeamCard name="Smera Bhatia" title="Director of Marketing" img={Marketing}>
              Smera directs social media, graphic design, and outreach strategies to increase engagement with DSGT both on and off campus.
            </TeamCard>

            <TeamCard name="Aryan Hazra" title="Director of Events" img={Events}>
              Aryan manages room bookings, catering, and volunteer coordination, ensuring technical workshops and socials execute perfectly.
            </TeamCard>

            <TeamCard name="Vidhi Gupta" title="Co-Director of External Affairs" img={External2}>
              Vidhi develops strategic partnerships and manages sponsor communications to support club initiatives and industry collaboration.
            </TeamCard>

            <TeamCard name="Anushka Jain" title="Co-Director of Content" img={Content1}>
              Anushka leads the Content team in managing Bootcamp and Udemy courses, helping members build professional ML projects.
            </TeamCard>

            <TeamCard name="Glenne Dela Torre" title="Co-Director of Content" img={Content2}>
              Glenne oversees Bootcamp workshops, ensuring members learn core data science skills and complete polished, industry-ready projects.
            </TeamCard>

            <TeamCard name="Anika V" title="Director of Projects" img={Project}>
              Anika oversees project logistics, managing the project portal and setting up research opportunities with professors and industry pros.
            </TeamCard>

            <TeamCard name="Jacob Abernathy" title="Club Advisor" img={Advisor}>
              Jacob is an Assistant Professor in the School of Computer Science and serves as a faculty advisor to DS@GT. His research focuses on machine learning, optimization, and data-driven decision-making, with applications spanning economics and large-scale systems.
            </TeamCard>

          </div>
        </Section>

        <Footer screen_width={windowWidth} className="mt-32 border-t border-white/5" />
      </main>
    </div>
  );
};

export default Team;