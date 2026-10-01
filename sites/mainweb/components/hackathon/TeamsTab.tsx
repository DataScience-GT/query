"use client";

import React, { useState } from "react";
import { trpc } from "@/lib/trpc";
import Image from "next/image";
import { LiquidGlass } from "@/components/portal/LiquidGlass";
import { AlertCircle, AlertTriangle, Plus, Users } from "lucide-react";

export function TeamsTab({
  hackathonId,
  isRegistered,
  myTeamId,
}: {
  hackathonId: string;
  isRegistered: boolean;
  myTeamId: string | null;
}) {
  const { data: teams, isLoading } = trpc.team.list.useQuery({ hackathonId });
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

  if (isLoading)
    return (
      <div className="py-16 text-center text-sm text-[var(--text-muted)]">
        Loading teams…
      </div>
    );

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
    : !teamWindow.isOpen && new Date() < new Date(teamWindow.opensAt)
      ? `Team creation opens ${fmt(teamWindow.opensAt)}.`
      : !teamWindow.isOpen
        ? `Team creation closed ${fmt(teamWindow.closesAt)}.`
        : !teamWindow.canLeave
          ? `Teams are locked. Leaving closed ${fmt(teamWindow.leaveLocksAt)}, 12 hours before the project deadline.`
          : null;

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {!isRegistered && (
        <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-sm flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0" />
          <p className="text-amber-400 text-sm font-medium">
            Register for this hackathon first to create or join teams.
          </p>
        </div>
      )}

      {isRegistered && windowNotice && (
        <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-sm">
          <p className="text-amber-400 text-sm font-medium">{windowNotice}</p>
        </div>
      )}

      {error && (
        <div className="p-4 bg-rose-500/10 border border-rose-500/20 rounded-sm flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-rose-400 shrink-0" />
          <p className="text-rose-400 text-sm font-medium">{error}</p>
        </div>
      )}

      {myTeam && (
        <LiquidGlass printed className="p-6">
          <h3 className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-widest mb-3">
            Your team
          </h3>
          <h2 className="text-xl font-bold text-[var(--text-primary)] tracking-wider font-oswald uppercase mb-3">
            {myTeam.name}
          </h2>
          {myTeam.description && (
            <p className="text-[var(--text-muted)] text-sm mb-6 max-w-2xl leading-relaxed">
              {myTeam.description}
            </p>
          )}

          <div className="flex flex-wrap gap-3 mb-6">
            {(myTeam.participants || []).map(
              (p: {
                userId: string;
                user: { name?: string | null; image?: string | null };
              }) => (
                <div
                  key={p.userId}
                  className="flex items-center gap-3 px-4 py-2 bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-sm"
                >
                  {p.user.image ? (
                    <Image
                      src={p.user.image}
                      alt=""
                      width={24}
                      height={24}
                      className="rounded-sm"
                    />
                  ) : (
                    <div className="w-6 h-6 rounded-sm bg-[var(--bg-elevated)] flex items-center justify-center text-[10px] font-bold text-[var(--text-muted)]">
                      {(p.user.name?.[0] ?? "?").toUpperCase()}
                    </div>
                  )}
                  <span className="text-sm text-[var(--text-primary)] font-medium">
                    {p.user.name ?? "Unknown"}
                  </span>
                  {p.userId === myTeam.captainId && (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-sm text-[11px] font-bold uppercase tracking-wider border text-amber-400 bg-amber-400/10 border-amber-400/20">
                      Captain
                    </span>
                  )}
                </div>
              ),
            )}
          </div>

          <div className="flex items-center gap-5 pt-4 border-t border-[var(--border-subtle)]">
            <span className="text-sm text-[var(--text-muted)] flex items-center gap-2">
              <Users className="w-3.5 h-3.5 text-[var(--text-subtle)]" />
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
              className="px-5 py-2.5 rounded-sm border border-red-500/30 text-red-400 text-xs font-bold uppercase tracking-widest hover:bg-red-500/10 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {leaveTeam.isPending
                ? "Leaving…"
                : canLeave
                  ? "Leave team"
                  : "Roster locked"}
            </button>
          </div>
        </LiquidGlass>
      )}

      {isRegistered && !myTeamId && (
        <LiquidGlass printed className="p-6">
          {!canCreate ? (
            <div className="flex flex-col gap-1">
              <p className="text-sm text-[var(--text-muted)]">
                Team creation is closed.
              </p>
              {windowNotice && (
                <p className="text-xs text-[var(--text-subtle)]">
                  {windowNotice}
                </p>
              )}
            </div>
          ) : !showCreate ? (
            <button
              type="button"
              onClick={() => setShowCreate(true)}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-sm bg-accent/10 border border-accent/25 text-accent text-xs font-bold uppercase tracking-widest hover:bg-accent/20 transition-colors"
            >
              <Plus className="w-4 h-4" />
              Create a team
            </button>
          ) : (
            <div className="space-y-5">
              <h3 className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-widest">
                New team
              </h3>

              <div>
                <label
                  htmlFor="team-name"
                  className="block text-xs font-bold text-[var(--text-muted)] uppercase tracking-widest mb-2"
                >
                  Team name
                </label>
                <input
                  id="team-name"
                  type="text"
                  value={teamName}
                  onChange={(e) => setTeamName(e.target.value)}
                  maxLength={100}
                  className="w-full bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-sm px-4 py-3 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-subtle)] focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/30 transition-ui"
                />
              </div>

              <div>
                <label
                  htmlFor="team-description"
                  className="block text-xs font-bold text-[var(--text-muted)] uppercase tracking-widest mb-2"
                >
                  Description
                </label>
                <textarea
                  id="team-description"
                  value={teamDesc}
                  onChange={(e) => setTeamDesc(e.target.value)}
                  placeholder="What are you building, and who do you need?"
                  maxLength={1000}
                  rows={4}
                  className="w-full bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-sm px-4 py-3 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-subtle)] focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/30 transition-ui resize-none"
                />
              </div>

              <div>
                <span
                  id="team-capacity-label"
                  className="block text-xs font-bold text-[var(--text-muted)] uppercase tracking-widest mb-2"
                >
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
                      className={`w-12 h-12 rounded-sm text-sm font-bold border transition-ui ${maxMembers === n ? "bg-accent/15 border-accent/40 text-accent" : "bg-[var(--bg-secondary)] border-[var(--border-subtle)] text-[var(--text-muted)] hover:border-[var(--border-hover)]"}`}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex flex-col sm:flex-row items-center gap-4 pt-4 border-t border-[var(--border-subtle)]">
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
                  className="w-full sm:w-auto px-6 py-3 bg-accent text-[var(--text-on-accent)] rounded-sm font-bold text-sm uppercase tracking-widest hover:bg-[var(--accent-secondary)] transition-ui disabled:opacity-50"
                >
                  {createTeam.isPending ? "Creating…" : "Create team"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowCreate(false);
                    setError("");
                  }}
                  className="text-xs font-bold uppercase tracking-widest text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </LiquidGlass>
      )}

      <div>
        <h3 className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-widest mb-4">
          Open teams ({otherTeams.length})
        </h3>

        {otherTeams.length === 0 && !myTeam && (
          <LiquidGlass
            printed
            className="p-8 text-center flex flex-col items-center gap-3"
          >
            <div className="w-12 h-12 rounded-full bg-[var(--bg-secondary)] border border-[var(--border-subtle)] flex items-center justify-center">
              <Users className="w-5 h-5 text-[var(--text-subtle)]" />
            </div>
            <p className="text-sm text-[var(--text-muted)]">
              No teams yet. Create one above, or wait for others to form.
            </p>
          </LiquidGlass>
        )}

        <div className="space-y-4">
          {otherTeams.map((team) => {
            const isFull = team.currentMembers >= team.maxMembers;
            const canJoin =
              isRegistered &&
              !myTeamId &&
              team.isOpen &&
              !isFull &&
              windowAllowsJoin;

            return (
              <LiquidGlass key={team.id} printed className="p-6">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-5">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="text-base font-bold text-[var(--text-primary)] truncate">
                        {team.name}
                      </h3>
                      {!team.isOpen && (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-sm text-[11px] font-bold uppercase tracking-wider border text-rose-400 bg-rose-500/10 border-rose-500/20">
                          Closed
                        </span>
                      )}
                      {isFull && (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-sm text-[11px] font-bold uppercase tracking-wider border text-amber-400 bg-amber-500/10 border-amber-500/20">
                          Full
                        </span>
                      )}
                    </div>
                    {team.description && (
                      <p className="text-[var(--text-muted)] text-sm mb-4 line-clamp-2 leading-relaxed">
                        {team.description}
                      </p>
                    )}

                    <div className="flex items-center gap-3">
                      <div className="flex -space-x-2">
                        {(team.participants || [])
                          .slice(0, 5)
                          .map(
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
                                  width={32}
                                  height={32}
                                  className="rounded-sm border-2 border-[var(--bg-primary)] relative z-10"
                                />
                              ) : (
                                <div
                                  key={p.userId}
                                  className="w-8 h-8 rounded-sm bg-[var(--bg-elevated)] border-2 border-[var(--bg-primary)] flex items-center justify-center text-[10px] font-bold text-[var(--text-muted)] relative z-10"
                                >
                                  {(p.user.name?.[0] ?? "?").toUpperCase()}
                                </div>
                              ),
                          )}
                        {team.currentMembers > 5 && (
                          <div className="w-8 h-8 rounded-sm bg-[var(--bg-secondary)] border-2 border-[var(--bg-primary)] flex items-center justify-center text-[10px] font-bold text-[var(--text-muted)] relative z-10">
                            +{team.currentMembers - 5}
                          </div>
                        )}
                      </div>
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-sm text-[11px] font-bold uppercase tracking-wider border text-[var(--text-muted)] bg-[var(--bg-secondary)] border-[var(--border-subtle)]">
                        {team.currentMembers} / {team.maxMembers}
                      </span>
                    </div>
                  </div>

                  {canJoin && (
                    <button
                      type="button"
                      onClick={() => {
                        setError("");
                        joinTeam.mutate({ hackathonId, teamId: team.id });
                      }}
                      disabled={joinTeam.isPending}
                      className="flex-shrink-0 inline-flex items-center gap-2 px-5 py-2.5 rounded-sm bg-accent/10 border border-accent/25 text-accent text-xs font-bold uppercase tracking-widest hover:bg-accent/20 transition-colors disabled:opacity-50"
                    >
                      {joinTeam.isPending ? "Joining…" : "Join team"}
                    </button>
                  )}
                </div>
              </LiquidGlass>
            );
          })}
        </div>
      </div>
    </div>
  );
}
