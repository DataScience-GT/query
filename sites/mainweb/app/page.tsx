// src/app/page.tsx
"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import Image from "next/image";

import Background from "@/components/Background";
import Navbar from "@/components/Navbar";
import Hero from "@/components/Hero";
import Section from "@/components/Section";
import Major from "@/components/Text/Major";
import Mini from "@/components/Text/Mini";
import Minor from "@/components/Text/Minor";
import Card from "@/components/Card";
import Footer from "@/components/Footer";
import LearnMore from "@/components/LearnMore/LearnMore";
import EventCard from "@/components/EventCard";

import { Chart as ChartJS, ArcElement, Tooltip, Legend, TooltipItem } from "chart.js";
import dynamic from "next/dynamic";
import { ClassData, MajorData } from "@/assets/Data/demographics";

import slide1 from "@/assets/images/slides/slide1.jpg";
import slide2 from "@/assets/images/slides/slide2.jpg";
import slide6 from "@/assets/images/slides/slide6.jpg";
import slide7 from "@/assets/images/slides/slide7.jpg";
import slide8 from "@/assets/images/slides/slide8.jpg";
import dlp4 from "@/assets/images/logos/dlp4.png";
import furnichanter from "@/assets/images/logos/furnichanter.png";
import arc from "@/assets/images/logos/arc-logo-v3.png";
import gtaa from "@/assets/images/logos/gtaa.png";
import blueconduit from "@/assets/images/logos/blueconduit.png";
import stock from "@/assets/images/logos/stock.png"

const Pie = dynamic(() => import("react-chartjs-2").then(mod => mod.Pie), {
  ssr: false,
  loading: () => <div className="h-80 w-80 flex items-center justify-center text-gray-400">Loading Chart...</div>
});

ChartJS.register(ArcElement, Tooltip, Legend);

type PieTooltipItem = TooltipItem<'pie'>;

const Home = () => {
  const [windowWidth, setWindowWidth] = useState<number>(0);

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
        backgroundColor: 'rgba(30, 41, 59, 0.9)',
        titleColor: '#fff',
        bodyColor: '#e2e8f0',
        padding: 10,
        borderRadius: 6,
      },
      legend: {
        position: 'bottom' as const,
        labels: {
          color: '#fff',
          font: { size: 14 }
        }
      }
    },
    color: "#fff",
  }), []);

  return (
    <div id="home-page" className="relative">
      <Background />
      <Navbar screen_width={windowWidth} page="home" />
      <Hero screen_width={windowWidth} />

      <Section id="about">
        <div className="flex flex-col-reverse md:flex-row items-center gap-12">
          <div className="md:w-1/2 space-y-6">
            <Major type="a">About Us</Major>
            <Mini className="text-gray-300 leading-relaxed">
              As the <strong>largest student-run data science organization at Georgia Tech</strong>,
              we provide technical skill development via club projects, workshops,
              guest speakers, and more. DSGT is open to all majors and focuses on <strong>projects, bootcamps, and Hacklytics</strong>.
            </Mini>
            <Mini>
              <LearnMore to="/team">Meet the Team</LearnMore>
            </Mini>
          </div>
          <div className="md:w-1/2 w-full group" role="figure" aria-labelledby="about-image-caption">
            <div className="relative overflow-hidden rounded-2xl shadow-lg transition-transform duration-500 hover:scale-[1.02]">
              <div className="absolute inset-0 bg-gradient-to-tr from-blue-600/20 to-cyan-600/20 opacity-0 group-hover:opacity-100 transition-opacity duration-500 z-10" />
              <Image
                src={slide2}
                alt="The DSGT Executive Team in a group photo"
                id="about-image-caption"
                className="w-full h-96 object-cover"
                sizes="(max-width: 768px) 100vw, 50vw"
                width={600}
                height={384}
                placeholder="blur"
              />
            </div>
          </div>
        </div>
      </Section>

      <Section id="stats">
        <Major type="b">Who We Are</Major>
        <Mini className="text-gray-300">In <strong>Fall 2025</strong>, we had <span className="font-extrabold text-blue-400">550+ DSGT members</span>. Here's a snapshot of class and major demographics:</Mini>
        <div className="flex flex-wrap justify-center items-stretch gap-8 my-10" role="region" aria-label="DSGT Demographics Charts">
          <div className="flex flex-col items-center w-full max-w-sm p-8 rounded-3xl bg-white/5 backdrop-blur-md border border-white/10 shadow-2xl transition-all duration-300 hover:bg-white/10 hover:shadow-blue-500/20">
            <Minor className="text-lg font-bold text-blue-300 mb-2">CLASS DEMOGRAPHICS</Minor>
            <div className="mt-4 w-64 h-64 sm:w-80 sm:h-80">
              <Pie data={ClassData} options={chartOptions} aria-label="Pie chart showing class demographics" />
            </div>
          </div>
          <div className="flex flex-col items-center w-full max-w-sm p-8 rounded-3xl bg-white/5 backdrop-blur-md border border-white/10 shadow-2xl transition-all duration-300 hover:bg-white/10
          hover:shadow-cyan-500/20">
            <Minor className="text-lg font-bold text-cyan-300 mb-2">MAJOR DEMOGRAPHICS</Minor>
            <div className="mt-4 w-64 h-64 sm:w-80 sm:h-80">
              <Pie data={MajorData} options={chartOptions} aria-label="Pie chart showing major demographics" />
            </div>
          </div>
        </div>
        <div className="text-center mt-8">
          <Mini className="text-gray-400">Reflecting Georgia Tech's diverse, interdisciplinary focus on data and technology.</Mini>
        </div>
      </Section>

      <Section id="bootcamp">
        <div className="flex flex-col-reverse md:flex-row items-center gap-12">
          <div className="md:w-1/2 space-y-6">
            <Major type="a">Bootcamp</Major>
            <Mini className="text-gray-300 leading-relaxed">
              Our bootcamp teaches core data science skills, from <strong>data cleaning</strong> to <strong>feature engineering</strong> and <strong>model building</strong>.
              Learn <strong>Python</strong>, <strong>pandas</strong>, visualization, and machine learning fundamentals through a structured, hands-on project.
            </Mini>
            <Mini>
              <LearnMore to="/bootcamp" rel="noopener noreferrer">Learn more at our Bootcamp site</LearnMore>
            </Mini>
          </div>
          <div className="md:w-1/2 w-full group" role="figure">
            <div className="relative overflow-hidden rounded-2xl shadow-lg transition-transform duration-500 hover:scale-[1.02]">
              <div className="absolute inset-0 bg-gradient-to-br from-teal-500/20 to-blue-500/20 opacity-0 group-hover:opacity-100 transition-opacity duration-500 z-10" />
              <Image
                src={slide8}
                alt="Students collaborating during a DSGT Bootcamp session"
                className="w-full h-96 object-cover relative z-10"
                sizes="(max-width: 768px) 100vw, 50vw"
                width={600}
                height={384}
                placeholder="blur"
              />
            </div>
          </div>
        </div>
      </Section>

      <Section id="golden-byte">
        <div className="flex flex-col md:flex-row items-center gap-12">
          <div className="md:w-1/2 w-full group" role="figure">
            <div className="relative overflow-hidden rounded-2xl shadow-lg transition-transform duration-500 hover:scale-[1.02]">
              <div className="absolute inset-0 bg-gradient-to-tl from-cyan-600/20 to-green-600/20 opacity-0 group-hover:opacity-100 transition-opacity duration-500 z-10" />
              <Image
                src={slide6}
                alt="Attendees gathered at the Golden Byte 2024 datathon"
                className="w-full h-96 object-cover relative z-10"
                sizes="(max-width: 768px) 100vw, 50vw"
                width={600}
                height={384}
                placeholder="blur"
              />
            </div>
          </div>
          <div className="md:w-1/2 space-y-6">
            <Major type="b">Hacklytics</Major>
            <Mini className="text-gray-300 leading-relaxed">
              Hacklytics is Georgia Tech's premier <strong>36-hour datathon</strong> brought to you by DSGT.
              Join hundreds of students for a weekend of data science, workshops, and prizes.
            </Mini>
            <Mini>
              <LearnMore to="https://hacklytics.io" target="_blank" rel="noopener noreferrer">Register/Learn more about Golden Byte 2026</LearnMore>
            </Mini>
          </div>
        </div>
      </Section>

      <Section id="projects">
        <Major type="a">Projects Showcase</Major>
        <Mini className="text-gray-300 mb-6">
          Our projects give members hands-on experience while exploring the power of
          data science and AI across diverse applications, from deep learning to financial modeling.
        </Mini>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 my-10" role="region" aria-label="DSGT Member Projects">

          {/* === VIEW ALL PAST PROJECTS CARD === */}


          {/* === ARC PROJECT CARD === */}
          <Card
            img=""
            linkUrl="https://github.com/datasciencegt/arc"
            className="flex flex-col justify-between h-full hover:shadow-2xl hover:-translate-y-1 transition-all duration-300 border border-white/5 p-6 rounded-xl"
          >
            {/* Logo on top */}
            <div className="w-full flex justify-center mb-4">
              <div className="p-4 bg-white rounded-xl">
                <Image
                  src={arc}
                  alt="ARC Logo"
                  className="object-contain w-24 h-24"
                  width={96}
                  height={96}
                />
              </div>
            </div>

            {/* Title below image */}
            <h3 className="text-teal-400 text-lg font-bold text-center mb-2">
              DS@GT Applied Research Competitions (ARC)
            </h3>
            <div className="flex justify-center mb-3">
            <span className="px-3 py-1 text-xs font-semibold rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
            Actively Recruiting
            </span>
            </div>

            {/* Description */}
            <p className="text-gray-300 text-sm leading-relaxed mb-4">
              ARC is a student-run research group at Georgia Tech focused on machine learning, information retrieval, and data-driven scientific modeling. Members participate in competitions like CLEF, Kaggle, and TREC, while also publishing research notes. The group is open to all DS@GT members, fostering hands-on experience in competitive research challenges.
            </p>

            {/* Link */}
            <a
              href="https://dsgt-arc.org/"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Visit the DS@GT ARC GitHub page"
              className="text-teal-400 mt-auto inline-block font-semibold hover:underline hover:text-teal-300 transition-colors"
            >
              Learn More →
            </a>
          </Card>

          {/* Other project cards */}
          <Card
          className="flex flex-col justify-between h-full hover:shadow-2xl hover:-translate-y-1 transition-all duration-300 border border-white/5 p-6 rounded-xl"
        >
      {/* Logo on top */}
      <div className="w-full flex justify-center mb-4">
        <div className="p-4 bg-white rounded-xl">
          <Image
            src={stock}
            alt="Roboinvesting Logo"
            className="object-contain w-32 h-32"
            width={128}
            height={128}
          />
        </div>
      </div>

      {/* Title */}
      <h3 className="text-teal-400 text-lg font-bold text-center mb-3">Roboinvesting</h3>
      <div className="flex justify-center mb-3">
        <span className="px-3 py-1 text-xs font-semibold rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
          Actively Recruiting
        </span>
      </div>

      {/* Description */}
      <p className="text-gray-300 text-sm leading-relaxed">
        A <strong>machine learning–driven trading simulation</strong> that analyzes
        <strong> technical indicators</strong>, <strong>macroeconomic signals</strong>,
        and <strong>risk metrics</strong> to generate
        <strong> data-informed trading decisions</strong>. Built for
        <strong> education</strong> and <strong>real-world financial modeling experience</strong>.
      </p>

                    {/* Email contact link */}
                        <a
                    href="mailto:bjmichaels.25@gmail.com"
                  aria-label="Contact project via email"
                  className="text-teal-400 mt-4 inline-block font-semibold hover:underline hover:text-teal-300 transition-colors"
                  >
                Get in Contact Now →
                  </a>
            </Card>

          <Card
            img={gtaa}
            heading="Sports Analytics Project"
            className="flex flex-col justify-between h-full hover:shadow-2xl hover:-translate-y-1 transition-all duration-300 border border-white/5 p-6 rounded-xl"
          >
            <div className="flex justify-center mb-3">
            <span className="px-3 py-1 text-xs font-semibold rounded-full bg-red-500/15 text-red-400 border border-red-500/30">
            Closed
            </span>
            </div>
            <p className="text-gray-300 text-sm leading-relaxed line-clamp-4">
              The <strong>sports analysis</strong> project is a space for students to explore
              sports-related data. Past projects include NFL projections, NBA roster
              optimization, and odds analysis using advanced statistics.
            </p>
          </Card>

          <Card
            img={blueconduit}
            heading="AI-Driven Investment Platform"
            className="flex flex-col justify-between h-full hover:shadow-2xl hover:-translate-y-1 transition-all duration-300 border border-white/5 p-6 rounded-xl"
          >
             <div className="flex justify-center mb-4">
              <span className="px-3 py-1 text-xs font-semibold rounded-full bg-red-500/15 text-red-400 border border-red-500/30">
                Past Project
              </span>
            </div>
            <p className="text-gray-300 text-sm leading-relaxed line-clamp-4">
              This innovative project reimagines financial planning as a <strong>conversational experience</strong>. The AI engages users to create personalized financial
              roadmaps using their data and predictive models.
            </p>
          </Card>

          <Card
            img={furnichanter}
            heading="Furnichanter (AI Interior Design)"
            linkUrl="https://nucleusfox.github.io/furnichanter.html"
            className="flex flex-col justify-between h-full hover:shadow-2xl hover:-translate-y-1 transition-all duration-300 border border-white/5 p-6 rounded-xl"
          >
              <div className="flex justify-center mb-4">
              <span className="px-3 py-1 text-xs font-semibold rounded-full bg-red-500/15 text-red-400 border border-red-500/30">
                Past Project
              </span>
            </div>
            <p className="text-gray-300 text-sm leading-relaxed line-clamp-4 mb-4">
              Furnichanter combines <strong>computer vision and AI</strong> to allow users to search
              for furniture using images and generate custom pieces from text
              descriptions.
            </p>
            <a
              href="https://nucleusfox.github.io/furnichanter.html"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Visit the Furnichanter project page"
              className="text-teal-400 mt-auto inline-block font-semibold hover:underline hover:text-teal-300 transition-colors"
            >
              Visit Project Page →
            </a>
          </Card>


           <Card
            img=""
            linkUrl="/projects"
            className="flex flex-col justify-between h-full hover:shadow-2xl hover:-translate-y-1 transition-all duration-300 border border-cyan-500/30 p-6 rounded-xl bg-gradient-to-br from-cyan-500/10 to-blue-500/10"
          >
            <h3 className="text-cyan-400 text-xl font-bold text-center mb-4">
              View All Past Projects
            </h3>
            <p className="text-gray-300 text-sm leading-relaxed mb-4">
              Explore our complete archive of data science projects spanning machine learning, analytics, and innovative applications across multiple semesters.
            </p>
            <a
              href="/projects"
              aria-label="See all past projects from DSGT"
              className="text-cyan-400 mt-auto inline-block font-semibold hover:underline hover:text-cyan-300 transition-colors"
            >
              Browse Projects Archive →
            </a>
          </Card>

        </div>
      </Section>

      <Section id="getinvolved" className="pb-20">
        <div className="text-center mb-20">
          <Major type="b">Get Involved</Major>
          <div className="mt-6">
            <Mini className="text-gray-300">Ready to start your data science journey? Check out these opportunities:</Mini>
          </div>
        </div>
        <div className="max-w-[1400px] mx-auto px-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-x-10 gap-y-12 justify-items-center">
            <div className="w-full max-w-[400px]">
              <EventCard
                img={slide1}
                heading="Become a Member"
                button_text="Sign Up Now"
                button_to="/tbd"
                rel="noopener noreferrer"
                className="hover:shadow-blue-500/30"
              >
                Take part in the largest data science organization at Georgia Tech! Join our community and mailing list.
              </EventCard>
            </div>

            <div className="w-full max-w-[400px]">
              <EventCard
                img={slide7}
                heading="Apply for Leadership"
                button_text="View Open Roles"
                button_to="/tbd"
                rel="noopener noreferrer"
                className="hover:shadow-cyan-500/30"
              >
                Join one of the many executive teams that help run DSGT, including projects, finance, and marketing.
              </EventCard>
            </div>

            <div className="w-full max-w-[400px]">
              <EventCard
                img={slide6}
                heading="Hacklytics 2026"
                when="Feb 20-22, 2026"
                button_text="More Details"
                button_to="#golden-byte"
                className="hover:shadow-green-500/30"
              >
                Golden Byte is Georgia Tech's premier 36-hour datathon. Theme: "Golden Byte" - A challenging weekend of data fun!
              </EventCard>
            </div>
          </div>
        </div>
      </Section>

      <Footer screen_width={windowWidth} />
    </div>
  );
};

export default Home;