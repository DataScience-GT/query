"use client";

import { useState, useEffect } from "react";

import Background from "@/components/Background";
import Footer from "@/components/Footer";
import Navbar from "@/components/Navbar";
import Section from "@/components/Section";
import SmallHero from "@/components/SmallHero";
import TeamCard from "@/components/TeamCard";

import President from "@/assets/images/2025/aditi.jpg";
import ViceP from "@/assets/images/2025/nitika.jpg";
import Logistics1 from "@/assets/images/2025/alysha.png";
import Logistics2 from "@/assets/images/2025/diya.jpeg";
import Events from "@/assets/images/2025/aryan.jpeg"
import Marketing from "@/assets/images/2025/smera.png"
import Tech from "@/assets/images/2025/aamogh.png";
import Content1 from "@/assets/images/2025/anushka.jpg"
import Content2 from "@/assets/images/2025/glenne.png"
import External1 from "@/assets/images/2025/sarvesh.jpg"
import External2 from "@/assets/images/2025/vidhi.jpeg"
import Project from "@/assets/images/2025/anika.jpg"

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
    <div id="about-page" className="relative min-h-screen">
      {/* Background */}
      <Background className="absolute inset-0 z-0" />

      {/* Navbar - fixed at top, smooth scroll */}
      <Navbar
        screen_width={windowWidth}
        className="fixed top-0 left-0 w-full z-30"
        page="team"
      />

      {/* Main content */}
      <main className="relative z-10 pt-[80px]">
        <SmallHero
          title="Meet The Team"
          desc="The people who make DSGT what it is"
        />

        <Section id="teams" makefull>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-10 px-5 max-w-7xl mx-auto">
            <TeamCard name="Aditi Koratpallikar" title="President" img={President}>
              Aditi oversees all operations of DSGT, ensuring the club runs smoothly across projects, workshops, events, and initiatives like Hacklytics, while leading the executive board and coordinating with faculty and industry partners. This role provides opportunities to develop leadership, organizational, and strategic management skills while shaping the future of data science at Georgia Tech.
            </TeamCard>

            <TeamCard name="Nitika Agnihotri" title="Vice President" img={ViceP}>
              Nitika leads <strong>Hacklytics</strong>, DSGT's flagship datathon held every Spring.
              Her role includes communicating with corporations for sponsorships, organizing special events, and managing the datathon.
              This position provides opportunities to network with sponsors, develop strong communication and management skills, and meet many new people each year.
            </TeamCard>

            <TeamCard name="Alysha Irvin" title="Co-Director of Logistics" img={Logistics1}>
              Alysha Irvin coordinates and manages logistics for DSGT events and Hacklytics, ensuring smooth operations. This role provides her opportunities to collaborate with sponsors, enhance communication skills, and develop strong event management experience.

            </TeamCard>

            <TeamCard name="Diya Kaimal" title="Co-Director of Logistics" img={Logistics2}>
              Diya Kaimal coordinates and manages logistics for DSGT events and Hacklytics, ensuring smooth operations. This role provides her opportunities to collaborate with sponsors, enhance communication skills, and develop strong event management experience.
            </TeamCard>

            <TeamCard name="Aamogh Sawant" title="Director of Technology" img={Tech}>
              Aamogh Sawant leads the Technology Team, which specializes in frontend web development as well as backend systems. The team works on the many websites used by DSGT, most notably this site and the Membership Portal, ensuring smooth functionality and user experience.
            </TeamCard>

            <TeamCard name="Smera Bhatia" title="Director of Marketing" img={Marketing}>
              Smera Bhatia leads the Marketing Team, which focuses on social media initiatives, graphic design, newsletters, outreach, and more to increase engagement with DSGT both on and off campus. The team creates digital and in-person marketing strategies to promote DSGT and its events effectively.
            </TeamCard>

            <TeamCard name="Aryan Hazra" title="Director of Events" img={Events}>
              Aryan Hazra manages event logistics including room bookings, decor, and food arrangements. His responsibilities include handling invoices, grocery and storage locker runs, coordinating volunteers, and liaising with external parties to ensure smooth execution of events. He also organizes booths, workshops, banners, and creates application and RSVP forms.

            </TeamCard>

            <TeamCard name="Sarvesh Tiku" title="Co-Director of External Affairs" img={External1}>
              Sarvesh manages communication and relationships with external organizations and sponsors.
              He coordinates partnerships, outreach, and engagement for DSGT events and initiatives, helping the club build strong connections with the industry and the community.
            </TeamCard>

            <TeamCard name="Vidhi Gupta" title="Co-Director of External Affairs" img={External2}>
              Vidhi focuses on developing and maintaining relationships with external partners and sponsors.
              She supports outreach efforts, manages communication for club initiatives, and helps ensure strong collaboration with the industry and community.
            </TeamCard>

            <TeamCard name="Anushka Jain" title="Co-Director of Content" img={Content1}>
              Anushka leads the content team in managing Bootcamp and Udemy courses, teaching core data science skills from start to finish.
              She organizes workshops on beginner-friendly data science and machine learning topics, helping members build professional-quality projects by the end of Bootcamp.
            </TeamCard>

            <TeamCard name="Glenne Dela Torre" title="Co-Director of Content" img={Content2}>
              Glenne oversees the Bootcamp and Udemy courses, guiding members through the full learning journey of core data science skills.
              She conducts workshops on beginner-friendly topics in data science and machine learning, ensuring members complete polished, professional projects by the end of the program.
            </TeamCard>

            <TeamCard name="Anika V" title="Director of Projects" img={Project}>
              Anika oversees project logistics, regularly meeting with project leads for updates and managing the project portal.
              She sets up new projects with professors and industry professionals, ensures about six active projects per semester, manages the project application process, and maintains the projects spreadsheet.
            </TeamCard>
          </div>
        </Section>

        <Footer screen_width={windowWidth} />
      </main>
    </div>
  );
};

export default Team;
