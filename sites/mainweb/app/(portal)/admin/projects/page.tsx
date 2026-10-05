"use client";

import { useSession } from "next-auth/react";
import { loginHref } from "@/lib/safe-callback";
import { trpc } from "@/lib/trpc";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { skipToken } from "@tanstack/react-query";
import {
  body,
  btnDanger,
  btnPrimary,
  btnSecondary,
  fieldLabel,
  input,
  itemTitle,
  meta,
  object,
  page,
  pageDek,
  status as statusClass,
} from "@/components/portal/ui";
import type { Tone } from "@/components/portal/ui";

const adminTitle =
  "font-[family-name:var(--font-display)] text-[32px] md:text-[40px] font-semibold leading-[1.05] tracking-[-0.02em] text-[var(--text-primary)] text-balance";

export default function ProjectsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [selectedHackathon, setSelectedHackathon] = useState<string | null>(
    null,
  );

  const { data: hackathonList } = trpc.hackathon.listAll.useQuery(undefined, {
    enabled: !!session,
  });

  const { data: projects, isLoading } = trpc.hackathon.projects.useQuery(
    selectedHackathon ? { hackathonId: selectedHackathon } : skipToken,
  );

  // The one project being repaired, and the field values being repaired to.
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "",
    description: "",
    githubUrl: "",
    demoUrl: "",
    videoUrl: "",
  });
  const [actionError, setActionError] = useState<string | null>(null);
  const [withdrawing, setWithdrawing] = useState<string | null>(null);

  const utils = trpc.useUtils();

  const refresh = () => {
    if (selectedHackathon) {
      utils.hackathon.projects.invalidate({ hackathonId: selectedHackathon });
    }
  };

  const updateProject = trpc.hackathon.adminUpdateProject.useMutation({
    onSuccess: () => {
      setEditing(null);
      setActionError(null);
      refresh();
    },
    onError: (error) => setActionError(error.message),
  });

  const withdrawProject = trpc.hackathon.adminWithdrawProject.useMutation({
    onSuccess: () => {
      setWithdrawing(null);
      setActionError(null);
      refresh();
    },
    // A project already in judging comes back as CONFLICT with what that
    // means; the second press confirms it.
    onError: (error) => setActionError(error.message),
  });

  if (status === "unauthenticated") {
    router.push(loginHref());
    return null;
  }

  const getStatusTone = (projectStatus: string): Tone => {
    switch (projectStatus) {
      case "submitted":
        return "accent";
      case "judging":
        return "warning";
      case "winner":
        return "success";
      default:
        return "neutral";
    }
  };

  return (
    <div className={page}>
      <h1 className={adminTitle}>Hackathon projects</h1>
      <p className={pageDek}>
        Browse the projects participants submitted, fix their details, or
        withdraw one.
      </p>

      <div className="mt-10 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
          <div className="sm:w-80">
            <label htmlFor="project-hackathon" className={fieldLabel}>
              Hackathon
            </label>
            <select
              id="project-hackathon"
              aria-label="Filter projects by hackathon"
              value={selectedHackathon || ""}
              onChange={(e) => setSelectedHackathon(e.target.value || null)}
              className={`${input} min-h-11 cursor-pointer`}
            >
              <option value="">Select a hackathon…</option>
              {hackathonList?.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.name}
                </option>
              ))}
            </select>
          </div>
          <p className={`${meta} tabular-nums`}>
            {projects?.length || 0} total projects
          </p>
        </div>

        <div className="border-t border-[var(--border-subtle)] pt-6">
          {!selectedHackathon ? (
            <p className={body}>
              Choose a hackathon above to see its submitted projects.
            </p>
          ) : isLoading ? (
            <p className={meta}>Loading projects…</p>
          ) : !projects || projects.length === 0 ? (
            <p className={body}>
              No projects yet. They will appear here once participants submit
              them.
            </p>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {projects.map((project) => (
                <div
                  key={project.id}
                  className={`${object} p-5 flex flex-col`}
                >
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="min-w-0 flex-1">
                      <h3 className={`${itemTitle} break-words`}>
                        {project.name}
                      </h3>
                      <p className="text-[14px] text-[var(--text-muted)] mt-1 line-clamp-2">
                        {project.description || "No description"}
                      </p>
                    </div>
                    <span
                      className={`${statusClass(getStatusTone(project.status))} shrink-0 capitalize`}
                    >
                      {project.status}
                    </span>
                  </div>

                  <div className={`${meta} space-y-1`}>
                    {project.tracks && project.tracks.length > 0 && (
                      <p>Tracks: {project.tracks.join(", ")}</p>
                    )}
                    <p>Team: {project.team?.name || "Unknown"}</p>
                  </div>

                  {editing === project.id ? (
                    <div className="mt-4 pt-4 border-t border-[var(--border-subtle)] space-y-3">
                      {(
                        [
                          ["name", "Name"],
                          ["description", "Description"],
                          ["githubUrl", "Repo URL"],
                          ["demoUrl", "Demo URL"],
                          ["videoUrl", "Video URL"],
                        ] as const
                      ).map(([field, label]) => (
                        <div key={field}>
                          <label
                            htmlFor={`${project.id}-${field}`}
                            className={fieldLabel}
                          >
                            {label}
                          </label>
                          <input
                            id={`${project.id}-${field}`}
                            type="text"
                            value={form[field]}
                            onChange={(e) =>
                              setForm((f) => ({
                                ...f,
                                [field]: e.target.value,
                              }))
                            }
                            className={input}
                          />
                        </div>
                      ))}
                      <div className="flex flex-wrap gap-2 pt-1">
                        <button
                          type="button"
                          disabled={updateProject.isPending}
                          onClick={() =>
                            updateProject.mutate({
                              projectId: project.id,
                              name: form.name.trim() || undefined,
                              description:
                                form.description.trim() || undefined,
                              // null clears; undefined leaves unchanged.
                              githubUrl: form.githubUrl.trim() || null,
                              demoUrl: form.demoUrl.trim() || null,
                              videoUrl: form.videoUrl.trim() || null,
                            })
                          }
                          className={btnPrimary}
                        >
                          {updateProject.isPending ? "Saving…" : "Save"}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setEditing(null);
                            setActionError(null);
                          }}
                          className={btnSecondary}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-auto pt-4">
                      <div className="pt-4 border-t border-[var(--border-subtle)] flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setActionError(null);
                            setWithdrawing(null);
                            setEditing(project.id);
                            setForm({
                              name: project.name,
                              description: project.description || "",
                              githubUrl: project.githubUrl || "",
                              demoUrl: project.demoUrl || "",
                              videoUrl: project.videoUrl || "",
                            });
                          }}
                          className={btnSecondary}
                        >
                          Fix details
                        </button>
                        {project.status !== "draft" && (
                          <button
                            type="button"
                            disabled={withdrawProject.isPending}
                            onClick={() => {
                              setActionError(null);
                              withdrawProject.mutate({
                                projectId: project.id,
                                // Forced only on the second press, after the
                                // server has said what withdrawing costs.
                                force: withdrawing === project.id,
                              });
                              setWithdrawing(project.id);
                            }}
                            className={btnDanger}
                          >
                            {withdrawing === project.id
                              ? "Withdraw anyway"
                              : "Withdraw"}
                          </button>
                        )}
                      </div>
                    </div>
                  )}

                  {actionError &&
                    (editing === project.id ||
                      withdrawing === project.id) && (
                      <p
                        role="alert"
                        className="mt-3 text-[13px] leading-relaxed text-[var(--warning)]"
                      >
                        {actionError}
                      </p>
                    )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
