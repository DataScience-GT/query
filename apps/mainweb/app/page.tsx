"use client";

import { useState, useEffect, useMemo } from "react";
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
import { ClassData, MajorData } from "@/assets/Data/demographics";
import dynamic from "next/dynamic";

const Pie = dynamic(() => import("react-chartjs-2").then(mod => mod.Pie), { ssr: false });

ChartJS.register(ArcElement, Tooltip, Legend);

import slide1 from "@/assets/images/slides/slide1.jpg";
import slide2 from "@/assets/images/slides/slide2.jpg";
import slide6 from "@/assets/images/slides/slide6.jpg";
import slide7 from "@/assets/images/slides/slide7.jpg";
import slide8 from "@/assets/images/slides/slide8.jpg";

import dlp4 from "@/assets/images/logos/dlp4.png";
import furnichanter from "@/assets/images/logos/furnichanter.png";
import birdclef from "@/assets/images/logos/birdclef.png";
import gtaa from "@/assets/images/logos/gtaa.png";
import shepcenter from "@/assets/images/logos/shepcenter.jpeg";
import blueconduit from "@/assets/images/logos/blueconduit.png";

const Home = () => {
  const [windowWidth, setWindowWidth] = useState(0);

  useEffect(() => {
    setWindowWidth(window.innerWidth);
    document.body.style.overflow = "auto";
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const chartOptions = useMemo(() => ({
    plugins: {
      tooltip: {
        callbacks: {
          label: (context: TooltipItem<'pie'>) => {
            const sum = context.dataset.data.reduce((a: number, b: number) => a + b, 0);
            const percent = Math.round((context.parsed * 1000) / sum) / 10;
            return ` ${context.label}: ${context.parsed} (${percent}%)`;
          },
        },
      },
    },
    color: "#fff",
  }), []);

  return (
    <div id="home-page" className="relative">
      <Background />
      <Navbar screen_width={windowWidth} page="home" />
      <Hero screen_width={windowWidth} />

      <Section id="about">
        <div className="flex flex-col-reverse md:flex-row items-center gap-10">
          <div className="md:w-1/2 space-y-6">
            <Major type="a">About Us</Major>
            <Mini>
              As the largest student-run data science organization at Georgia Tech,
              we provide technical skill development via club projects, workshops,
              guest speakers, and more. DSGT is open to all majors and focuses on
              projects, bootcamps, and Hacklytics.
            </Mini>
            <Mini>
              <LearnMore to="/team">Meet the Team</LearnMore>
            </Mini>
          </div>
          <div className="md:w-1/2 w-full group">
            <div className="relative overflow-hidden rounded-2xl shadow-2xl transition-transform duration-500 hover:scale-[1.02]">
              <div className="absolute inset-0 bg-gradient-to-tr from-blue-600/20 to-purple-600/20 opacity-0 group-hover:opacity-100 transition-opacity duration-500 z-10" />
              <Image
                src={slide2}
                alt="The DSGT Exec Team"
                className="w-full h-96 object-cover"
                width={600}
                height={384}
                loading="lazy"
              />
            </div>
          </div>
        </div>
      </Section>

      <Section id="stats">
        <Major type="b">Who We Are</Major>
        <Mini>In spring 2023, we had <span className="font-bold text-blue-400">504 DSGT members</span>. Here's a snapshot of class and major demographics:</Mini>
        <div className="flex flex-wrap justify-evenly items-center gap-8 my-8">
          <div className="flex flex-col items-center w-80 p-6 rounded-2xl bg-white/5 backdrop-blur-sm border border-white/10 shadow-xl hover:shadow-2xl transition-all duration-300 hover:bg-white/10">
            <Minor>CLASS DEMOGRAPHICS</Minor>
            <div className="mt-4">
              <Pie data={ClassData} options={chartOptions} className="h-80 w-80" />
            </div>
          </div>
          <div className="flex flex-col items-center w-80 p-6 rounded-2xl bg-white/5 backdrop-blur-sm border border-white/10 shadow-xl hover:shadow-2xl transition-all duration-300 hover:bg-white/10">
            <Minor type="b">MAJOR DEMOGRAPHICS</Minor>
            <div className="mt-4">
              <Pie data={MajorData} options={chartOptions} className="h-80 w-80" />
            </div>
          </div>
        </div>
      </Section>

      <Section id="bootcamp">
        <div className="flex flex-col-reverse md:flex-row items-center gap-10">
          <div className="md:w-1/2 space-y-6">
            <Major type="a">Bootcamp</Major>
            <Mini>
              Our bootcamp teaches core data science skills, from data cleaning to feature engineering.
              Learn Python, pandas, visualization, and machine learning fundamentals through hands-on projects.
            </Mini>
            <Mini>
              <LearnMore to="https://dsgtbootcamp.netlify.app/">Learn more at our Bootcamp site</LearnMore>
            </Mini>
          </div>
          <div className="md:w-1/2 w-full group">
            <div className="relative overflow-hidden rounded-2xl shadow-2xl transition-transform duration-500 hover:scale-[1.02]">
              <div className="absolute inset-0 bg-gradient-to-br from-teal-500/20 to-blue-500/20 opacity-0 group-hover:opacity-100 transition-opacity duration-500 z-10" />
              <div className="absolute -inset-1 bg-gradient-to-r from-teal-500 to-blue-500 rounded-2xl opacity-0 group-hover:opacity-30 blur transition-opacity duration-500" />
              <Image
                src={slide8}
                alt="Bootcamp"
                className="w-full h-96 object-cover relative z-10"
                width={600}
                height={384}
                loading="lazy"
              />
            </div>
          </div>
        </div>
      </Section>

      <Section id="hacklytics">
        <div className="flex flex-col md:flex-row items-center gap-10">
          <div className="md:w-1/2 w-full group">
            <div className="relative overflow-hidden rounded-2xl shadow-2xl transition-transform duration-500 hover:scale-[1.02]">
              <div className="absolute inset-0 bg-gradient-to-tl from-purple-600/20 to-pink-600/20 opacity-0 group-hover:opacity-100 transition-opacity duration-500 z-10" />
              <div className="absolute -inset-1 bg-gradient-to-r from-purple-600 to-pink-600 rounded-2xl opacity-0 group-hover:opacity-40 blur transition-opacity duration-500" />
              <Image
                src={slide6}
                alt="Hacklytics"
                className="w-full h-96 object-cover relative z-10"
                width={600}
                height={384}
                loading="lazy"
              />
            </div>
          </div>
          <div className="md:w-1/2 space-y-6">
            <Major type="b">Hacklytics</Major>
            <Mini>
              Hacklytics is Georgia Tech's premier 36-hour datathon brought to you by DSGT.
              Join hundreds of students for a weekend of data science, workshops, and prizes.
              Theme for 2026: <span className="font-bold text-purple-400">"Jurassic Park"</span> — February 20-22, 2026.
            </Mini>
            <Mini>
              <LearnMore to="https://hacklytics.io">Learn more about Hacklytics 2026</LearnMore>
            </Mini>
          </div>
        </div>
      </Section>

      <Section id="projects">
        <Major type="a">Projects</Major>
        <Mini>
          Our projects give members hands-on experience while exploring the power of
          data science and AI across diverse applications.
        </Mini>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 my-10">
          <Card
            img={dlp4}
            heading="Deep Learning Playground"
            linkUrl="https://datasciencegt-dlp.com/"
            className="flex flex-col justify-between h-full hover:shadow-2xl hover:-translate-y-1 transition-all duration-300"
          >
            <p className="text-gray-200 text-sm leading-relaxed line-clamp-4 mb-4">
              Deep Learning Playground is a user-friendly web app that provides an
              interactive and accessible introduction to Machine Learning and Deep
              Learning concepts.
            </p>
            <a
              href="https://datasciencegt-dlp.com/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#74b1aa] mt-auto inline-block font-semibold hover:underline hover:text-[#5a9e97] transition-colors"
            >
              Learn More →
            </a>
          </Card>

          <Card
            img={blueconduit}
            heading="AI-Driven Investment Platform"
            className="flex flex-col justify-between h-full hover:shadow-2xl hover:-translate-y-1 transition-all duration-300"
          >
            <p className="text-gray-200 text-sm leading-relaxed line-clamp-4">
              This innovative project reimagines financial planning as a conversational
              experience. The AI engages users to create personalized financial
              roadmaps using their data.
            </p>
          </Card>

          <Card
            img={birdclef}
            heading="Kaggle CLEF"
            className="flex flex-col justify-between h-full hover:shadow-2xl hover:-translate-y-1 transition-all duration-300"
          >
            <p className="text-gray-200 text-sm leading-relaxed line-clamp-4">
              A seminar-style introduction to data science competitions, including
              Kaggle and CLEF 2025. Members present, discuss research, and compete in
              internal challenges.
            </p>
          </Card>

          <Card
            img={furnichanter}
            heading="Furnichanter"
            linkUrl="https://nucleusfox.github.io/furnichanter.html"
            className="flex flex-col justify-between h-full hover:shadow-2xl hover:-translate-y-1 transition-all duration-300"
          >
            <p className="text-gray-200 text-sm leading-relaxed line-clamp-4 mb-4">
              Furnichanter combines AI and interior design, allowing users to search
              for furniture using images and generate custom pieces from text
              descriptions.
            </p>
            <a
              href="https://nucleusfox.github.io/furnichanter.html"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#74b1aa] mt-auto inline-block font-semibold hover:underline hover:text-[#5a9e97] transition-colors"
            >
              Learn More →
            </a>
          </Card>

          <Card
            img={gtaa}
            heading="Sports"
            className="flex flex-col justify-between h-full hover:shadow-2xl hover:-translate-y-1 transition-all duration-300"
          >
            <p className="text-gray-200 text-sm leading-relaxed line-clamp-4">
              The sports analysis project is a space for students to explore
              sports-related data. Past projects include NFL projections, NBA roster
              optimization, and odds analysis.
            </p>
          </Card>
        </div>
      </Section>

      <Section id="getinvolved" className="pb-20">
        <div className="text-center mb-20">
          <Major type="b">Get Involved</Major>
          <div className="mt-6">
            <Mini>Check out these opportunities to get involved:</Mini>
          </div>
        </div>
        <div className="max-w-[1400px] mx-auto px-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-10 gap-y-12 justify-items-center">
            <div className="w-full max-w-[400px]">
              <EventCard
                img={slide1}
                heading="Join DSGT"
                button_text="Learn More"
                button_to="https://member.datasciencegt.org"
              >
                Take part in the largest data science organization at Georgia Tech!
              </EventCard>
            </div>

            <div className="w-full max-w-[400px]">
              <EventCard
                img={slide7}
                heading="Apply for Leadership Positions"
                button_text="Learn More"
                button_to="https://member.datasciencegt.org/portal/forms"
              >
                Join one of the many executive teams that help run DSGT!
              </EventCard>
            </div>

            <div className="w-full max-w-[400px] md:col-span-2 lg:col-span-1 md:justify-self-center">
              <EventCard
                img={slide6}
                heading="Hacklytics 2026"
                when="Feb 20-22, 2026"
                button_text="Learn More"
                button_to="#hacklytics"
              >
                Georgia Tech's premier 36-hour datathon. Theme: "Jurassic Park"
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