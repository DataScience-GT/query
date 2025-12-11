"use client";

import { useState, useEffect, useMemo } from "react";
import Image from "next/image";

// Components
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

// Chart
import { Chart as ChartJS, ArcElement, Tooltip, Legend, TooltipItem } from "chart.js";
import { ClassData, MajorData } from "@/assets/Data/demographics";
import dynamic from "next/dynamic";

// Dynamically import Pie to avoid heavy SSR load
const Pie = dynamic(() => import("react-chartjs-2").then(mod => mod.Pie), { ssr: false });

ChartJS.register(ArcElement, Tooltip, Legend);

// Images
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

  // Memoize chart options for speed
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

      {/* About Section */}
      <Section id="about">
        <div className="flex flex-col-reverse md:flex-row items-center gap-10">
          <div className="md:w-1/2">
            <Major type="a">About Us</Major>
            <Mini>
              As the largest student-run data science organization at Georgia Tech,
              we provide technical skill development via club projects, workshops,
              guest speakers, and more. DSGT is open to all majors and focuses on
              projects, bootcamps, and Hacklytics.
            </Mini>
            <Mini>
              <LearnMore to="about">Meet the Team</LearnMore>
            </Mini>
          </div>
          <div className="md:w-1/2 w-full">
            <Image
              src={slide2}
              alt="The DSGT Exec Team"
              className="w-full h-96 object-cover rounded-xl"
              width={600}
              height={384}
              loading="lazy"
            />
          </div>
        </div>
      </Section>

      {/* Stats Section */}
      <Section id="stats">
        <Major type="b">Who We Are</Major>
        <Mini>In spring 2023, we had 504 DSGT members. Here's a snapshot of class and major demographics:</Mini>
        <div className="flex flex-wrap justify-evenly items-center gap-5 my-5">
          <div className="flex flex-col items-center w-80">
            <Minor>CLASS DEMOGRAPHICS</Minor>
            <Pie data={ClassData} options={chartOptions} className="h-80 w-80" />
          </div>
          <div className="flex flex-col items-center w-80">
            <Minor type="b">MAJOR DEMOGRAPHICS</Minor>
            <Pie data={MajorData} options={chartOptions} className="h-80 w-80" />
          </div>
        </div>
      </Section>

      {/* Bootcamp Section */}
      <Section id="bootcamp">
        <div className="flex flex-col-reverse md:flex-row items-center gap-10">
          <div className="md:w-1/2">
            <Major type="a">Bootcamp</Major>
            <Mini>
              Our bootcamp teaches core data science skills, from data cleaning to feature engineering.
              Learn Python, pandas, visualization, and machine learning fundamentals through hands-on projects.
            </Mini>
            <Mini>
              <LearnMore to="https://dsgtbootcamp.netlify.app/">Learn more at our Bootcamp site</LearnMore>
            </Mini>
          </div>
          <div className="md:w-1/2 w-full">
            <Image 
              src={slide8} 
              alt="Bootcamp" 
              className="w-full h-96 object-cover rounded-xl"
              width={600}
              height={384}
              loading="lazy"
            />
          </div>
        </div>
      </Section>

      {/* Hacklytics Section */}
      <Section id="hacklytics">
        <div className="flex flex-col md:flex-row items-center gap-10">
          <div className="md:w-1/2 w-full">
            <Image 
              src={slide6} 
              alt="Hacklytics" 
              className="w-full h-96 object-cover rounded-xl"
              width={600}
              height={384}
              loading="lazy"
            />
          </div>
          <div className="md:w-1/2">
            <Major type="b">Hacklytics</Major>
            <Mini>
              Hacklytics is Georgia Tech's premier 36-hour datathon brought to you by DSGT. 
              Join hundreds of students for a weekend of data science, workshops, and prizes.
              Theme for 2026: "Jurassic Park" — February 20-22, 2026.
            </Mini>
            <Mini>
              <LearnMore to="https://hacklytics.io">Learn more about Hacklytics 2026</LearnMore>
            </Mini>
          </div>
        </div>
      </Section>

      {/* Projects Section */}
      <Section id="projects">
        <Major type="a">Projects</Major>
        <Mini>
          Our projects give members hands-on experience while exploring the power of
          data science and AI across diverse applications.
        </Mini>

        <div className="flex flex-wrap justify-center gap-8 my-8 items-stretch">
          <Card
            img={dlp4}
            heading="Deep Learning Playground"
            linkUrl="https://datasciencegt-dlp.com/"
            className="max-w-sm flex flex-col justify-between h-full"
          >
            <p className="text-gray-200 text-sm leading-snug line-clamp-4">
              Deep Learning Playground is a user-friendly web app that provides an
              interactive and accessible introduction to Machine Learning and Deep
              Learning concepts.
            </p>
            <a
              href="https://datasciencegt-dlp.com/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#74b1aa] mt-2 inline-block font-semibold hover:underline"
            >
              Learn More →
            </a>
          </Card>

          <Card
            img={blueconduit}
            heading="AI-Driven Investment Platform"
            className="max-w-sm flex flex-col justify-between h-full"
          >
            <p className="text-gray-300 text-sm leading-snug line-clamp-4">
              This innovative project reimagines financial planning as a conversational
              experience. The AI engages users to create personalized financial
              roadmaps using their data.
            </p>
          </Card>

          <Card
            img={birdclef}
            heading="Kaggle CLEF"
            className="max-w-sm flex flex-col justify-between h-full"
          >
            <p className="text-gray-300 text-sm leading-snug line-clamp-4">
              A seminar-style introduction to data science competitions, including
              Kaggle and CLEF 2025. Members present, discuss research, and compete in
              internal challenges.
            </p>
          </Card>

          <Card
            img={furnichanter}
            heading="Furnichanter"
            linkUrl="https://nucleusfox.github.io/furnichanter.html"
            className="max-w-sm flex flex-col justify-between h-full"
          >
            <p className="text-gray-300 text-sm leading-snug line-clamp-4">
              Furnichanter combines AI and interior design, allowing users to search
              for furniture using images and generate custom pieces from text
              descriptions.
            </p>
            <a
              href="https://nucleusfox.github.io/furnichanter.html"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#74b1aa] mt-2 inline-block font-semibold hover:underline"
            >
              Learn More →
            </a>
          </Card>

          <Card
            img={gtaa}
            heading="Sports"
            className="max-w-sm flex flex-col justify-between h-full"
          >
            <p className="text-gray-300 text-sm leading-snug line-clamp-4">
              The sports analysis project is a space for students to explore
              sports-related data. Past projects include NFL projections, NBA roster
              optimization, and odds analysis.
            </p>
          </Card>
        </div>
      </Section>

      {/* Get Involved Section */}
      <Section id="getinvolved">
        <Major type="b">Get Involved</Major>
        <Mini>Check out these opportunities to get involved:</Mini>
        <div className="flex flex-wrap justify-between gap-5 my-5">
          <EventCard 
            img={slide1} 
            heading="Join DSGT" 
            button_text="Learn More" 
            button_to="https://member.datasciencegt.org"
          >
            Take part in the largest data science organization at Georgia Tech!
          </EventCard>

          <EventCard 
            img={slide7} 
            heading="Apply for Leadership Positions" 
            button_text="Learn More" 
            button_to="https://member.datasciencegt.org/portal/forms"
          >
            Join one of the many executive teams that help run DSGT!
          </EventCard>

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
      </Section>

      <Footer screen_width={windowWidth} />
    </div>
  );
};

export default Home;
