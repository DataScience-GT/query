"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { trpc } from "@/lib/trpc";
import { LiquidGlass } from "@/components/portal/LiquidGlass";
import { LoadingScreen } from "@/components/portal/LoadingScreen";
import Link from "next/link";

type HackathonData = {
  id: string;
  name: string;
  description: string | null;
  startDate: Date | string;
  endDate: Date | string;
  status: string;
  location?: string | null;
  maxParticipants?: number | null;
  currentParticipants?: number | null;
  theme?: string | null;
};

export default function JudgePage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [mounted, setMounted] = useState(false);

  const { data: judgeStatus, isLoading: checkingJudge } =
    trpc.judge.isJudge.useQuery(undefined, { enabled: !!session });
  const { data: hackathons, isLoading: hackathonsLoading } =
    trpc.hackathon.list.useQuery({});
  const { data: assignments } = trpc.judge.getMyAssignments.useQuery(
    undefined,
    { enabled: !!session && !!judgeStatus?.isJudge },
  );
  // Applications, approved or not. getMyAssignments only returns approved ones,
  // so without this an applicant saw "Apply to Judge" again — and pressing it
  // threw "You have already applied".
  const { data: applications } = trpc.judge.myApplications.useQuery(undefined, {
    enabled: !!session,
  });

  useEffect(() => setMounted(true), []);

  // The approval email points here. Rendering nothing for a signed-out visitor
  // turned an expired session into a broken link.
  useEffect(() => {
    if (status === "unauthenticated") router.push("/login");
  }, [status, router]);

  if (!mounted || status === "loading" || checkingJudge || hackathonsLoading) {
    return <LoadingScreen message="Syncing..." />;
  }

  if (!session) return null;

  const confMap: Record<string, { label: string; bg: string; border: string }> =
    {
      open: {
        label: "Accepting Judges",
        bg: "bg-accent/10",
        border: "border-accent/30",
      },
      in_progress: {
        label: "Active",
        bg: "bg-accent/10",
        border: "border-accent/30",
      },
      completed: {
        label: "Completed",
        bg: "bg-white/5",
        border: "border-[var(--border-subtle)]",
      },
      closed: {
        label: "Closed",
        bg: "bg-amber-400/10",
        border: "border-amber-400/30",
      },
      cancelled: {
        label: "Cancelled",
        bg: "bg-rose-500/10",
        border: "border-rose-500/30",
      },
    };

  const formatDateRange = (start: Date | string, end: Date | string) => {
    const s = new Date(start);
    const e = new Date(end);
    if (s.getMonth() === e.getMonth() && s.getFullYear() === e.getFullYear()) {
      return `${s.toLocaleDateString("en-US", { month: "short", day: "numeric" })} - ${e.getDate()}, ${e.getFullYear()}`;
    }
    if (s.getFullYear() === e.getFullYear()) {
      return `${s.toLocaleDateString("en-US", { month: "short", day: "numeric" })} - ${e.toLocaleDateString("en-US", { month: "short", day: "numeric" })}, ${e.getFullYear()}`;
    }
    return `${s.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })} - ${e.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`;
  };

  return (
    <div className="relative min-h-screen bg-[var(--bg-secondary)] text-text-muted font-sans">
      <div className="relative z-10 max-w-7xl mx-auto py-16 px-6 md:px-12">
        <div className="flex flex-col md:flex-row md:items-end justify-between mb-12 gap-6">
          <div className="max-w-xl">
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-2 text-text-muted hover:text-[var(--text-primary)] transition-colors text-sm font-medium mb-6 group"
            >
              <div className="p-1.5 rounded-sm bg-white/5 border border-[var(--border-subtle)] group-hover:bg-white/10 transition-colors">
                <svg
                  className="w-3.5 h-3.5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15 19l-7-7 7-7"
                  />
                </svg>
              </div>
              Nexus
            </Link>
            <h1 className="text-3xl md:text-4xl font-black text-[var(--text-primary)] tracking-tight mb-2">
              Judge <span className="text-accent italic">Portal</span>
            </h1>
            <p className="text-sm text-text-muted">
              Browse upcoming hackathons and apply to become a judge. You must
              be approved by the hackathon admin before you can start judging.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {hackathons?.map((h: HackathonData) => {
            // draft has no entry, and admins see drafts in this list.
            const conf = confMap[h.status] ?? {
              label: h.status,
              bg: "bg-white/5",
              border: "border-[var(--border-subtle)]",
            };
            const assignment = assignments?.find((a) => a.hackathonId === h.id);
            const isRegistered = !!assignment;
            const application = applications?.find(
              (a) => a.hackathonId === h.id,
            );
            const awaitingApproval = !isRegistered && !!application;

            return (
              <LiquidGlass
                key={h.id}
                className="h-full flex flex-col p-1 transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_10px_30px_-10px_rgba(0,0,0,0.5)] bg-white/[0.01] border-[var(--border-subtle)] hover:bg-white/[0.02] hover:border-[var(--border-subtle)]"
              >
                {/* The card is a plain container, not a Link.
                    It used to wrap the whole thing in an anchor and then put
                    the "Apply to Judge" / "Ready to Judge" links inside it —
                    nested anchors, which React warns about and browsers
                    resolve unpredictably: the inner link often lost its click
                    to the outer one, so Apply took you to the judging screen
                    instead of the application form. */}
                <div className="group block">
                  <div className="relative flex flex-col h-full bg-[var(--bg-secondary)] rounded-none p-6 overflow-hidden">
                    <div
                      className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-sm text-xs font-semibold uppercase tracking-wide mb-4 ${conf.bg} border ${conf.border}`}
                    >
                      <div
                        className={`h-1.5 w-1.5 rounded-sm ${h.status === "open" || h.status === "in_progress" ? "bg-emerald-400 animate-pulse" : "bg-gray-500"}`}
                      />
                      {conf.label}
                    </div>
                    <div className="flex-1 min-h-0 mb-4">
                      {h.theme && (
                        <p className="text-accent/70 text-xs font-mono mb-2 uppercase tracking-wide">
                          {h.theme}
                        </p>
                      )}
                      <h2
                        className="text-xl font-bold text-[var(--text-primary)] mb-2 leading-tight truncate"
                        title={h.name}
                      >
                        {h.name}
                      </h2>
                      {h.description && (
                        <p className="text-xs text-text-muted line-clamp-2 leading-relaxed">
                          {h.description}
                        </p>
                      )}
                    </div>
                    <div className="mt-auto pt-4 border-t border-[var(--border-subtle)] flex flex-col gap-2">
                      <div className="flex items-center gap-2 text-xs text-text-muted">
                        <svg
                          className="w-3.5 h-3.5 flex-shrink-0 text-gray-600"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={1.5}
                            d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                          />
                        </svg>
                        <span>{formatDateRange(h.startDate, h.endDate)}</span>
                      </div>
                      {h.location && (
                        <div className="flex items-center gap-2 text-xs text-text-muted">
                          <svg
                            className="w-3.5 h-3.5 flex-shrink-0 text-gray-600"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={1.5}
                              d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
                            />
                          </svg>
                          <span>{h.location}</span>
                        </div>
                      )}
                      {h.maxParticipants && (
                        <div className="flex items-center gap-2 text-xs text-text-muted">
                          <svg
                            className="w-3.5 h-3.5 flex-shrink-0 text-gray-600"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={1.5}
                              d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
                            />
                          </svg>
                          <span>
                            {h.currentParticipants ?? 0} / {h.maxParticipants}{" "}
                            Spots
                          </span>
                        </div>
                      )}
                    </div>
                    <div className="mt-4 flex gap-2">
                      {isRegistered ? (
                        <>
                          <Link
                            href={`/hackathons/${h.id}/judge`}
                            className="flex-1 px-4 py-2 rounded-none bg-accent/10 border border-accent/20 text-accent text-xs font-bold uppercase tracking-widest hover:bg-accent/20 transition-colors cursor-pointer"
                          >
                            Ready to Judge
                          </Link>
                        </>
                      ) : awaitingApproval ? (
                        <div className="flex-1 px-4 py-2 rounded-none bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs font-bold uppercase tracking-widest text-center">
                          Application pending review
                        </div>
                      ) : h.status === "open" ||
                        h.status === "closed" ||
                        h.status === "in_progress" ? (
                        <Link
                          href={`/judge/register?hackathonId=${h.id}`}
                          className="flex-1 px-4 py-2 rounded-none bg-accent/10 border border-accent/30 text-accent text-xs font-bold uppercase tracking-widest hover:bg-accent/20 transition-colors"
                        >
                          Apply to Judge
                        </Link>
                      ) : (
                        <button
                          disabled
                          className="flex-1 px-4 py-2 rounded-none bg-white/5 border border-[var(--border-subtle)] text-gray-600 text-xs font-bold uppercase tracking-widest cursor-not-allowed"
                        >
                          Closed
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </LiquidGlass>
            );
          })}
        </div>
      </div>
    </div>
  );
}
