"use client";

import { useSession, signOut } from "next-auth/react";
import { loginHref } from "@/lib/safe-callback";
import { trpc } from "@/lib/trpc";
import {
  useInvalidatePortalContext,
  usePortalContext,
} from "@/lib/use-portal-context";
import { hackathonSlug } from "@/lib/hackathon-slug";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import LinkStripeAccount from "@/components/portal/LinkStripeAccount";
import { StatusBadge } from "@/components/hackathon/StatusBadge";
import {
  MEMBERSHIP_CENTS,
  SEMESTER_MEMBERSHIP_CENTS,
  formatCents,
} from "@query/api/pricing";
import { LoadingScreen } from "@/components/portal/LoadingScreen";
import { ArrowRight } from "lucide-react";
import {
  body,
  btnPrimary,
  btnSecondary,
  itemTitle,
  label,
  mastRule,
  meta,
  page,
  pageDek,
  pageTitle,
  sectionRule,
  sectionTitle,
  status as statusLine,
  tab,
  tabList,
  textLink,
} from "@/components/portal/ui";

export default function Dashboard() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const { data: portalContext } = usePortalContext();
  const { data: userData } = trpc.user.me.useQuery(undefined, {
    enabled: !!session,
  });
  const { data: myRegs, isLoading: loadingRegs } =
    trpc.hackathon.myRegistrations.useQuery(undefined, { enabled: !!session });

  const memberStatus = portalContext?.member;
  const isAdmin = portalContext?.isAdmin ?? false;
  const isJudge = portalContext?.isJudge ?? false;

  /**
   * Which half they land on. Held as null until they choose so the default can
   * follow the data once it arrives — a paid member opens on Club, everyone
   * else on Hackathon, which is the half that is open to them.
   */
  const [chosenView, setChosenView] = useState<"club" | "hackathon" | null>(
    null,
  );
  const view = chosenView ?? (memberStatus?.isMember ? "club" : "hackathon");
  const setView = setChosenView;

  const now = new Date();
  const activeRegs =
    myRegs?.filter((r) =>
      r.hackathon.endDate ? new Date(r.hackathon.endDate) >= now : true,
    ) ?? [];
  const pastRegs =
    myRegs?.filter((r) =>
      r.hackathon.endDate ? new Date(r.hackathon.endDate) < now : false,
    ) ?? [];

  // A link made here changes membership, so the page has to re-read it — or it
  // keeps showing the pay button to somebody who has already paid.
  const utils = trpc.useUtils();
  const invalidatePortalContext = useInvalidatePortalContext();
  const { mutate: attemptAutoLink } = trpc.stripe.attemptAutoLink.useMutation({
    onSuccess: (data) => {
      if (!data.success) return;
      void utils.member.checkStatus.invalidate();
      invalidatePortalContext();
    },
  });
  // Once per visit. `session` changes identity on every refetch (window focus),
  // and each re-fire past the first only hits the server's 10s throttle.
  const autoLinkFired = useRef(false);
  useEffect(() => {
    if (status !== "authenticated" || autoLinkFired.current) return;
    autoLinkFired.current = true;
    attemptAutoLink();
  }, [status, attemptAutoLink]);
  useEffect(() => {
    if (status === "unauthenticated") router.push(loginHref());
  }, [status, router]);
  useEffect(() => {
    if (isAdmin) router.replace("/admin");
  }, [isAdmin, router]);

  if (status === "loading")
    return <LoadingScreen message="Loading dashboard…" />;
  if (!session) return null;

  const roleLabel = isAdmin
    ? "Admin"
    : memberStatus?.isMember
      ? "Member"
      : "Guest";

  const today = now.toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  const daysLeft = memberStatus?.daysRemaining;
  const endsSoon = typeof daysLeft === "number" && daysLeft <= 30;
  const expiresOn = memberStatus?.expiresAt
    ? new Date(memberStatus.expiresAt).toLocaleDateString(undefined, {
        month: "long",
        day: "numeric",
        year: "numeric",
      })
    : null;

  // The headline is the one thing that matters on this half right now, worked
  // out from what the page already loaded.
  const latestReg = activeRegs[0];
  let headline: string;
  let dek: string;
  if (view === "hackathon") {
    if (loadingRegs) {
      headline = "Your hackathons";
      dek = "Checking your registrations…";
    } else if (latestReg) {
      const name = latestReg.hackathon.name;
      const byStatus: Record<string, string> = {
        approved: `You're in for ${name}.`,
        checked_in: `You're checked in at ${name}.`,
        pending: `Your application to ${name} is under review.`,
        waitlisted: `You're on the waitlist for ${name}.`,
        rejected: `Your application to ${name} wasn't accepted.`,
      };
      headline =
        byStatus[latestReg.registrationStatus] ??
        `You're registered for ${name}.`;
      dek = latestReg.team
        ? `You're on team ${latestReg.team.name}.`
        : "You don't have a team yet.";
    } else {
      headline = "Pick a hackathon to register for.";
      dek =
        "Hackathons are open to anyone with an account. No membership needed.";
    }
  } else if (memberStatus?.isMember) {
    if (endsSoon) {
      headline = `Your membership ends in ${daysLeft} ${daysLeft === 1 ? "day" : "days"}.`;
      dek =
        "Renew now and the new term starts when this one ends, so you lose nothing by paying early.";
    } else {
      headline = expiresOn
        ? `You're a member through ${expiresOn}.`
        : "Your membership is active.";
      dek = "Club events, check-ins and member resources are open to you.";
    }
  } else if (memberStatus?.hasLapsed) {
    headline = "Your membership has run out.";
    dek = "Renew below to get back into the Club Portal.";
  } else {
    headline = "Become a member to open the Club Portal.";
    dek = `${formatCents(MEMBERSHIP_CENTS)} a year or ${formatCents(SEMESTER_MEMBERSHIP_CENTS)} a semester. Projects stay open to browse either way.`;
  }

  return (
    <div className={page}>
      {/* ── MASTHEAD ───────────────────────────────────── */}
      <div className={`flex items-center justify-between gap-4 ${mastRule}`}>
        <div className="flex min-w-0 items-center gap-3">
          <Image
            unoptimized
            src={userData?.image || "/avatars/default.svg"}
            alt="Avatar"
            width={28}
            height={28}
            className="h-7 w-7 flex-shrink-0 rounded-full object-cover"
          />
          <p className="min-w-0 truncate text-[13px] text-[var(--text-subtle)]">
            <span className="font-semibold text-[var(--text-primary)]">
              {userData?.name ?? "Your account"}
            </span>
            {userData?.email ? ` · ${userData.email}` : ""} · {roleLabel}
          </p>
        </div>
        <p className="hidden flex-shrink-0 whitespace-nowrap text-[13px] text-[var(--text-subtle)] sm:block">
          {today}
        </p>
      </div>

      {/* ── HEADLINE ───────────────────────────────────── */}
      <div className="mt-10 md:mt-12">
        <h1 className={pageTitle}>{headline}</h1>
        <p className={pageDek}>{dek}</p>
        {view === "hackathon" && !loadingRegs && latestReg && (
          <div className="mt-6">
            <Link
              href={`/hackathons/${hackathonSlug(latestReg.hackathon.name)}?tab=SCHEDULE`}
              className={btnPrimary}
            >
              Open {latestReg.hackathon.name}
            </Link>
          </div>
        )}
      </div>

      {/* ── CLUB / HACKATHON ───────────────────────────── */}
      {/* Two different things this org does, and they have different rules:
          the hackathon is open to anyone with an account, the club is the
          paid yearly membership. Splitting them is what stops the dashboard
          reading as though everything is behind the same paywall. */}
      <div role="tablist" aria-label="Portal view" className={`mt-12 ${tabList}`}>
        {(
          [
            { value: "hackathon", label: "Hackathon" },
            { value: "club", label: "Club" },
          ] as const
        ).map((option) => (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={view === option.value}
            onClick={() => setView(option.value)}
            className={tab(view === option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>

      {/* ── MEMBERSHIP ─────────────────────────────────── */}
      {/* Club view only, and it now also catches lapsed members: `isMember`
          means paid AND unexpired, so the renew path is reachable instead of
          being hidden behind the same flag that expired. */}
      {view === "club" && memberStatus?.isMember && (
        <section className="mt-8">
          <p className={statusLine("success")}>Membership active</p>
          <p className={`mt-1 ${body}`}>
            {expiresOn ? `Runs until ${expiresOn}` : "Active"}
            {endsSoon ? ` · ${daysLeft} days left` : ""}
          </p>
          {/* Renewing early extends from the current end date rather than
              from today, so nobody loses time by paying ahead. */}
          {endsSoon && (
            <div className="mt-6 max-w-md">
              <LinkStripeAccount />
            </div>
          )}
        </section>
      )}

      {/* ── DESTINATIONS ───────────────────────────────── */}
      <ul className="mt-8 grid grid-cols-1 gap-x-10 gap-y-6 sm:grid-cols-2 lg:grid-cols-3">
        {/* Hackathons — open to everyone, no membership needed */}
        {view === "hackathon" && (
          <Destination href="/hackathons" title="Hackathon hub">
            Browse and register for upcoming hackathons. Open to everyone, no
            membership needed.
          </Destination>
        )}

        {/* Club Portal — members only */}
        {view === "club" &&
          (memberStatus?.isMember ? (
            <Destination href="/club" title="Club Portal">
              Club events, check-ins, and resources.
            </Destination>
          ) : (
            <li className="border-t border-[var(--border-subtle)] pt-4 opacity-60">
              <p className={itemTitle}>Club Portal</p>
              <p className={`mt-1 ${body}`}>
                {memberStatus?.hasLapsed
                  ? "Your membership has run out. Renew below to get back in."
                  : "Membership required. Join below to unlock access."}
              </p>
            </li>
          ))}

        {/* Projects — club side, but browsing is open so anyone can see
            what membership actually buys before paying for it. */}
        {view === "club" && (
          <Destination href="/initiatives" title="Projects">
            Projects the club runs year-round. Join one, or pitch your own.
          </Destination>
        )}

        {/* Become a Member — sits beside Projects so the club view says
            what is missing where the rest of the club lives. The pay UI is
            the block below; this jumps to it. */}
        {view === "club" && !memberStatus?.isMember && !isAdmin && (
          <Destination
            href="#membership"
            title={
              memberStatus?.hasLapsed ? "Renew membership" : "Become a member"
            }
            plain
          >
            {formatCents(MEMBERSHIP_CENTS)}/year or{" "}
            {formatCents(SEMESTER_MEMBERSHIP_CENTS)}/semester. Opens the Club
            Portal and member resources.
          </Destination>
        )}

        {/* Judge Portal — judges only */}
        {isJudge && (
          <Destination href="/judge" title="Judge Portal">
            Score projects and manage your judging queue.
          </Destination>
        )}

        {/* Admin Panel — admins, and bug testers read-only */}
        {(isAdmin || !!portalContext?.isBugTester) && (
          <Destination href="/admin" title="Admin Panel">
            Manage events, attendees, and analytics.
          </Destination>
        )}
      </ul>

      {/* The pay UI itself, below the destinations. The entry above is the
          label; this is the block. */}
      {view === "club" && !memberStatus?.isMember && !isAdmin && (
        <section id="membership" className={`mt-12 scroll-mt-8 ${sectionRule}`}>
          <h2 className={sectionTitle}>
            {memberStatus?.hasLapsed ? "Renew your membership" : "Become a member"}
          </h2>
          <div className="mt-5 max-w-md">
            <LinkStripeAccount />
          </div>
        </section>
      )}

      {/* ── MY HACKATHONS ───────────────────────────────── */}
      <section
        className={`mt-12 ${sectionRule} ${view === "hackathon" ? "" : "hidden"}`}
      >
        <div className="flex items-baseline justify-between gap-4">
          <h2 className={sectionTitle}>My hackathons</h2>
          <Link href="/hackathons" className={textLink}>
            Browse all
          </Link>
        </div>

        {loadingRegs ? (
          <ul aria-hidden="true" className="mt-4">
            {[1, 2].map((i) => (
              <li
                key={i}
                className="border-b border-[var(--border-subtle)] py-5 space-y-2"
              >
                <div className="h-5 w-1/2 rounded-[var(--radius-sm)] bg-[var(--bg-secondary)] animate-pulse" />
                <div className="h-3.5 w-1/3 rounded-[var(--radius-sm)] bg-[var(--bg-secondary)] animate-pulse" />
              </li>
            ))}
          </ul>
        ) : activeRegs.length > 0 ? (
          <ul className="mt-4">
            {activeRegs.map((reg) => (
              <li key={reg.id} className="border-b border-[var(--border-subtle)]">
                <Link
                  href={`/hackathons/${hackathonSlug(reg.hackathon.name)}?tab=SCHEDULE`}
                  className="group flex flex-col gap-2 py-5 sm:flex-row sm:items-center sm:justify-between sm:gap-6"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <h3
                        className={`${itemTitle} group-hover:underline decoration-accent decoration-2 underline-offset-4`}
                      >
                        {reg.hackathon.name}
                      </h3>
                      <StatusBadge status={reg.registrationStatus} />
                    </div>
                    <p className={`mt-1 ${meta}`}>
                      {reg.hackathon.theme
                        ? `Theme: ${reg.hackathon.theme} · `
                        : ""}
                      {reg.team ? `Team: ${reg.team.name}` : "No team yet"}
                    </p>
                  </div>
                  <span className="flex flex-shrink-0 items-center gap-1 text-sm font-semibold text-[var(--text-primary)]">
                    View
                    <ArrowRight
                      className="h-4 w-4 text-[var(--text-subtle)] group-hover:text-[var(--text-primary)] transition-colors"
                      strokeWidth={1.75}
                      aria-hidden="true"
                    />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <div className="mt-4">
            <p className={body}>
              Hackathons you register for will show up here.
            </p>
            <Link href="/hackathons" className={`mt-3 ${textLink}`}>
              Browse hackathons
            </Link>
          </div>
        )}

        {/* Past events */}
        {!loadingRegs && pastRegs.length > 0 && (
          <div className="mt-10">
            <h3 className={label}>Past events</h3>
            <ul className="mt-2">
              {pastRegs.map((reg) => (
                <li
                  key={reg.id}
                  className="border-b border-[var(--border-subtle)] opacity-60 hover:opacity-100 transition-opacity"
                >
                  <Link
                    href={`/hackathons/${hackathonSlug(reg.hackathon.name)}?tab=INFO`}
                    className="group flex items-center justify-between gap-4 py-4"
                  >
                    <span className="min-w-0 truncate text-[15px] font-semibold text-[var(--text-primary)] group-hover:underline decoration-accent decoration-2 underline-offset-4">
                      {reg.hackathon.name}
                    </span>
                    <span className="flex flex-shrink-0 items-center gap-4">
                      <StatusBadge status={reg.registrationStatus} />
                      <span className={meta}>Details</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {/* ── SIGN OUT ───────────────────────────────────── */}
      <div className={`mt-16 flex flex-wrap items-center justify-between gap-4 ${sectionRule}`}>
        <p className={meta}>
          Signed in{userData?.email ? ` as ${userData.email}` : ""}.
        </p>
        <button
          type="button"
          onClick={() => signOut({ callbackUrl: "/login" })}
          className={btnSecondary}
        >
          Sign out
        </button>
      </div>
    </div>
  );
}

/**
 * One place the dashboard can send you: a serif title with an arrow and a
 * line saying what is there. `plain` renders an in-page anchor rather than a
 * route link.
 */
function Destination({
  href,
  title,
  plain = false,
  children,
}: {
  href: string;
  title: string;
  plain?: boolean;
  children: ReactNode;
}) {
  const content = (
    <>
      <span className={`flex items-center gap-2 ${itemTitle}`}>
        <span className="group-hover:underline decoration-accent decoration-2 underline-offset-4">
          {title}
        </span>
        <ArrowRight
          className="h-4 w-4 flex-shrink-0 text-[var(--text-subtle)] group-hover:text-[var(--text-primary)] transition-colors"
          strokeWidth={1.75}
          aria-hidden="true"
        />
      </span>
      <span className={`mt-1 block ${body}`}>{children}</span>
    </>
  );
  return (
    <li className="border-t border-[var(--border-subtle)] pt-4">
      {plain ? (
        <a href={href} className="group block">
          {content}
        </a>
      ) : (
        <Link href={href} className="group block">
          {content}
        </Link>
      )}
    </li>
  );
}
