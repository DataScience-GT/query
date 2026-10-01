"use client";

import React from "react";
import { trpc } from "@/lib/trpc";
import { LiquidGlass } from "@/components/portal/LiquidGlass";
import { Code, ExternalLink, FolderGit2 } from "lucide-react";

export function ProjectsTab({ hackathonId }: { hackathonId: string }) {
  const { data: projects, isLoading } =
    trpc.hackathon.getPublicProjects.useQuery({ hackathonId });

  if (isLoading)
    return (
      <div className="py-16 text-center text-sm text-[var(--text-muted)]">
        Loading projects…
      </div>
    );

  if (!projects || projects.length === 0) {
    return (
      <LiquidGlass
        printed
        className="p-8 text-center flex flex-col items-center gap-3"
      >
        <div className="w-12 h-12 rounded-full bg-[var(--bg-secondary)] border border-[var(--border-subtle)] flex items-center justify-center">
          <FolderGit2 className="w-5 h-5 text-[var(--text-subtle)]" />
        </div>
        <p className="text-sm text-[var(--text-muted)]">
          No projects have been submitted yet.
        </p>
      </LiquidGlass>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {projects.map((project) => (
        <LiquidGlass
          key={project.id}
          printed
          className="p-6 h-full flex flex-col"
        >
          <div className="flex items-start justify-between mb-4">
            <h3 className="text-base font-bold text-[var(--text-primary)] leading-tight">
              {project.name}
            </h3>
            {project.status === "winner" && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-sm text-[11px] font-bold uppercase tracking-wider border text-amber-400 bg-amber-400/10 border-amber-400/20 shrink-0 ml-3">
                Winner
              </span>
            )}
          </div>

          <p className="text-sm text-[var(--text-muted)] mb-6 line-clamp-3 leading-relaxed flex-1">
            {project.description}
          </p>

          <div>
            {project.technologies && project.technologies.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-4">
                {project.technologies.slice(0, 4).map((tech) => (
                  <span
                    key={tech}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-sm text-[11px] font-bold uppercase tracking-wider border text-[var(--text-muted)] bg-[var(--bg-secondary)] border-[var(--border-subtle)]"
                  >
                    {tech}
                  </span>
                ))}
                {project.technologies.length > 4 && (
                  <span className="text-[11px] font-semibold text-[var(--text-subtle)] px-1 py-1">
                    +{project.technologies.length - 4}
                  </span>
                )}
              </div>
            )}

            {project.challenges && project.challenges.length > 0 && (
              <div className="mb-5 space-y-1.5">
                {project.challenges.map((c) => (
                  <div key={c} className="text-xs font-medium text-accent/80">
                    {c.replace("MLH_", "").replace(/_/g, " ")}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="mt-auto pt-5 border-t border-[var(--border-subtle)] flex flex-wrap items-center justify-between gap-3">
            <div className="text-xs text-[var(--text-muted)]">
              By{" "}
              <span className="text-[var(--text-primary)] font-medium">
                {project.team?.name || "Solo"}
              </span>
            </div>
            <div className="flex gap-2">
              {project.githubUrl && (
                <a
                  href={project.githubUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-sm border border-[var(--border-medium)] bg-[var(--bg-secondary)] text-[var(--text-muted)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)] hover:border-[var(--border-hover)] transition-ui text-xs font-bold uppercase tracking-widest"
                >
                  <Code className="w-3.5 h-3.5" />
                  Code
                </a>
              )}
              {project.demoUrl && (
                <a
                  href={project.demoUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-sm bg-accent/10 border border-accent/25 text-accent text-xs font-bold uppercase tracking-widest hover:bg-accent/20 transition-colors"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  Demo
                </a>
              )}
            </div>
          </div>
        </LiquidGlass>
      ))}
    </div>
  );
}
