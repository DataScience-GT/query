"use client";

import { useEffect } from "react";
import { loginHref } from "@/lib/safe-callback";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { trpc } from "@/lib/trpc";
import { useIsClient } from "@/lib/use-is-client";
import { LoadingScreen } from "@/components/portal/LoadingScreen";
import Link from "next/link";
import { Calendar, MapPin, Users } from "lucide-react";
import {
  body,
  btnPrimary,
  btnSecondary,
  itemTitle,
  meta,
  object,
  page,
  pageDek,
  pageTitle,
  status as statusClass,
  textLink,
} from "@/components/portal/ui";
import type { Tone } from "@/components/portal/ui";

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
  const { data: panelDesk } = trpc.judge.panelDesk.useQuery(undefined, {
    enabled: !!session,
  });
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

  const confMap: Record<string, { label: string; tone: Tone }> = {
    announced: { label: "Accepting judges", tone: "accent" },
    open: { label: "Accepting judges", tone: "accent" },
    in_progress: { label: "Live", tone: "accent" },
    completed: { label: "Completed", tone: "neutral" },
    closed: { label: "Closed", tone: "warning" },
    cancelled: { label: "Cancelled", tone: "danger" },
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
    <main className={page}>
      <Link
        href="/dashboard"
        className="text-[13px] text-[var(--text-subtle)] hover:text-[var(--text-primary)] transition-colors"
      >
        ← Dashboard
      </Link>

      <header className="mt-6">
        <h1 className={pageTitle}>Judge a hackathon</h1>
        <p className={pageDek}>
          Apply to judge an event. An organiser approves you before you can
          score.
        </p>
        {panelDesk?.url ? (
          <a className={textLink} href={panelDesk.url}>
            Open the judging desk
          </a>
        ) : null}
      </header>

      {!hackathons?.length ? (
        <section className="mt-10 border-t border-[var(--border-subtle)] pt-6">
          <p className={body}>
            Hackathons taking judge applications will be listed here.
          </p>
          <Link href="/hackathons" className={`mt-3 ${textLink}`}>
            See all hackathons
          </Link>
        </section>
      ) : (
        <div className="mt-10 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {hackathons.map((h: HackathonData) => {
            // draft has no entry, and admins see drafts in this list.
            const conf = confMap[h.status] ?? {
              label: h.status,
              tone: "neutral" as Tone,
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
              <article key={h.id} className={`${object} p-5 h-full flex flex-col`}>
                {/* The card is a plain container, not a Link.
                    It used to wrap the whole thing in an anchor and then put
                    the "Apply to judge" / "Start judging" links inside it —
                    nested anchors, which React warns about and browsers
                    resolve unpredictably: the inner link often lost its click
                    to the outer one, so Apply took you to the judging screen
                    instead of the application form. */}
                <span className={statusClass(conf.tone)}>{conf.label}</span>
                <div className="flex-1 min-h-0 mt-3 mb-4">
                  {h.theme && <p className={`mb-1 ${meta}`}>{h.theme}</p>}
                  <h2 className={`truncate ${itemTitle}`} title={h.name}>
                    {h.name}
                  </h2>
                  {h.description && (
                    <p className="mt-2 text-[15px] text-[var(--text-muted)] line-clamp-2 leading-relaxed">
                      {h.description}
                    </p>
                  )}
                </div>
                <div className={`mt-auto pt-4 border-t border-[var(--border-subtle)] flex flex-col gap-2 ${meta}`}>
                  <div className="flex items-center gap-2">
                    <Calendar
                      size={16}
                      strokeWidth={1.75}
                      aria-hidden="true"
                      className="flex-shrink-0"
                    />
                    <span>{formatDateRange(h.startDate, h.endDate)}</span>
                  </div>
                  {h.location && (
                    <div className="flex items-center gap-2">
                      <MapPin
                        size={16}
                        strokeWidth={1.75}
                        aria-hidden="true"
                        className="flex-shrink-0"
                      />
                      <span>{h.location}</span>
                    </div>
                  )}
                  {h.maxParticipants && (
                    <div className="flex items-center gap-2">
                      <Users
                        size={16}
                        strokeWidth={1.75}
                        aria-hidden="true"
                        className="flex-shrink-0"
                      />
                      <span className="tabular-nums">
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
                      className={`flex-1 min-h-11 ${h.status === "in_progress" ? btnPrimary : btnSecondary}`}
                    >
                      Start judging
                    </Link>
                  ) : awaitingApproval ? (
                    <p className={`py-2.5 ${statusClass("warning")}`}>
                      Awaiting approval
                    </p>
                  ) : h.status === "announced" ||
                    h.status === "open" ||
                    h.status === "closed" ||
                    h.status === "in_progress" ? (
                    <Link
                      href={`/judge/register?hackathonId=${h.id}`}
                      className={`flex-1 min-h-11 ${btnSecondary}`}
                    >
                      Apply to judge
                    </Link>
                  ) : (
                    <button
                      disabled
                      className={`flex-1 min-h-11 ${btnSecondary}`}
                    >
                      Not taking judges
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </main>
  );
}
