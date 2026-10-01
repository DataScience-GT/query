"use client";

import { useSession } from "next-auth/react";
import { loginHref } from "@/lib/safe-callback";
import { trpc } from "@/lib/trpc";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { LiquidGlass } from "@/components/portal/LiquidGlass";
import { LoadingScreen } from "@/components/portal/LoadingScreen";
import Link from "next/link";
import { Calendar, ChevronLeft, Send } from "lucide-react";

/**
 * Deadlines are rendered in the event's own time zone, not the viewer's. Half
 * the field is remote, and a submission deadline shown in the wrong zone is the
 * one rendering mistake that costs someone their entry.
 */
const formatMoment = (moment: Date) =>
  moment.toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
    timeZone: "America/New_York",
  });

function SubmitPortalContent() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlHackathonId = searchParams.get("id");

  const utils = trpc.useUtils();

  // Context & State
  const [selectedHackathonId, setSelectedHackathonId] = useState<string>(
    urlHackathonId || "",
  );
  const [teamName, setTeamName] = useState("");
  const [joinTeamId, setJoinTeamId] = useState("");

  const [projectName, setProjectName] = useState("");
  const [projectDesc, setProjectDesc] = useState("");
  const [githubUrl, setGithubUrl] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
  const [demoUrl, setDemoUrl] = useState("");
  // Judge routing filters on exactly these three. A submission without them
  // reaches no track judge and no sponsor judge at all.
  const [tracks, setTracks] = useState<string[]>([]);
  const [challenges, setChallenges] = useState<string[]>([]);
  const [isCreateX, setIsCreateX] = useState(false);

  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [projectSubmitted, setProjectSubmitted] = useState(false);
  // Which hackathon the form below has already been filled from, so a
  // background refetch cannot overwrite what someone is part-way through
  // typing.
  const [prefilledFor, setPrefilledFor] = useState("");

  // Queries
  const { data: myRegs, isLoading: loadingRegs } =
    trpc.hackathon.myRegistrations.useQuery(undefined, { enabled: !!session });

  // The project a submit would overwrite — the team's entry, or the solo one
  // this participant filed. Reading it from the team alone leaves every solo
  // hacker staring at a blank form over a live submission.
  const mySubmission = trpc.team.mySubmission.useQuery(
    { hackathonId: selectedHackathonId },
    { enabled: !!session && !!selectedHackathonId },
  );

  // The event's own track and challenge lists. Offering free text instead
  // would be worse than offering nothing: judge assignment matches these
  // strings exactly, so a typo silently removes a project from a judge's pool.
  const { data: hackathonDetail } = trpc.hackathon.getById.useQuery(
    { id: selectedHackathonId },
    { enabled: !!session && !!selectedHackathonId },
  );

  // The window the submit mutation gates on. The page never queried it, so the
  // refusal only ever arrived after the form was filled in.
  const submissionWindow = trpc.team.submissionWindow.useQuery(
    { hackathonId: selectedHackathonId },
    { enabled: !!session && !!selectedHackathonId },
  );

  // Team create/join/leave gate on a different window to submitting: it opens
  // at +12h, shuts at +34h, and leaving locks at +24h. The panel queried none
  // of it, so every button outside those hours failed on click.
  const teamWindow = trpc.team.window.useQuery(
    { hackathonId: selectedHackathonId },
    { enabled: !!session && !!selectedHackathonId },
  );

  const availableTracks = hackathonDetail?.tracks ?? [];
  const availableChallenges = hackathonDetail?.challenges ?? [];

  const teamsOpen = teamWindow.data?.isOpen ?? false;
  const canLeaveTeam = teamWindow.data?.canLeave ?? false;
  const teamWindowNotice = !teamWindow.data
    ? null
    : teamsOpen
      ? null
      : "Team formation has closed for this event.";

  const toggle = (
    value: string,
    current: string[],
    set: (next: string[]) => void,
  ) =>
    set(
      current.includes(value)
        ? current.filter((v) => v !== value)
        : [...current, value],
    );

  // We get the specific registration / team context based on selected hackathon
  const currentReg = myRegs?.find((r) => r.hackathonId === selectedHackathonId);
  // A withdrawn project stays as a draft row, so the row alone is not a
  // submission.
  const hasSubmitted =
    (!!mySubmission.data && mySubmission.data.status !== "draft") ||
    currentReg?.hasSubmittedProject ||
    projectSubmitted;

  // Mutations
  // Joining, creating or leaving a team changes which project this participant
  // owns, so the form has to be refilled from the new one rather than keeping
  // the old team's answers.
  const teamChanged = () => {
    utils.hackathon.myRegistrations.invalidate();
    utils.team.mySubmission.invalidate();
    setPrefilledFor("");
    setError("");
  };

  const createTeam = trpc.team.createTeam.useMutation({
    onSuccess: () => {
      teamChanged();
      setTeamName("");
    },
    onError: (err) => setError(err.message),
  });

  const joinTeam = trpc.team.joinTeam.useMutation({
    onSuccess: () => {
      teamChanged();
      setJoinTeamId("");
    },
    onError: (err) => setError(err.message),
  });

  const leaveTeam = trpc.team.leaveTeam.useMutation({
    onSuccess: () => {
      teamChanged();
    },
    onError: (err) => setError(err.message),
  });

  const disbandTeam = trpc.team.disbandTeam.useMutation({
    onSuccess: () => {
      teamChanged();
    },
    onError: (err) => setError(err.message),
  });

  const submitProject = trpc.team.submitProject.useMutation({
    onSuccess: () => {
      utils.hackathon.myRegistrations.invalidate();
      utils.team.mySubmission.invalidate();
      setError("");
      setSuccessMessage(
        "Project submitted.",
      );
      setProjectSubmitted(true);
    },
    onError: (err) => setError(err.message),
  });

  // Leaving or disbanding a team refuses while a submission stands and tells
  // the user to withdraw it first, so there has to be a way to do that.
  const withdrawProject = trpc.team.withdrawProject.useMutation({
    onSuccess: () => {
      utils.hackathon.myRegistrations.invalidate();
      utils.team.mySubmission.invalidate();
      setError("");
      setProjectSubmitted(false);
      setSuccessMessage(
        "Submission withdrawn. It is back to draft and no longer entered for judging.",
      );
    },
    onError: (err) => setError(err.message),
  });

  // Still submittable: until 12 hours after the event ends. The default pick
  // and the dropdown use the same rule; defaulting to myRegs[0] could select
  // a past edition the dropdown did not even list.
  const isActiveReg = (reg: NonNullable<typeof myRegs>[number]) =>
    reg.hackathon.endDate
      ? new Date(
          new Date(reg.hackathon.endDate).getTime() + 12 * 60 * 60 * 1000,
        ) >= new Date()
      : true;

  if (!selectedHackathonId && myRegs && myRegs.length > 0) {
    const firstReg = myRegs.find(isActiveReg);
    if (firstReg) {
      setSelectedHackathonId(firstReg.hackathonId);
    }
  }

  // Fill the form from the existing submission, once per selected event.
  // Clearing when there is none matters as much as filling: the form used to
  // keep the previous event's answers after switching, so a submit could file
  // one hackathon's project against another.
  if (
    selectedHackathonId &&
    !mySubmission.isPending &&
    prefilledFor !== selectedHackathonId
  ) {
    const p = mySubmission.data;
    setProjectName(p?.name ?? "");
    setProjectDesc(p?.description ?? "");
    setGithubUrl(p?.githubUrl ?? "");
    setVideoUrl(p?.videoUrl ?? "");
    setDemoUrl(p?.demoUrl ?? "");
    setTracks(p?.tracks ?? []);
    setChallenges(p?.challenges ?? []);
    setIsCreateX(p?.isCreateX ?? false);
    setPrefilledFor(selectedHackathonId);
  }

  if (status === "loading" || loadingRegs) {
    return <LoadingScreen message="Loading…" />;
  }

  if (!session) {
    router.push(loginHref());
    return null;
  }

  const activeRegs = myRegs?.filter(isActiveReg) || [];

  return (
    <div className="relative min-h-screen bg-[var(--bg-tertiary)]">
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[-20%] left-[10%] w-[600px] h-[600px] bg-accent/5 blur-[200px] rounded-full" />
        <div className="absolute bottom-[-10%] right-[5%] w-[500px] h-[500px] bg-indigo-600/5 blur-[180px] rounded-full" />
      </div>

      <main className="relative z-10 max-w-6xl mx-auto px-6 py-10 space-y-8">
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-1 text-xs text-[var(--text-muted)] hover:text-accent"
        >
          <ChevronLeft className="w-3.5 h-3.5" />
          Dashboard
        </Link>

        <div className="w-full space-y-8">
          <div>
            <p className="text-[10px] font-mono text-accent/60 uppercase tracking-[0.2em] mb-2">
              Hackathon
            </p>
            <h1 className="text-3xl font-black text-[var(--text-primary)] tracking-wider font-oswald uppercase">
              Submit a project
            </h1>
            <p className="text-sm text-[var(--text-muted)] mt-1">
              Pick the event, set up your team, then fill in your project.
            </p>
          </div>

          {!myRegs || myRegs.length === 0 ? (
            <LiquidGlass
              printed
              className="p-8 text-center flex flex-col items-center gap-3"
            >
              <div className="w-12 h-12 rounded-full bg-[var(--bg-secondary)] border border-[var(--border-subtle)] flex items-center justify-center">
                <Calendar className="w-5 h-5 text-[var(--text-subtle)]" />
              </div>
              <p className="text-sm text-[var(--text-muted)]">
                You haven&apos;t registered for any hackathons yet.
              </p>
              <Link
                href="/hackathons"
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-sm bg-accent/10 border border-accent/25 text-accent text-xs font-bold uppercase tracking-widest hover:bg-accent/20 transition-colors"
              >
                Browse hackathons
              </Link>
            </LiquidGlass>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
              {/* LEFT ALCOVE - CONTEXT / TEAM */}
              <div className="lg:col-span-4 space-y-8">
                <LiquidGlass printed className="p-6">
                  <div className="mb-6">
                    <label htmlFor="event-context" className="block text-xs font-bold text-[var(--text-muted)] uppercase tracking-widest mb-2">
                      Hackathon
                    </label>
                    <select
                      id="event-context"
                      className="w-full bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-sm px-4 py-3 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-subtle)] focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/30 transition-ui"
                      value={selectedHackathonId}
                      onChange={(e) => {
                        setSelectedHackathonId(e.target.value);
                        setError("");
                        setSuccessMessage("");
                        setProjectSubmitted(false);
                      }}
                    >
                      <option value="" disabled>
                        Select a hackathon…
                      </option>
                      {activeRegs.map((r) => (
                        <option key={r.hackathonId} value={r.hackathonId}>
                          {r.hackathon.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  {currentReg?.team ? (
                    <div className="space-y-4">
                      <h3 className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-widest border-b border-[var(--border-subtle)] pb-2">
                        Your team
                      </h3>
                      <div className="p-4 bg-accent/5 border border-accent/20 rounded-sm">
                        <p className="text-base font-bold text-[var(--text-primary)] mb-4">
                          {currentReg.team.name}
                        </p>

                        <div>
                          <p className="block text-xs font-bold text-[var(--text-muted)] uppercase tracking-widest mb-2">Invite code</p>
                          <div className="p-2 bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-sm font-mono text-xs text-accent text-center select-all">
                            {currentReg.team.id}
                          </div>
                          <p className="mt-2 text-xs text-[var(--text-muted)]">
                            Share this so teammates can join.
                          </p>
                        </div>

                        <div className="mt-6 pt-4 border-t border-[var(--border-subtle)]">
                          <p className="text-xs text-[var(--text-muted)]">
                            {currentReg.team.currentMembers} of{" "}
                            {currentReg.team.maxMembers} members
                          </p>
                        </div>

                        {currentReg.team.captainId === session?.user?.id ? (
                          <div className="mt-4 space-y-3">
                            <p className="text-xs text-[var(--text-muted)]">
                              You&apos;re the team captain.
                            </p>
                            {/* leaveTeam refuses for a captain and points here;
                                without this the captain has no way out. */}
                            <button
                              onClick={() => {
                                const teamId = currentReg.team?.id;
                                if (!teamId) return;
                                disbandTeam.mutate({
                                  hackathonId: selectedHackathonId,
                                  teamId,
                                });
                              }}
                              disabled={disbandTeam.isPending || !canLeaveTeam}
                              className="w-full px-5 py-2.5 rounded-sm border border-red-500/30 text-red-400 text-xs font-bold uppercase tracking-widest hover:bg-red-500/10 transition-colors disabled:opacity-40"
                            >
                              {disbandTeam.isPending
                                ? "Disbanding…"
                                : "Disband team"}
                            </button>
                            {!canLeaveTeam && (
                              <p className="text-xs text-[var(--text-muted)]">
                                Rosters are locked for the final 12 hours before
                                the deadline.
                              </p>
                            )}
                          </div>
                        ) : (
                          <div className="mt-6 space-y-2">
                            <button
                              onClick={() =>
                                leaveTeam.mutate({
                                  hackathonId: selectedHackathonId,
                                })
                              }
                              disabled={leaveTeam.isPending || !canLeaveTeam}
                              className="w-full px-5 py-2.5 rounded-sm border border-red-500/30 text-red-400 text-xs font-bold uppercase tracking-widest hover:bg-red-500/10 transition-colors disabled:opacity-40"
                            >
                              {leaveTeam.isPending ? "Leaving…" : "Leave team"}
                            </button>
                            {!canLeaveTeam && (
                              <p className="text-xs text-[var(--text-muted)]">
                                Rosters are locked for the final 12 hours before
                                the deadline.
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-6">
                      <h3 className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-widest border-b border-[var(--border-subtle)] pb-2">
                        Team
                      </h3>
                      <p className="text-sm text-[var(--text-muted)]">
                        You&apos;re submitting solo. Create a team or join one
                        with an invite code.
                      </p>

                      {teamWindowNotice && (
                        <p className="p-3 rounded-sm border border-amber-500/20 bg-amber-500/5 text-xs text-amber-400">
                          {teamWindowNotice}
                        </p>
                      )}

                      <div className="pt-2 space-y-3">
                        <input
                          type="text"
                          aria-label="Team name"
                          placeholder="Team name"
                          value={teamName}
                          onChange={(e) => setTeamName(e.target.value)}
                          className="w-full bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-sm px-4 py-3 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-subtle)] focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/30 transition-ui"
                        />
                        <button
                          onClick={() => {
                            if (teamName.trim().length === 0) {
                              setError("Team name is required.");
                              return;
                            }
                            createTeam.mutate({
                              hackathonId: selectedHackathonId,
                              name: teamName,
                            });
                          }}
                          disabled={createTeam.isPending || !teamsOpen}
                          className="w-full px-5 py-2.5 rounded-sm border border-[var(--border-medium)] bg-[var(--bg-secondary)] text-[var(--text-muted)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)] hover:border-[var(--border-hover)] transition-ui text-xs font-bold uppercase tracking-widest disabled:opacity-40"
                        >
                          {createTeam.isPending
                            ? "Creating…"
                            : "Create team"}
                        </button>
                      </div>

                      <div className="flex items-center gap-4 py-2">
                        <div className="flex-1 h-px bg-[var(--border-subtle)]"></div>
                        <span className="text-xs text-[var(--text-subtle)]">
                          or
                        </span>
                        <div className="flex-1 h-px bg-[var(--border-subtle)]"></div>
                      </div>

                      <div className="space-y-3">
                        <input
                          type="text"
                          aria-label="Invite code"
                          placeholder="Paste invite code"
                          value={joinTeamId}
                          onChange={(e) => setJoinTeamId(e.target.value)}
                          className="w-full bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-sm px-4 py-3 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-subtle)] focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/30 transition-ui"
                        />
                        <button
                          onClick={() =>
                            joinTeam.mutate({
                              hackathonId: selectedHackathonId,
                              teamId: joinTeamId,
                            })
                          }
                          disabled={
                            joinTeam.isPending ||
                            joinTeamId.trim().length === 0 ||
                            !teamsOpen
                          }
                          className="w-full px-5 py-2.5 rounded-sm border border-[var(--border-medium)] bg-[var(--bg-secondary)] text-[var(--text-muted)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)] hover:border-[var(--border-hover)] transition-ui text-xs font-bold uppercase tracking-widest disabled:opacity-40"
                        >
                          {joinTeam.isPending ? "Joining…" : "Join team"}
                        </button>
                      </div>
                    </div>
                  )}
                </LiquidGlass>
              </div>

              {/* RIGHT ALCOVE - PROJECT SUBMISSION */}
              <div className="lg:col-span-8 flex flex-col">
                <LiquidGlass printed className="p-6 md:p-8 flex-1">
                  <h2 className="text-xl font-bold text-[var(--text-primary)] tracking-wider font-oswald uppercase mb-2">
                    Your project
                  </h2>
                  <p className="text-sm text-[var(--text-muted)] mb-6">
                    Name and description are required. On a team, only the
                    captain can submit.
                  </p>

                  {/* Where judges will come. The table is assigned when an
                      organiser opens judging, and nothing else told the team. */}
                  {mySubmission.data?.tableNumber != null && (
                    <div className="p-4 mb-6 rounded-sm border bg-accent/5 border-accent/20">
                      <p className="text-sm text-accent">
                        Your project is at table{" "}
                        <span className="font-bold">
                          {mySubmission.data.tableNumber}
                        </span>
                        . Be there when judging starts; judges come to you.
                      </p>
                    </div>
                  )}

                  {/* Admission, said before the form is filled in. Acceptance
                      lets you form a team; submitting needs the badge scan,
                      because judging happens in person at a table number. */}
                  {currentReg &&
                    currentReg.registrationStatus !== "checked_in" && (
                      <div className="p-4 mb-6 rounded-sm border bg-amber-500/10 border-amber-500/30">
                        <p className="text-sm text-amber-300">
                          {currentReg.registrationStatus === "approved"
                            ? "You're accepted — check in at the event before submitting. Find a volunteer and have your badge scanned."
                            : currentReg.registrationStatus === "pending"
                              ? "Your registration is still being reviewed. You can form a team once you have been accepted."
                              : currentReg.registrationStatus === "waitlisted"
                                ? "You're on the waitlist. If a seat opens, you'll be accepted and can submit."
                                : "Your registration wasn't accepted, so you can't submit to this hackathon."}
                        </p>
                      </div>
                    )}

                  {/* The window this form is gated on, said before it is filled
                      in. Without it an attendee wrote a full description and
                      learned it was refused only on submit. */}
                  {submissionWindow.data && (
                    <div
                      className={`p-4 mb-8 rounded-sm border ${
                        submissionWindow.data.isOpen
                          ? "bg-accent/5 border-accent/20"
                          : "bg-amber-500/10 border-amber-500/30"
                      }`}
                    >
                      <p
                        className={`text-sm ${submissionWindow.data.isOpen ? "text-accent" : "text-amber-300"}`}
                      >
                        {submissionWindow.data.cancelled
                          ? "This hackathon has been cancelled — nothing can be submitted."
                          : submissionWindow.data.notYetOpen
                            ? `Submission opens ${formatMoment(submissionWindow.data.opensAt)}. The form is here early so you can see what it asks for.`
                            : !submissionWindow.data.isOpen
                              ? `Submission closed ${formatMoment(submissionWindow.data.closesAt)}.`
                              : submissionWindow.data.canEditExisting
                                ? `Open until ${formatMoment(submissionWindow.data.closesAt)} · edits to an existing submission close ${formatMoment(submissionWindow.data.editsCloseAt)}.`
                                : `Open until ${formatMoment(submissionWindow.data.closesAt)} — but edits to an existing submission are closed, so this can only file a first entry.`}
                      </p>
                    </div>
                  )}

                  {error && (
                    <div className="p-4 mb-8 bg-red-500/10 border border-red-500/20 rounded-sm">
                      <p className="text-red-400 text-sm">{error}</p>
                    </div>
                  )}

                  {successMessage && (
                    <div className="p-4 mb-8 bg-accent/10 border border-accent/20 rounded-sm flex flex-wrap items-center justify-between gap-4">
                      <p className="text-accent text-sm font-bold">
                        {successMessage}
                      </p>
                      <Link
                        href="/dashboard"
                        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-sm bg-accent/10 border border-accent/25 text-accent text-xs font-bold uppercase tracking-widest hover:bg-accent/20 transition-colors"
                      >
                        Back to dashboard
                      </Link>
                    </div>
                  )}

                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      submitProject.mutate({
                        hackathonId: selectedHackathonId,
                        teamId: currentReg?.team?.id,
                        name: projectName,
                        description: projectDesc,
                        githubUrl,
                        demoUrl,
                        videoUrl,
                        tracks,
                        challenges,
                        isCreateX,
                      });
                    }}
                    className="space-y-8"
                  >
                    {/* Name & Desc */}
                    <div className="space-y-4">
                      <div>
                        <label htmlFor="project-name" className="block text-xs font-bold text-[var(--text-muted)] uppercase tracking-widest mb-2">
                          Project name <span className="text-accent">*</span>
                        </label>
                        <input
                          id="project-name"
                          type="text"
                          required
                          value={projectName}
                          onChange={(e) => setProjectName(e.target.value)}
                          placeholder="e.g. Transit delay predictor"
                          className="w-full bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-sm px-4 py-3 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-subtle)] focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/30 transition-ui"
                        />
                      </div>
                      <div>
                        <label htmlFor="project-description" className="block text-xs font-bold text-[var(--text-muted)] uppercase tracking-widest mb-2">
                          Description{" "}
                          <span className="text-accent">*</span>
                        </label>
                        <textarea
                          id="project-description"
                          required
                          value={projectDesc}
                          onChange={(e) => setProjectDesc(e.target.value)}
                          placeholder="Explain the problem you solved and how you built it…"
                          rows={5}
                          className="w-full bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-sm px-4 py-3 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-subtle)] focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/30 transition-ui resize-none"
                        />
                      </div>
                    </div>

                    {/* Tracks, challenges and CreateX — what judge assignment
                        routes on. Rendered only when the organisers configured
                        them, so an event without tracks shows nothing rather
                        than an empty box. */}
                    {(availableTracks.length > 0 ||
                      availableChallenges.length > 0) && (
                      <div className="rounded-sm border border-[var(--border-subtle)] p-5">
                        <h3 className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-widest mb-2">
                          Tracks & challenges
                        </h3>
                        <p className="text-sm text-[var(--text-muted)] mb-6">
                          This decides which judges see your project. Pick
                          everything you are competing for.
                        </p>

                        {availableTracks.length > 0 && (
                          <div className="mb-6">
                            <p className="block text-xs font-bold text-[var(--text-muted)] uppercase tracking-widest mb-2">
                              Tracks
                            </p>
                            <div className="flex flex-wrap gap-2">
                              {availableTracks.map((track) => (
                                <button
                                  key={track}
                                  type="button"
                                  onClick={() =>
                                    toggle(track, tracks, setTracks)
                                  }
                                  aria-pressed={tracks.includes(track)}
                                  className={`px-3 py-2 text-xs font-bold uppercase tracking-wider rounded-sm border transition-colors ${
                                    tracks.includes(track)
                                      ? "bg-accent/15 border-accent/40 text-accent"
                                      : "bg-[var(--bg-secondary)] border-[var(--border-subtle)] text-[var(--text-muted)] hover:border-[var(--border-hover)]"
                                  }`}
                                >
                                  {track}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}

                        {availableChallenges.length > 0 && (
                          <div className="mb-6">
                            <p className="block text-xs font-bold text-[var(--text-muted)] uppercase tracking-widest mb-2">
                              Sponsor challenges
                            </p>
                            <div className="flex flex-wrap gap-2">
                              {availableChallenges.map((challenge) => (
                                <button
                                  key={challenge}
                                  type="button"
                                  onClick={() =>
                                    toggle(challenge, challenges, setChallenges)
                                  }
                                  aria-pressed={challenges.includes(challenge)}
                                  className={`px-3 py-2 text-xs font-bold uppercase tracking-wider rounded-sm border transition-colors ${
                                    challenges.includes(challenge)
                                      ? "bg-accent/15 border-accent/40 text-accent"
                                      : "bg-[var(--bg-secondary)] border-[var(--border-subtle)] text-[var(--text-muted)] hover:border-[var(--border-hover)]"
                                  }`}
                                >
                                  {challenge}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}

                        <label htmlFor="is-createx" className="flex items-center gap-3 text-sm text-[var(--text-muted)] cursor-pointer">
                          <input
                            id="is-createx"
                            type="checkbox"
                            checked={isCreateX}
                            onChange={(e) => setIsCreateX(e.target.checked)}
                            className="w-4 h-4 rounded-sm accent-[var(--accent)]"
                          />
                          We are competing for the CreateX entrepreneurship prize
                        </label>
                      </div>
                    )}

                    {/* Links */}
                    <div className="rounded-sm border border-[var(--border-subtle)] p-5">
                      <h3 className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-widest mb-6">
                        Links
                      </h3>

                      <div className="space-y-4">
                        <div>
                          <label htmlFor="github-url" className="block text-xs font-bold text-[var(--text-muted)] uppercase tracking-widest mb-2">
                            GitHub repository
                          </label>
                          <input
                            id="github-url"
                            type="url"
                            value={githubUrl}
                            onChange={(e) => setGithubUrl(e.target.value)}
                            placeholder="https://github.com/…"
                            className="w-full bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-sm px-4 py-3 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-subtle)] focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/30 transition-ui"
                          />
                        </div>
                        <div>
                          <label htmlFor="video-url" className="block text-xs font-bold text-[var(--text-muted)] uppercase tracking-widest mb-2">
                            Demo video
                          </label>
                          <input
                            id="video-url"
                            type="url"
                            value={videoUrl}
                            onChange={(e) => setVideoUrl(e.target.value)}
                            placeholder="https://youtube.com/…"
                            className="w-full bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-sm px-4 py-3 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-subtle)] focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/30 transition-ui"
                          />
                        </div>
                        <div>
                          <label htmlFor="demo-url" className="block text-xs font-bold text-[var(--text-muted)] uppercase tracking-widest mb-2">
                            Live demo URL
                          </label>
                          <input
                            id="demo-url"
                            type="url"
                            value={demoUrl}
                            onChange={(e) => setDemoUrl(e.target.value)}
                            placeholder="https://…"
                            className="w-full bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-sm px-4 py-3 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-subtle)] focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/30 transition-ui"
                          />
                        </div>
                      </div>
                    </div>

                    <div className="pt-6 border-t border-[var(--border-subtle)] flex flex-wrap items-center justify-between gap-4">
                      <p className="text-xs text-[var(--text-muted)]">
                        {hasSubmitted
                          ? "You've already submitted. Saving replaces your current entry."
                          : ""}
                      </p>
                      {hasSubmitted && (
                        <button
                          type="button"
                          disabled={withdrawProject.isPending}
                          onClick={() => {
                            setError("");
                            setSuccessMessage("");
                            withdrawProject.mutate({
                              hackathonId: selectedHackathonId,
                            });
                          }}
                          className="px-5 py-2.5 rounded-sm border border-red-500/30 text-red-400 text-xs font-bold uppercase tracking-widest hover:bg-red-500/10 transition-colors disabled:opacity-40"
                        >
                          {withdrawProject.isPending
                            ? "Withdrawing…"
                            : "Withdraw submission"}
                        </button>
                      )}
                      <button
                        type="submit"
                        disabled={submitProject.isPending}
                        className="inline-flex items-center gap-2 px-6 py-3 bg-accent text-[var(--text-on-accent)] rounded-sm font-bold text-sm uppercase tracking-widest hover:bg-[var(--accent-secondary)] transition-ui disabled:opacity-50"
                      >
                        {submitProject.isPending
                          ? "Submitting…"
                          : hasSubmitted
                            ? "Save changes"
                            : "Submit project"}
                        {!submitProject.isPending && <Send className="w-4 h-4" />}
                      </button>
                    </div>
                  </form>
                </LiquidGlass>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

export default function SubmitPortalPage() {
  return (
    <Suspense fallback={<LoadingScreen message="Loading…" />}>
      <SubmitPortalContent />
    </Suspense>
  );
}
