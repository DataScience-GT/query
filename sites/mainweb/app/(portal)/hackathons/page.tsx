"use client";

import React, { useEffect, useState } from "react";
import { loginHref } from "@/lib/safe-callback";
import { useSession } from "next-auth/react";
import { trpc } from "@/lib/trpc";
import { hackathonSlug } from "@/lib/hackathon-slug";
import { useRouter } from "next/navigation";
import { LoadingScreen } from "@/components/portal/LoadingScreen";
import Link from "next/link";
import { StatusBadge } from "@/components/hackathon/StatusBadge";
import { hackathonStatus } from "@/lib/hackathon-status";
import {
  body,
  btnSecondary,
  chip,
  itemTitle,
  kicker,
  meta,
  object,
  page,
  pageDek,
  pageTitle,
  sectionTitle,
  status,
  tab,
  tabList,
  textLink,
} from "@/components/portal/ui";

type Tab = "browse" | "registrations" | "projects";

function formatDate(d: Date | string) {
  return new Date(d).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatDateRange(start: Date | string, end: Date | string) {
  const s = new Date(start);
  const e = new Date(end);
  if (s.getMonth() === e.getMonth() && s.getFullYear() === e.getFullYear()) {
    return `${s.toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${e.getDate()}, ${e.getFullYear()}`;
  }
  if (s.getFullYear() === e.getFullYear()) {
    return `${s.toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${e.toLocaleDateString("en-US", { month: "short", day: "numeric" })}, ${e.getFullYear()}`;
  }
  return `${formatDate(s)} – ${formatDate(e)}`;
}

export default function HackathonsPage() {
  const { data: session, status: authStatus } = useSession();
  const router = useRouter();

  const [activeTab, setActiveTab] = useState<Tab>("browse");
  const [statusFilter, setStatusFilter] = useState<
    "all" | "open" | "live" | "completed"
  >("all");

  const { data: hackathons, isLoading } = trpc.hackathon.list.useQuery({});
  const { data: myRegs } = trpc.hackathon.myRegistrations.useQuery(undefined, {
    enabled: !!session,
  });

  // Covers solo submissions too, which have no team to read them off.
  const { data: myProjects } = trpc.team.myProjects.useQuery(undefined, {
    enabled: !!session,
  });
  const projects = myProjects ?? [];

  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.replace("#", "") as Tab;
      if (["browse", "registrations", "projects"].includes(hash)) {
        setActiveTab(hash);
      }
    };
    handleHashChange();
    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, []);

  useEffect(() => {
    if (authStatus === "unauthenticated") router.push(loginHref());
  }, [authStatus, router]);

  if (authStatus === "loading" || isLoading)
    return <LoadingScreen message="Loading hackathons…" />;
  if (!session) return null;

  const regStatusById = new Map(
    myRegs?.map((r) => [r.hackathonId, r.registrationStatus]) ?? [],
  );

  const tabs = [
    { id: "browse", label: "Browse" },
    { id: "registrations", label: "My registrations" },
    { id: "projects", label: "My projects" },
  ];

  const filters = [
    { key: "all", label: "All" },
    { key: "open", label: "Open" },
    { key: "live", label: "Live" },
    { key: "completed", label: "Past" },
  ] as const;

  const filtered = (hackathons ?? []).filter((h) => {
    if (statusFilter === "all") return true;
    if (statusFilter === "open") return h.status === "open";
    if (statusFilter === "live") return h.status === "in_progress";
    return h.status === "completed";
  });
  const filterLabel =
    filters.find((f) => f.key === statusFilter)?.label.toLowerCase() ?? "";

  return (
    <div className={page}>
      <Link
        href="/dashboard"
        className="text-[13px] text-[var(--text-subtle)] hover:text-[var(--text-primary)] transition-colors"
      >
        ← Dashboard
      </Link>

      <header className="mt-6">
        <h1 className={pageTitle}>Hackathons</h1>
        <p className={pageDek}>
          Events you can register for, your registrations, and projects
          you&apos;ve submitted.
        </p>
      </header>

      <nav aria-label="Hackathon views" className={`mt-8 ${tabList}`}>
        {tabs.map((t) => (
          <Link
            key={t.id}
            href={`#${t.id}`}
            onClick={() => setActiveTab(t.id as Tab)}
            aria-current={activeTab === t.id ? "page" : undefined}
            className={tab(activeTab === t.id)}
          >
            {t.label}
          </Link>
        ))}
      </nav>

      {/* Browse */}
      {activeTab === "browse" && (
        <div className="mt-6">
          <div className="flex flex-wrap gap-2">
            {filters.map(({ key, label }) => (
              <button
                key={key}
                type="button"
                onClick={() => setStatusFilter(key)}
                aria-pressed={statusFilter === key}
                className={chip(statusFilter === key)}
              >
                {label}
              </button>
            ))}
          </div>

          {!hackathons || hackathons.length === 0 ? (
            <p className={`mt-8 ${body}`}>
              No hackathons are listed yet. New events show up here when
              they&apos;re announced.
            </p>
          ) : filtered.length === 0 ? (
            <div className="mt-8 space-y-3">
              <p className={body}>No {filterLabel} hackathons right now.</p>
              <button
                type="button"
                onClick={() => setStatusFilter("all")}
                className={textLink}
              >
                Show all hackathons
              </button>
            </div>
          ) : (
            <div className="mt-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filtered.map((h) => {
                const conf = hackathonStatus(h.status);
                const regStatus = regStatusById.get(h.id);
                return (
                  <Link
                    href={`/hackathons/${hackathonSlug(h.name)}`}
                    key={h.id}
                    className={`flex h-full flex-col gap-3 p-5 transition-colors hover:border-[var(--border-hover)] ${object}`}
                  >
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                      <span className={status(conf.tone)}>{conf.label}</span>
                      {regStatus && <StatusBadge status={regStatus} />}
                    </div>

                    <div className="flex-1">
                      {h.theme && <p className={kicker}>{h.theme}</p>}
                      <h2 className={`mt-1 ${itemTitle}`}>{h.name}</h2>
                      {h.description && (
                        <p className={`mt-2 line-clamp-3 ${body}`}>
                          {h.description}
                        </p>
                      )}
                    </div>

                    <div className={`space-y-0.5 ${meta}`}>
                      <p>{formatDateRange(h.startDate, h.endDate)}</p>
                      {h.location && <p>{h.location}</p>}
                      {h.maxParticipants && (
                        <p>
                          {h.currentParticipants} of {h.maxParticipants} spots
                          taken
                        </p>
                      )}
                    </div>

                    <span className={`mt-1 self-start ${textLink}`}>View</span>
                  </Link>
                );
              })}
            </div>
          )}

          <section className="mt-12 border-t border-[var(--border-subtle)] pt-6 flex flex-col md:flex-row md:items-end justify-between gap-4">
            <div>
              <h2 className={sectionTitle}>Judge a hackathon</h2>
              <p className={`mt-2 max-w-xl ${body}`}>
                Industry professionals and experienced students score projects
                at the expo. You apply per event, and an organiser reviews each
                application.
              </p>
            </div>
            <Link
              href="/judge/register"
              className={`shrink-0 self-start md:self-auto ${btnSecondary}`}
            >
              Apply to judge
            </Link>
          </section>
        </div>
      )}

      {/* My registrations */}
      {activeTab === "registrations" && (
        <div className="mt-6">
          {myRegs && myRegs.length > 0 ? (
            <ul className="border-b border-[var(--border-subtle)]">
              {myRegs.map((reg) => (
                <li
                  key={reg.id}
                  className="border-t border-[var(--border-subtle)] first:border-t-0"
                >
                  <Link
                    href={`/hackathons/${hackathonSlug(reg.hackathon.name)}?tab=INFO`}
                    className="flex flex-col gap-3 py-5 sm:flex-row sm:items-start sm:justify-between sm:gap-8"
                  >
                    <div className="min-w-0">
                      <StatusBadge status={reg.registrationStatus} />
                      <h3 className={`mt-1 ${itemTitle}`}>
                        {reg.hackathon.name}
                      </h3>
                      {reg.hackathon.theme && (
                        <p className={`mt-0.5 ${meta}`}>
                          Theme: {reg.hackathon.theme}
                        </p>
                      )}
                      <p className={`mt-2 line-clamp-3 max-w-2xl ${body}`}>
                        {reg.hackathon.description}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-6 sm:flex-col sm:items-end sm:gap-2">
                      <span className={meta}>
                        {reg.hackathon.startDate
                          ? new Date(
                              reg.hackathon.startDate,
                            ).toLocaleDateString()
                          : "TBA"}
                      </span>
                      <span className={textLink}>View</span>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <div className="mt-8 space-y-3">
              <p className={body}>
                You haven&apos;t registered for any hackathons yet.
              </p>
              <button
                type="button"
                onClick={() => setActiveTab("browse")}
                className={textLink}
              >
                Browse hackathons
              </button>
            </div>
          )}
        </div>
      )}

      {/* My projects */}
      {activeTab === "projects" && (
        <div className="mt-6">
          {projects.length === 0 ? (
            <div className="mt-8 space-y-3">
              <p className={body}>
                Projects you submit to a hackathon show up here.
              </p>
              <button
                type="button"
                onClick={() => setActiveTab("browse")}
                className={textLink}
              >
                Browse hackathons
              </button>
            </div>
          ) : (
            <ul className="border-b border-[var(--border-subtle)]">
              {projects.map((project) => (
                <li
                  key={project.id}
                  className="border-t border-[var(--border-subtle)] first:border-t-0 py-5"
                >
                  <span
                    className={status(
                      project.status === "winner"
                        ? "success"
                        : project.status === "judging"
                          ? "accent"
                          : "neutral",
                    )}
                  >
                    {project.status === "winner"
                      ? "Winner"
                      : project.status === "judging"
                        ? "In judging"
                        : "Submitted"}
                  </span>
                  <h3 className={`mt-1 ${itemTitle}`}>{project.name}</h3>
                  <p className={`mt-2 line-clamp-3 max-w-2xl ${body}`}>
                    {project.description}
                  </p>

                  {(project.githubUrl || project.demoUrl) && (
                    <div className="mt-3 flex flex-wrap gap-6">
                      {project.githubUrl && (
                        <Link
                          href={project.githubUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={textLink}
                        >
                          Code
                        </Link>
                      )}
                      {project.demoUrl && (
                        <Link
                          href={project.demoUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={textLink}
                        >
                          Demo
                        </Link>
                      )}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
