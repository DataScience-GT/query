"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { loginHref } from "@/lib/safe-callback";
import { trpc } from "@/lib/trpc";
import { useIsClient } from "@/lib/use-is-client";
import { usePortalContext } from "@/lib/use-portal-context";
import { LoadingScreen } from "@/components/portal/LoadingScreen";
import {
  body,
  itemTitle,
  label,
  meta,
  page,
  pageDek,
  pageTitle,
  sectionRule,
  status,
  textLink,
} from "@/components/portal/ui";

// Statuses that take judge applications; judge.register enforces the same.
const APPLYING = new Set(["announced", "open", "closed", "in_progress"]);

function formatDates(start: Date | string, end: Date | string) {
  const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
  const s = new Date(start);
  const e = new Date(end);
  return `${s.toLocaleDateString("en-US", opts)} – ${e.toLocaleDateString("en-US", { ...opts, year: "numeric" })}`;
}

export default function JudgePage() {
  const { data: session, status: authStatus } = useSession();
  const router = useRouter();
  const mounted = useIsClient();

  // isJudge covers a judge an organiser added by email, who has no application;
  // myApplications covers every edition the user applied to, approved or not.
  const { data: judgeStatus, isLoading: checkingJudge } =
    trpc.judge.isJudge.useQuery(undefined, { enabled: !!session });
  const { data: applications, isLoading: applicationsLoading } =
    trpc.judge.myApplications.useQuery(undefined, { enabled: !!session });
  const { data: hackathons, isLoading: hackathonsLoading } =
    trpc.hackathon.list.useQuery({ limit: 50 });
  // Staff can judge any edition without applying.
  const { data: portal } = usePortalContext();

  // The approval email points here, so a signed-out visitor goes to sign in.
  useEffect(() => {
    if (authStatus === "unauthenticated") router.push(loginHref());
  }, [authStatus, router]);

  if (
    !mounted ||
    authStatus === "loading" ||
    checkingJudge ||
    applicationsLoading ||
    hackathonsLoading
  ) {
    return <LoadingScreen message="Loading…" />;
  }

  if (!session) return null;

  const byId = new Map((hackathons ?? []).map((h) => [h.id, h]));

  const judgingIds = new Set(
    (applications ?? []).filter((a) => a.approved).map((a) => a.hackathonId),
  );
  if (judgeStatus?.isJudge && judgeStatus.hackathonId) {
    judgingIds.add(judgeStatus.hackathonId);
  }
  if (portal?.isAdmin) {
    for (const h of hackathons ?? []) {
      if (h.status === "in_progress") judgingIds.add(h.id);
    }
  }
  const waitingIds = new Set(
    (applications ?? [])
      .filter((a) => !a.approved && !judgingIds.has(a.hackathonId))
      .map((a) => a.hackathonId),
  );
  const canApply = (hackathons ?? []).filter(
    (h) =>
      APPLYING.has(h.status) && !judgingIds.has(h.id) && !waitingIds.has(h.id),
  );

  const judging = [...judgingIds];
  const waiting = [...waitingIds];

  return (
    <main className={page}>
      <header>
        <h1 className={pageTitle}>Judging</h1>
        <p className={pageDek}>
          {judging.length > 0
            ? "Open your edition on judging day, then scan the QR code on your room's door to take your seat."
            : "Apply to judge an edition. An organiser approves you before judging day."}
        </p>
      </header>

      {judging.length > 0 && (
        <section className={`mt-10 ${sectionRule}`}>
          <h2 className={label}>You are judging</h2>
          <ul className="mt-3 border-t border-[var(--border-subtle)]">
            {judging.map((id) => {
              const h = byId.get(id);
              return (
                <li key={id} className="border-b border-[var(--border-subtle)]">
                  <Link
                    href={`/judge/${id}`}
                    className="flex items-center gap-4 py-4 min-h-11 hover:bg-[var(--bg-secondary)] transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <p className={`${itemTitle} truncate`}>
                        {h?.name ?? "Hackathon"}
                      </p>
                      {h && (
                        <p className={`mt-1 ${meta}`}>
                          {formatDates(h.startDate, h.endDate)}
                          {h.location ? ` · ${h.location}` : ""}
                        </p>
                      )}
                    </div>
                    <ChevronRight
                      className="h-4 w-4 shrink-0 text-[var(--text-subtle)]"
                      strokeWidth={1.75}
                      aria-hidden="true"
                    />
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {waiting.length > 0 && (
        <section className={`mt-10 ${sectionRule}`}>
          <h2 className={label}>Waiting for approval</h2>
          <ul className="mt-3 border-t border-[var(--border-subtle)]">
            {waiting.map((id) => (
              <li
                key={id}
                className="flex items-center justify-between gap-4 border-b border-[var(--border-subtle)] py-4"
              >
                <p className={`${itemTitle} truncate`}>
                  {byId.get(id)?.name ?? "Hackathon"}
                </p>
                <span className={status("warning")}>Applied</span>
              </li>
            ))}
          </ul>
          <p className={`mt-3 ${meta}`}>
            You will get an email when an organiser approves you.
          </p>
        </section>
      )}

      <section className={`mt-10 ${sectionRule}`}>
        <h2 className={label}>Taking judges</h2>
        {canApply.length === 0 ? (
          <p className={`mt-3 ${body}`}>
            No edition is taking judge applications right now.
          </p>
        ) : (
          <ul className="mt-3 border-t border-[var(--border-subtle)]">
            {canApply.map((h) => (
              <li
                key={h.id}
                className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 border-b border-[var(--border-subtle)] py-4"
              >
                <div className="flex-1 min-w-0">
                  <p className={`${itemTitle} truncate`}>{h.name}</p>
                  <p className={`mt-1 ${meta}`}>
                    {formatDates(h.startDate, h.endDate)}
                  </p>
                </div>
                <Link
                  href={`/judge/register?hackathonId=${h.id}`}
                  className={`${textLink} min-h-11`}
                >
                  Apply to judge
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
