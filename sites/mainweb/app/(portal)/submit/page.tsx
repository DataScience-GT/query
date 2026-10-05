"use client";

import { useSession } from "next-auth/react";
import { loginHref } from "@/lib/safe-callback";
import { trpc } from "@/lib/trpc";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { LoadingScreen } from "@/components/portal/LoadingScreen";
import Link from "next/link";
import {
  body,
  btnDanger,
  btnPrimary,
  btnSecondary,
  chip,
  fieldHint,
  fieldLabel,
  input,
  itemTitle,
  kicker,
  label,
  meta,
  page,
  pageDek,
  pageTitle,
  sectionTitle,
  textLink,
} from "@/components/portal/ui";

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
  // Same gate as TeamsTab: forming a team needs acceptance, and the server
  // refuses anyone else, so the controls are not offered until then.
  const admitted =
    currentReg?.registrationStatus === "approved" ||
    currentReg?.registrationStatus === "checked_in";
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
      setSuccessMessage("Project submitted.");
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
    <main className={page}>
      <Link
        href="/dashboard"
        className="text-[13px] text-[var(--text-subtle)] hover:text-[var(--text-primary)] transition-colors"
      >
        ← Dashboard
      </Link>

      <header className="mt-6">
        {currentReg && <p className={kicker}>{currentReg.hackathon.name}</p>}
        <h1 className={`mt-1 ${pageTitle}`}>Submit your project</h1>
        <p className={pageDek}>
          Pick the event, set up your team, then fill in your project.
        </p>
      </header>

      {!myRegs || myRegs.length === 0 ? (
        <section className="mt-10 border-t border-[var(--border-subtle)] pt-6">
          <p className={body}>
            Once you register for a hackathon, you can submit your project
            here.
          </p>
          <Link href="/hackathons" className={`mt-4 ${btnPrimary}`}>
            Browse hackathons
          </Link>
        </section>
      ) : (
        <div className="mt-10 grid grid-cols-1 gap-10 border-t border-[var(--border-subtle)] pt-8 lg:grid-cols-12">
          {/* Context and team */}
          <aside className="space-y-8 lg:col-span-4">
            <div>
              <label htmlFor="event-context" className={fieldLabel}>
                Hackathon
              </label>
              <select
                id="event-context"
                className={input}
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
              <div className="border-t border-[var(--border-subtle)] pt-6">
                <h2 className={label}>Your team</h2>
                <p className={`mt-1 ${itemTitle}`}>{currentReg.team.name}</p>
                <p className={`mt-1 ${meta}`}>
                  {currentReg.team.currentMembers} of{" "}
                  {currentReg.team.maxMembers} members
                </p>

                <div className="mt-5">
                  <p className={fieldLabel}>Invite code</p>
                  <div className="rounded-[var(--radius-sm)] border border-[var(--border-medium)] bg-[var(--bg-input)] px-3 py-2 text-center font-mono text-[13px] text-[var(--text-primary)] select-all break-all">
                    {currentReg.team.id}
                  </div>
                  <p className={fieldHint}>Share this so teammates can join.</p>
                </div>

                {currentReg.team.captainId === session?.user?.id ? (
                  <div className="mt-6 space-y-3">
                    <p className={meta}>You&apos;re the team captain.</p>
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
                      className={`w-full ${btnDanger}`}
                    >
                      {disbandTeam.isPending ? "Disbanding…" : "Disband team"}
                    </button>
                    {!canLeaveTeam && (
                      <p className={meta}>
                        Rosters are locked for the final 12 hours before the
                        deadline.
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="mt-6 space-y-3">
                    <button
                      onClick={() =>
                        leaveTeam.mutate({
                          hackathonId: selectedHackathonId,
                        })
                      }
                      disabled={leaveTeam.isPending || !canLeaveTeam}
                      className={`w-full ${btnDanger}`}
                    >
                      {leaveTeam.isPending ? "Leaving…" : "Leave team"}
                    </button>
                    {!canLeaveTeam && (
                      <p className={meta}>
                        Rosters are locked for the final 12 hours before the
                        deadline.
                      </p>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-4 border-t border-[var(--border-subtle)] pt-6">
                <h2 className={label}>Team</h2>
                <p className={body}>
                  {admitted
                    ? "You're submitting solo. Create a team or join one with an invite code."
                    : "You can create or join a team once you have been accepted."}
                </p>

                {teamWindowNotice && (
                  <p className="border-l-2 border-[var(--warning)] pl-3 text-[15px] text-[var(--text-primary)]">
                    {teamWindowNotice}
                  </p>
                )}

                {admitted && (
                  <>
                    <div className="space-y-3 pt-2">
                      <input
                        type="text"
                        aria-label="Team name"
                        placeholder="Team name"
                        value={teamName}
                        onChange={(e) => setTeamName(e.target.value)}
                        className={input}
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
                        className={`w-full ${btnSecondary}`}
                      >
                        {createTeam.isPending ? "Creating…" : "Create team"}
                      </button>
                    </div>

                    <div className="flex items-center gap-4 py-1">
                      <div className="h-px flex-1 bg-[var(--border-subtle)]"></div>
                      <span className={meta}>or</span>
                      <div className="h-px flex-1 bg-[var(--border-subtle)]"></div>
                    </div>

                    <div className="space-y-3">
                      <input
                        type="text"
                        aria-label="Invite code"
                        placeholder="Paste invite code"
                        value={joinTeamId}
                        onChange={(e) => setJoinTeamId(e.target.value)}
                        className={`font-mono ${input}`}
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
                        className={`w-full ${btnSecondary}`}
                      >
                        {joinTeam.isPending ? "Joining…" : "Join team"}
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
          </aside>

          {/* Project submission */}
          <section className="border-t border-[var(--border-subtle)] pt-8 lg:col-span-8 lg:border-t-0 lg:pt-0">
            <h2 className={sectionTitle}>Your project</h2>
            <p className={`mt-2 ${body}`}>
              Name and description are required. On a team, only the captain
              can submit.
            </p>

            <div className="mt-6 space-y-4 empty:hidden">
              {/* Where judges will come. The table is assigned when an
                  organiser opens judging, and nothing else told the team. */}
              {mySubmission.data?.tableNumber != null && (
                <p className="border-l-2 border-accent pl-3 text-[15px] text-[var(--text-primary)]">
                  Your project is at table{" "}
                  <span className="font-semibold tabular-nums">
                    {mySubmission.data.tableNumber}
                  </span>
                  . Be there when judging starts; judges come to you.
                </p>
              )}

              {/* Admission, said before the form is filled in. Acceptance
                  lets you form a team; submitting needs the badge scan,
                  because judging happens in person at a table number. */}
              {currentReg && currentReg.registrationStatus !== "checked_in" && (
                <p className="border-l-2 border-[var(--warning)] pl-3 text-[15px] text-[var(--text-primary)]">
                  {currentReg.registrationStatus === "approved"
                    ? "You're accepted. Check in at the event before submitting: find a volunteer and have your badge scanned."
                    : currentReg.registrationStatus === "pending"
                      ? "Your registration is still being reviewed. You can form a team once you have been accepted."
                      : currentReg.registrationStatus === "waitlisted"
                        ? "You're on the waitlist. If a seat opens, you'll be accepted and can submit."
                        : "Your registration wasn't accepted, so you can't submit to this hackathon."}
                </p>
              )}

              {/* The window this form is gated on, said before it is filled
                  in. Without it an attendee wrote a full description and
                  learned it was refused only on submit. */}
              {submissionWindow.data && (
                <p
                  className={`border-l-2 pl-3 text-[15px] text-[var(--text-primary)] ${
                    submissionWindow.data.isOpen
                      ? "border-accent"
                      : "border-[var(--warning)]"
                  }`}
                >
                  {submissionWindow.data.cancelled
                    ? "This hackathon has been cancelled, so nothing can be submitted."
                    : submissionWindow.data.notYetOpen
                      ? `Submission opens ${formatMoment(submissionWindow.data.opensAt)}. The form is here early so you can see what it asks for.`
                      : !submissionWindow.data.isOpen
                        ? `Submission closed ${formatMoment(submissionWindow.data.closesAt)}.`
                        : submissionWindow.data.canEditExisting
                          ? `Open until ${formatMoment(submissionWindow.data.closesAt)}. Edits to an existing submission close ${formatMoment(submissionWindow.data.editsCloseAt)}.`
                          : `Open until ${formatMoment(submissionWindow.data.closesAt)}. Edits to an existing submission are closed, so this can only file a first entry.`}
                </p>
              )}

              {error && (
                <p
                  role="alert"
                  className="border-l-2 border-[var(--danger)] pl-3 text-[15px] text-[var(--danger)]"
                >
                  {error}
                </p>
              )}

              {successMessage && (
                <div className="flex flex-wrap items-center justify-between gap-4 border-l-2 border-[var(--success)] pl-3">
                  <p className="text-[15px] font-semibold text-[var(--text-primary)]">
                    {successMessage}
                  </p>
                  <Link href="/dashboard" className={textLink}>
                    Back to dashboard
                  </Link>
                </div>
              )}
            </div>

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
              className="mt-8 space-y-10"
            >
              {/* Name & Desc */}
              <div className="space-y-5">
                <div>
                  <label htmlFor="project-name" className={fieldLabel}>
                    Project name{" "}
                    <span className="font-normal text-[var(--text-subtle)]">
                      (required)
                    </span>
                  </label>
                  <input
                    id="project-name"
                    type="text"
                    required
                    value={projectName}
                    onChange={(e) => setProjectName(e.target.value)}
                    placeholder="e.g. Transit delay predictor"
                    className={input}
                  />
                </div>
                <div>
                  <label htmlFor="project-description" className={fieldLabel}>
                    Description{" "}
                    <span className="font-normal text-[var(--text-subtle)]">
                      (required)
                    </span>
                  </label>
                  <textarea
                    id="project-description"
                    required
                    value={projectDesc}
                    onChange={(e) => setProjectDesc(e.target.value)}
                    placeholder="Explain the problem you solved and how you built it…"
                    rows={5}
                    className={`resize-none ${input}`}
                  />
                </div>
              </div>

              {/* Tracks, challenges and CreateX — what judge assignment
                  routes on. Rendered only when the organisers configured
                  them, so an event without tracks shows nothing rather
                  than an empty box. */}
              {(availableTracks.length > 0 ||
                availableChallenges.length > 0) && (
                <div className="border-t border-[var(--border-subtle)] pt-6">
                  <h3 className={itemTitle}>Tracks and challenges</h3>
                  <p className={`mt-1 ${body}`}>
                    This decides which judges see your project. Pick
                    everything you are competing for.
                  </p>

                  {availableTracks.length > 0 && (
                    <div className="mt-5">
                      <p className={fieldLabel}>Tracks</p>
                      <div className="flex flex-wrap gap-2">
                        {availableTracks.map((track) => (
                          <button
                            key={track}
                            type="button"
                            onClick={() => toggle(track, tracks, setTracks)}
                            aria-pressed={tracks.includes(track)}
                            className={chip(tracks.includes(track))}
                          >
                            {track}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {availableChallenges.length > 0 && (
                    <div className="mt-5">
                      <p className={fieldLabel}>Sponsor challenges</p>
                      <div className="flex flex-wrap gap-2">
                        {availableChallenges.map((challenge) => (
                          <button
                            key={challenge}
                            type="button"
                            onClick={() =>
                              toggle(challenge, challenges, setChallenges)
                            }
                            aria-pressed={challenges.includes(challenge)}
                            className={chip(challenges.includes(challenge))}
                          >
                            {challenge}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  <label
                    htmlFor="is-createx"
                    className="mt-6 flex cursor-pointer items-start gap-3 text-[15px] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
                  >
                    <input
                      id="is-createx"
                      type="checkbox"
                      checked={isCreateX}
                      onChange={(e) => setIsCreateX(e.target.checked)}
                      className="mt-1 h-4 w-4 shrink-0 cursor-pointer accent-[var(--accent)]"
                    />
                    We are competing for the CreateX entrepreneurship prize
                  </label>
                </div>
              )}

              {/* Links */}
              <div className="border-t border-[var(--border-subtle)] pt-6">
                <h3 className={itemTitle}>Links</h3>

                <div className="mt-4 space-y-5">
                  <div>
                    <label htmlFor="github-url" className={fieldLabel}>
                      GitHub repository
                    </label>
                    <input
                      id="github-url"
                      type="url"
                      value={githubUrl}
                      onChange={(e) => setGithubUrl(e.target.value)}
                      placeholder="https://github.com/…"
                      className={input}
                    />
                  </div>
                  <div>
                    <label htmlFor="video-url" className={fieldLabel}>
                      Demo video
                    </label>
                    <input
                      id="video-url"
                      type="url"
                      value={videoUrl}
                      onChange={(e) => setVideoUrl(e.target.value)}
                      placeholder="https://youtube.com/…"
                      className={input}
                    />
                  </div>
                  <div>
                    <label htmlFor="demo-url" className={fieldLabel}>
                      Live demo URL
                    </label>
                    <input
                      id="demo-url"
                      type="url"
                      value={demoUrl}
                      onChange={(e) => setDemoUrl(e.target.value)}
                      placeholder="https://…"
                      className={input}
                    />
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-4 border-t border-[var(--border-subtle)] pt-6">
                <p className={meta}>
                  {hasSubmitted
                    ? "You've already submitted. Saving replaces your current entry."
                    : ""}
                </p>
                <div className="flex flex-wrap items-center gap-3">
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
                      className={btnDanger}
                    >
                      {withdrawProject.isPending
                        ? "Withdrawing…"
                        : "Withdraw submission"}
                    </button>
                  )}
                  <button
                    type="submit"
                    disabled={submitProject.isPending}
                    className={btnPrimary}
                  >
                    {submitProject.isPending
                      ? "Submitting…"
                      : hasSubmitted
                        ? "Save changes"
                        : "Submit project"}
                  </button>
                </div>
              </div>
            </form>
          </section>
        </div>
      )}
    </main>
  );
}

export default function SubmitPortalPage() {
  return (
    <Suspense fallback={<LoadingScreen message="Loading…" />}>
      <SubmitPortalContent />
    </Suspense>
  );
}
