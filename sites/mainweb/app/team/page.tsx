"use client";

import { useState, useEffect } from "react";
import Footer from "@/components/Footer";
import Navbar from "@/components/Navbar";
import Section from "@/components/Section";
import TeamCard from "@/components/TeamCard";
import PublicFrame from "@/components/PublicFrame";

import Aamogh from "@/assets/images/2025/aamogh.png";
import Diya from "@/assets/images/2025/diya.jpeg";
import Advisor from "@/assets/images/2025/jake.png";
import IDEaS from "@/assets/images/2025/ideas.png";

const Team = () => {
  const [windowWidth, setWindowWidth] = useState<number>(
    typeof window !== "undefined" ? window.innerWidth : 1024,
  );

  useEffect(() => {
    document.body.style.overflow = "auto";
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  return (
    <PublicFrame note="exec 2026–27">
      <div id="team-page" className="relative min-h-screen">
        <Navbar screen_width={windowWidth} page="team" />

        <main className="relative z-10 pt-40 pb-32">
          <div className="max-w-7xl mx-auto px-6 lg:px-12 mb-20 space-y-5">
            <p className="public-kicker">Executive board 2026–2027</p>
            <h1 className="public-display text-5xl md:text-7xl">
              The people who keep the bench running.
            </h1>
            <p className="public-lede max-w-2xl">
              Engineers, designers, and organizers behind the largest
              student-run data science organization at Georgia Tech.
            </p>
          </div>

          <Section id="teams" className="px-6 lg:px-12">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 max-w-7xl mx-auto">
              <TeamCard
                name="IDEaS @ Georgia Tech"
                title="Supervising Lab"
                img={IDEaS}
              >
                The Institute for Data Engineering and Science (IDEaS) is the
                Georgia Tech lab that oversees DS@GT. It connects government,
                industry, and academia to advance foundational data science
                research and provides the faculty expertise that powers our
                club.
              </TeamCard>

              <TeamCard
                name="Aamogh Sawant"
                title="President"
                href="https://aamogh.vercel.app/"
                img={Aamogh}
              >
                Aamogh oversees DSGT operations, leading the executive board and
                coordinating with faculty and industry partners to shape data
                science at Georgia Tech.
              </TeamCard>

              <TeamCard
                name="Diya Kaimal"
                title="Vice President & Co-Director of Hacklytics"
                img={Diya}
              >
                Diya serves as Vice President and Co-Director of{" "}
                <strong>Hacklytics</strong>, DSGT&apos;s flagship datathon,
                managing event organization, corporate sponsorships, and
                member-facing programming.
              </TeamCard>

              <TeamCard name="Nitya Patil" title="Director of Marketing">
                Nitya directs social media, graphic design, and outreach
                strategies to increase engagement with DSGT both on and off
                campus.
              </TeamCard>

              <TeamCard name="Samantha Forero" title="Director of Projects">
                Samantha oversees project logistics, managing the project portal
                and setting up research opportunities with professors and
                industry pros.
              </TeamCard>

              <TeamCard
                name="Aishi Agarwal"
                title="Co-Director of External Affairs"
              >
                Aishi develops strategic partnerships and manages sponsor
                communications to support club initiatives and industry
                collaboration.
              </TeamCard>

              <TeamCard
                name="Vishal Luthra"
                title="Co-Director of External Affairs"
              >
                Vishal manages sponsor communications and builds industry
                partnerships that support DSGT initiatives.
              </TeamCard>

              <TeamCard name="Minjee Yi" title="Co-Director of Logistics">
                Minjee coordinates logistics for club events and Hacklytics,
                managing smooth operations and collaborating with external
                sponsors.
              </TeamCard>

              <TeamCard
                name="Francisco Valentinotti"
                title="Co-Director of Logistics"
              >
                Francisco manages event logistics so club programs and
                Hacklytics run on schedule.
              </TeamCard>

              <TeamCard name="Yashika Reddy" title="Director of Events">
                Yashika manages room bookings, catering, and volunteer
                coordination, ensuring technical workshops and socials execute
                perfectly.
              </TeamCard>

              <TeamCard name="Sahith Rajesh" title="Co-Director of Content">
                Sahith leads the Content team in managing Bootcamp and Udemy
                courses, helping members build professional ML projects.
              </TeamCard>

              <TeamCard name="Victor Gong" title="Co-Director of Content">
                Victor oversees Bootcamp workshops, ensuring members learn core
                data science skills and complete polished, industry-ready
                projects.
              </TeamCard>

              <TeamCard
                name="Jacob Abernathy"
                title="Club Advisor"
                img={Advisor}
              >
                Jacob is an Assistant Professor in the School of Computer
                Science and serves as a faculty advisor to DS@GT. His research
                focuses on machine learning, optimization, and data-driven
                decision-making, with applications spanning economics and
                large-scale systems.
              </TeamCard>
            </div>
          </Section>

          <Footer screen_width={windowWidth} className="mt-32" />
        </main>
      </div>
    </PublicFrame>
  );
};

export default Team;
