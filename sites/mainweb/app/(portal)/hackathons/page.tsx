"use client";

import React, { useEffect, useState } from "react";
import { loginHref } from "@/lib/safe-callback";
import { useSession } from "next-auth/react";
import { trpc } from "@/lib/trpc";
import { hackathonSlug } from "@/lib/hackathon-slug";
import { useRouter } from "next/navigation";
import { LiquidGlass } from "@/components/portal/LiquidGlass";
import { LoadingScreen } from "@/components/portal/LoadingScreen";
import Link from "next/link";
import { StatusBadge } from "@/components/hackathon/StatusBadge";
import {
  Calendar,
  FolderGit2,
  Globe,
  ArrowRight,
  ChevronLeft,
  MapPin,
  Users,
} from "lucide-react";

type HackathonStatus =
  | "announced"
  | "open"
  | "in_progress"
  | "completed"
  | "closed"
  | "cancelled";
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

function statusConfig(s: HackathonStatus | "draft" | "cancelled") {
  const map: Record<string, { label: string; className: string }> = {
    announced: {
      label: "Opens soon",
      className: "text-cyan-400 bg-cyan-400/10 border-cyan-400/25",
    },
    open: {
      label: "Registration open",
      className: "text-accent bg-accent/10 border-accent/25",
    },
    in_progress: {
      label: "Live",
      className: "text-accent bg-accent/10 border-accent/25",
    },
    completed: {
      label: "Completed",
      className:
        "text-[var(--text-muted)] bg-[var(--bg-secondary)] border-[var(--border-subtle)]",
    },
    closed: {
      label: "Registration closed",
      className: "text-amber-400 bg-amber-400/10 border-amber-400/25",
    },
    cancelled: {
      label: "Cancelled",
      className: "text-rose-500 bg-rose-500/10 border-rose-500/25",
    },
    draft: {
      label: "Draft",
      className:
        "text-[var(--text-muted)] bg-[var(--bg-secondary)] border-[var(--border-subtle)]",
    },
  };
  return (
    map[s] ?? {
      label: s,
      className:
        "text-[var(--text-muted)] bg-[var(--bg-secondary)] border-[var(--border-subtle)]",
    }
  );
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
    <div className="relative min-h-screen bg-[var(--bg-tertiary)]">
      {/* Ambient glows */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
        <div className="absolute top-[-20%] left-[10%] w-[600px] h-[600px] bg-accent/5 blur-[200px] rounded-full" />
        <div className="absolute bottom-[-10%] right-[5%] w-[500px] h-[500px] bg-indigo-600/5 blur-[180px] rounded-full" />
      </div>

      <div className="relative z-10 max-w-6xl mx-auto px-6 py-10 space-y-8">
        {/* Back nav */}
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-1 text-xs text-[var(--text-muted)] hover:text-accent"
        >
          <ChevronLeft className="w-3.5 h-3.5" />
          Dashboard
        </Link>

        {/* Header */}
        <div>
          <h1 className="text-3xl font-black text-[var(--text-primary)] tracking-wider font-oswald uppercase">
            Hackathons
          </h1>
          <p className="text-sm text-[var(--text-muted)] mt-1">
            Events you can register for, your registrations, and projects
            you&apos;ve submitted.
          </p>
        </div>

        {/* Tab Navigation */}
        <div className="inline-flex flex-wrap rounded-sm border border-[var(--border-subtle)] bg-[var(--bg-secondary)] p-1">
          {tabs.map((tab) => (
            <Link
              key={tab.id}
              href={`#${tab.id}`}
              onClick={() => setActiveTab(tab.id as Tab)}
              className={`rounded-sm px-5 py-2 text-sm font-bold uppercase tracking-wider transition-colors ${
                activeTab === tab.id
                  ? "bg-accent/15 text-accent"
                  : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
              }`}
            >
              {tab.label}
            </Link>
          ))}
        </div>

        {/* ── BROWSE TAB ── */}
        {activeTab === "browse" && (
          <div className="space-y-6 animate-in fade-in duration-300">
            {/* Status Filter */}
            <div className="flex flex-wrap gap-2">
              {filters.map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => setStatusFilter(key)}
                  className={`px-3 py-1.5 rounded-sm text-xs font-bold uppercase tracking-wider border transition-colors ${
                    statusFilter === key
                      ? "bg-accent/15 border-accent/40 text-accent"
                      : "border-[var(--border-subtle)] text-[var(--text-muted)] hover:border-[var(--border-hover)]"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {!hackathons || hackathons.length === 0 ? (
              <LiquidGlass printed className="p-8 text-center flex flex-col items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-[var(--bg-secondary)] border border-[var(--border-subtle)] flex items-center justify-center">
                  <Calendar className="w-5 h-5 text-[var(--text-subtle)]" />
                </div>
                <p className="text-sm text-[var(--text-muted)]">
                  No hackathons are listed yet. New events show up here when
                  they&apos;re announced.
                </p>
              </LiquidGlass>
            ) : filtered.length === 0 ? (
              <LiquidGlass printed className="p-8 text-center flex flex-col items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-[var(--bg-secondary)] border border-[var(--border-subtle)] flex items-center justify-center">
                  <Calendar className="w-5 h-5 text-[var(--text-subtle)]" />
                </div>
                <p className="text-sm text-[var(--text-muted)]">
                  No {filterLabel} hackathons right now.
                </p>
              </LiquidGlass>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filtered.map((h) => {
                  const conf = statusConfig(h.status);
                  const regStatus = regStatusById.get(h.id);
                  return (
                    <Link
                      href={`/hackathons/${hackathonSlug(h.name)}`}
                      key={h.id}
                      className="block group"
                    >
                      <LiquidGlass
                        printed
                        holographic
                        className="p-6 h-full flex flex-col gap-3 hover:border-accent/40 transition-ui"
                      >
                        <div className="flex flex-wrap justify-between items-start gap-2">
                          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-sm text-[11px] font-bold uppercase tracking-wider border ${conf.className}`}>
                            {conf.label}
                          </span>
                          {regStatus && <StatusBadge status={regStatus} />}
                        </div>

                        <div className="flex-1">
                          {h.theme && (
                            <p className="text-[11px] text-accent/80 uppercase tracking-wider mb-1">
                              {h.theme}
                            </p>
                          )}
                          <h2 className="text-lg font-bold text-[var(--text-primary)] group-hover:text-accent leading-tight">
                            {h.name}
                          </h2>
                          {h.description && (
                            <p className="text-sm text-[var(--text-muted)] line-clamp-3 leading-relaxed mt-2">
                              {h.description}
                            </p>
                          )}
                        </div>

                        <div className="pt-3 border-t border-[var(--border-subtle)] flex flex-col gap-2">
                          <div className="text-xs text-[var(--text-muted)] flex items-center gap-2">
                            <Calendar className="w-3.5 h-3.5 text-[var(--text-subtle)]" />
                            {formatDateRange(h.startDate, h.endDate)}
                          </div>
                          {h.location && (
                            <div className="text-xs text-[var(--text-muted)] flex items-center gap-2">
                              <MapPin className="w-3.5 h-3.5 text-[var(--text-subtle)]" />
                              {h.location}
                            </div>
                          )}
                          {h.maxParticipants && (
                            <div className="text-xs text-[var(--text-muted)] flex items-center gap-2">
                              <Users className="w-3.5 h-3.5 text-[var(--text-subtle)]" />
                              {h.currentParticipants} of {h.maxParticipants}{" "}
                              spots taken
                            </div>
                          )}
                        </div>

                        <div className="mt-auto flex justify-end items-center gap-1 text-[11px] font-semibold text-accent">
                          View <ArrowRight className="w-3 h-3" />
                        </div>
                      </LiquidGlass>
                    </Link>
                  );
                })}
              </div>
            )}

            {/* Judge Sign-Up CTA */}
            <LiquidGlass
              printed
              className="p-6 flex flex-col md:flex-row md:items-center justify-between gap-4"
            >
              <div>
                <h3 className="text-base font-bold text-[var(--text-primary)]">
                  Judge a hackathon
                </h3>
                <p className="text-sm text-[var(--text-muted)] mt-1 max-w-xl">
                  Industry professionals and experienced students score
                  projects at the expo. You apply per event, and an organiser
                  reviews each application.
                </p>
              </div>
              <Link
                href="/judge/register"
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-sm bg-accent/10 border border-accent/25 text-accent text-xs font-bold uppercase tracking-widest hover:bg-accent/20 transition-colors shrink-0 self-start md:self-auto"
              >
                Apply to judge
              </Link>
            </LiquidGlass>
          </div>
        )}

        {/* ── MY REGISTRATIONS TAB ── */}
        {activeTab === "registrations" && (
          <div className="animate-in fade-in duration-300">
            {myRegs && myRegs.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {myRegs.map((reg) => (
                  <Link
                    key={reg.id}
                    href={`/hackathons/${hackathonSlug(reg.hackathon.name)}?tab=INFO`}
                    className="block group"
                  >
                    <LiquidGlass
                      printed
                      holographic
                      className="p-5 h-full flex flex-col gap-3 hover:border-accent/40 transition-ui"
                    >
                      <div>
                        <StatusBadge status={reg.registrationStatus} />
                      </div>

                      <div className="flex-1">
                        <h4 className="font-bold text-sm text-[var(--text-primary)] group-hover:text-accent leading-tight">
                          {reg.hackathon.name}
                        </h4>
                        {reg.hackathon.theme && (
                          <p className="text-[11px] text-accent/80 uppercase tracking-wider mt-1">
                            Theme: {reg.hackathon.theme}
                          </p>
                        )}
                        <p className="text-[var(--text-muted)] text-sm line-clamp-3 leading-relaxed mt-2">
                          {reg.hackathon.description}
                        </p>
                      </div>

                      <div className="border-t border-[var(--border-subtle)] pt-3 mt-auto flex items-center justify-between">
                        <span className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
                          <Calendar className="w-3.5 h-3.5 text-[var(--text-subtle)]" />
                          {reg.hackathon.startDate
                            ? new Date(
                                reg.hackathon.startDate,
                              ).toLocaleDateString()
                            : "TBA"}
                        </span>
                        <span className="flex items-center gap-1 text-[11px] font-semibold text-accent">
                          View <ArrowRight className="w-3 h-3" />
                        </span>
                      </div>
                    </LiquidGlass>
                  </Link>
                ))}
              </div>
            ) : (
              <LiquidGlass printed className="p-8 text-center flex flex-col items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-[var(--bg-secondary)] border border-[var(--border-subtle)] flex items-center justify-center">
                  <Calendar className="w-5 h-5 text-[var(--text-subtle)]" />
                </div>
                <p className="text-sm text-[var(--text-muted)]">
                  You haven&apos;t registered for any hackathons yet.
                </p>
                <button
                  onClick={() => setActiveTab("browse")}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-sm bg-accent/10 border border-accent/25 text-accent text-xs font-bold uppercase tracking-widest hover:bg-accent/20 transition-colors"
                >
                  Browse hackathons
                </button>
              </LiquidGlass>
            )}
          </div>
        )}

        {/* ── MY PROJECTS TAB ── */}
        {activeTab === "projects" && (
          <div className="animate-in fade-in duration-300">
            {projects.length === 0 ? (
              <LiquidGlass printed className="p-8 text-center flex flex-col items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-[var(--bg-secondary)] border border-[var(--border-subtle)] flex items-center justify-center">
                  <FolderGit2 className="w-5 h-5 text-[var(--text-subtle)]" />
                </div>
                <p className="text-sm text-[var(--text-muted)]">
                  Projects you submit to a hackathon show up here.
                </p>
                <button
                  onClick={() => setActiveTab("browse")}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-sm bg-accent/10 border border-accent/25 text-accent text-xs font-bold uppercase tracking-widest hover:bg-accent/20 transition-colors"
                >
                  Browse hackathons
                </button>
              </LiquidGlass>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {projects.map((project) => (
                  <LiquidGlass key={project.id} printed className="p-6">
                    <div className="flex justify-between items-start gap-3 mb-3">
                      <h4 className="text-base font-bold text-[var(--text-primary)]">
                        {project.name}
                      </h4>
                      <span
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-sm text-[11px] font-bold uppercase tracking-wider border shrink-0 ${
                          project.status === "winner"
                            ? "text-amber-400 bg-amber-500/10 border-amber-500/25"
                            : project.status === "judging"
                              ? "text-sky-400 bg-sky-500/10 border-sky-500/25"
                              : "text-accent bg-accent/10 border-accent/25"
                        }`}
                      >
                        {project.status === "winner"
                          ? "Winner"
                          : project.status === "judging"
                            ? "In judging"
                            : "Submitted"}
                      </span>
                    </div>
                    <p className="text-[var(--text-muted)] text-sm mb-6 line-clamp-3 leading-relaxed">
                      {project.description}
                    </p>

                    <div className="flex flex-wrap gap-3 border-t border-[var(--border-subtle)] pt-5">
                      {project.githubUrl && (
                        <Link
                          href={project.githubUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-sm border border-[var(--border-medium)] bg-[var(--bg-secondary)] text-[var(--text-muted)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)] hover:border-[var(--border-hover)] transition-ui text-xs font-bold uppercase tracking-widest"
                        >
                          <FolderGit2 className="w-4 h-4" /> Code
                        </Link>
                      )}
                      {project.demoUrl && (
                        <Link
                          href={project.demoUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-sm bg-accent/10 border border-accent/25 text-accent text-xs font-bold uppercase tracking-widest hover:bg-accent/20 transition-colors"
                        >
                          <Globe className="w-4 h-4" /> Demo
                        </Link>
                      )}
                    </div>
                  </LiquidGlass>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
