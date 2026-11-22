import type { Metadata } from "next";
// Asset imports — reuse in-repo photos only
import Aamogh from "@/assets/images/2025/aamogh.png";
import Diya from "@/assets/images/2025/diya.jpeg";
import IDEaS from "@/assets/images/2025/ideas.png";
import Advisor from "@/assets/images/2025/jake.png";
import PublicPage, { SectionHeading } from "@/components/PublicPage";
import TeamCard from "@/components/TeamCard";

export const metadata: Metadata = {
  title: "Team",
  alternates: { canonical: "/team" },
};

const Team = () => {
  return (
    <PublicPage
      eyebrow="Executive board 2026-2027"
      title="Meet the team"
      lede="The students who run DSGT: the bootcamp, club projects, events, and Hacklytics."
    >
      <section className="mb-32">
        <SectionHeading>Board</SectionHeading>
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
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
            Diya serves as Vice President and Co-Director of Hacklytics,
            DSGT&apos;s flagship datathon, managing event organization,
            corporate sponsorships, and member-facing programming.
          </TeamCard>

          <TeamCard name="Nitya Patil" title="Director of Marketing">
            Nitya directs social media, graphic design, and outreach strategies
            to increase engagement with DSGT both on and off campus.
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
            managing smooth operations and collaborating with external sponsors.
          </TeamCard>

          <TeamCard
            name="Francisco Valentinotti"
            title="Co-Director of Logistics"
          >
            Francisco manages event logistics so club programs and Hacklytics
            run on schedule.
          </TeamCard>

          <TeamCard name="Yashika Reddy" title="Director of Events">
            Yashika manages room bookings, catering, and volunteer coordination,
            ensuring technical workshops and socials execute perfectly.
          </TeamCard>

          <TeamCard name="Sahith Rajesh" title="Co-Director of Content">
            Sahith leads the Content team in managing Bootcamp and Udemy
            courses, helping members build professional ML projects.
          </TeamCard>

          <TeamCard name="Victor Gong" title="Co-Director of Content">
            Victor oversees Bootcamp workshops, ensuring members learn core data
            science skills and complete polished, industry-ready projects.
          </TeamCard>
        </div>
      </section>

      <section>
        <SectionHeading>Faculty</SectionHeading>
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <TeamCard name="Jacob Abernathy" title="Club Advisor" img={Advisor}>
            Jacob is an Assistant Professor in the School of Computer Science
            and serves as a faculty advisor to DS@GT. His research focuses on
            machine learning, optimization, and data-driven decision-making,
            with applications spanning economics and large-scale systems.
          </TeamCard>

          <TeamCard
            name="IDEaS @ Georgia Tech"
            title="Supervising Lab"
            img={IDEaS}
          >
            The Institute for Data Engineering and Science (IDEaS) is the
            Georgia Tech lab that oversees DS@GT. It connects government,
            industry, and academia to advance foundational data science research
            and provides the faculty expertise that powers our club.
          </TeamCard>
        </div>
      </section>
    </PublicPage>
  );
};

export default Team;
