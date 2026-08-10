"use client";

import React, { useState, useEffect } from "react";
import { Zap } from "lucide-react";
import { useSession } from "next-auth/react";
import { trpc } from "@/lib/trpc";
import { trpcErrorMessage } from "@/lib/trpc-error";
import { usePortalContext } from "@/lib/use-portal-context";
import { useRouter } from "next/navigation";
import { LiquidGlass } from "@/components/portal/LiquidGlass";
import { SetupWizard } from "@/components/admin/setup/SetupWizard";
import { CreateHackathonStep } from "@/components/admin/setup/CreateHackathonStep";

export default function AdminSetupPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const [mounted, setMounted] = useState(false);

  // Step state
  const [activeStep, setActiveStep] = useState(1);
  const [hackathonName, setHackathonName] = useState("");
  const [hackathonTracks, setHackathonTracks] = useState("");
  const [hackathonChallenges, setHackathonChallenges] = useState("");
  // Real dates. These used to be `now` and `now + 24h`, and the submission
  // window is derived from the hacking start time — so every deadline the
  // product enforces was anchored to whenever the button happened to be pressed.
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [hackingStartTime, setHackingStartTime] = useState("");
  const [selectedHackathonId, setSelectedHackathonId] = useState<string | null>(
    null,
  );

  // Status tracking
  const [projectsSynced, setProjectsSynced] = useState(false);
  const [judgesAssigned, setJudgesAssigned] = useState(false);

  // Admin check
  const { data: portalContext } = usePortalContext();

  const { data: hackathons, refetch: refetchHackathons } =
    trpc.hackathon.list.useQuery(
      {},
      {
        enabled: !!session && !!portalContext?.isAdmin,
      },
    );

  // Mutations
  const createHackathon = trpc.hackathon.create.useMutation({
    onSuccess: (data) => {
      setSelectedHackathonId(data?.id ?? null);
      setActiveStep(2);
      refetchHackathons();
    },
  });

  const promoteSubmissions = trpc.judge.promoteSubmissions.useMutation({
    onSuccess: (data) => {
      // Nothing to judge means the step is not done, however cleanly the
      // request succeeded — moving on would hand the assigner an empty list.
      if (data.total === 0) return;
      setProjectsSynced(true);
      setActiveStep(3);
    },
  });

  const assignJudges = trpc.judge.assignJudgesToProjects.useMutation({
    onSuccess: () => {
      setJudgesAssigned(true);
    },
  });

  useEffect(() => setMounted(true), []);

  if (!mounted) return null;

  const steps = [
    { num: 1, label: "Create Hackathon", done: !!selectedHackathonId },
    { num: 2, label: "Sync Submissions", done: projectsSynced },
    { num: 3, label: "Assign Judges", done: judgesAssigned },
  ];

  return (
    <>
      <div className="relative z-10 max-w-4xl mx-auto">
        <div className="mb-12">
          <p className="text-[10px] font-mono text-accent/60 uppercase tracking-[0.2em] mb-2 flex items-center gap-2">
            <Zap className="w-3 h-3" /> Hackathon Hub
          </p>
          <h1 className="text-4xl font-black text-[var(--text-primary)] uppercase tracking-tighter mb-1">
            Judging <span className="text-accent italic">Setup</span>
          </h1>
          <p className="text-sm font-mono text-text-muted uppercase tracking-widest">
            Everything comes from the portal — nothing to upload
          </p>
        </div>

        {/* Progress Steps */}
        <SetupWizard
          activeStep={activeStep}
          setActiveStep={setActiveStep}
          steps={steps}
        />

        {/* Step 1: Create Hackathon */}
        {activeStep === 1 && (
          <CreateHackathonStep
            hackathons={hackathons || []}
            selectedHackathonId={selectedHackathonId}
            setSelectedHackathonId={setSelectedHackathonId}
            setActiveStep={setActiveStep}
            hackathonName={hackathonName}
            setHackathonName={setHackathonName}
            hackathonTracks={hackathonTracks}
            setHackathonTracks={setHackathonTracks}
            hackathonChallenges={hackathonChallenges}
            setHackathonChallenges={setHackathonChallenges}
            startDate={startDate}
            setStartDate={setStartDate}
            endDate={endDate}
            setEndDate={setEndDate}
            hackingStartTime={hackingStartTime}
            setHackingStartTime={setHackingStartTime}
            createHackathonPending={createHackathon.isPending}
            createHackathonError={
              createHackathon.error
                ? trpcErrorMessage(
                    createHackathon.error,
                    "Could not create the hackathon.",
                  )
                : null
            }
            onCreateHackathon={() => {
              if (!hackathonName.trim()) return;

              // Parse tracks and challenges
              const parsedTracks = hackathonTracks
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean);
              const parsedChallenges = hackathonChallenges
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean);

              if (!startDate || !endDate) return;

              createHackathon.mutate({
                name: hackathonName.trim(),
                startDate: new Date(startDate),
                endDate: new Date(endDate),
                hackingStartTime: hackingStartTime
                  ? new Date(hackingStartTime)
                  : undefined,
                tracks: parsedTracks.length > 0 ? parsedTracks : undefined,
                challenges:
                  parsedChallenges.length > 0 ? parsedChallenges : undefined,
              });
            }}
          />
        )}

        {/* Step 2: Sync submitted projects into judging */}
        {activeStep === 2 && (
          <LiquidGlass className="rounded-none p-8">
            <h2 className="text-xl font-black text-[var(--text-primary)] uppercase tracking-tight mb-2">
              Sync Submitted Projects
            </h2>
            <p className="text-xs text-text-muted font-mono mb-8 leading-relaxed">
              Every submitted project becomes a judgeable entry with its own
              table number, carrying the tracks and challenges the team picked.
              Safe to run again as late submissions land — projects already
              synced are left alone.
            </p>

            <button
              type="button"
              onClick={() => {
                if (!selectedHackathonId) return;
                promoteSubmissions.mutate({
                  hackathonId: selectedHackathonId,
                });
              }}
              disabled={promoteSubmissions.isPending || !selectedHackathonId}
              className="w-full px-8 py-6 bg-accent/10 border-2 border-accent/40 text-[var(--text-primary)] font-black text-lg uppercase tracking-widest rounded-none hover:bg-accent/20 transition-ui disabled:opacity-30 font-mono"
            >
              {promoteSubmissions.isPending
                ? "Syncing…"
                : "Sync Submissions to Judging"}
            </button>

            {promoteSubmissions.error && (
              <div className="mt-6 p-4 bg-red-500/10 border border-red-500/20 rounded-none">
                <p className="text-red-400 text-xs font-mono">
                  {trpcErrorMessage(
                    promoteSubmissions.error,
                    "Could not sync submissions.",
                  )}
                </p>
              </div>
            )}

            {promoteSubmissions.data &&
              (promoteSubmissions.data.total === 0 ? (
                <div className="mt-6 p-4 bg-amber-500/10 border border-amber-500/20 rounded-none">
                  <p className="text-amber-300 text-xs font-mono">
                    No submitted projects yet. Teams submit from /submit — come
                    back once the deadline has passed.
                  </p>
                </div>
              ) : (
                <div className="mt-6 space-y-3">
                  <div className="p-4 bg-accent/10 border border-accent/20 rounded-none">
                    <p className="text-accent text-xs font-mono">
                      {promoteSubmissions.data.created} newly synced |{" "}
                      {promoteSubmissions.data.alreadyPresent} already in
                      judging | {promoteSubmissions.data.total} total
                    </p>
                  </div>
                  {/* Queues are a snapshot, so promotion adds late projects to
                      the queues that already exist — appending, because a
                      rebuild reorders every queue mid-judging. */}
                  {promoteSubmissions.data.queueRowsAdded > 0 && (
                    <div className="p-4 bg-accent/10 border border-accent/20 rounded-none">
                      <p className="text-accent text-xs font-mono">
                        Added to existing judge queues in{" "}
                        {promoteSubmissions.data.queueRowsAdded} slot(s). No
                        re-assign needed — nobody's current queue was reordered.
                      </p>
                    </div>
                  )}
                  {promoteSubmissions.data.queuesNeedRebuild && (
                    <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-none">
                      <p className="text-amber-300 text-xs font-mono">
                        The newly synced projects reached no judge — their
                        track is one no active judge covers. Set a judge to that
                        track, or re-run Assign Judges.
                      </p>
                    </div>
                  )}
                </div>
              ))}
          </LiquidGlass>
        )}

        {/* Step 3: Auto-Assign Judges */}
        {activeStep === 3 && (
          <LiquidGlass className="rounded-none p-8">
            <h2 className="text-xl font-black text-[var(--text-primary)] uppercase tracking-tight mb-2">
              Auto-Assign Judges to Projects
            </h2>
            <p className="text-xs text-text-muted font-mono mb-8">
              Main track judges get 3-9 projects. Special label judges get all
              matching projects (randomized).
            </p>

            <div className="mb-8 p-4 bg-white/[0.02] border border-[var(--border-subtle)] rounded-none">
              <p className="text-xs text-[var(--text-muted)] font-mono leading-relaxed">
                Judges sign themselves up at{" "}
                <span className="text-accent">/judge/register</span>. Approve
                their applications under the Judges tab of this hackathon before
                assigning — only approved judges get a queue.
              </p>
            </div>

            <button
              onClick={() => {
                if (!selectedHackathonId) return;
                assignJudges.mutate({ hackathonId: selectedHackathonId });
              }}
              disabled={assignJudges.isPending || !selectedHackathonId}
              className="w-full px-8 py-6 bg-gradient-to-r from-accent/10 to-accent/10 border-2 border-accent/40 text-[var(--text-primary)] font-black text-lg uppercase tracking-widest rounded-none hover:from-accent/20 hover:to-accent/20 transition-ui disabled:opacity-30 font-mono shadow-[0_0_30px_rgba(16,185,129,0.1)]"
            >
              {assignJudges.isPending
                ? "Assigning…"
                : "Auto-Assign All Judges"}
            </button>

            {assignJudges.error && (
              <div className="mt-6 p-4 bg-red-500/10 border border-red-500/20 rounded-none">
                <p className="text-red-400 text-xs font-mono">
                  {trpcErrorMessage(
                    assignJudges.error,
                    "Could not assign judges.",
                  )}
                </p>
                {/* The server refuses a rebuild that would disturb live or
                    completed judging, and reports how much is at stake. Only
                    once the admin has read that number is overriding offered —
                    they cannot know the count without the round trip. */}
                {assignJudges.error.data?.code === "CONFLICT" && (
                  <button
                    type="button"
                    onClick={() => {
                      if (!selectedHackathonId) return;
                      assignJudges.mutate({
                        hackathonId: selectedHackathonId,
                        force: true,
                      });
                    }}
                    disabled={assignJudges.isPending}
                    className="mt-4 px-6 py-3 bg-red-500/10 border border-red-500/40 text-red-300 font-bold text-xs uppercase tracking-widest rounded-none hover:bg-red-500/20 transition-ui font-mono disabled:opacity-40"
                  >
                    Rebuild anyway
                  </button>
                )}
              </div>
            )}

            {assignJudges.data && (
              <div className="mt-6">
                <div className="p-4 bg-accent/10 border border-accent/20 rounded-none mb-4">
                  <p className="text-accent text-sm font-mono font-bold mb-2">
                    Assigned {assignJudges.data.totalJudges} judges
                  </p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-gray-600 uppercase tracking-widest">
                        <th className="text-left py-2 px-3 font-mono">Judge</th>
                        <th className="text-left py-2 px-3 font-mono">Track</th>
                        <th className="text-left py-2 px-3 font-mono">
                          Projects
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {assignJudges.data.assignments.map((a, i) => (
                        <tr
                          key={i}
                          className="border-t border-[var(--border-subtle)]"
                        >
                          <td className="py-2 px-3 text-[var(--text-primary)]">
                            {a.judgeName || "Unknown"}
                          </td>
                          <td className="py-2 px-3 text-accent">
                            {a.track || "General"}
                          </td>
                          <td className="py-2 px-3 text-[var(--text-muted)] font-mono">
                            {a.assignedCount}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {judgesAssigned && (
              <div className="mt-8 text-center">
                <p className="text-accent text-sm font-bold mb-4">
                  Setup complete - all judges assigned.
                </p>
                <button
                  onClick={() => router.push("/admin/judging")}
                  className="px-10 py-4 bg-accent/10 border border-accent/40 text-accent font-bold text-sm uppercase tracking-widest rounded-none hover:bg-accent/20 transition-ui font-mono"
                >
                  Go to Results Dashboard
                </button>
              </div>
            )}
          </LiquidGlass>
        )}
      </div>
    </>
  );
}
