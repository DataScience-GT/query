"use client";

import React, { useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import { trpc } from "@/lib/trpc";
import Image from "next/image";
import { AlertCircle, Copy, Share } from "lucide-react";
import {
  body,
  btnDanger,
  btnPrimary,
  btnSecondary,
  chip,
  fieldLabel,
  input,
  itemTitle,
  label,
  meta,
  object,
  sectionRule,
  sectionTitle,
  status,
} from "@/components/portal/ui";

type TeamMember = {
  userId: string;
  user: { name?: string | null; image?: string | null };
};

// First and last initial: a lone letter reads as a word once the avatars overlap.
const initials = (name?: string | null) => {
  const words = (name ?? "").trim().split(/\s+/).filter(Boolean);
  return (
    (words[0]?.[0] ?? "?") +
    (words.length > 1 ? words[words.length - 1][0] : "")
  ).toUpperCase();
};

export function TeamsTab({
  hackathonId,
  isRegistered,
  registrationStatus,
  myTeamId,
}: {
  hackathonId: string;
  isRegistered: boolean;
  registrationStatus: string | null;
  myTeamId: string | null;
}) {
  const {
    data: teams,
    isLoading,
    isError,
    error: listError,
    refetch,
  } = trpc.team.list.useQuery({ hackathonId });
  const { data: teamWindow } = trpc.team.window.useQuery(
    { hackathonId },
    { enabled: isRegistered },
  );
  const [showCreate, setShowCreate] = useState(false);
  const [teamName, setTeamName] = useState("");
  const [teamDesc, setTeamDesc] = useState("");
  const [maxMembers, setMaxMembers] = useState(4);
  const [error, setError] = useState("");
  const [confirmDisband, setConfirmDisband] = useState(false);
  const [confirmJoinId, setConfirmJoinId] = useState<string | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);
  const [search, setSearch] = useState("");
  const [hideFull, setHideFull] = useState(false);

  const { data: session } = useSession();
  // An invite link (?join=<teamId>) lands on that team's card.
  const joinTarget = useSearchParams().get("join");
  const scrolledTo = useRef<string | null>(null);

  useEffect(() => {
    if (!joinTarget || !teams || scrolledTo.current === joinTarget) return;
    const card = document.getElementById(`team-${joinTarget}`);
    if (!card) return;
    scrolledTo.current = joinTarget;
    card.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [joinTarget, teams]);

  const utils = trpc.useUtils();

  const createTeam = trpc.team.createTeam.useMutation({
    onSuccess: () => {
      setShowCreate(false);
      setTeamName("");
      setTeamDesc("");
      setError("");
      utils.team.list.invalidate({ hackathonId });
      utils.hackathon.myRegistrations.invalidate();
      // /submit prefills its form from this once per visit, so a team change
      // has to drop the old copy rather than just mark it stale.
      utils.team.mySubmission.reset();
    },
    onError: (e) => setError(e.message),
  });

  const joinTeam = trpc.team.joinTeam.useMutation({
    onSuccess: () => {
      setConfirmJoinId(null);
      utils.team.list.invalidate({ hackathonId });
      utils.hackathon.myRegistrations.invalidate();
      utils.team.mySubmission.reset();
    },
    onError: (e) => {
      setConfirmJoinId(null);
      setError(e.message);
    },
  });

  const leaveTeam = trpc.team.leaveTeam.useMutation({
    onSuccess: () => {
      utils.team.list.invalidate({ hackathonId });
      utils.hackathon.myRegistrations.invalidate();
      utils.team.mySubmission.reset();
    },
    onError: (e) => setError(e.message),
  });

  // A captain with other members cannot leave; the server points them here.
  const disbandTeam = trpc.team.disbandTeam.useMutation({
    onSuccess: () => {
      setConfirmDisband(false);
      utils.team.list.invalidate({ hackathonId });
      utils.hackathon.myRegistrations.invalidate();
      utils.team.mySubmission.reset();
    },
    onError: (e) => {
      setConfirmDisband(false);
      setError(e.message);
    },
  });

  const setOpen = trpc.team.setOpen.useMutation({
    onSuccess: () => utils.team.list.invalidate({ hackathonId }),
    onError: (e) => setError(e.message),
  });

  if (isLoading) return <p className={`py-16 ${body}`}>Loading teams…</p>;

  if (isError)
    return (
      <div className="flex flex-col items-start gap-4">
        <p className="text-[15px] text-[var(--danger)]">
          Couldn&apos;t load teams. {listError.message}
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

  // The server only lets accepted people create or join (pending and
  // waitlisted are refused), so the controls follow the same rule.
  const isAdmitted =
    registrationStatus === "approved" || registrationStatus === "checked_in";

  const myTeam = teams?.find((t) => t.id === myTeamId);
  const otherTeams = teams?.filter((t) => t.id !== myTeamId) ?? [];
  const isCaptain = !!myTeam && myTeam.captainId === session?.user?.id;
  // Where the browser has a share sheet (most phones) the invite goes there;
  // elsewhere it goes to the clipboard.
  const canShare =
    typeof navigator !== "undefined" && typeof navigator.share === "function";

  // Someone already on a team cannot join any of these, so the filter is
  // offered only when it can change what they see.
  const showHideFull =
    !myTeamId && otherTeams.some((t) => t.currentMembers >= t.maxMembers);

  // Matches the team name or any member's name; both are already in the list.
  const needle = search.trim().toLowerCase();
  const visibleTeams = otherTeams.filter((t) => {
    if (hideFull && showHideFull && t.currentMembers >= t.maxMembers)
      return false;
    if (!needle) return true;
    return (
      t.name.toLowerCase().includes(needle) ||
      (t.participants || []).some((p: TeamMember) =>
        (p.user.name ?? "").toLowerCase().includes(needle),
      )
    );
  });

  // Until the teamWindow loads, assume closed so nothing is offered that would fail.
  const canCreate = teamWindow?.canCreate ?? false;
  const windowAllowsJoin = teamWindow?.canJoin ?? false;
  const canLeave = teamWindow?.canLeave ?? false;

  const fmt = (d: Date | string) =>
    new Date(d).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });

  const windowNotice = !teamWindow
    ? null
    : !teamWindow.isOpen
      ? `Team creation closed ${fmt(teamWindow.closesAt)}.`
      : !teamWindow.canLeave
        ? `Teams are locked. Leaving closed ${fmt(teamWindow.leaveLocksAt)}, 12 hours before the project deadline.`
        : null;

  return (
    <div className="space-y-8">
      {!isAdmitted && (
        <p className={body}>
          {isRegistered
            ? "You can form or join a team once you're accepted."
            : "Register for this hackathon to form a team."}
        </p>
      )}

      {isRegistered && windowNotice && (
        <p className="border-l-2 border-[var(--warning)] pl-3 text-[15px] text-[var(--warning)]">
          {windowNotice}
        </p>
      )}

      {error && (
        <div className="flex items-start gap-2.5 border-l-2 border-[var(--danger)] py-1 pl-3">
          <AlertCircle
            size={16}
            strokeWidth={1.75}
            aria-hidden="true"
            className="mt-0.5 shrink-0 text-[var(--danger)]"
          />
          <p className="text-[15px] text-[var(--danger)]">{error}</p>
        </div>
      )}

      {myTeam && (
        <section className={`${object} p-5`}>
          <p className={label}>Your team</p>
          <h2 className={`mt-1 ${sectionTitle}`}>{myTeam.name}</h2>
          {myTeam.description && (
            <p className={`mt-2 max-w-2xl ${body}`}>{myTeam.description}</p>
          )}

          <ul className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {(myTeam.participants || []).map(
              (p: {
                userId: string;
                user: { name?: string | null; image?: string | null };
              }) => (
                <li key={p.userId} className="flex items-center gap-2.5">
                  {p.user.image ? (
                    <Image
                      src={p.user.image}
                      alt=""
                      width={28}
                      height={28}
                      className="rounded-full"
                    />
                  ) : (
                    <div className="w-7 h-7 rounded-full bg-[var(--border-subtle)] flex items-center justify-center text-[12px] font-semibold text-[var(--text-secondary)]">
                      {initials(p.user.name)}
                    </div>
                  )}
                  <span className="text-[15px] text-[var(--text-primary)]">
                    {p.user.name ?? "Unknown"}
                  </span>
                  {p.userId === myTeam.captainId && (
                    <span className={meta}>Captain</span>
                  )}
                </li>
              ),
            )}
          </ul>

          <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-3">
            {isCaptain &&
              windowAllowsJoin &&
              myTeam.isOpen &&
              myTeam.currentMembers < myTeam.maxMembers && (
                <button
                  type="button"
                  onClick={() => {
                    const url = `${window.location.origin}/hackathons/${hackathonId}?tab=TEAMS&join=${myTeam.id}`;
                    setError("");
                    const fail = () =>
                      setError(
                        `Couldn't ${canShare ? "share" : "copy"}. The link is ${url}`,
                      );
                    if (canShare) {
                      // A dismissed share sheet rejects too; that is not a failure.
                      void navigator
                        .share({ title: myTeam.name, url })
                        .catch((e: unknown) => {
                          if (!(e instanceof Error && e.name === "AbortError"))
                            fail();
                        });
                      return;
                    }
                    if (!navigator.clipboard) return fail();
                    void navigator.clipboard.writeText(url).then(() => {
                      setLinkCopied(true);
                      setTimeout(() => setLinkCopied(false), 2000);
                    }, fail);
                  }}
                  className={btnPrimary}
                >
                  {canShare ? (
                    <Share size={16} strokeWidth={1.75} aria-hidden="true" />
                  ) : (
                    <Copy size={16} strokeWidth={1.75} aria-hidden="true" />
                  )}
                  {canShare
                    ? "Share invite link"
                    : linkCopied
                      ? "Copied"
                      : "Copy invite link"}
                </button>
              )}
            <span className={`${meta} tabular-nums`}>
              {myTeam.currentMembers} of {myTeam.maxMembers} members
            </span>
          </div>

          <div className="mt-6 flex flex-col items-start gap-3 border-t border-[var(--border-subtle)] pt-4">
            {isCaptain && (
              <label
                htmlFor="team-closed"
                className="flex min-h-11 cursor-pointer items-start gap-3 py-2.5 text-[15px] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
              >
                <input
                  id="team-closed"
                  type="checkbox"
                  checked={!myTeam.isOpen}
                  disabled={setOpen.isPending || !teamWindow?.isOpen}
                  onChange={(e) => {
                    setError("");
                    setOpen.mutate({
                      hackathonId,
                      teamId: myTeam.id,
                      isOpen: !e.target.checked,
                    });
                  }}
                  className="mt-0.5 h-5 w-5 min-h-0! min-w-0! shrink-0 cursor-pointer accent-[var(--accent)]"
                />
                <span>
                  Closed to new members
                  <span className={`block ${meta}`}>
                    Nobody can join, even with your invite link.
                  </span>
                </span>
              </label>
            )}
            {isCaptain && myTeam.currentMembers > 1 ? (
              !confirmDisband && (
                <button
                  type="button"
                  onClick={() => {
                    setError("");
                    setConfirmDisband(true);
                  }}
                  disabled={!canLeave}
                  title={canLeave ? undefined : (windowNotice ?? undefined)}
                  className={btnDanger}
                >
                  {canLeave ? "Disband team" : "Roster locked"}
                </button>
              )
            ) : (
              <button
                type="button"
                onClick={() => {
                  setError("");
                  leaveTeam.mutate({ hackathonId });
                }}
                disabled={leaveTeam.isPending || !canLeave}
                title={canLeave ? undefined : (windowNotice ?? undefined)}
                className={btnDanger}
              >
                {leaveTeam.isPending
                  ? "Leaving…"
                  : canLeave
                    ? "Leave team"
                    : "Roster locked"}
              </button>
            )}
          </div>

          {isCaptain && confirmDisband && (
            <div className="mt-4 flex w-full flex-col gap-3 border-t border-[var(--border-subtle)] pt-4">
              <p className={body}>
                Disband {myTeam.name}? Every member is removed and the team is
                deleted. This cannot be undone.
              </p>
              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setError("");
                    disbandTeam.mutate({ hackathonId, teamId: myTeam.id });
                  }}
                  disabled={disbandTeam.isPending}
                  className={btnDanger}
                >
                  {disbandTeam.isPending ? "Disbanding…" : "Disband"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setConfirmDisband(false);
                    setError("");
                  }}
                  disabled={disbandTeam.isPending}
                  className={btnSecondary}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </section>
      )}

      {isAdmitted && !myTeamId && (
        <section>
          {!canCreate ? (
            <div className="flex flex-col gap-1">
              <p className={body}>Team creation is closed.</p>
              {windowNotice && <p className={meta}>{windowNotice}</p>}
            </div>
          ) : !showCreate ? (
            <button
              type="button"
              onClick={() => setShowCreate(true)}
              className={btnPrimary}
            >
              Create a team
            </button>
          ) : (
            <div className="max-w-xl space-y-5">
              <h3 className={itemTitle}>New team</h3>

              <div>
                <label htmlFor="team-name" className={fieldLabel}>
                  Team name
                </label>
                <input
                  id="team-name"
                  type="text"
                  value={teamName}
                  onChange={(e) => setTeamName(e.target.value)}
                  maxLength={100}
                  className={input}
                />
              </div>

              <div>
                <label htmlFor="team-description" className={fieldLabel}>
                  Description
                </label>
                <textarea
                  id="team-description"
                  value={teamDesc}
                  onChange={(e) => setTeamDesc(e.target.value)}
                  placeholder="What are you building, and who do you need?"
                  maxLength={1000}
                  rows={4}
                  className={`${input} resize-none`}
                />
              </div>

              <div>
                <span id="team-capacity-label" className={fieldLabel}>
                  Capacity
                </span>
                <div
                  role="group"
                  aria-labelledby="team-capacity-label"
                  className="flex gap-2"
                >
                  {[2, 3, 4].map((n) => (
                    <button
                      type="button"
                      key={n}
                      aria-pressed={maxMembers === n}
                      aria-label={`${n} members`}
                      onClick={() => setMaxMembers(n)}
                      className={`w-11 h-11 rounded-[var(--radius-sm)] border text-[15px] tabular-nums transition-colors ${
                        maxMembers === n
                          ? "border-accent bg-[var(--accent-dim)] text-[var(--text-primary)] font-semibold"
                          : "border-[var(--border-medium)] text-[var(--text-muted)] hover:border-[var(--border-hover)] hover:text-[var(--text-primary)]"
                      }`}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setError("");
                    createTeam.mutate({
                      hackathonId,
                      name: teamName,
                      description: teamDesc || undefined,
                      maxMembers,
                    });
                  }}
                  disabled={!teamName.trim() || createTeam.isPending}
                  className={`${btnPrimary} w-full sm:w-auto`}
                >
                  {createTeam.isPending ? "Creating…" : "Create team"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowCreate(false);
                    setError("");
                  }}
                  className="py-2.5 text-sm font-semibold text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </section>
      )}

      <section className={sectionRule}>
        <div className="flex items-baseline justify-between gap-4 mb-4">
          <h3 className={sectionTitle}>
            {myTeam ? "Other teams" : "All teams"}
          </h3>
          <span className="text-[13px] tabular-nums text-[var(--text-muted)]">
            {visibleTeams.length === otherTeams.length
              ? `${otherTeams.length} ${otherTeams.length === 1 ? "team" : "teams"}`
              : `${visibleTeams.length} of ${otherTeams.length} teams`}
          </span>
        </div>

        {otherTeams.length === 0 && !myTeam && (
          <p className={body}>
            No teams yet. Create one above, or wait for others to form.
          </p>
        )}

        {otherTeams.length > 0 && (
          <div className="mb-5 flex items-center gap-3">
            <input
              type="search"
              aria-label="Search teams"
              placeholder="Search teams or people"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className={`${input} min-w-0 flex-1 sm:max-w-sm`}
            />
            {showHideFull && (
              <button
                type="button"
                aria-pressed={hideFull}
                onClick={() => setHideFull((v) => !v)}
                className={`${chip(hideFull)} shrink-0`}
              >
                Hide full
              </button>
            )}
          </div>
        )}

        {otherTeams.length > 0 && visibleTeams.length === 0 && (
          <p className={body}>No teams match.</p>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {visibleTeams.map((team) => {
            const isFull = team.currentMembers >= team.maxMembers;
            const canJoin =
              isAdmitted &&
              !myTeamId &&
              team.isOpen &&
              !isFull &&
              windowAllowsJoin;
            const memberNames = (team.participants || [])
              .map((p: TeamMember) => p.user.name ?? "Unknown")
              .join(", ");

            return (
              <article
                key={team.id}
                id={`team-${team.id}`}
                className={`${object} p-5 flex flex-col gap-4 ${
                  team.id === joinTarget ? "ring-2 ring-accent" : ""
                }`}
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <h4 className={`${itemTitle} min-w-0 break-words`}>
                      {team.name}
                    </h4>
                    {!team.isOpen && (
                      <span className={status("neutral")}>Closed</span>
                    )}
                    {isFull && <span className={status("neutral")}>Full</span>}
                  </div>
                  {team.description && (
                    <p className={`mt-1.5 line-clamp-4 ${body}`}>
                      {team.description}
                    </p>
                  )}
                  {memberNames && (
                    <p className={`mt-1.5 line-clamp-2 ${meta}`}>
                      {memberNames}
                    </p>
                  )}
                </div>

                <div className="mt-auto flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="flex -space-x-1">
                      {(team.participants || []).slice(0, 5).map(
                        (p: {
                          userId: string;
                          user: {
                            name?: string | null;
                            image?: string | null;
                          };
                        }) =>
                          p.user.image ? (
                            <Image
                              key={p.userId}
                              src={p.user.image}
                              alt=""
                              width={28}
                              height={28}
                              className="rounded-full border-2 border-[var(--bg-card)] relative z-10"
                            />
                          ) : (
                            <div
                              key={p.userId}
                              className="w-7 h-7 rounded-full bg-[var(--border-subtle)] border-2 border-[var(--bg-card)] flex items-center justify-center text-[12px] font-semibold text-[var(--text-secondary)] relative z-10"
                            >
                              {initials(p.user.name)}
                            </div>
                          ),
                      )}
                      {team.currentMembers > 5 && (
                        <div className="w-7 h-7 rounded-full bg-[var(--border-subtle)] border-2 border-[var(--bg-card)] flex items-center justify-center text-[12px] font-semibold text-[var(--text-secondary)] relative z-10">
                          +{team.currentMembers - 5}
                        </div>
                      )}
                    </div>
                    <span className={`${meta} tabular-nums`}>
                      {team.currentMembers} of {team.maxMembers}
                    </span>
                  </div>

                  {canJoin && confirmJoinId !== team.id && (
                    <button
                      type="button"
                      onClick={() => {
                        setError("");
                        setConfirmJoinId(team.id);
                      }}
                      className={`${btnSecondary} shrink-0`}
                    >
                      Join team
                    </button>
                  )}
                </div>

                {canJoin && confirmJoinId === team.id && (
                  <div className="flex flex-col gap-3 border-t border-[var(--border-subtle)] pt-4">
                    <p className={body}>
                      Join {team.name}?
                      {teamWindow &&
                        (teamWindow.canLeave
                          ? ` You can leave until ${fmt(teamWindow.leaveLocksAt)}.`
                          : " Rosters are locked, so you will not be able to leave.")}
                    </p>
                    <div className="flex flex-wrap gap-3">
                      <button
                        type="button"
                        onClick={() => {
                          setError("");
                          joinTeam.mutate({ hackathonId, teamId: team.id });
                        }}
                        disabled={joinTeam.isPending}
                        className={btnPrimary}
                      >
                        {joinTeam.isPending ? "Joining…" : "Join"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmJoinId(null)}
                        disabled={joinTeam.isPending}
                        className={btnSecondary}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}
