"use client";

import { useSession, signOut } from "next-auth/react";
import { trpc } from "@/lib/trpc";
import { usePortalContext } from "@/lib/use-portal-context";
import { hackathonSlug } from "@/lib/hackathon-slug";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import LinkStripeAccount from "@/components/portal/LinkStripeAccount";
import {
  MEMBERSHIP_CENTS,
  SEMESTER_MEMBERSHIP_CENTS,
  formatCents,
} from "@query/api/pricing";
import { LiquidGlass } from "@/components/portal/LiquidGlass";
import { LoadingScreen } from "@/components/portal/LoadingScreen";
import {
  Zap,
  QrCode,
  Shield,
  Users,
  ArrowRight,
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  Gavel,
  Rocket,
} from "lucide-react";

function StatusBadge({ status }: { status: string }) {
  const map: Record<
    string,
    { label: string; color: string; icon: React.ReactNode }
  > = {
    approved: {
      label: "Approved",
      color: "text-emerald-500 bg-emerald-500/10 border-emerald-500/20",
      icon: <CheckCircle className="w-3 h-3" />,
    },
    checked_in: {
      label: "Checked In",
      color: "text-emerald-500 bg-emerald-500/10 border-emerald-500/20",
      icon: <CheckCircle className="w-3 h-3" />,
    },
    waitlisted: {
      label: "Waitlisted",
      color: "text-amber-500  bg-amber-500/10  border-amber-500/20",
      icon: <Clock className="w-3 h-3" />,
    },
    pending: {
      label: "Pending",
      color: "text-amber-500  bg-amber-500/10  border-amber-500/20",
      icon: <Clock className="w-3 h-3" />,
    },
    rejected: {
      label: "Rejected",
      color: "text-[var(--text-muted)] bg-[var(--bg-secondary)] border-[var(--border-medium)]",
      icon: <XCircle className="w-3 h-3" />,
    },
  };
  const cfg = map[status] ?? {
    label: status,
    color:
      "text-[var(--text-subtle)] bg-[var(--bg-secondary)] border-[var(--border-subtle)]",
    icon: <AlertCircle className="w-3 h-3" />,
  };
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-sm text-[11px] font-bold uppercase tracking-wider border ${cfg.color}`}
    >
      {cfg.icon} {cfg.label}
    </span>
  );
}

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

  const { mutate: attemptAutoLink } = trpc.stripe.attemptAutoLink.useMutation();
  useEffect(() => {
    if (session) attemptAutoLink();
  }, [session, attemptAutoLink]);
  useEffect(() => {
    if (status === "unauthenticated") router.push("/login");
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
  const roleDot = isAdmin
    ? "bg-[var(--accent)]"
    : memberStatus?.isMember
      ? "bg-emerald-500"
      : "bg-amber-500";

  return (
    <div className="min-h-screen bg-[var(--bg-tertiary)]">
      {/* Ambient glows */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
        <div className="absolute top-[-20%] left-[10%] w-[600px] h-[600px] bg-accent/5 blur-[200px] rounded-full" />
        <div className="absolute bottom-[-10%] right-[5%]  w-[500px] h-[500px] bg-indigo-600/5 blur-[180px] rounded-full" />
      </div>

      <div className="relative z-10 max-w-6xl mx-auto px-6 py-10 space-y-8">
        {/* ── HEADER ─────────────────────────────────────── */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-5 justify-between">
          {/* User identity */}
          <div className="flex items-center gap-4">
            <div className="relative">
              <Image
                src={userData?.image || "/avatars/default.svg"}
                alt="Avatar"
                width={56}
                height={56}
                className="rounded-full border-2 border-[var(--border-subtle)] object-cover h-14 w-14"
              />
              <span
                className={`absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full border-2 border-[var(--bg-tertiary)] ${roleDot}`}
              />
            </div>
            <div>
              <h1 className="text-3xl font-black text-[var(--text-primary)] tracking-wider font-oswald uppercase">
                Welcome back, {userData?.name?.split(" ")[0] ?? "there"}
              </h1>
              <p className="text-sm text-[var(--text-muted)] mt-0.5">
                {userData?.email ?? ""} ·{" "}
                <span className="font-semibold text-accent">{roleLabel}</span>
              </p>
            </div>
          </div>

          {/* Sign out */}
          <button
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="self-start sm:self-auto px-5 py-2.5 rounded-sm border border-[var(--border-medium)] bg-[var(--bg-secondary)] text-[var(--text-muted)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)] hover:border-[var(--border-hover)] transition-ui text-xs font-bold uppercase tracking-widest"
          >
            Sign Out
          </button>
        </div>

        {/* ── CLUB / HACKATHON ───────────────────────────── */}
        {/* Two different things this org does, and they have different rules:
            the hackathon is open to anyone with an account, the club is the
            paid yearly membership. Splitting them is what stops the dashboard
            reading as though everything is behind the same paywall. */}
        <div
          role="tablist"
          aria-label="Portal view"
          className="inline-flex rounded-sm border border-[var(--border-subtle)] bg-[var(--bg-secondary)] p-1"
        >
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
              className={`rounded-sm px-5 py-2 text-sm font-bold uppercase tracking-wider transition-colors ${
                view === option.value
                  ? "bg-accent/15 text-accent"
                  : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>

        {/* ── ROLE TILES ─────────────────────────────────── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* Hackathons — open to everyone, no membership needed */}
          {view === "hackathon" && (
          <Link href="/hackathons" className="group">
            <LiquidGlass printed holographic className="p-6 h-full flex flex-col gap-3 hover:border-accent/40 transition-ui">
              <div className="flex items-center justify-between">
                <div className="p-2.5 rounded-sm bg-accent/10 border border-accent/20 group-hover:bg-accent/20 transition-colors">
                  <Zap className="w-5 h-5 text-accent" />
                </div>
                <ArrowRight className="w-4 h-4 text-[var(--text-subtle)] group-hover:text-accent group-hover:translate-x-1 transition-ui" />
              </div>
              <div>
                <h3 className="text-base font-bold text-[var(--text-primary)]">
                  Hackathon Hub
                </h3>
                <p className="text-sm text-[var(--text-muted)] mt-1">
                  Browse and register for upcoming hackathons. Open to
                  everyone — no membership needed.
                </p>
              </div>
            </LiquidGlass>
          </Link>
          )}

          {/* Club Portal — members only */}
          {view === "club" &&
          (memberStatus?.isMember ? (
            <Link href="/club" className="group">
              <LiquidGlass printed holographic className="p-6 h-full flex flex-col gap-3 hover:border-emerald-500/40 transition-ui">
                <div className="flex items-center justify-between">
                  <div className="p-2.5 rounded-sm bg-emerald-500/10 border border-emerald-500/20 group-hover:bg-emerald-500/20 transition-colors">
                    <QrCode className="w-5 h-5 text-emerald-500" />
                  </div>
                  <ArrowRight className="w-4 h-4 text-[var(--text-subtle)] group-hover:text-emerald-500 group-hover:translate-x-1 transition-ui" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-[var(--text-primary)]">
                    Club Portal
                  </h3>
                  <p className="text-sm text-[var(--text-muted)] mt-1">
                    Access club events, check-ins, and resources.
                  </p>
                </div>
              </LiquidGlass>
            </Link>
          ) : (
            <div className="group">
              <LiquidGlass printed className="p-6 h-full flex flex-col gap-3 opacity-60 border-dashed">
                <div className="flex items-center justify-between">
                  <div className="p-2.5 rounded-sm bg-[var(--bg-secondary)] border border-[var(--border-subtle)]">
                    <QrCode className="w-5 h-5 text-[var(--text-subtle)]" />
                  </div>
                </div>
                <div>
                  <h3 className="text-base font-bold text-[var(--text-primary)]">
                    Club Portal
                  </h3>
                  <p className="text-sm text-[var(--text-muted)] mt-1">
                    {memberStatus?.hasLapsed
                      ? "Your membership has run out. Renew below to get back in."
                      : "Membership required. Join below to unlock access."}
                  </p>
                </div>
              </LiquidGlass>
            </div>
          ))}

          {/* Initiatives — club side, but browsing is open so anyone can see
              what membership actually buys before paying for it. */}
          {view === "club" && (
            <Link href="/initiatives" className="group">
              <LiquidGlass printed holographic className="p-6 h-full flex flex-col gap-3 hover:border-sky-500/40 transition-ui">
                <div className="flex items-center justify-between">
                  <div className="p-2.5 rounded-sm bg-sky-500/10 border border-sky-500/20 group-hover:bg-sky-500/20 transition-colors">
                    <Rocket className="w-5 h-5 text-sky-400" />
                  </div>
                  <ArrowRight className="w-4 h-4 text-[var(--text-subtle)] group-hover:text-sky-400 group-hover:translate-x-1 transition-ui" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-[var(--text-primary)]">
                    Initiatives
                  </h3>
                  <p className="text-sm text-[var(--text-muted)] mt-1">
                    Projects the club runs year-round. Join one, or pitch your
                    own.
                  </p>
                </div>
              </LiquidGlass>
            </Link>
          )}

          {/* Judge Portal — judges only */}
          {isJudge && (
            <Link href="/judge" className="group">
              <LiquidGlass printed holographic className="p-6 h-full flex flex-col gap-3 hover:border-purple-500/40 transition-ui">
                <div className="flex items-center justify-between">
                  <div className="p-2.5 rounded-sm bg-purple-500/10 border border-purple-500/20 group-hover:bg-purple-500/20 transition-colors">
                    <Gavel className="w-5 h-5 text-purple-400" />
                  </div>
                  <ArrowRight className="w-4 h-4 text-[var(--text-subtle)] group-hover:text-purple-400 group-hover:translate-x-1 transition-ui" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-[var(--text-primary)]">
                    Judge Portal
                  </h3>
                  <p className="text-sm text-[var(--text-muted)] mt-1">
                    Score projects and manage your judging queue.
                  </p>
                </div>
              </LiquidGlass>
            </Link>
          )}

          {/* Admin Panel — admins only */}
          {isAdmin && (
            <Link href="/admin" className="group">
              <LiquidGlass printed holographic className="p-6 h-full flex flex-col gap-3 hover:border-accent/40 transition-ui">
                <div className="flex items-center justify-between">
                  <div className="p-2.5 rounded-sm bg-accent/10 border border-accent/20 group-hover:bg-accent/20 transition-colors">
                    <Shield className="w-5 h-5 text-accent" />
                  </div>
                  <ArrowRight className="w-4 h-4 text-[var(--text-subtle)] group-hover:text-accent group-hover:translate-x-1 transition-ui" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-[var(--text-primary)]">
                    Admin Panel
                  </h3>
                  <p className="text-sm text-[var(--text-muted)] mt-1">
                    Manage events, attendees, and analytics.
                  </p>
                </div>
              </LiquidGlass>
            </Link>
          )}
        </div>

        {/* ── MEMBERSHIP ─────────────────────────────────── */}
        {/* Club view only, and it now also catches lapsed members: `isMember`
            means paid AND unexpired, so the renew path is reachable instead of
            being hidden behind the same flag that expired. */}
        {view === "club" && memberStatus?.isMember && (
          <LiquidGlass printed className="p-6">
            <div className="flex flex-col sm:flex-row sm:items-center gap-5 justify-between">
              <div>
                <h3 className="text-base font-bold text-[var(--text-primary)]">
                  Membership active
                </h3>
                <p className="text-sm text-[var(--text-muted)] mt-1">
                  {memberStatus.expiresAt
                    ? `Runs until ${new Date(memberStatus.expiresAt).toLocaleDateString()}`
                    : "Active"}
                  {typeof memberStatus.daysRemaining === "number" &&
                  memberStatus.daysRemaining <= 30
                    ? ` · ${memberStatus.daysRemaining} days left`
                    : ""}
                </p>
              </div>
              {/* Renewing early extends from the current end date rather than
                  from today, so nobody loses time by paying ahead. */}
              {typeof memberStatus.daysRemaining === "number" &&
                memberStatus.daysRemaining <= 30 && (
                  <div className="flex-shrink-0">
                    <LinkStripeAccount />
                  </div>
                )}
            </div>
          </LiquidGlass>
        )}

        {view === "club" && !memberStatus?.isMember && !isAdmin && (
          <LiquidGlass printed holographic className="p-6 border-amber-500/20 bg-gradient-to-r from-amber-500/5 to-yellow-500/5">
            <div className="flex flex-col sm:flex-row sm:items-center gap-5 justify-between">
              <div className="flex items-start gap-4">
                <div className="p-3 rounded-sm bg-amber-500/10 border border-amber-500/20 flex-shrink-0">
                  <Users className="w-5 h-5 text-amber-500" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-[var(--text-primary)]">
                    {memberStatus?.hasLapsed
                      ? "Renew your membership"
                      : "Become a Member"}
                  </h3>
                  <p className="text-sm text-[var(--text-muted)] mt-1">
                    Join DSGT as a full member for{" "}
                    <span className="text-[var(--text-primary)] font-semibold">
                      {formatCents(MEMBERSHIP_CENTS)}/year
                    </span>{" "}
                    or{" "}
                    <span className="text-[var(--text-primary)] font-semibold">
                      {formatCents(SEMESTER_MEMBERSHIP_CENTS)}/semester
                    </span>{" "}
                    to unlock the Club Portal, event check-ins, and member-only
                    resources.
                  </p>
                </div>
              </div>
              <div className="flex-shrink-0">
                <LinkStripeAccount />
              </div>
            </div>
          </LiquidGlass>
        )}

        {/* ── MY HACKATHONS ───────────────────────────────── */}
        <div className={`space-y-4 ${view === "hackathon" ? "" : "hidden"}`}>
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-[var(--text-primary)] tracking-wider font-oswald uppercase">
              My Hackathons
            </h2>
            <Link
              href="/hackathons"
              className="text-xs text-accent hover:underline font-semibold flex items-center gap-1"
            >
              Browse all <ArrowRight className="w-3 h-3" />
            </Link>
          </div>

          {loadingRegs ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {[1, 2].map((i) => (
                <div
                  key={i}
                  className="h-36 rounded-sm bg-[var(--bg-secondary)] animate-pulse border border-[var(--border-subtle)]"
                />
              ))}
            </div>
          ) : activeRegs.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {activeRegs.map((reg) => (
                <Link
                  key={reg.id}
                  href={`/hackathons/${hackathonSlug(reg.hackathon.name)}?tab=SCHEDULE`}
                  className="group block"
                >
                  <LiquidGlass printed holographic className="p-5 flex flex-col gap-3 hover:border-accent/40 transition-ui h-full">
                    <div className="flex items-start justify-between gap-3">
                      <h4 className="font-bold text-[var(--text-primary)] group-hover:text-accent transition-colors leading-tight text-sm">
                        {reg.hackathon.name}
                      </h4>
                      <StatusBadge status={reg.registrationStatus} />
                    </div>
                    {reg.hackathon.theme && (
                      <p className="text-[11px] text-accent/80 font-mono uppercase tracking-wider">
                        Theme: {reg.hackathon.theme}
                      </p>
                    )}
                    <div className="mt-auto flex items-center justify-between text-[11px] text-[var(--text-subtle)]">
                      <span>
                        {reg.team ? `Team: ${reg.team.name}` : "No team yet"}
                      </span>
                      <span className="flex items-center gap-1 font-semibold text-accent group-hover:gap-2 transition-ui">
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
                <Zap className="w-5 h-5 text-[var(--text-subtle)]" />
              </div>
              <p className="text-sm text-[var(--text-muted)]">
                You haven't registered for any hackathons yet.
              </p>
              <Link
                href="/hackathons"
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-sm bg-accent/10 border border-accent/25 text-accent text-xs font-bold uppercase tracking-widest hover:bg-accent/20 transition-colors"
              >
                Browse Hackathons <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </LiquidGlass>
          )}

          {/* Past events */}
          {!loadingRegs && pastRegs.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-sm font-bold text-[var(--text-subtle)] uppercase tracking-widest flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-[var(--text-subtle)]" />
                Past Events
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {pastRegs.map((reg) => (
                  <Link
                    key={reg.id}
                    href={`/hackathons/${hackathonSlug(reg.hackathon.name)}?tab=INFO`}
                    className="group block"
                  >
                    <LiquidGlass printed className="p-5 flex items-center justify-between gap-3 opacity-60 hover:opacity-100 transition-opacity">
                      <div>
                        <p className="text-[10px] text-[var(--text-subtle)] uppercase tracking-widest mb-1">
                          Past Event
                        </p>
                        <h4 className="text-sm font-bold text-[var(--text-primary)] group-hover:text-accent transition-colors">
                          {reg.hackathon.name}
                        </h4>
                      </div>
                      <div className="flex-shrink-0 flex flex-col items-end gap-2">
                        <StatusBadge status={reg.registrationStatus} />
                        <span className="text-[10px] text-[var(--text-subtle)] group-hover:text-accent transition-colors flex items-center gap-1">
                          Details <ArrowRight className="w-2.5 h-2.5" />
                        </span>
                      </div>
                    </LiquidGlass>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
