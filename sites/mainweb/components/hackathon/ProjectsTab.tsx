"use client";

import React from "react";
import { trpc } from "@/lib/trpc";
import {
  body,
  btnSecondary,
  itemTitle,
  meta,
  status,
  textLink,
} from "@/components/portal/ui";

export function ProjectsTab({ hackathonId }: { hackathonId: string }) {
  const {
    data: projects,
    isLoading,
    isError,
    error,
    refetch,
  } = trpc.hackathon.getPublicProjects.useQuery({ hackathonId });

  if (isLoading) return <p className={`py-16 ${body}`}>Loading projects…</p>;

  // Without this a failed fetch falls through to "No projects" below.
  if (isError)
    return (
      <div className="flex flex-col items-start gap-4">
        <p className="text-[15px] text-[var(--danger)]">
          Couldn&apos;t load projects. {error.message}
        </p>
        <button
          type="button"
          onClick={() => refetch()}
          className={btnSecondary}
        >
          Try again
        </button>
      </div>
    );

  if (!projects || projects.length === 0) {
    return (
      <p className={body}>
        No projects have been submitted yet. Submitted projects will be listed
        here.
      </p>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-10 gap-y-10">
      {projects.map((project) => (
        <article
          key={project.id}
          className="flex flex-col border-t border-[var(--border-subtle)] pt-5"
        >
          <div className="flex items-start justify-between gap-3">
            <h3 className={itemTitle}>{project.name}</h3>
            {project.status === "winner" && (
              <span className={`${status("accent")} mt-1.5 shrink-0`}>
                Winner
              </span>
            )}
          </div>

          <p className={`mt-2 line-clamp-3 flex-1 ${body}`}>
            {project.description}
          </p>

          {project.technologies && project.technologies.length > 0 && (
            <p className={`mt-3 ${meta}`}>
              {project.technologies.slice(0, 4).join(" · ")}
              {project.technologies.length > 4 &&
                ` · +${project.technologies.length - 4}`}
            </p>
          )}

          {project.challenges && project.challenges.length > 0 && (
            <ul className="mt-2 space-y-0.5">
              {project.challenges.map((c) => (
                <li
                  key={c}
                  className="text-[13px] text-[var(--text-secondary)]"
                >
                  {c.replace("MLH_", "").replace(/_/g, " ")}
                </li>
              ))}
            </ul>
          )}

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <p className={meta}>
              By{" "}
              <span className="text-[var(--text-primary)]">
                {project.team?.name || "Solo"}
              </span>
            </p>
            <div className="flex gap-5">
              {project.githubUrl && (
                <a
                  href={project.githubUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={textLink}
                >
                  Code
                </a>
              )}
              {project.demoUrl && (
                <a
                  href={project.demoUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={textLink}
                >
                  Demo
                </a>
              )}
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}
