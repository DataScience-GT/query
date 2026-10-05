"use client";

import { useRef, useState } from "react";
import { FileText, Upload, Trash2, Eye, EyeOff, ExternalLink } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { MAX_RESUME_BYTES, decodeStoredFileName } from "@/lib/resume-file";
import { ResumePreview } from "@/components/portal/ResumePreview";
import {
  itemTitle,
  meta,
  sectionRule,
  object,
  btnSecondary,
  btnDanger,
} from "@/components/portal/ui";

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function ResumeSection() {
  const { data: resume, isLoading } = trpc.resume.me.useQuery();
  const utils = trpc.useUtils();
  const inputRef = useRef<HTMLInputElement>(null);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [preview, setPreview] = useState(false);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // Reset first so picking the same file twice still fires a change.
    e.target.value = "";
    if (!file) return;

    setError(null);
    setNotice(null);

    if (file.type !== "application/pdf") {
      setError("Resumes must be a PDF. Save it as a PDF and try again.");
      return;
    }
    if (file.size > MAX_RESUME_BYTES) {
      setError(
        `That file is ${formatSize(file.size)}. The limit is ${formatSize(MAX_RESUME_BYTES)}.`,
      );
      return;
    }

    setBusy(true);
    try {
      const res = await fetch("/api/resume", {
        method: "POST",
        headers: {
          "content-type": "application/pdf",
          "x-resume-filename": encodeURIComponent(file.name).slice(0, 255),
        },
        body: file,
      });

      const body = (await res.json().catch(() => null)) as {
        error?: string;
        sizeBytes?: number;
        originalBytes?: number;
      } | null;

      if (!res.ok) throw new Error(body?.error ?? "Upload failed. Try again.");

      // Only worth saying when it actually shrank — a scan will not.
      if (
        body?.sizeBytes &&
        body.originalBytes &&
        body.originalBytes - body.sizeBytes > 20 * 1024
      ) {
        setNotice(
          `Compressed from ${formatSize(body.originalBytes)} to ${formatSize(body.sizeBytes)} — same text, same links.`,
        );
      }

      await utils.resume.me.invalidate();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const handleRemove = async () => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch("/api/resume", { method: "DELETE" });
      if (!res.ok) throw new Error("Could not remove your resume. Try again.");
      setPreview(false);
      await utils.resume.me.invalidate();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not remove your resume. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={`${sectionRule} space-y-4`}>
      <div>
        <h3 className={itemTitle}>Resume</h3>
        <p className={`${meta} mt-1`}>
          PDF, up to {formatSize(MAX_RESUME_BYTES)}. Shared with sponsors and
          recruiters through the club resume book. Remove it any time.
        </p>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="application/pdf"
        className="hidden"
        onChange={handleUpload}
        disabled={busy}
      />

      {isLoading ? (
        <div className="h-[74px] rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--bg-secondary)] animate-pulse" />
      ) : resume ? (
        <>
          <div className={`${object} flex flex-wrap items-center justify-between gap-4 p-4`}>
            <div className="flex items-start gap-3 min-w-0">
              <FileText
                className="w-4 h-4 mt-0.5 shrink-0 text-[var(--text-subtle)]"
                strokeWidth={1.75}
              />
              <div className="min-w-0">
                <p className="text-[15px] font-semibold text-[var(--text-primary)] truncate">
                  {decodeStoredFileName(resume.fileName)}
                </p>
                <p className={`${meta} mt-0.5`}>
                  <span className="font-mono">{formatSize(resume.sizeBytes)}</span>
                  {" · "}Uploaded{" "}
                  {new Date(resume.uploadedAt).toLocaleDateString()}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <a
                href="/api/resume/me"
                target="_blank"
                rel="noopener noreferrer"
                className={btnSecondary}
              >
                <ExternalLink className="w-4 h-4" strokeWidth={1.75} /> Open
              </a>
              <button
                type="button"
                onClick={() => setPreview((open) => !open)}
                aria-expanded={preview}
                className={btnSecondary}
              >
                {preview ? (
                  <>
                    <EyeOff className="w-4 h-4" strokeWidth={1.75} /> Hide
                  </>
                ) : (
                  <>
                    <Eye className="w-4 h-4" strokeWidth={1.75} /> Preview
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                disabled={busy}
                className={btnSecondary}
              >
                <Upload className="w-4 h-4" strokeWidth={1.75} /> Replace
              </button>
              <button
                type="button"
                onClick={handleRemove}
                disabled={busy}
                aria-label="Remove resume"
                className={`${btnDanger} sm:ml-4`}
              >
                <Trash2 className="w-4 h-4" strokeWidth={1.75} /> Remove
              </button>
            </div>
          </div>

          {/* Versioned by upload time: a fixed src kept the old PDF on screen
              after Replace. */}
          {preview && (
            <ResumePreview
              src={`/api/resume/me?v=${new Date(resume.uploadedAt).getTime()}`}
              title="Your resume"
            />
          )}
        </>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          className="w-full flex flex-col items-center justify-center gap-1.5 px-6 py-8 rounded-[var(--radius-md)] border border-dashed border-[var(--border-medium)] text-[var(--text-muted)] hover:border-accent hover:text-[var(--text-primary)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          <Upload className="w-4 h-4 text-[var(--text-subtle)]" strokeWidth={1.75} />
          <span className="text-[15px] font-semibold text-[var(--text-primary)]">
            {busy ? "Uploading…" : "Upload your resume"}
          </span>
          <span className={meta}>
            No resume on file yet. PDF only, up to {formatSize(MAX_RESUME_BYTES)}.
          </span>
        </button>
      )}

      {error && (
        <p role="alert" className="text-[13px] text-[var(--danger)]">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="text-[13px] text-[var(--success)]">
          {notice}
        </p>
      )}
    </div>
  );
}
