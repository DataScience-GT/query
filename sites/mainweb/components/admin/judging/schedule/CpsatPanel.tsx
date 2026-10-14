"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { trpcErrorMessage } from "@/lib/trpc-error";
import { READ_ONLY_TITLE, useReadOnly } from "@/lib/use-portal-context";
import {
  body,
  btnPrimary,
  btnSecondary,
  fieldLabel,
  input,
  itemTitle,
  label,
  meta,
  sectionRule,
  status,
} from "@/components/portal/ui";
import { ErrorLine } from "@/components/admin/judging/shared";
import type { CpsatPreview, ScheduleBoard, Timing } from "./format";
import {
  PreviewFigures,
  PreviewTimetable,
  ReducedBreaks,
} from "./SchedulePlanner";

// How long CP-SAT may search on this server, per attempt. The API takes 5
// to 60 seconds; shorter runs often end before it finds anything.
const SECONDS = [20, 45, 60];

/** A checked CP-SAT schedule and the solution text saveCpsat reads again. */
type Candidate = { result: CpsatPreview; solution: string };

/**
 * CP-SAT for the submitted timing: the way forward when the in-app solver
 * finds no schedule, and a second opinion when it does. The server runs it
 * when it has Python and OR-Tools; otherwise the organiser downloads the
 * problem, runs the script and uploads what it writes. The server checks
 * either answer before showing it, and again before saving it.
 */
export function CpsatPanel({
  hackathonId,
  rooms,
  timing,
  found,
  stale,
}: {
  hackathonId: string;
  rooms: ScheduleBoard["rooms"];
  timing: Required<Timing>;
  /** The in-app solver found a schedule for this timing. */
  found: boolean;
  /** The form has changed since `timing` was submitted. */
  stale: boolean;
}) {
  const utils = trpc.useUtils();
  const readOnly = useReadOnly();
  const [seconds, setSeconds] = useState(SECONDS[0]);
  const [download, setDownload] = useState<{
    command: string;
    hinted: boolean;
  } | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [candidate, setCandidate] = useState<Candidate | null>(null);

  const availability = trpc.judging.schedule.cpsatAvailability.useQuery({
    hackathonId,
  });
  const canRun = availability.data?.available === true;

  const solve = trpc.judging.schedule.solveCpsat.useMutation({
    onSuccess: (data) =>
      setCandidate({ result: data, solution: data.solution }),
  });
  const check = trpc.judging.schedule.previewCpsat.useMutation({
    onSuccess: (data, { solution }) => setCandidate({ result: data, solution }),
  });
  const busy = solve.isPending || check.isPending;

  // A new run or upload replaces whatever is on show.
  const startOver = () => {
    setCandidate(null);
    solve.reset();
    check.reset();
  };

  const run = () => {
    startOver();
    solve.mutate({ hackathonId, timing, seconds });
  };

  async function downloadProblem() {
    setDownloadError(null);
    setDownloading(true);
    try {
      // Fetched fresh each time: the file has to match the projects and
      // rooms as they are when the solution comes back.
      const problem = await utils.judging.schedule.cpsatProblem.fetch(
        { hackathonId, timing },
        { staleTime: 0 },
      );
      const url = URL.createObjectURL(
        new Blob([problem.contents], { type: "application/json" }),
      );
      const link = document.createElement("a");
      link.href = url;
      link.download = problem.fileName;
      link.style.visibility = "hidden";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      setDownload({ command: problem.command, hinted: problem.hinted });
    } catch (error) {
      setDownloadError(
        error instanceof Error
          ? error.message
          : "Could not download the problem.",
      );
    } finally {
      setDownloading(false);
    }
  }

  const pick = (picked: File | undefined) => {
    setFileError(null);
    if (!picked) return;
    startOver();
    picked.text().then(
      (solution) => check.mutate({ hackathonId, timing, solution }),
      () =>
        setFileError(
          "Could not read that file. Pick the solution.json the script wrote.",
        ),
    );
  };

  return (
    <section
      aria-labelledby="cpsat-title"
      className={`${sectionRule} space-y-6`}
    >
      <div>
        <h3 id="cpsat-title" className={itemTitle}>
          {found ? "Look for a better schedule" : "Try CP-SAT"}
        </h3>
        <p className={`mt-1 max-w-2xl ${body}`}>
          {found
            ? "CP-SAT searches longer than the preview and starts from its schedule, though it does not always beat it. Compare the figures and save the one you prefer."
            : "The in-app solver can miss a schedule that exists. CP-SAT searches longer, and either finds one for this timing or proves none fits."}
        </p>
      </div>

      {stale && (
        <p className={`${meta} text-[var(--warning)]`}>
          The timing changed since this preview. Preview again before running
          CP-SAT or saving its schedule.
        </p>
      )}

      {canRun && (
        <div className="flex flex-wrap items-end gap-x-4 gap-y-3">
          <div className="w-40">
            <label htmlFor="cpsat-seconds" className={fieldLabel}>
              Time limit
            </label>
            <select
              id="cpsat-seconds"
              value={seconds}
              disabled={busy}
              onChange={(e) => setSeconds(Number(e.target.value))}
              className={input}
            >
              {SECONDS.map((s) => (
                <option key={s} value={s}>
                  {s} seconds
                </option>
              ))}
            </select>
          </div>
          <button
            type="button"
            onClick={run}
            disabled={readOnly || busy || stale}
            title={readOnly ? READ_ONLY_TITLE : undefined}
            className={found || candidate ? btnSecondary : btnPrimary}
          >
            {solve.isPending ? "Solving…" : "Solve with CP-SAT"}
          </button>
        </div>
      )}

      {!availability.isPending && (
        <div className="max-w-2xl space-y-4">
          <div>
            <h4 className={label}>
              {canRun
                ? "Or run it on your own computer"
                : "Run it on your own computer"}
            </h4>
            {!canRun && (
              <p className={`mt-1 ${meta}`}>
                This server does not run CP-SAT itself. Download the problem,
                run the script, and upload the solution it writes.
              </p>
            )}
          </div>

          <div className="space-y-2">
            <button
              type="button"
              onClick={() => void downloadProblem()}
              disabled={downloading || stale}
              className={
                found || candidate || canRun ? btnSecondary : btnPrimary
              }
            >
              {downloading ? "Preparing…" : "Download problem.json"}
            </button>
            {downloadError && <ErrorLine>{downloadError}</ErrorLine>}
            {download && (
              <div className="space-y-1.5">
                <p className={meta}>
                  Put it in the root of the query repo and run:
                </p>
                <code className="block overflow-x-auto whitespace-nowrap rounded-[var(--radius-sm)] bg-[var(--bg-secondary)] px-3 py-2 text-[13px] text-[var(--text-primary)]">
                  {download.command}
                </code>
                {download.hinted && (
                  <p className={meta}>
                    CP-SAT starts from the preview&apos;s schedule.
                  </p>
                )}
              </div>
            )}
          </div>

          <div>
            <label htmlFor="cpsat-solution" className={fieldLabel}>
              Upload solution.json
            </label>
            <input
              id="cpsat-solution"
              type="file"
              accept=".json,application/json"
              disabled={readOnly || busy || stale}
              title={readOnly ? READ_ONLY_TITLE : undefined}
              onChange={(e) => {
                pick(e.target.files?.[0]);
                // So picking the same file after another run reads it again.
                e.target.value = "";
              }}
              className={`${input} file:mr-4 file:rounded-[var(--radius-sm)] file:border-0 file:bg-[var(--bg-secondary)] file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-[var(--text-primary)]`}
            />
            {fileError && <ErrorLine>{fileError}</ErrorLine>}
          </div>
        </div>
      )}

      <div aria-live="polite" className="space-y-8">
        {solve.isPending ? (
          <p className={body} role="status">
            CP-SAT is searching. It can take up to {seconds} seconds and a
            little setup, or twice that if no schedule keeps the full break
            between buildings.
          </p>
        ) : check.isPending ? (
          <p className={body} role="status">
            Checking the solution against this edition.
          </p>
        ) : solve.error ? (
          <ErrorLine>
            {trpcErrorMessage(solve.error, "CP-SAT could not run.")}
          </ErrorLine>
        ) : check.error ? (
          <ErrorLine>
            {trpcErrorMessage(check.error, "Could not check that solution.")}
          </ErrorLine>
        ) : candidate ? (
          <CpsatResult
            key={candidate.result.candidateKey}
            hackathonId={hackathonId}
            rooms={rooms}
            timing={timing}
            found={found}
            stale={stale}
            candidate={candidate}
          />
        ) : null}
      </div>
    </section>
  );
}

/** One CP-SAT schedule, shown like the preview, and saving it. */
function CpsatResult({
  hackathonId,
  rooms,
  timing,
  found,
  stale,
  candidate: { result, solution },
}: {
  hackathonId: string;
  rooms: ScheduleBoard["rooms"];
  timing: Required<Timing>;
  found: boolean;
  stale: boolean;
  candidate: Candidate;
}) {
  const utils = trpc.useUtils();
  const readOnly = useReadOnly();
  const [acknowledged, setAcknowledged] = useState(false);

  const save = trpc.judging.schedule.saveCpsat.useMutation({
    onSuccess: async () => {
      void utils.judging.admin.invalidate();
      await utils.judging.schedule.get.invalidate({ hackathonId });
    },
    onError: (error) => {
      // Another organiser saved one first; the board replaces this form.
      if (error.data?.code === "CONFLICT") {
        void utils.judging.schedule.get.invalidate({ hackathonId });
      }
    },
  });

  const optimal = result.solverStatus === "optimal";

  return (
    <>
      <p className={meta}>
        <span className={status(optimal ? "success" : "neutral")}>
          {optimal ? "Proved optimal" : "Best found in the time limit"}
        </span>{" "}
        {optimal
          ? "CP-SAT showed no schedule for this timing does better."
          : "A longer run might find a better one."}
      </p>

      <PreviewFigures result={result} timing={timing} />

      {result.relaxed && (
        <ReducedBreaks
          result={result}
          timing={timing}
          acknowledged={acknowledged}
          onAcknowledge={setAcknowledged}
        />
      )}

      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <button
            type="button"
            onClick={() =>
              save.mutate({
                hackathonId,
                timing,
                solution,
                candidateKey: result.candidateKey,
                acknowledgeReducedBreaks: acknowledged,
              })
            }
            disabled={
              readOnly ||
              save.isPending ||
              stale ||
              (result.relaxed && !acknowledged)
            }
            title={readOnly ? READ_ONLY_TITLE : undefined}
            className={stale ? btnSecondary : btnPrimary}
          >
            {save.isPending ? "Saving…" : "Save CP-SAT schedule"}
          </button>
          <p className={meta}>
            {found
              ? "Books this schedule instead of the preview's."
              : "Books every appointment below."}{" "}
            Until the first result is in you can drop it and start over.
          </p>
        </div>
        {save.error && (
          <ErrorLine>
            {trpcErrorMessage(save.error, "Could not save the schedule.")}
          </ErrorLine>
        )}
      </div>

      <PreviewTimetable
        rooms={rooms}
        result={result}
        windowStart={timing.windowStart}
      />
    </>
  );
}
