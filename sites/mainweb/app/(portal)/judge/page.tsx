"use client";

import { useEffect } from "react";
import { loginHref } from "@/lib/safe-callback";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { trpc } from "@/lib/trpc";
import { useIsClient } from "@/lib/use-is-client";
import { LiquidGlass } from "@/components/portal/LiquidGlass";
import { LoadingScreen } from "@/components/portal/LoadingScreen";
import Link from "next/link";
import { Calendar, ChevronLeft, Gavel, MapPin, Users } from "lucide-react";

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

const BADGE =
  "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-sm text-[11px] font-bold uppercase tracking-wider border";
const NEUTRAL_BADGE =
  "bg-[var(--bg-secondary)] border-[var(--border-subtle)] text-[var(--text-muted)]";

export default function JudgePage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const mounted = useIsClient();

  const { data: judgeStatus, isLoading: checkingJudge } =
    trpc.judge.isJudge.useQuery(undefined, { enabled: !!session });
  const { data: hackathons, isLoading: hackathonsLoading } =
    trpc.hackathon.list.useQuery({});
  // Applications, approved or not. getMyAssignments only returns approved ones,
  // so without this an applicant saw "Apply to judge" again — and pressing it
  // threw "You have already applied".
  const { data: applications } = trpc.judge.myApplications.useQuery(undefined, {
    enabled: !!session,
  });
  // Gated on any approved application, not isJudge: isJudge answers for the
  // current edition only, while assignments span every edition, so a judge
  // approved for another one saw "Awaiting approval" forever.
  const { data: assignments } = trpc.judge.getMyAssignments.useQuery(
    undefined,
    {
      enabled:
        !!session &&
        !!(judgeStatus?.isJudge || applications?.some((a) => a.approved)),
    },
  );

  // The approval email points here. Rendering nothing for a signed-out visitor
  // turned an expired session into a broken link.
  useEffect(() => {
    if (status === "unauthenticated") router.push(loginHref());
  }, [status, router]);

  if (!mounted || status === "loading" || checkingJudge || hackathonsLoading) {
    return <LoadingScreen message="Loading…" />;
  }

  if (!session) return null;

  const confMap: Record<string, { label: string; cls: string }> = {
    announced: {
      label: "Accepting judges",
      cls: "bg-accent/10 border-accent/25 text-accent",
    },
    open: {
      label: "Accepting judges",
      cls: "bg-accent/10 border-accent/25 text-accent",
    },
    in_progress: {
      label: "Live",
      cls: "bg-accent/10 border-accent/25 text-accent",
    },
    completed: {
      label: "Completed",
      cls: NEUTRAL_BADGE,
    },
    closed: {
      label: "Closed",
      cls: "bg-amber-400/10 border-amber-400/30 text-amber-300",
    },
    cancelled: {
      label: "Cancelled",
      cls: "bg-rose-500/10 border-rose-500/30 text-rose-400",
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
    <div className="relative min-h-screen bg-[var(--bg-tertiary)]">
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
        <div className="absolute top-[-20%] left-[10%] w-[600px] h-[600px] bg-accent/5 blur-[200px] rounded-full" />
        <div className="absolute bottom-[-10%] right-[5%] w-[500px] h-[500px] bg-indigo-600/5 blur-[180px] rounded-full" />
      </div>

      <div className="relative z-10 max-w-6xl mx-auto px-6 py-10 space-y-8">
        <div>
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-1 text-xs text-[var(--text-muted)] hover:text-accent mb-4"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
            Dashboard
          </Link>
          <h1 className="text-3xl font-black text-[var(--text-primary)] tracking-wider font-oswald uppercase">
            Judging
          </h1>
          <p className="text-sm text-[var(--text-muted)] mt-1">
            Apply to judge an event. An organiser approves you before you can
            score.
          </p>
        </div>

        {!hackathons?.length ? (
          <LiquidGlass
            printed
            className="p-8 text-center flex flex-col items-center gap-3"
          >
            <div className="w-12 h-12 rounded-full bg-[var(--bg-secondary)] border border-[var(--border-subtle)] flex items-center justify-center">
              <Gavel className="w-5 h-5 text-[var(--text-subtle)]" />
            </div>
            <p className="text-sm text-[var(--text-muted)]">
              No hackathons are taking judge applications right now.
            </p>
          </LiquidGlass>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {hackathons.map((h: HackathonData) => {
              // draft has no entry, and admins see drafts in this list.
              const conf = confMap[h.status] ?? {
                label: h.status,
                cls: NEUTRAL_BADGE,
              };
              const assignment = assignments?.find(
                (a) => a.hackathonId === h.id,
              );
              const isRegistered = !!assignment;
              const application = applications?.find(
                (a) => a.hackathonId === h.id,
              );
              const awaitingApproval = !isRegistered && !!application;

              return (
                <LiquidGlass
                  key={h.id}
                  printed
                  className="p-6 h-full flex flex-col"
                >
                  {/* The card is a plain container, not a Link.
                      It used to wrap the whole thing in an anchor and then put
                      the "Apply to judge" / "Start judging" links inside it —
                      nested anchors, which React warns about and browsers
                      resolve unpredictably: the inner link often lost its click
                      to the outer one, so Apply took you to the judging screen
                      instead of the application form. */}
                  <div className={`${BADGE} ${conf.cls} self-start mb-4`}>
                    {conf.label}
                  </div>
                  <div className="flex-1 min-h-0 mb-4">
                    {h.theme && (
                      <p className="text-[11px] text-accent/80 uppercase tracking-wider mb-2">
                        {h.theme}
                      </p>
                    )}
                    <h2
                      className="text-base font-bold text-[var(--text-primary)] mb-2 leading-tight truncate"
                      title={h.name}
                    >
                      {h.name}
                    </h2>
                    {h.description && (
                      <p className="text-xs text-[var(--text-muted)] line-clamp-2 leading-relaxed">
                        {h.description}
                      </p>
                    )}
                  </div>
                  <div className="mt-auto pt-4 border-t border-[var(--border-subtle)] flex flex-col gap-2 text-xs text-[var(--text-muted)]">
                    <div className="flex items-center gap-2">
                      <Calendar className="w-3.5 h-3.5 flex-shrink-0 text-[var(--text-subtle)]" />
                      <span>{formatDateRange(h.startDate, h.endDate)}</span>
                    </div>
                    {h.location && (
                      <div className="flex items-center gap-2">
                        <MapPin className="w-3.5 h-3.5 flex-shrink-0 text-[var(--text-subtle)]" />
                        <span>{h.location}</span>
                      </div>
                    )}
                    {h.maxParticipants && (
                      <div className="flex items-center gap-2">
                        <Users className="w-3.5 h-3.5 flex-shrink-0 text-[var(--text-subtle)]" />
                        <span>
                          {h.currentParticipants ?? 0} of {h.maxParticipants}{" "}
                          spots taken
                        </span>
                      </div>
                    )}
                  </div>
                  <div className="mt-4 flex gap-2">
                    {isRegistered ? (
                      <Link
                        href={`/hackathons/${h.id}/judge`}
                        className="flex-1 px-4 py-2 rounded-sm bg-accent/10 border border-accent/25 text-accent text-xs font-bold uppercase tracking-widest text-center hover:bg-accent/20 transition-colors"
                      >
                        Start judging
                      </Link>
                    ) : awaitingApproval ? (
                      <div className="flex-1 px-4 py-2 rounded-sm bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs font-bold uppercase tracking-widest text-center">
                        Awaiting approval
                      </div>
                    ) : h.status === "announced" ||
                      h.status === "open" ||
                      h.status === "closed" ||
                      h.status === "in_progress" ? (
                      <Link
                        href={`/judge/register?hackathonId=${h.id}`}
                        className="flex-1 px-4 py-2 rounded-sm bg-accent/10 border border-accent/25 text-accent text-xs font-bold uppercase tracking-widest text-center hover:bg-accent/20 transition-colors"
                      >
                        Apply to judge
                      </Link>
                    ) : (
                      <button
                        disabled
                        className="flex-1 px-4 py-2 rounded-sm bg-[var(--bg-secondary)] border border-[var(--border-subtle)] text-[var(--text-subtle)] text-xs font-bold uppercase tracking-widest cursor-not-allowed"
                      >
                        Closed
                      </button>
                    )}
                  </div>
                </LiquidGlass>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
