"use client";

import React, { useState } from "react";
import { trpc } from "@/lib/trpc";
import Image from "next/image";
import { AlertCircle } from "lucide-react";
import {
  body,
  btnDanger,
  btnPrimary,
  btnSecondary,
  fieldLabel,
  input,
  itemTitle,
  label,
  meta,
  object,
  sectionTitle,
  status,
} from "@/components/portal/ui";

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

  const utils = trpc.useUtils();

  const createTeam = trpc.team.createTeam.useMutation({
    onSuccess: () => {
      setShowCreate(false);
      setTeamName("");
      setTeamDesc("");
      setError("");
      utils.team.list.invalidate({ hackathonId });
      utils.hackathon.myRegistrations.invalidate();
    },
    onError: (e) => setError(e.message),
  });

  const joinTeam = trpc.team.joinTeam.useMutation({
    onSuccess: () => {
      utils.team.list.invalidate({ hackathonId });
      utils.hackathon.myRegistrations.invalidate();
    },
    onError: (e) => setError(e.message),
  });

  const leaveTeam = trpc.team.leaveTeam.useMutation({
    onSuccess: () => {
      utils.team.list.invalidate({ hackathonId });
      utils.hackathon.myRegistrations.invalidate();
    },
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
    <div className="space-y-10">
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
        <section className={`${object} p-6`}>
          <p className={label}>Your team</p>
          <h2 className={`mt-1 ${sectionTitle}`}>{myTeam.name}</h2>
          {myTeam.description && (
            <p className={`mt-2 max-w-2xl ${body}`}>{myTeam.description}</p>
          )}

          <ul className="mt-5 flex flex-wrap gap-x-6 gap-y-3">
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
                    <div className="w-7 h-7 rounded-full bg-[var(--bg-secondary)] flex items-center justify-center text-[12px] font-semibold text-[var(--text-muted)]">
                      {(p.user.name?.[0] ?? "?").toUpperCase()}
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

          <div className="mt-6 flex flex-wrap items-center justify-between gap-4 border-t border-[var(--border-subtle)] pt-4">
            <span className={meta}>
              {myTeam.currentMembers} of {myTeam.maxMembers} members
            </span>
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
          </div>
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

      <section className="border-t border-[var(--border-subtle)] pt-8">
        <div className="flex items-baseline justify-between gap-4 mb-5">
          <h3 className={sectionTitle}>Open teams</h3>
          <span className={meta}>{otherTeams.length}</span>
        </div>

        {otherTeams.length === 0 && !myTeam && (
          <p className={body}>
            No teams yet. Create one above, or wait for others to form.
          </p>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {otherTeams.map((team) => {
            const isFull = team.currentMembers >= team.maxMembers;
            const canJoin =
              isAdmitted &&
              !myTeamId &&
              team.isOpen &&
              !isFull &&
              windowAllowsJoin;

            return (
              <article
                key={team.id}
                className={`${object} p-5 flex flex-col gap-4`}
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <h4 className={`${itemTitle} truncate`}>{team.name}</h4>
                    {!team.isOpen && (
                      <span className={status("neutral")}>Closed</span>
                    )}
                    {isFull && <span className={status("warning")}>Full</span>}
                  </div>
                  {team.description && (
                    <p className={`mt-1.5 line-clamp-2 ${body}`}>
                      {team.description}
                    </p>
                  )}
                </div>

                <div className="mt-auto flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="flex -space-x-2">
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
                              className="w-7 h-7 rounded-full bg-[var(--bg-secondary)] border-2 border-[var(--bg-card)] flex items-center justify-center text-[12px] font-semibold text-[var(--text-muted)] relative z-10"
                            >
                              {(p.user.name?.[0] ?? "?").toUpperCase()}
                            </div>
                          ),
                      )}
                      {team.currentMembers > 5 && (
                        <div className="w-7 h-7 rounded-full bg-[var(--bg-secondary)] border-2 border-[var(--bg-card)] flex items-center justify-center text-[12px] font-semibold text-[var(--text-muted)] relative z-10">
                          +{team.currentMembers - 5}
                        </div>
                      )}
                    </div>
                    <span className={`${meta} tabular-nums`}>
                      {team.currentMembers} of {team.maxMembers}
                    </span>
                  </div>

                  {canJoin && (
                    <button
                      type="button"
                      onClick={() => {
                        setError("");
                        joinTeam.mutate({ hackathonId, teamId: team.id });
                      }}
                      disabled={joinTeam.isPending}
                      className={`${btnSecondary} shrink-0`}
                    >
                      {joinTeam.isPending ? "Joining…" : "Join team"}
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}
