import type { ClubProjectCard } from "@/lib/club-projects";
import Link from "next/link";
import {
  isExternalJoin,
  joinHref,
  joinLabel,
  STATUS_CLASSES,
  STATUS_LABELS,
} from "@/lib/club-projects";

/** One club project, as listed on /projects and the home page. */
export default function ProjectCard({ project }: { project: ClubProjectCard }) {
  const href = joinHref(project);
  const external = isExternalJoin(project);
  const muted = project.status === "past";

  return (
    <div
      className={`group flex flex-col rounded-xl border border-white/5 bg-[#0a0a0a] p-8 transition-colors duration-300 [&>:last-child]:mb-0 ${
        muted ? "" : "hover:border-dsgt-teal/30"
      }`}
    >
      <div className="mb-3 flex items-start justify-between gap-4">
        <h3
          className={`group-hover:text-dsgt-teal text-xl font-semibold tracking-tight transition-colors ${muted ? "text-neutral-300" : "text-white"}`}
        >
          {project.name}
        </h3>
        <span
          className={`shrink-0 rounded border px-2 py-0.5 font-mono text-[11px] tracking-widest uppercase ${STATUS_CLASSES[project.status]}`}
        >
          {STATUS_LABELS[project.status]}
        </span>
      </div>

      <p className="mb-5 font-mono text-xs text-neutral-400">
        {project.leadName ? `Lead: ${project.leadName}` : "Lead: open"}
        {project.capacityNote ? ` · ${project.capacityNote}` : ""}
      </p>

      <p className="mb-6 text-[15px] leading-relaxed text-neutral-300">
        {project.summary}
      </p>

      {project.tech.length > 0 && (
        <p className="mb-6 font-mono text-[11px] leading-relaxed text-neutral-300">
          {project.tech.join(" · ")}
        </p>
      )}

      {(!muted || project.repoUrl) && (
        <div className="mt-auto flex flex-wrap items-center gap-6">
          {!muted &&
            (external ? (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-dsgt-teal inline-flex min-h-11 items-center font-mono text-xs tracking-[0.15em] uppercase transition-colors hover:text-white md:min-h-0"
              >
                {joinLabel(project)} →
              </a>
            ) : (
              <Link
                href={href}
                className="text-dsgt-teal inline-flex min-h-11 items-center font-mono text-xs tracking-[0.15em] uppercase transition-colors hover:text-white md:min-h-0"
              >
                {joinLabel(project)} →
              </Link>
            ))}
          {project.repoUrl && (
            <a
              href={project.repoUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-dsgt-teal inline-flex min-h-11 items-center font-mono text-xs tracking-[0.15em] text-neutral-400 uppercase transition-colors md:min-h-0"
            >
              Repo →
            </a>
          )}
        </div>
      )}
    </div>
  );
}
