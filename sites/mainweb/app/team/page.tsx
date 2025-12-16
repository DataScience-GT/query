"use client";

import { useState, useEffect } from "react";

import Background from "@/components/Background";
import Footer from "@/components/Footer";
import Navbar from "@/components/Navbar";
import Section from "@/components/Section";
import SmallHero from "@/components/SmallHero";
import TeamCard from "@/components/TeamCard";

import Shreiyas from "@/assets/images/portraits/2022/Shreiyas.png";
import Archie from "@/assets/images/portraits/2024/Archie.jpg";
import Emma from "@/assets/images/portraits/2024/Emma.jpeg";
import Smera from "@/assets/images/portraits/2023/Smera.jpeg";
import Harsha from "@/assets/images/portraits/2024/Harsha.jpeg";
import Lavan from "@/assets/images/portraits/2024/Lavan.jpeg";
import Nikita from "@/assets/images/portraits/2024/Nikita.jpeg";
import Ryan from "@/assets/images/portraits/2024/Ryan.jpeg";
import Shreya from "@/assets/images/portraits/2024/Shreya.jpg";
import Dhruv from "@/assets/images/portraits/2024/Dhruv.jpeg";
import Aditi from "@/assets/images/portraits/2024/Aditi.jpeg";
import Om from "@/assets/images/portraits/2024/Om.jpeg";

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
            <TeamCard name="Archie Goli" title="President" img={Archie}>
              The executive board is in charge of the functioning of Data Science
              at Georgia Tech - from administering the bootcamp, running projects,
              holding super cool events with companies like Amazon and Accenture as
              well as our annual data science datathon, Golden Byte, every year!
            </TeamCard>

            <TeamCard name="Shreiyas Saraf" title="Director of External Affairs" img={Shreiyas}>
              External Affairs is responsible for communicating with corporations
              for representation at meetings and sponsorship for large club
              events. All special events such as the Hackathon also fall within
              the duties of External Affairs.
            </TeamCard>

            <TeamCard name="Emma Lawton" title="Director of Golden Byte" img={Emma}>
              The Golden Byte team works to organize and conduct DSGT's flagship
              datathon every Spring. This is a great way to network with sponsors
              and develop strong communication and management skills. Plus, you get
              to meet many new people every year!
            </TeamCard>

            <TeamCard name="Nikita Agnihotri" title="Director of Logistics" img={Nikita}>
              The Logistics team coordinates and manages the logistics for DSGT
              and our annual flagship hackathon held every Spring. Engaging in this
              event provides an excellent opportunity to collaborate with sponsors,
              enhance communication and management proficiencies, as well as connect
              with a diverse range of individuals each year.
            </TeamCard>

            <TeamCard name="Lavan Vivekanandasarma" title="Director of Technology" img={Lavan}>
              The Technology Team specializes in frontend web-development as well as
              backend systems. We work on the many websites used by DSGT and Golden Byte,
              most notably being this site and the Membership Portal.
            </TeamCard>

            <TeamCard name="Aditi Koratpallikar" title="Co-Director of Content" img={Aditi}>
              The content team manages Bootcamp and Udemy courses, teaching core data
              science skills from start to finish. We offer workshops on beginner-friendly
              data science and machine learning topics, helping members complete
              professional projects by the end of Bootcamp.
            </TeamCard>

            <TeamCard name="Ryan Lundqvist" title="Co-Director of Content" img={Ryan}>
              The content team manages the Bootcamp and Udemy courses, where we teach
              our members core data science skills on a start-to-finish journey. We
              provide workshops on beginner-friendly data science and machine learning
              topics and help members complete a fully polished and professional
              data science project by the end of Bootcamp.
            </TeamCard>

            <TeamCard name="Shreya Dudeja" title="Co-Director of Marketing" img={Shreya}>
              The marketing team focuses on social media initiatives, graphic design,
              newsletters, outreach, and more to increase engagement with DSGT both
              on and off campus. Our work consists of creating digital and in-person
              marketing strategies for both DSGT and Golden Byte!
            </TeamCard>

            <TeamCard name="Smera Bhatia" title="Co-Director of Marketing" img={Smera}>
              The marketing team focuses on social media initiatives, graphic design,
              newsletters, outreach, and more to increase engagement with DSGT both
              on and off campus. Our work consists of creating digital and in-person
              marketing strategies for both DSGT and Golden Byte!
            </TeamCard>

            <TeamCard name="Dhruv Shah" title="Co-Director of Events" img={Dhruv}>
              The Directors of Events manage event logistics, including room bookings,
              decor, and food arrangements. Responsibilities include handling invoices,
              grocery and storage locker runs, and coordinating volunteers. They also
              liaise with external parties to ensure smooth execution of events,
              organize booths, workshops, and banners, and create application and RSVP forms.
            </TeamCard>

            <TeamCard name="Om Rajpal" title="Co-Director of Events" img={Om}>
              The Directors of Events manage event logistics, including room bookings,
              decor, and food arrangements. Responsibilities include handling invoices,
              grocery and storage locker runs, and coordinating volunteers. They also
              liaise with external parties to ensure smooth execution of events,
              organize booths, workshops, and banners, and create application and RSVP forms.
            </TeamCard>

            <TeamCard name="Harsha Gaddipati" title="Director of Projects" img={Harsha}>
              The Director of Projects oversees project logistics, regularly meeting
              with leads for updates and managing the project portal. They set up new
              projects with professors and industry professionals, ensure around six
              active projects per semester, and oversee the project application process.
              Additionally, they maintain the projects spreadsheet.
            </TeamCard>
          </div>
        </Section>

        <Footer screen_width={windowWidth} />
      </main>
    </div>
  );
};

export default Team;
