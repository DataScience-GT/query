"use client";

import { useSession } from "next-auth/react";
import { trpc } from "@/lib/trpc";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { LiquidGlass } from "@/components/portal/LiquidGlass";
import { LoadingScreen } from "@/components/portal/LoadingScreen";
import Link from "next/link";

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

  // We get the specific registration / team context based on selected hackathon
  const currentReg = myRegs?.find((r) => r.hackathonId === selectedHackathonId);
  const hasSubmitted =
    !!mySubmission.data || currentReg?.hasSubmittedProject || projectSubmitted;

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

  const submitProject = trpc.team.submitProject.useMutation({
    onSuccess: () => {
      utils.hackathon.myRegistrations.invalidate();
      utils.team.mySubmission.invalidate();
      setError("");
      setSuccessMessage(
        "Project successfully submitted to the judging pipeline!",
      );
      setProjectSubmitted(true);
    },
    onError: (err) => setError(err.message),
  });

  useEffect(() => {
    if (!selectedHackathonId && myRegs && myRegs.length > 0) {
      const firstReg = myRegs[0];
      if (firstReg) {
        setSelectedHackathonId(firstReg.hackathonId);
      }
    }
  }, [myRegs, selectedHackathonId]);

  // Fill the form from the existing submission, once per selected event.
  // Clearing when there is none matters as much as filling: the form used to
  // keep the previous event's answers after switching, so a submit could file
  // one hackathon's project against another.
  useEffect(() => {
    if (!selectedHackathonId) return;
    if (mySubmission.isPending) return;
    if (prefilledFor === selectedHackathonId) return;

    const p = mySubmission.data;
    setProjectName(p?.name ?? "");
    setProjectDesc(p?.description ?? "");
    setGithubUrl(p?.githubUrl ?? "");
    setVideoUrl(p?.videoUrl ?? "");
    setDemoUrl(p?.demoUrl ?? "");
    setPrefilledFor(selectedHackathonId);
  }, [
    selectedHackathonId,
    mySubmission.isPending,
    mySubmission.data,
    prefilledFor,
  ]);

  if (status === "loading" || loadingRegs) {
    return <LoadingScreen message="Initializing Workspace..." />;
  }

  if (!session) {
    router.push("/login");
    return null;
  }

  const activeRegs =
    myRegs?.filter((reg) =>
      reg.hackathon.endDate
        ? new Date(
            new Date(reg.hackathon.endDate).getTime() + 12 * 60 * 60 * 1000,
          ) >= new Date()
        : true,
    ) || [];

  return (
    <div className="relative min-h-screen bg-gradient-to-b from-[var(--bg-secondary)] via-[var(--bg-tertiary)] to-[var(--bg-primary)] text-text-muted font-sans selection:bg-accent/30 overflow-x-hidden">
      {/* Ambient Background Effects */}
      <div className="fixed top-0 left-0 w-full h-full pointer-events-none overflow-hidden">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-sm bg-emerald-600/5 blur-[150px] animate-pulse" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] rounded-sm bg-purple-600/5 blur-[150px] animate-pulse delay-1000" />
        <div className="absolute top-[40%] right-[10%] w-[30%] h-[30%] rounded-sm bg-indigo-600/5 blur-[120px] animate-pulse delay-2000" />
      </div>

      <main className="relative z-10 max-w-5xl mx-auto px-6 py-24 min-h-screen">
        {/* Header Link */}
        <div className="w-full flex justify-between items-center mb-12 group">
          <Link
            href="/dashboard"
            className="text-text-muted hover:text-accent transition-all duration-300 font-mono text-xs tracking-widest uppercase flex items-center gap-2 group-hover:pl-2"
          >
            <span className="text-lg transition-transform duration-300 group-hover:-translate-x-1">
              ←
            </span>
            <span className="bg-gradient-to-r from-gray-400 to-white bg-clip-text text-transparent group-hover:from-white group-hover:to-emerald-300 transition-all">
              Central Gateway
            </span>
          </Link>
        </div>

        <div className="w-full space-y-12">
          {/* Welcome Header */}
          <div className="space-y-6">
            <div className="inline-block px-5 py-2 border border-accent/20 rounded-sm bg-accent/5 mb-2">
              <p className="text-[10px] font-mono text-accent uppercase tracking-[0.5em] font-black flex items-center gap-2">
                <span className="w-1.5 h-1.5 bg-accent rounded-sm animate-pulse" />
                Project Initialization
              </p>
            </div>

            <h1 className="text-5xl lg:text-7xl font-black text-[var(--text-primary)] uppercase tracking-tighter leading-[0.85]">
              Submission
              <br />
              <span className="text-accent italic">Terminal</span>
            </h1>
          </div>

          {!myRegs || myRegs.length === 0 ? (
            <LiquidGlass className="p-12 text-center border-orange-500/20 transition-all duration-500 hover:border-orange-400/30 hover:bg-orange-500/5">
              <h3 className="text-2xl font-bold text-[var(--text-primary)] mb-4 animate-in fade-in slide-in-from-bottom-4">
                No Active Registrations
              </h3>
              <p className="text-text-muted font-mono mb-8 max-w-md mx-auto">
                You must register for a hackathon before you can form a team or
                submit a project.
              </p>
              <Link
                href="/hackathons"
                className="px-8 py-4 bg-white/5 border border-[var(--border-subtle)] text-[var(--text-primary)] font-bold rounded-none hover:bg-white/10 hover:border-white/20 hover:shadow-[0_0_20px_rgba(255,255,255,0.1)] transition-all duration-300"
              >
                Browse Hackathons
              </Link>
            </LiquidGlass>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
              {/* LEFT ALCOVE - CONTEXT / TEAM */}
              <div className="lg:col-span-4 space-y-8">
                <LiquidGlass className="p-6">
                  <div className="space-y-2 mb-6">
                    <label className="text-[10px] font-mono text-text-muted uppercase tracking-widest font-bold ml-1">
                      Context: Event
                    </label>
                    <select
                      className="w-full bg-[var(--bg-primary)]/50 border border-[var(--border-subtle)] rounded-none px-4 py-3 text-[var(--text-primary)] focus:outline-none focus:border-accent/50 transition-colors"
                      value={selectedHackathonId}
                      onChange={(e) => {
                        setSelectedHackathonId(e.target.value);
                        setError("");
                        setSuccessMessage("");
                        setProjectSubmitted(false);
                      }}
                    >
                      <option value="" disabled>
                        Select Hackathon...
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
                      <h3 className="text-sm font-bold text-accent uppercase tracking-widest border-b border-[var(--border-subtle)] pb-2">
                        Active Squad
                      </h3>
                      <div className="p-4 bg-accent/5 border border-accent/20 rounded-none">
                        <p className="text-[var(--text-primary)] font-black text-xl tracking-tight mb-4">
                          {currentReg.team.name}
                        </p>

                        <div className="space-y-2">
                          <p className="text-[10px] text-text-muted font-mono uppercase tracking-widest">
                            Team ID (For invites)
                          </p>
                          <div className="p-2 bg-[var(--bg-primary)]/50 border border-[var(--border-subtle)] rounded font-mono text-xs text-accent text-center select-all">
                            {currentReg.team.id}
                          </div>
                        </div>

                        <div className="mt-6 pt-4 border-t border-[var(--border-subtle)]">
                          <p className="text-[10px] text-text-muted font-mono uppercase tracking-widest mb-2">
                            Members ({currentReg.team.currentMembers}/
                            {currentReg.team.maxMembers})
                          </p>
                        </div>

                        {currentReg.team.captainId === session?.user?.id ? (
                          <p className="text-xs text-accent font-mono mt-4">
                            You are the Captain
                          </p>
                        ) : (
                          <button
                            onClick={() =>
                              leaveTeam.mutate({
                                hackathonId: selectedHackathonId,
                              })
                            }
                            disabled={leaveTeam.isPending}
                            className="w-full mt-6 py-2 border border-red-500/20 text-red-500 text-xs font-mono uppercase tracking-widest rounded-none hover:bg-red-500/10 transition-colors"
                          >
                            {leaveTeam.isPending ? "Leaving..." : "Leave Team"}
                          </button>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-6">
                      <h3 className="text-sm font-bold text-gray-300 uppercase tracking-widest border-b border-[var(--border-subtle)] pb-2">
                        Squad Formation
                      </h3>
                      <p className="text-xs font-mono text-text-muted">
                        You are currently operating SOLO. Create or join a team
                        to link your profiles for the final submission.
                      </p>

                      <div className="pt-2 space-y-3">
                        <input
                          type="text"
                          placeholder="Awesome Team Name"
                          value={teamName}
                          onChange={(e) => setTeamName(e.target.value)}
                          className="w-full px-4 py-3 bg-[var(--bg-primary)]/40 border border-[var(--border-subtle)] rounded-none text-[var(--text-primary)] text-sm font-mono placeholder:text-gray-600 focus:border-accent/50 focus:outline-none transition-colors"
                        />
                        <button
                          onClick={() => {
                            if (teamName.trim().length === 0) {
                              setError("Team name is required");
                              return;
                            }
                            createTeam.mutate({
                              hackathonId: selectedHackathonId,
                              name: teamName,
                            });
                          }}
                          disabled={createTeam.isPending}
                          className="w-full py-3 bg-white/5 border border-[var(--border-subtle)] text-[var(--text-primary)] font-bold text-xs uppercase tracking-widest rounded-none hover:bg-white/10 transition-all font-mono"
                        >
                          {createTeam.isPending
                            ? "Deploying..."
                            : "Create Team"}
                        </button>
                      </div>

                      <div className="flex items-center gap-4 py-2">
                        <div className="flex-1 h-px bg-white/10"></div>
                        <span className="text-[10px] font-mono text-gray-600 uppercase">
                          OR
                        </span>
                        <div className="flex-1 h-px bg-white/10"></div>
                      </div>

                      <div className="space-y-3">
                        <input
                          type="text"
                          placeholder="Paste Invite ID..."
                          value={joinTeamId}
                          onChange={(e) => setJoinTeamId(e.target.value)}
                          className="w-full px-4 py-3 bg-[var(--bg-primary)]/40 border border-[var(--border-subtle)] rounded-none text-[var(--text-primary)] text-sm font-mono placeholder:text-gray-600 focus:border-accent/50 focus:outline-none transition-colors"
                        />
                        <button
                          onClick={() =>
                            joinTeam.mutate({
                              hackathonId: selectedHackathonId,
                              teamId: joinTeamId,
                            })
                          }
                          disabled={
                            joinTeam.isPending || joinTeamId.trim().length === 0
                          }
                          className="w-full py-3 bg-white/5 text-[var(--text-muted)] text-xs uppercase tracking-widest rounded-none hover:bg-white/10 hover:text-[var(--text-primary)] transition-all font-mono"
                        >
                          {joinTeam.isPending ? "Syncing..." : "Join Team"}
                        </button>
                      </div>
                    </div>
                  )}
                </LiquidGlass>
              </div>

              {/* RIGHT ALCOVE - PROJECT SUBMISSION */}
              <div className="lg:col-span-8 flex flex-col">
                <LiquidGlass className="p-8 md:p-12 relative overflow-hidden flex-1 border-t-2 border-accent/30 transition-all duration-500 hover:border-accent/50 hover:shadow-[inset_0_0_50px_rgba(16,185,129,0.05)]">
                  <div className="absolute top-0 right-0 p-8 opacity-5">
                    <svg
                      className="w-48 h-48 text-accent"
                      viewBox="0 0 24 24"
                      fill="currentColor"
                    >
                      <path d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96zM14 13v4h-4v-4H7l5-5 5 5h-3z" />
                    </svg>
                  </div>

                  <h2 className="text-3xl font-black text-[var(--text-primary)] uppercase tracking-tight mb-2 relative z-10">
                    Project Repository
                  </h2>
                  <p className="text-sm font-mono text-text-muted mb-10 relative z-10">
                    Finalize your hackathon submission. Only the core properties
                    are required. If you are in a team, only the{" "}
                    <span className="text-accent font-bold">Captain</span> can
                    deploy the final record.
                  </p>

                  {error && (
                    <div className="p-4 mb-8 bg-red-500/10 border border-red-500/20 rounded-none relative z-10">
                      <p className="text-red-400 font-mono text-sm">{error}</p>
                    </div>
                  )}

                  {successMessage && (
                    <div className="p-6 mb-8 bg-accent/10 border border-accent/20 rounded-none relative z-10 flex items-center justify-between">
                      <p className="text-accent font-mono text-sm font-bold flex items-center gap-3">
                        <span className="w-2 h-2 rounded-sm bg-accent animate-pulse" />
                        {successMessage}
                      </p>
                      <Link
                        href="/dashboard"
                        className="px-4 py-2 bg-accent/20 text-accent text-xs rounded hover:bg-accent/30 transition-colors uppercase tracking-widest font-mono"
                      >
                        Return
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
                      });
                    }}
                    className="space-y-8 relative z-10"
                  >
                    {/* Name & Desc */}
                    <div className="space-y-4">
                      <div>
                        <label className="block text-xs uppercase tracking-[0.15em] font-bold text-text-muted mb-2 font-mono">
                          Code Name <span className="text-accent">*</span>
                        </label>
                        <input
                          type="text"
                          required
                          value={projectName}
                          onChange={(e) => setProjectName(e.target.value)}
                          placeholder="Project Apollo"
                          className="w-full px-5 py-4 bg-[var(--bg-primary)]/40 border border-[var(--border-subtle)] rounded-none text-[var(--text-primary)] font-mono placeholder:text-gray-600 focus:border-accent/50 focus:outline-none transition-all duration-300 focus:shadow-[4px_4px_0_0_var(--accent)] hover:border-white/20 group"
                        />
                      </div>
                      <div>
                        <label className="block text-xs uppercase tracking-[0.15em] font-bold text-text-muted mb-2 font-mono">
                          Mission Briefing{" "}
                          <span className="text-accent">*</span>
                        </label>
                        <textarea
                          required
                          value={projectDesc}
                          onChange={(e) => setProjectDesc(e.target.value)}
                          placeholder="Explain the problem you solved and how you built it..."
                          rows={5}
                          className="w-full px-5 py-4 bg-[var(--bg-primary)]/40 border border-[var(--border-subtle)] rounded-none text-[var(--text-primary)] font-mono placeholder:text-gray-600 focus:border-accent/50 focus:outline-none transition-colors resize-none"
                        />
                      </div>
                    </div>

                    {/* Links */}
                    <div className="p-6 border border-[var(--border-subtle)] rounded-none bg-white/[0.02]">
                      <h3 className="text-sm font-bold text-[var(--text-primary)] uppercase tracking-widest mb-6 flex items-center gap-3">
                        <span className="w-1.5 h-1.5 bg-text-muted rounded-sm"></span>
                        External Vectors
                      </h3>

                      <div className="space-y-4">
                        <div>
                          <label className="block text-xs uppercase tracking-[0.15em] font-bold text-text-muted mb-2 font-mono">
                            Repository (GitHub)
                          </label>
                          <input
                            type="url"
                            value={githubUrl}
                            onChange={(e) => setGithubUrl(e.target.value)}
                            placeholder="https://github.com/..."
                            className="w-full px-4 py-3 bg-[var(--bg-primary)]/60 border border-[var(--border-subtle)] rounded-none text-gray-300 text-sm font-mono placeholder:text-gray-700 focus:border-accent/30 focus:outline-none transition-colors"
                          />
                        </div>
                        <div>
                          <label className="block text-xs uppercase tracking-[0.15em] font-bold text-text-muted mb-2 font-mono">
                            Video Demo (YouTube)
                          </label>
                          <input
                            type="url"
                            value={videoUrl}
                            onChange={(e) => setVideoUrl(e.target.value)}
                            placeholder="https://youtube.com/..."
                            className="w-full px-4 py-3 bg-[var(--bg-primary)]/60 border border-[var(--border-subtle)] rounded-none text-gray-300 text-sm font-mono placeholder:text-gray-700 focus:border-accent/30 focus:outline-none transition-colors"
                          />
                        </div>
                        <div>
                          <label className="block text-xs uppercase tracking-[0.15em] font-bold text-text-muted mb-2 font-mono">
                            Live Demo (Vercel, etc)
                          </label>
                          <input
                            type="url"
                            value={demoUrl}
                            onChange={(e) => setDemoUrl(e.target.value)}
                            placeholder="https://..."
                            className="w-full px-4 py-3 bg-[var(--bg-primary)]/60 border border-[var(--border-subtle)] rounded-none text-gray-300 text-sm font-mono placeholder:text-gray-700 focus:border-accent/30 focus:outline-none transition-colors"
                          />
                        </div>
                      </div>
                    </div>

                    <div className="pt-6 border-t border-[var(--border-subtle)] flex items-center justify-between">
                      <p className="text-xs font-mono text-text-muted">
                        {hasSubmitted
                          ? "Project record exists. Resubmitting will overwrite it."
                          : "Ready for deployment."}
                      </p>
                      <button
                        type="submit"
                        disabled={submitProject.isPending}
                        className={`px-10 py-5 font-black text-lg uppercase tracking-[0.2em] transition-all flex items-center gap-3 rounded-none shadow-[0_0_30px_rgba(16,185,129,0.2)] hover:shadow-[0_0_50px_rgba(16,185,129,0.4)] hover:scale-[1.02] active:scale-[0.98] ${
                          hasSubmitted
                            ? "bg-transparent border-2 border-accent text-accent hover:bg-accent hover:text-black"
                            : "bg-accent text-black hover:bg-white border-2 border-transparent"
                        }`}
                      >
                        {submitProject.isPending
                          ? "UPLOADING..."
                          : hasSubmitted
                            ? "UPDATE RECORD"
                            : "DEPLOY RECORD"}
                        {!submitProject.isPending && (
                          <svg
                            className="w-5 h-5"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
                            />
                          </svg>
                        )}
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
    <Suspense fallback={<LoadingScreen message="Initializing Workspace..." />}>
      <SubmitPortalContent />
    </Suspense>
  );
}
