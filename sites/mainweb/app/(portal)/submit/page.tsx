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
  fieldLabel,
  input,
  itemTitle,
  kicker,
  page,
  pageTitle,
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

/** A deadline that never breaks across lines: "EST." alone on a line is unreadable. */
const Moment = ({ at }: { at: Date }) => (
  <span className="whitespace-nowrap font-semibold">{formatMoment(at)}</span>
);

/** A teammate's view of the form: filed values read as values, not empty fields. */
const readOnlyField =
  "read-only:bg-transparent read-only:border-[var(--border-subtle)]";

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
  // The id can come straight from the URL or the picker, so it is encoded
  // wherever it becomes part of a link path.
  const hackathonPath = `/hackathons/${encodeURIComponent(selectedHackathonId)}`;
  const [confirmWithdraw, setConfirmWithdraw] = useState(false);

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
    trpc.hackathon.myRegistrations.useQuery(undefined, {
      enabled: !!session,
      // An accepted attendee gets checked in at the venue, which is what
      // unlocks the form. Poll for it only on the event's days, so the page
      // updates without a reload and idle tabs stay quiet. Day granularity on
      // the viewer's clock, as the event page does: a badge scanned before
      // doors open still counts.
      refetchInterval: (query) => {
        const reg = query.state.data?.find(
          (r) => r.hackathonId === selectedHackathonId,
        );
        if (reg?.registrationStatus !== "approved") return false;
        const startOfDay = (d: Date | string) =>
          new Date(d).setHours(0, 0, 0, 0);
        const today = startOfDay(new Date());
        const started = startOfDay(reg.hackathon.startDate) <= today;
        const ended =
          !!reg.hackathon.endDate && today > startOfDay(reg.hackathon.endDate);
        return started && !ended ? 30_000 : false;
      },
    });

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

  const availableTracks = hackathonDetail?.tracks ?? [];
  const availableChallenges = hackathonDetail?.challenges ?? [];

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
  // submitProject and withdrawProject refuse everyone but the captain, so
  // teammates see the entry but cannot change it.
  const readOnly =
    !!currentReg?.team && currentReg.team.captainId !== session?.user?.id;
  // The team list already carries the captain; it is read only to name them.
  const teamRoster = trpc.team.list.useQuery(
    { hackathonId: selectedHackathonId },
    { enabled: readOnly && !!selectedHackathonId },
  );
  const captainName = teamRoster.data?.find(
    (t) => t.id === currentReg?.team?.id,
  )?.captain?.name;

  // Mutations
  const submitProject = trpc.team.submitProject.useMutation({
    onSuccess: () => {
      utils.hackathon.myRegistrations.invalidate();
      utils.team.mySubmission.invalidate();
      setError("");
      setSuccessMessage(
        "Project submitted. Judging is in person: your team presents to judges for each challenge, and the event's Judging tab shows where and when.",
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
      setConfirmWithdraw(false);
      setSuccessMessage(
        "Submission withdrawn. It is back to draft and no longer entered for judging.",
      );
    },
    onError: (err) => {
      setConfirmWithdraw(false);
      setError(err.message);
    },
  });

  // Still submittable: until 12 hours after the event ends. The default pick
  // and the dropdown use the same rule; defaulting to myRegs[0] could select
  // a past edition the dropdown did not even list.
  const isActiveReg = (reg: NonNullable<typeof myRegs>[number]) =>
    reg.hackathon.endDate
      ? new Date(
          new Date(reg.hackathon.endDate).getTime() + 12 * 60 * 60 * 1000,
        // oxlint-disable-next-line react/purity
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
  // One live event is already named by the kicker; the picker earns its place
  // only when there is something to choose.
  const showEventPicker =
    activeRegs.length > 1 ||
    !activeRegs.some((r) => r.hackathonId === selectedHackathonId);

  // A teammate reads what was filed; a row of dimmed buttons says it badly.
  const filedChips = (picked: string[]) =>
    picked.length > 0 ? (
      picked.map((v) => (
        <span key={v} className={chip(true)}>
          {v}
        </span>
      ))
    ) : (
      <p className="text-[13px] text-[var(--text-muted)]">None picked</p>
    );

  return (
    <main className={page}>
      <Link
        href="/dashboard"
        className="inline-flex min-h-11 items-center text-[13px] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
      >
        ← Dashboard
      </Link>

      <header className="mt-2">
        {currentReg && <p className={kicker}>{currentReg.hackathon.name}</p>}
        <h1 className={`mt-1 ${pageTitle}`}>Submit your project</h1>
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
            {showEventPicker && (
              <div>
                <label htmlFor="event-context" className={fieldLabel}>
                  Hackathon
                </label>
                <select
                  id="event-context"
                  className={`${input} min-h-11`}
                  value={selectedHackathonId}
                  onChange={(e) => {
                    setSelectedHackathonId(e.target.value);
                    setError("");
                    setSuccessMessage("");
                    setProjectSubmitted(false);
                    setConfirmWithdraw(false);
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
            )}

            <div
              className={
                showEventPicker
                  ? "border-t border-[var(--border-subtle)] pt-6"
                  : undefined
              }
            >
              <h2 className="text-[13px] font-medium text-[var(--text-muted)]">
                {currentReg?.team ? "Your team" : "Team"}
              </h2>
              {currentReg?.team ? (
                <>
                  <p className={`mt-1 ${itemTitle}`}>{currentReg.team.name}</p>
                  <p className="mt-1 text-[13px] text-[var(--text-muted)]">
                    {currentReg.team.currentMembers} of{" "}
                    {currentReg.team.maxMembers} members ·{" "}
                    {readOnly
                      ? `${captainName ?? "your captain"} submits for the team`
                      : "you're the captain"}
                  </p>
                </>
              ) : (
                <p className={`mt-1 ${body}`}>
                  {admitted
                    ? "You're submitting solo. Create a team or join one from the event's Teams tab."
                    : "You can create or join a team once you have been accepted."}
                </p>
              )}
              {currentReg && (currentReg.team || admitted) && (
                <Link
                  href={`${hackathonPath}?tab=TEAMS`}
                  className={`mt-3 ${textLink}`}
                >
                  {currentReg.team ? "Manage team" : "Create or join a team"}
                </Link>
              )}
            </div>
          </aside>

          {/* Project submission */}
          <section className="border-t border-[var(--border-subtle)] pt-8 lg:col-span-8 lg:border-t-0 lg:pt-0">
            <div className="mb-8 space-y-4 empty:hidden">
              {/* Once the project is in judging, the team's times and rooms
                  live on the hackathon's Judging tab. */}
              {mySubmission.data?.inJudging && (
                <p className="border-l-2 border-accent pl-3 text-[15px] text-[var(--text-primary)]">
                  Your project is in judging. Your team presents to judges for
                  each challenge it entered, and the{" "}
                  <Link
                    href={`${hackathonPath}?tab=JUDGING`}
                    className="font-semibold underline decoration-accent decoration-2 underline-offset-[5px]"
                  >
                    Judging tab
                  </Link>{" "}
                  shows where and when once organisers publish the schedule.
                </p>
              )}

              {/* Admission, said before the form is filled in. Acceptance
                  lets you form a team; submitting needs the badge scan,
                  because judging happens in person. */}
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
                  {submissionWindow.data.cancelled ? (
                    "This hackathon has been cancelled, so nothing can be submitted."
                  ) : submissionWindow.data.notYetOpen ? (
                    <>
                      Submission opens{" "}
                      <Moment at={submissionWindow.data.opensAt} />. The form is
                      here early so you can see what it asks for.
                    </>
                  ) : !submissionWindow.data.isOpen ? (
                    <>
                      Submission closed{" "}
                      <Moment at={submissionWindow.data.closesAt} />.
                    </>
                  ) : !hasSubmitted ? (
                    <>
                      Submissions close{" "}
                      <Moment at={submissionWindow.data.closesAt} />.
                    </>
                  ) : submissionWindow.data.canEditExisting ? (
                    <>
                      {readOnly
                        ? "Your team can edit its entry"
                        : "You can edit your entry"}{" "}
                      until <Moment at={submissionWindow.data.editsCloseAt} />.
                    </>
                  ) : (
                    <>
                      Edits closed{" "}
                      <Moment at={submissionWindow.data.editsCloseAt} />, so
                      your entry stands as filed.
                    </>
                  )}
                </p>
              )}
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (readOnly) return;
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
              className="space-y-10"
            >
              {/* Name & Desc */}
              <div className="space-y-5">
                <div>
                  <label htmlFor="project-name" className={fieldLabel}>
                    Project name{" "}
                    <span className="font-normal text-[var(--text-muted)]">
                      (required)
                    </span>
                  </label>
                  <input
                    id="project-name"
                    type="text"
                    required
                    readOnly={readOnly}
                    value={projectName}
                    onChange={(e) => setProjectName(e.target.value)}
                    placeholder="e.g. Transit delay predictor"
                    className={`${input} ${readOnlyField}`}
                  />
                </div>
                <div>
                  <label htmlFor="project-description" className={fieldLabel}>
                    Description{" "}
                    <span className="font-normal text-[var(--text-muted)]">
                      (required)
                    </span>
                  </label>
                  <textarea
                    id="project-description"
                    required
                    readOnly={readOnly}
                    value={projectDesc}
                    onChange={(e) => setProjectDesc(e.target.value)}
                    placeholder="Explain the problem you solved and how you built it…"
                    rows={5}
                    className={`resize-none ${input} ${readOnlyField} [field-sizing:content] min-h-[8.5rem]`}
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
                  {!readOnly && (
                    <p className={`mt-1 ${body}`}>
                      Your project presents to judges for each challenge you
                      pick, so pick everything you are competing for.
                    </p>
                  )}

                  {availableTracks.length > 0 && (
                    <div className="mt-5">
                      <p className={fieldLabel}>Tracks</p>
                      <div className="flex flex-wrap gap-2">
                        {readOnly
                          ? filedChips(tracks)
                          : availableTracks.map((track) => (
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
                        {readOnly
                          ? filedChips(challenges)
                          : availableChallenges.map((challenge) => (
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

                  {readOnly ? (
                    isCreateX && (
                      <p className={`mt-6 ${body}`}>
                        Entered for the CreateX entrepreneurship prize.
                      </p>
                    )
                  ) : (
                    <label
                      htmlFor="is-createx"
                      className="mt-6 flex min-h-11 cursor-pointer items-start gap-3 py-2.5 text-[15px] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
                    >
                      <input
                        id="is-createx"
                        type="checkbox"
                        checked={isCreateX}
                        onChange={(e) => setIsCreateX(e.target.checked)}
                        className="mt-0.5 h-5 w-5 min-h-0! min-w-0! shrink-0 cursor-pointer accent-[var(--accent)]"
                      />
                      We are competing for the CreateX entrepreneurship prize
                    </label>
                  )}
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
                      readOnly={readOnly}
                      value={githubUrl}
                      onChange={(e) => setGithubUrl(e.target.value)}
                      placeholder="https://github.com/…"
                      className={`${input} ${readOnlyField}`}
                    />
                  </div>
                  <div>
                    <label htmlFor="video-url" className={fieldLabel}>
                      Demo video
                    </label>
                    <input
                      id="video-url"
                      type="url"
                      readOnly={readOnly}
                      value={videoUrl}
                      onChange={(e) => setVideoUrl(e.target.value)}
                      placeholder="https://youtube.com/…"
                      className={`${input} ${readOnlyField}`}
                    />
                  </div>
                  <div>
                    <label htmlFor="demo-url" className={fieldLabel}>
                      Live demo URL
                    </label>
                    <input
                      id="demo-url"
                      type="url"
                      readOnly={readOnly}
                      value={demoUrl}
                      onChange={(e) => setDemoUrl(e.target.value)}
                      placeholder="https://…"
                      className={`${input} ${readOnlyField}`}
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-4 border-t border-[var(--border-subtle)] pt-6 empty:hidden">
                {/* Feedback lands beside the button that was tapped, not in
                    the notices above the form. */}
                {error && (
                  <p
                    role="alert"
                    className="border-l-2 border-[var(--danger)] pl-3 text-[15px] text-[var(--danger)]"
                  >
                    {error}
                  </p>
                )}

                {successMessage && (
                  <div
                    role="status"
                    className="space-y-2 border-l-2 border-[var(--success)] pl-3"
                  >
                    <p className="text-[15px] font-semibold text-[var(--text-primary)]">
                      {successMessage}
                    </p>
                    {/* A withdrawn project is out of judging, so only a
                        submit points there. */}
                    {projectSubmitted ? (
                      <Link
                        href={`${hackathonPath}?tab=JUDGING`}
                        className={textLink}
                      >
                        Go to Judging
                      </Link>
                    ) : (
                      <Link href="/dashboard" className={textLink}>
                        Back to dashboard
                      </Link>
                    )}
                  </div>
                )}

                {hasSubmitted && !successMessage && (
                  <p className="text-[13px] text-[var(--text-muted)]">
                    {readOnly
                      ? "Your team has submitted."
                      : "You've already submitted. Saving replaces your current entry."}
                  </p>
                )}

                {!readOnly && (
                  <button
                    type="submit"
                    disabled={submitProject.isPending}
                    className={`${btnPrimary} w-full sm:w-auto`}
                  >
                    {submitProject.isPending
                      ? "Submitting…"
                      : hasSubmitted
                        ? "Save changes"
                        : "Submit project"}
                  </button>
                )}

                {hasSubmitted && !readOnly && !confirmWithdraw && (
                  <div className="border-t border-[var(--border-subtle)] pt-4">
                    <button
                      type="button"
                      onClick={() => {
                        setError("");
                        setSuccessMessage("");
                        setConfirmWithdraw(true);
                      }}
                      className={btnDanger}
                    >
                      Withdraw submission
                    </button>
                  </div>
                )}

                {confirmWithdraw && (
                  <div className="flex w-full flex-col gap-3 border-t border-[var(--border-subtle)] pt-4">
                    <p className={body}>
                      Withdraw your submission? It goes back to draft and is no
                      longer entered for judging.
                    </p>
                    <div className="flex flex-wrap gap-3">
                      <button
                        type="button"
                        onClick={() =>
                          withdrawProject.mutate({
                            hackathonId: selectedHackathonId,
                          })
                        }
                        disabled={withdrawProject.isPending}
                        className={btnDanger}
                      >
                        {withdrawProject.isPending
                          ? "Withdrawing…"
                          : "Withdraw"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmWithdraw(false)}
                        disabled={withdrawProject.isPending}
                        className={btnSecondary}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
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
