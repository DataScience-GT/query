"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import {
  INTEREST_FORM_URL,
  STATUS_CLASSES,
  STATUS_LABELS,
  groupClubProjects,
  isExternalJoin,
  joinHref,
  joinLabel,
  type ClubProjectCard,
} from "@/lib/club-projects";

function ProjectCard({ project }: { project: ClubProjectCard }) {
  const href = joinHref(project);
  const external = isExternalJoin(project);
  const muted = project.status === "past";

  return (
    <div
      className={`group bg-[#0a0a0a] border border-white/5 p-8 rounded-xl transition-all duration-500 shadow-2xl relative overflow-hidden flex flex-col ${
        muted ? "opacity-70" : "hover:border-[#00A8A8]/30"
      }`}
    >
      <div className="absolute top-0 right-0 w-32 h-32 bg-[#00A8A8]/5 blur-3xl opacity-0 group-hover:opacity-100 transition-opacity" />

      <div className="flex justify-between items-start gap-4 mb-4 relative z-10">
        <h3 className="text-white text-xl font-bold group-hover:text-[#00A8A8] transition-colors uppercase tracking-tight italic">
          {project.name}
        </h3>
        <span
          className={`shrink-0 px-2 py-0.5 text-[9px] font-mono rounded border uppercase tracking-widest ${STATUS_CLASSES[project.status]}`}
        >
          {STATUS_LABELS[project.status]}
        </span>
      </div>

      <p className="text-[9px] font-mono text-gray-600 uppercase tracking-widest mb-6 relative z-10">
        {project.leadName ? `Lead // ${project.leadName}` : "Lead // Open"}
        {project.capacityNote ? ` // ${project.capacityNote}` : ""}
      </p>

      <p className="text-sm text-gray-400 leading-relaxed mb-8 italic relative z-10">
        {project.summary}
      </p>

      {project.tech.length > 0 && (
        <div className="flex flex-wrap gap-2 relative z-10 mb-8">
          {project.tech.map((tech) => (
            <span
              key={tech}
              className="text-[9px] font-mono text-[#00A8A8]/70 bg-[#00A8A8]/5 border border-[#00A8A8]/10 px-2 py-1 rounded-sm uppercase tracking-tighter"
            >
              {tech}
            </span>
          ))}
        </div>
      )}

      <div className="mt-auto flex flex-wrap items-center gap-6 relative z-10">
        {!muted &&
          (external ? (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center min-h-11 md:min-h-0 text-[#00A8A8] font-mono text-[10px] uppercase tracking-[0.2em] hover:text-white transition-colors"
            >
              {joinLabel(project)} →
            </a>
          ) : (
            <Link
              href={href}
              className="inline-flex items-center min-h-11 md:min-h-0 text-[#00A8A8] font-mono text-[10px] uppercase tracking-[0.2em] hover:text-white transition-colors"
            >
              {joinLabel(project)} →
            </Link>
          ))}
        {project.repoUrl && (
          <a
            href={project.repoUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center min-h-11 md:min-h-0 text-gray-500 font-mono text-[10px] uppercase tracking-[0.2em] hover:text-[#00A8A8] transition-colors"
          >
            Repo →
          </a>
        )}
      </div>
    </div>
  );
}

export default function ProjectsPageClient({
  projects,
}: {
  projects: ClubProjectCard[];
}) {
  const [windowWidth, setWindowWidth] = useState<number>(
    typeof window !== "undefined" ? window.innerWidth : 1024,
  );

  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const { current, past } = groupClubProjects(projects);
  const term = current.find((project) => project.term)?.term ?? "This term";

  return (
    <div className="relative min-h-screen bg-[#050505] text-gray-400 font-sans selection:bg-indigo-400/30 overflow-x-hidden">
      <Navbar
        screen_width={windowWidth}
        page="other"
        className="fixed top-0 z-30 border-b border-white/5 bg-[#050505]/80 backdrop-blur-md"
      />
      <main className="relative z-10 pt-44 pb-32 max-w-7xl mx-auto px-6 lg:px-12">
        <nav className="flex items-center gap-2 mb-8 text-[10px] font-mono tracking-[0.3em] uppercase">
          <Link href="/" className="hover:text-[#00A8A8] transition-colors">
            Home
          </Link>
          <span className="text-gray-800">/</span>
          <span className="text-gray-200 italic">Club_Projects</span>
        </nav>

        <section className="max-w-3xl mb-24 space-y-6">
          <h1 className="text-white text-6xl md:text-8xl font-black tracking-tighter leading-none uppercase italic">
            Club <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#00A8A8] to-[#006e6e] not-italic">
              Projects.
            </span>
          </h1>
          <p className="text-lg text-gray-400 leading-relaxed max-w-xl italic border-l-2 border-[#00A8A8]/20 pl-6">
            What DSGT members are building right now. Apply through the portal,
            or take one of the projects that still needs a lead.
          </p>
          <a
            href={INTEREST_FORM_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center min-h-11 md:min-h-0 text-[#00A8A8] font-mono text-[10px] uppercase tracking-[0.3em] hover:text-white transition-colors"
          >
            One interest form for every project →
          </a>
        </section>

        <section id="current" className="scroll-mt-32 mb-32">
          <div className="flex items-center gap-4 mb-12">
            <h2 className="text-white text-2xl font-black tracking-tight shrink-0 italic uppercase">
              {term}
            </h2>
            <div className="h-px bg-gradient-to-r from-[#00A8A8]/20 to-transparent w-full" />
          </div>

          {current.length === 0 ? (
            <p className="text-sm text-gray-500 italic">
              The roster is being updated. Check back shortly, or email{" "}
              <a
                href="mailto:hello@datasciencegt.org"
                className="text-[#00A8A8] hover:text-white transition-colors"
              >
                hello@datasciencegt.org
              </a>
              .
            </p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {current.map((project) => (
                <ProjectCard key={project.id} project={project} />
              ))}
            </div>
          )}
        </section>

        {past.length > 0 && (
          <section id="past" className="scroll-mt-32">
            <div className="flex items-center gap-4 mb-6">
              <h2 className="text-white text-2xl font-black tracking-tight shrink-0 italic uppercase">
                Past
              </h2>
              <div className="h-px bg-gradient-to-r from-white/10 to-transparent w-full" />
            </div>
            <p className="text-sm text-gray-500 italic mb-12 max-w-xl">
              Finished or retired. Kept here as an archive, not as something you
              can join today.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {past.map((project) => (
                <ProjectCard key={project.id} project={project} />
              ))}
            </div>
          </section>
        )}

        <section className="mt-40 border-t border-white/5 pt-20 text-center">
          <h2 className="text-white text-2xl font-black mb-12 italic uppercase tracking-tighter">
            Want in?
          </h2>
          <div className="flex flex-col sm:flex-row justify-center items-center gap-12">
            <Link
              href="/initiatives"
              className="text-[10px] font-mono text-gray-500 hover:text-[#00A8A8] transition-all uppercase tracking-[0.4em] flex items-center min-h-11 md:min-h-0 gap-4 group"
            >
              Apply_In_Portal{" "}
              <span className="text-lg group-hover:translate-x-2 transition-transform">
                →
              </span>
            </Link>
            <Link
              href="/bootcamp"
              className="text-[10px] font-mono text-gray-500 hover:text-[#00A8A8] transition-all uppercase tracking-[0.4em] flex items-center min-h-11 md:min-h-0 gap-4 group"
            >
              Join_Bootcamp{" "}
              <span className="text-lg group-hover:translate-x-2 transition-transform">
                →
              </span>
            </Link>
          </div>
        </section>
      </main>
      <Footer
        screen_width={windowWidth}
        className="relative z-10 border-t border-white/5 opacity-40"
      />
    </div>
  );
}
