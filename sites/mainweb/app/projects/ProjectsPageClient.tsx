"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import PublicFrame from "@/components/PublicFrame";
import {
  INTEREST_FORM_URL,
  STATUS_CLASSES,
  STATUS_LABELS,
  groupClubProjects,
  isExternalJoin,
  joinHref,
  joinLabel,
} from "@/lib/club-projects";
import type { ClubProjectCard } from "@/lib/club-projects";

function ProjectCard({ project }: { project: ClubProjectCard }) {
  const href = joinHref(project);
  const external = isExternalJoin(project);
  const muted = project.status === "past";

  return (
    <div
      className={`public-card p-8 relative flex flex-col ${
        muted ? "opacity-70" : ""
      }`}
    >
      <div className="flex justify-between items-start gap-4 mb-4">
        <h3 className="public-display text-xl">{project.name}</h3>
        <span
          className={`public-chip shrink-0 ${STATUS_CLASSES[project.status]}`}
        >
          {STATUS_LABELS[project.status]}
        </span>
      </div>

      <p className="public-kicker mb-6">
        {project.leadName ? `Lead · ${project.leadName}` : "Lead · Open"}
        {project.capacityNote ? ` · ${project.capacityNote}` : ""}
      </p>

      <p className="text-sm leading-relaxed mb-8">{project.summary}</p>

      {project.tech.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-8">
          {project.tech.map((tech) => (
            <span key={tech} className="public-chip">
              {tech}
            </span>
          ))}
        </div>
      )}

      <div className="mt-auto flex flex-wrap items-center gap-6">
        {!muted &&
          (external ? (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="public-link inline-flex items-center min-h-11"
            >
              {joinLabel(project)} →
            </a>
          ) : (
            <Link
              href={href}
              className="public-link inline-flex items-center min-h-11"
            >
              {joinLabel(project)} →
            </Link>
          ))}
        {project.repoUrl && (
          <a
            href={project.repoUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center min-h-11 text-[var(--muted)] hover:text-[var(--ink)]"
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
    <PublicFrame note="this term">
      <div className="relative min-h-screen overflow-x-hidden">
        <Navbar screen_width={windowWidth} page="other" />
        <main className="relative z-10 pt-44 pb-32 max-w-7xl mx-auto px-6 lg:px-12">
          <nav className="flex items-center gap-2 mb-8 public-kicker">
            <Link href="/" className="hover:text-[var(--ink)]">
              Home
            </Link>
            <span aria-hidden="true">/</span>
            <span>Projects</span>
          </nav>

          <section className="max-w-3xl mb-24 space-y-6">
            <h1 className="public-display text-5xl md:text-7xl">
              What members are building right now.
            </h1>
            <p className="public-lede max-w-xl">
              Apply through the portal, or take one of the projects that still
              needs a lead.
            </p>
            <a
              href={INTEREST_FORM_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="public-link inline-flex items-center min-h-11"
            >
              One interest form for every project →
            </a>
          </section>

          <section id="current" className="scroll-mt-32 mb-32">
            <h2 className="public-display text-2xl mb-12">{term}</h2>

            {current.length === 0 ? (
              <p className="public-lede">
                The roster is being updated. Check back shortly, or email{" "}
                <a
                  href="mailto:hello@datasciencegt.org"
                  className="public-link"
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
              <h2 className="public-display text-2xl mb-4">Past</h2>
              <p className="public-lede mb-12 max-w-xl">
                Finished or retired. Kept here as an archive, not as something
                you can join today.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {past.map((project) => (
                  <ProjectCard key={project.id} project={project} />
                ))}
              </div>
            </section>
          )}

          <section className="mt-40 border-t border-[var(--rule)] pt-20">
            <h2 className="public-display text-2xl mb-8">Want in?</h2>
            <div className="flex flex-col sm:flex-row gap-4">
              <Link href="/initiatives" className="public-btn">
                Apply in the portal
              </Link>
              <Link
                href="/bootcamp"
                className="public-btn-ghost text-[var(--ink)]"
              >
                Join bootcamp
              </Link>
            </div>
          </section>
        </main>
        <Footer screen_width={windowWidth} />
      </div>
    </PublicFrame>
  );
}
