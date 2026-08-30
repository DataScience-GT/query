import type { Metadata } from "next";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import type { ClubProject } from "@/lib/club-projects";
import {
  CURRENT_CLUB_PROJECTS,
  PAST_CLUB_PROJECTS,
  PROJECTS_INTEREST_FORM,
  projectStatusLabel,
} from "@/lib/club-projects";

export const metadata: Metadata = {
  title: "Projects",
  description:
    "Current Fall 2026 DS@GT club projects. Join via the interest form.",
};

function statusClass(project: ClubProject) {
  return project.status === "active"
    ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
    : "bg-amber-500/10 text-amber-400 border-amber-500/20";
}

export default function ProjectsPage() {
  return (
    <div className="relative min-h-screen bg-[#050505] text-gray-400 font-sans selection:bg-indigo-400/30 overflow-x-hidden">
      <Navbar
        screen_width={1024}
        page="other"
        className="fixed top-0 z-30 border-b border-white/5 bg-[#050505]/80 backdrop-blur-md"
      />
      <main className="relative z-10 pt-44 pb-32 max-w-7xl mx-auto px-6 lg:px-12">
        <nav className="flex items-center gap-2 mb-8 text-[10px] font-mono tracking-[0.3em] uppercase">
          <Link href="/" className="hover:text-[#00A8A8] transition-colors">
            Home
          </Link>
          <span className="text-gray-800">/</span>
          <span className="text-gray-200 italic">Projects</span>
        </nav>

        <section className="max-w-3xl mb-16 space-y-6">
          <p className="font-mono text-[10px] text-[#00A8A8] uppercase tracking-[0.4em]">
            Fall 2026
          </p>
          <h1 className="text-white text-6xl md:text-8xl font-black tracking-tighter leading-none uppercase italic">
            Club <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#00A8A8] to-[#006e6e] not-italic">
              Projects.
            </span>
          </h1>
          <p className="text-lg text-gray-400 leading-relaxed max-w-xl italic border-l-2 border-[#00A8A8]/20 pl-6">
            Current DS@GT member projects. Several still need a lead. One
            interest form covers all of them.
          </p>
          <a
            href={PROJECTS_INTEREST_FORM}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center min-h-11 px-6 py-3 bg-[#00A8A8] text-black text-[10px] font-mono font-bold uppercase tracking-[0.3em] rounded-md hover:bg-[#008f8f] transition-colors"
          >
            Interest form
          </a>
        </section>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {CURRENT_CLUB_PROJECTS.map((project) => (
            <article
              key={project.slug}
              id={project.slug}
              className="group bg-[#0a0a0a] border border-white/5 p-8 rounded-xl hover:border-[#00A8A8]/30 transition-all duration-500 shadow-2xl relative overflow-hidden scroll-mt-32"
            >
              <div className="absolute top-0 right-0 w-32 h-32 bg-[#00A8A8]/5 blur-3xl opacity-0 group-hover:opacity-100 transition-opacity" />

              <div className="flex flex-wrap justify-between items-start gap-3 mb-4 relative z-10">
                <div>
                  <h2 className="text-white text-xl font-bold group-hover:text-[#00A8A8] transition-colors uppercase tracking-tight italic">
                    {project.name}
                  </h2>
                  {project.subtitle ? (
                    <p className="text-[11px] text-gray-500 mt-1">
                      {project.subtitle}
                    </p>
                  ) : null}
                </div>
                <span
                  className={`text-[9px] font-mono uppercase tracking-widest px-2 py-1 rounded border ${statusClass(project)}`}
                >
                  {projectStatusLabel(project)}
                </span>
              </div>

              <p className="text-sm text-gray-400 leading-relaxed mb-6 relative z-10">
                {project.description}
              </p>

              <dl className="space-y-2 text-[11px] font-mono uppercase tracking-widest text-gray-500 mb-8 relative z-10">
                <div>
                  <dt className="sr-only">Lead</dt>
                  <dd>
                    {project.lead
                      ? `Lead · ${project.lead}`
                      : "Needs a lead"}
                    {project.leadNote ? ` · ${project.leadNote}` : ""}
                  </dd>
                </div>
                {project.recruiting ? (
                  <div>
                    <dt className="sr-only">Recruiting</dt>
                    <dd>Recruiting · {project.recruiting}</dd>
                  </div>
                ) : null}
              </dl>

              <div className="flex flex-wrap gap-3 relative z-10">
                {project.links.map((link) => {
                  const external = /^https?:\/\//.test(link.href);
                  return (
                    <a
                      key={link.href}
                      href={link.href}
                      target={external ? "_blank" : undefined}
                      rel={external ? "noopener noreferrer" : undefined}
                      className="inline-flex items-center min-h-11 md:min-h-0 text-[10px] font-mono text-[#00A8A8] uppercase tracking-[0.2em] hover:text-white transition-colors"
                    >
                      {link.label} →
                    </a>
                  );
                })}
                <a
                  href={PROJECTS_INTEREST_FORM}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center min-h-11 md:min-h-0 text-[10px] font-mono text-gray-500 uppercase tracking-[0.2em] hover:text-[#00A8A8] transition-colors"
                >
                  Interest form →
                </a>
              </div>
            </article>
          ))}
        </div>

        <section id="past" className="mt-32 scroll-mt-32">
          <div className="flex items-center gap-4 mb-6">
            <h2 className="text-white text-2xl font-black tracking-tight shrink-0 italic uppercase">
              Past
            </h2>
            <div className="h-px bg-gradient-to-r from-[#00A8A8]/20 to-transparent w-full" />
          </div>
          <p className="text-sm text-gray-500 italic mb-12 max-w-xl">
            Earlier club ventures. These are not the current Fall 2026 roster.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {PAST_CLUB_PROJECTS.map((project) => (
              <article
                key={`${project.name}-${project.lead}`}
                className="bg-[#080808] border border-white/5 p-6 rounded-xl"
              >
                <div className="flex justify-between items-start gap-3 mb-3">
                  <h3 className="text-gray-200 text-base font-bold uppercase tracking-tight italic">
                    {project.name}
                  </h3>
                  <span className="text-[9px] font-mono text-gray-600 uppercase tracking-widest shrink-0">
                    {project.lead}
                  </span>
                </div>
                <p className="text-sm text-gray-500 leading-relaxed">
                  {project.description}
                </p>
              </article>
            ))}
          </div>
        </section>

        <section className="mt-40 border-t border-white/5 pt-20 text-center">
          <h2 className="text-white text-2xl font-black mb-12 italic uppercase tracking-tighter">
            Want to join one?
          </h2>
          <div className="flex flex-col sm:flex-row justify-center items-center gap-12">
            <a
              href={PROJECTS_INTEREST_FORM}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[10px] font-mono text-gray-500 hover:text-[#00A8A8] transition-all uppercase tracking-[0.4em] flex items-center min-h-11 md:min-h-0 gap-4 group"
            >
              Interest_Form{" "}
              <span className="text-lg group-hover:translate-x-2 transition-transform">
                →
              </span>
            </a>
            <Link
              href="/"
              className="text-[10px] font-mono text-gray-500 hover:text-[#00A8A8] transition-all uppercase tracking-[0.4em] flex items-center min-h-11 md:min-h-0 gap-4 group"
            >
              <span className="text-lg group-hover:-translate-x-2 transition-transform">
                ←
              </span>{" "}
              Return_Home
            </Link>
          </div>
        </section>
      </main>
      <Footer
        screen_width={1024}
        className="relative z-10 border-t border-white/5 opacity-40"
      />
    </div>
  );
}
