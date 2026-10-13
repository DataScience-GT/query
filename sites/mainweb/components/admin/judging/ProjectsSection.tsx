"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { trpcErrorMessage } from "@/lib/trpc-error";
import { READ_ONLY_TITLE, useReadOnly } from "@/lib/use-portal-context";
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
  sectionRule,
  sectionTitle,
  status,
  textLink,
} from "@/components/portal/ui";
import {
  ErrorLine,
  NoticeLine,
  TypedConfirm,
  plural,
  shortTime,
  typedMatches,
  useRefreshJudging,
} from "@/components/admin/judging/shared";
import type { Overview } from "@/components/admin/judging/shared";
import { EntriesList } from "@/components/admin/judging/EntriesList";

// The API refuses anything larger; checking here saves uploading it first.
const MAX_BYTES = 10 * 1024 * 1024;

const megabytes = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;
const size = (bytes: number) =>
  bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : megabytes(bytes);

export function ProjectsSection({
  hackathonId,
  overview,
}: {
  hackathonId: string;
  overview: Overview;
}) {
  return (
    <div className="space-y-12">
      <div>
        <h2 className={sectionTitle}>Projects</h2>
        <p className={`mt-1 ${meta}`}>
          Devpost submissions and portal submissions both land here. Judges
          only see live projects.
        </p>
      </div>
      <DevpostImport hackathonId={hackathonId} overview={overview} />
      <PromoteSubmissions hackathonId={hackathonId} />
      <section className={sectionRule}>
        <EntriesList hackathonId={hackathonId} />
      </section>
    </div>
  );
}

type Mode = "automatic" | "replace";

function DevpostImport({
  hackathonId,
  overview,
}: {
  hackathonId: string;
  overview: Overview;
}) {
  const readOnly = useReadOnly();
  const refresh = useRefreshJudging();
  const [file, setFile] = useState<{
    name: string;
    bytes: number;
    text: string;
  } | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  // Remounts the file input so a finished import clears the picker.
  const [pickerKey, setPickerKey] = useState(0);
  const [mode, setMode] = useState<Mode>("automatic");
  const [typed, setTyped] = useState("");

  const importDevpost = trpc.judging.admin.importDevpost.useMutation({
    onSuccess: () => {
      void refresh();
      setFile(null);
      setTyped("");
      setPickerKey((key) => key + 1);
    },
  });

  const { config, counts, schedule, hackathon } = overview;
  const locked = !!config.inventoryLockedAt;
  const scored = counts.evaluations.total + counts.evaluations.drafts > 0;
  // Mirrors the API's rules so the form says what will happen before the
  // upload, not after.
  const replaceBlocked = config.claimsStartedAt
    ? "Hackers have started claiming projects, so the list can only grow."
    : schedule
      ? "A schedule is saved against these projects. Drop it on Schedule first."
      : scored
        ? "Judges have scored these projects. Drop evaluations from the danger zone first."
        : null;
  const automaticAdds = locked || !!config.claimsStartedAt || !!schedule || scored;
  const needsName = mode === "replace" && locked;

  const pick = (picked: File | undefined) => {
    setFileError(null);
    importDevpost.reset();
    setFile(null);
    if (!picked) return;
    if (picked.size > MAX_BYTES) {
      setFileError(
        `${picked.name} is ${megabytes(picked.size)}; the limit is 10 MB. Export the submissions CSV on its own.`,
      );
      return;
    }
    picked.text().then(
      (text) => setFile({ name: picked.name, bytes: picked.size, text }),
      () =>
        setFileError(
          "Could not read that file. Export it again from Devpost and pick the new copy.",
        ),
    );
  };

  const submit = () => {
    if (!file) return;
    // Automatic replaces too while nothing depends on the list. A typed
    // name already stands in for this question.
    const replaces = mode === "replace" || !automaticAdds;
    if (
      replaces &&
      !needsName &&
      counts.entries.devpost > 0 &&
      !window.confirm(
        `Replace deletes the ${plural(counts.entries.devpost, "Devpost project")} in judging and loads ${file.name} instead. Portal submissions stay. Continue?`,
      )
    ) {
      return;
    }
    importDevpost.mutate({
      hackathonId,
      csv: file.text,
      mode,
      confirmation: needsName ? typed : undefined,
    });
  };

  const disabled =
    readOnly ||
    !file ||
    importDevpost.isPending ||
    (mode === "replace" && !!replaceBlocked) ||
    (needsName && !typedMatches(typed, hackathon.name));

  const modes: { id: Mode; label: string; hint: string }[] = [
    {
      id: "automatic",
      label: "Automatic",
      hint: automaticAdds
        ? "Adds projects not already here. The list is in use, so nothing is removed."
        : "Replaces the Devpost projects with this file. Once room links, claims, a schedule or scores depend on the list, it only adds.",
    },
    {
      id: "replace",
      label: "Replace",
      hint:
        replaceBlocked ??
        (locked
          ? "Deletes every Devpost project and loads this file. Room QR links are out, so every link is retired and guest judges are signed out."
          : "Deletes every Devpost project and loads this file. Portal submissions stay."),
    },
  ];

  const result = importDevpost.data;
  const tallies: [string, number][] = result
    ? [
        ["Imported", result.imported],
        ["Already here", result.skipped],
        ...(result.mode === "replace"
          ? [["Removed", result.removed] as [string, number]]
          : []),
        ["Duplicate rows merged", result.collapsedRows],
        ["Drafts left out", result.drafts],
        ["New challenges", result.newChallenges],
        ["Rejected", result.rejected.length],
      ]
    : [];

  return (
    <section className={sectionRule}>
      <h3 className={itemTitle}>Import from Devpost</h3>
      <p className={`mt-1 max-w-2xl ${meta}`}>
        Upload the submissions CSV exported from Devpost. Only submitted
        projects are imported; drafts are counted and left out.
      </p>
      {config.inventoryLockedAt && (
        <p className={`mt-3 ${meta}`}>
          <span className={status("warning")}>Project list locked</span>{" "}
          since {shortTime(config.inventoryLockedAt)}, when the first room link
          or claim went out.
        </p>
      )}

      <div className="mt-6 max-w-2xl space-y-6">
        <div>
          <label htmlFor="devpost-file" className={fieldLabel}>
            Devpost CSV
          </label>
          <input
            key={pickerKey}
            id="devpost-file"
            type="file"
            accept=".csv,text/csv"
            disabled={readOnly}
            onChange={(e) => pick(e.target.files?.[0])}
            className={`${input} file:mr-4 file:rounded-[var(--radius-sm)] file:border-0 file:bg-[var(--bg-secondary)] file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-[var(--text-primary)]`}
          />
          {file && (
            <p className={`mt-1.5 ${meta}`}>
              {file.name} · {size(file.bytes)}
            </p>
          )}
        </div>
        {fileError && <ErrorLine>{fileError}</ErrorLine>}

        <fieldset>
          <legend className={`${label} mb-2`}>Mode</legend>
          <div className="grid gap-x-6 sm:grid-cols-2">
            {modes.map((option) => (
              <label
                key={option.id}
                className={`flex cursor-pointer gap-3 border-t-2 py-3 transition-colors ${
                  mode === option.id
                    ? "border-accent"
                    : "border-[var(--border-subtle)] hover:border-[var(--border-hover)]"
                }`}
              >
                <input
                  type="radio"
                  name="devpost-mode"
                  value={option.id}
                  checked={mode === option.id}
                  onChange={() => {
                    setMode(option.id);
                    importDevpost.reset();
                  }}
                  className="mt-1 accent-[var(--accent)]"
                />
                <span>
                  <span
                    className={`block text-[15px] ${
                      mode === option.id
                        ? "font-semibold text-[var(--text-primary)]"
                        : "text-[var(--text-muted)]"
                    }`}
                  >
                    {option.label}
                  </span>
                  <span className={`mt-0.5 block ${meta}`}>{option.hint}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        {needsName && !replaceBlocked && (
          <TypedConfirm
            id="devpost-confirm"
            expected={hackathon.name}
            value={typed}
            onChange={setTyped}
            what="Every room QR link is retired and every guest judge is signed out. Print the new codes from Rooms afterwards."
          />
        )}

        <button
          type="button"
          onClick={submit}
          disabled={disabled}
          title={readOnly ? READ_ONLY_TITLE : undefined}
          className={mode === "replace" ? btnDanger : btnPrimary}
        >
          {importDevpost.isPending
            ? "Importing…"
            : mode === "replace"
              ? "Replace Devpost projects"
              : "Import projects"}
        </button>

        {importDevpost.error && (
          <ErrorLine>
            {trpcErrorMessage(importDevpost.error, "The import failed.")}
          </ErrorLine>
        )}
      </div>

      {result && (
        <div className="mt-8 max-w-3xl">
          <NoticeLine>
            {result.mode === "replace"
              ? `Replaced the Devpost projects: ${result.removed} out, ${result.imported} in.`
              : `Added ${plural(result.imported, "project")}. ${result.skipped} were already here.`}
          </NoticeLine>
          <dl className="mt-5 grid grid-cols-2 sm:grid-cols-3 gap-x-6">
            {tallies.map(([name, value]) => (
              <div
                key={name}
                className="border-t border-[var(--border-subtle)] py-3"
              >
                <dt className={meta}>{name}</dt>
                <dd className="mt-1 text-[20px] font-semibold tabular-nums text-[var(--text-primary)]">
                  {value}
                </dd>
              </div>
            ))}
          </dl>
          {result.linksRevoked > 0 && (
            <p className={`mt-4 ${body}`}>
              {plural(result.linksRevoked, "room link")} retired and{" "}
              {plural(result.guestsSignedOut, "guest judge")} signed out.{" "}
              <a href="#rooms" className={textLink}>
                Generate new QR links
              </a>
            </p>
          )}
          {result.rejected.length > 0 && (
            <div className="mt-6">
              <h4 className={label}>Rejected rows</h4>
              <p className={`mt-1 ${meta}`}>
                Fix these on Devpost, export again and import in automatic
                mode; projects already here are skipped.
              </p>
              <ul className="mt-3 max-h-80 overflow-y-auto border-t border-[var(--border-subtle)]">
                {result.rejected.map((row, index) => (
                  <li
                    key={`${row.project}-${index}`}
                    className="border-b border-[var(--border-subtle)] py-2.5"
                  >
                    <p className="text-[15px] text-[var(--text-primary)] break-words">
                      {row.project}
                    </p>
                    <p className={`mt-0.5 ${meta}`}>{row.reason}</p>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <p className={`mt-4 ${meta}`}>
            File {result.fileTag} · {size(result.bytes)}
          </p>
        </div>
      )}
    </section>
  );
}

function PromoteSubmissions({ hackathonId }: { hackathonId: string }) {
  const readOnly = useReadOnly();
  const refresh = useRefreshJudging();
  const promote = trpc.judging.admin.promoteSubmissions.useMutation({
    onSuccess: () => void refresh(),
  });
  const result = promote.data;

  return (
    <section className={sectionRule}>
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div className="max-w-2xl">
          <h3 className={itemTitle}>Portal submissions</h3>
          <p className={`mt-1 ${meta}`}>
            Copies projects teams submitted through the portal into judging,
            with their members already linked. Run it again as late
            submissions land; projects already here are skipped.
          </p>
        </div>
        <button
          type="button"
          onClick={() => promote.mutate({ hackathonId })}
          disabled={readOnly || promote.isPending}
          title={readOnly ? READ_ONLY_TITLE : undefined}
          className={`${btnSecondary} shrink-0`}
        >
          {promote.isPending ? "Promoting…" : "Promote submissions"}
        </button>
      </div>
      <div className="mt-4 max-w-2xl">
        {promote.error && (
          <ErrorLine>
            {trpcErrorMessage(promote.error, "Could not promote submissions.")}
          </ErrorLine>
        )}
        {result && (
          <NoticeLine>
            {result.promoted === 0
              ? `No new submissions. ${plural(result.alreadyPromoted, "project")} already in judging.`
              : `Promoted ${plural(result.promoted, "project")}; ${result.alreadyPromoted} were already in judging.`}
            {result.newChallenges > 0 &&
              ` ${plural(result.newChallenges, "new challenge")} created from their tracks.`}
            {result.unlinkedMembers > 0 &&
              ` ${plural(result.unlinkedMembers, "teammate")} already on another project, so added without a link.`}
          </NoticeLine>
        )}
      </div>
    </section>
  );
}
