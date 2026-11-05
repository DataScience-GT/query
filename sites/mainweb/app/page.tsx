import Image from "next/image";
import type { StaticImageData } from "next/image";
import Link from "next/link";

import {
  STATUS_CLASSES,
  STATUS_LABELS,
  groupClubProjects,
  isExternalJoin,
  joinHref,
  joinLabel,
} from "@/lib/club-projects";
import { loadClubProjects } from "@/lib/club-projects.server";

import Navbar from "@/components/Navbar";
import Hero from "@/components/Hero";
import Section from "@/components/Section";
import Card from "@/components/Card";
import Footer from "@/components/Footer";
import HomeCharts from "@/components/HomeCharts";

import slide1 from "@/assets/images/slides/slide1.jpg";
import squad from "@/assets/images/2025/squad.jpg";
import slide6 from "@/assets/images/slides/slide6.jpg";
import slide7 from "@/assets/images/slides/slide7.jpg";
import slide9 from "@/assets/images/slides/slide9.jpg";
import arc from "@/assets/images/logos/arc-logo-v3.png";
import gtaa from "@/assets/images/logos/gtaa.png";
import stock from "@/assets/images/logos/stock.png";
import trading from "@/assets/images/logos/trading.png";

export const revalidate = 300;

const PROJECT_LOGOS: Record<string, StaticImageData> = {
  arc,
  roboinvesting: stock,
  "sports-analytics": gtaa,
  "dsgt-website": trading,
};

export default async function HomePage() {
  const projects = await loadClubProjects();
  const { current: currentProjects } = groupClubProjects(projects);

  return (
    <div
      id="home-page"
      className="relative bg-[#1A1A1A] text-gray-400 selection:bg-[#00A8A8]/30 overflow-x-hidden"
    >
      <Navbar
        page="home"
        className="fixed top-0 z-50 border-b border-white/5 bg-[#1A1A1A]/80 backdrop-blur-md"
      />
      <Hero />

      {/* ABOUT SECTION */}
      <Section id="about" className="py-32 relative z-10">
        <div className="max-w-7xl mx-auto px-6 lg:px-12 grid lg:grid-cols-2 gap-16 items-center">
          <div className="space-y-8">
            <h2 className="text-white text-5xl md:text-6xl font-bold tracking-tighter leading-none">
              About us.
            </h2>
            <p className="text-lg text-gray-300 leading-relaxed max-w-xl border-l-2 border-[#00A8A8]/20 pl-6">
              As the{" "}
              <strong className="text-white">
                largest student-run data science organization at Georgia Tech
              </strong>
              , we provide technical skill development via club projects,
              workshops, and guest speakers.
            </p>
            <Link
              href="/team"
              className="inline-flex items-center min-h-11 md:min-h-0 text-[#00A8A8] font-mono text-xs uppercase tracking-[0.2em] border-b border-[#00A8A8]/30 pb-1 hover:text-white transition-colors"
            >
              Meet the Team →
            </Link>
            <Link
              href="/events"
              className="ml-6 inline-flex items-center min-h-11 md:min-h-0 text-[#00A8A8] font-mono text-xs uppercase tracking-[0.2em] border-b border-[#00A8A8]/30 pb-1 hover:text-white transition-colors"
            >
              Club events →
            </Link>
          </div>
          <div className="relative group">
            <div className="absolute -inset-1 bg-[#00A8A8]/20 rounded-xl blur-lg opacity-0 group-hover:opacity-100 transition duration-500"></div>
            <Image
              src={squad}
              alt="DSGT Executive Board"
              className="relative rounded-xl border border-white/10 shadow-2xl transition-all duration-700"
              width={800}
              height={450}
              priority
              placeholder="blur"
            />
          </div>
        </div>
      </Section>

      {/* STATS SECTION */}
      <Section
        id="stats"
        className="py-32 border-y border-white/5 glass-section relative z-10"
      >
        <div className="max-w-7xl mx-auto px-6 lg:px-12">
          <div className="text-center mb-20 space-y-4">
            <h2 className="text-white text-4xl md:text-5xl font-bold tracking-tight leading-none">
              Our club.
            </h2>
            <p className="font-mono text-xs text-[#00A8A8] uppercase tracking-[0.4em]">
              550+ Verified Members
            </p>
          </div>
          <HomeCharts />
        </div>
      </Section>

      {/* BOOTCAMP SECTION */}
      <Section id="bootcamp" className="py-32 relative z-10">
        <div className="max-w-7xl mx-auto px-6 lg:px-12 grid lg:grid-cols-2 gap-20 items-center">
          <div className="order-2 lg:order-1 relative">
            <Image
              src={slide9}
              alt="Bootcamp Session"
              className="rounded-xl border border-white/10 shadow-xl transition-all duration-700"
              width={600}
              height={400}
              placeholder="blur"
            />
          </div>
          <div className="space-y-8 order-1 lg:order-2">
            <h2 className="text-white text-5xl md:text-6xl font-bold tracking-tighter leading-none">
              Bootcamp.
            </h2>
            <p className="text-gray-300 leading-relaxed border-l-2 border-[#00A8A8]/20 pl-6">
              Teaching core skills from{" "}
              <span className="text-white">data cleaning</span> to{" "}
              <span className="text-white">model building</span>. Learn Python
              and pandas through hands-on project work, one session a week
              for nine weeks.
            </p>
            <Link
              href="/bootcamp"
              className="inline-block bg-white text-black px-8 py-4 rounded-sm font-bold text-xs uppercase tracking-widest hover:bg-[#00A8A8] hover:text-white transition-all shadow-lg shadow-white/5"
            >
              See the bootcamp
            </Link>
          </div>
        </div>
      </Section>

      {/* HACKLYTICS SECTION */}
      <Section
        id="golden-byte"
        className="py-32 border-y border-white/5 relative z-10"
      >
        <div className="max-w-7xl mx-auto px-6 lg:px-12 grid lg:grid-cols-2 gap-20 items-center">
          <div className="space-y-8">
            <h2 className="text-white text-5xl md:text-6xl font-bold tracking-tighter leading-none">
              Hacklytics.
            </h2>
            <p className="text-gray-300 leading-relaxed border-l-2 border-amber-500/20 pl-6">
              Georgia Tech&apos;s premier{" "}
              <span className="text-white">36-hour datathon</span>. Join
              hundreds of students for a weekend of data science challenges and
              workshops.
            </p>
            <Link
              href="/hacklytics"
              className="inline-block border border-amber-500/30 text-amber-500 px-8 py-4 rounded-sm font-bold text-xs uppercase tracking-widest hover:bg-amber-500 hover:text-black transition-all"
            >
              About Hacklytics
            </Link>
          </div>
          <div className="relative">
            <Image
              src={slide6}
              alt="Hacklytics Event"
              className="rounded-xl border border-white/10 shadow-xl transition-all duration-700"
              width={600}
              height={400}
              placeholder="blur"
            />
          </div>
        </div>
      </Section>

      {/* PROJECTS SECTION */}
      <Section id="projects" className="py-32 relative z-10">
        <div className="max-w-7xl mx-auto px-6 lg:px-12">
          <div className="mb-16 space-y-2">
            <h2 className="text-white text-5xl md:text-6xl font-bold tracking-tighter leading-none">
              Projects.
            </h2>
            <p className="font-mono text-xs text-[#00A8A8] uppercase tracking-[0.3em]">
              Member projects
            </p>
          </div>

          {currentProjects.length === 0 ? (
            <p className="text-gray-300">
              The project roster is being updated —{" "}
              <Link
                href="/projects"
                className="text-[#00A8A8] hover:text-white transition-colors"
              >
                see all club projects
              </Link>
              .
            </p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {currentProjects.map((project) => {
                const logo = PROJECT_LOGOS[project.slug];
                const href = joinHref(project);
                const label = joinLabel(project);

                return (
                  <Card
                    key={project.id}
                    className="flex flex-col h-full bg-[#0a0a0a] border border-white/5 p-8 rounded-xl hover:border-[#00A8A8]/40 transition-all group shadow-2xl"
                  >
                    {logo && (
                      <div className="w-full flex justify-center mb-6">
                        <div className="p-4 bg-white/5 rounded-xl group-hover:bg-[#00A8A8]/10 transition-all">
                          <Image
                            src={logo}
                            alt={project.name}
                            width={80}
                            height={80}
                            className="w-20 h-20 object-contain"
                            placeholder="blur"
                          />
                        </div>
                      </div>
                    )}
                    <h3 className="text-white text-xl font-bold text-center mb-2">
                      {project.name}
                    </h3>
                    <div className="flex justify-center mb-4">
                      <span
                        className={`px-2 py-0.5 text-[11px] font-mono rounded border uppercase tracking-widest ${STATUS_CLASSES[project.status]}`}
                      >
                        {STATUS_LABELS[project.status]}
                      </span>
                    </div>
                    <p className="text-sm text-gray-400 text-center mb-4 leading-relaxed">
                      {project.summary}
                    </p>
                    <p className="text-xs font-mono text-gray-400 text-center mb-6">
                      {project.leadName
                        ? `Lead: ${project.leadName}`
                        : "Lead: open"}
                    </p>
                    {isExternalJoin(project) ? (
                      <a
                        href={href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center justify-center min-h-11 md:min-h-0 text-[#00A8A8] font-mono text-xs uppercase mt-auto text-center hover:text-white transition-colors tracking-[0.2em]"
                      >
                        {label} →
                      </a>
                    ) : (
                      <Link
                        href={href}
                        className="inline-flex items-center justify-center min-h-11 md:min-h-0 text-[#00A8A8] font-mono text-xs uppercase mt-auto text-center hover:text-white transition-colors tracking-[0.2em]"
                      >
                        {label} →
                      </Link>
                    )}
                  </Card>
                );
              })}

              <Link
                href="/projects"
                className="bg-[#00A8A8] p-8 rounded-xl flex flex-col justify-between hover:bg-[#008f8f] transition-all shadow-xl shadow-[#00A8A8]/10 group"
              >
                <div className="space-y-4">
                  <h3 className="text-black text-2xl font-bold tracking-tight">
                    All projects.
                  </h3>
                  <p className="text-black/80 text-sm font-medium leading-relaxed">
                    Every project running this term, what each one needs, and
                    the archive of what members built before.
                  </p>
                </div>
                <span className="text-black font-mono text-[10px] uppercase tracking-[0.3em] pt-4 font-bold group-hover:translate-x-2 transition-transform">
                  Browse Projects →
                </span>
              </Link>
            </div>
          )}
        </div>
      </Section>

      {/* GET INVOLVED */}
      <Section id="getinvolved" className="py-32 bg-[#080808] relative z-10">
        <div className="max-w-7xl mx-auto px-6 lg:px-12">
          <div className="text-center mb-20 space-y-4">
            <h2 className="text-white text-4xl md:text-5xl font-bold tracking-tight leading-none">
              Get involved.
            </h2>
            <p className="font-mono text-xs text-gray-400 uppercase tracking-[0.3em]">
              Georgia Tech Primary Data Science Organization{" "}
            </p>
          </div>
          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                t: "Member",
                d: "Join the mailing list for weekly updates.",
                i: slide1,
                l: "/login",
                a: "Join Here →",
              },
              {
                t: "Leadership",
                d: "Join the executive board and lead teams.",
                i: slide7,
                l: "/team",
                a: "Meet the Team →",
              },
              {
                t: "Hacklytics",
                d: "Attend our 36-hour flagship datathon.",
                i: slide6,
                l: "/hacklytics",
                a: "About Hacklytics →",
              },
            ].map((card, i) => (
              <div
                key={i}
                className="bg-[#0a0a0a] border border-white/5 rounded-2xl overflow-hidden group hover:border-[#00A8A8]/30 transition-all shadow-2xl"
              >
                <div className="h-56 overflow-hidden relative">
                  <div className="absolute inset-0 bg-[#00A8A8]/10 z-10 opacity-0 group-hover:opacity-100 transition-opacity" />
                  <Image
                    src={card.i}
                    alt={card.t}
                    className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
                    placeholder="blur"
                  />
                </div>
                <div className="p-8 space-y-4">
                  <h4 className="text-white text-lg font-bold tracking-tight">
                    {card.t}
                  </h4>
                  <p className="text-sm text-gray-400 leading-relaxed">
                    {card.d}
                  </p>
                  <Link
                    href={card.l}
                    className="inline-flex items-center min-h-11 md:min-h-0 text-xs font-mono text-[#00A8A8] uppercase tracking-[0.2em] hover:text-white transition-colors"
                  >
                    {card.a}
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </div>
      </Section>

      <Footer />
    </div>
  );
}
