"use client";

import { useRef, useState } from "react";
import { FileText, Upload, Trash2, Eye, EyeOff } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { MAX_RESUME_BYTES, decodeStoredFileName } from "@/lib/resume-file";

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
      setError("Resumes must be a PDF.");
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

      if (!res.ok) throw new Error(body?.error ?? "Upload failed.");

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
      setError(err instanceof Error ? err.message : "Upload failed.");
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
      if (!res.ok) throw new Error("Could not remove your resume.");
      setPreview(false);
      await utils.resume.me.invalidate();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not remove.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3 border-t border-[var(--border-subtle)] pt-6">
      <div className="flex items-center gap-2 text-xs font-bold text-[var(--text-muted)] uppercase tracking-widest">
        <FileText className="w-3.5 h-3.5" /> Resume
      </div>
      <p className="text-[10px] text-[var(--text-subtle)] font-mono">
        PDF, up to {formatSize(MAX_RESUME_BYTES)}. Shared with sponsors and
        recruiters through the club resume book. Remove it any time.
      </p>

      <input
        ref={inputRef}
        type="file"
        accept="application/pdf"
        className="hidden"
        onChange={handleUpload}
        disabled={busy}
      />

      {isLoading ? (
        <div className="h-[68px] rounded-sm bg-[var(--bg-secondary)] border border-[var(--border-subtle)] animate-pulse" />
      ) : resume ? (
        <>
          <div className="flex flex-wrap items-center justify-between gap-4 p-4 rounded-sm bg-[var(--bg-secondary)] border border-[var(--border-subtle)]">
            <div className="flex items-center gap-3 min-w-0">
              <div className="p-2.5 rounded-sm bg-[var(--bg-elevated)] border border-[var(--border-subtle)] shrink-0">
                <FileText className="w-5 h-5 text-accent" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-bold text-[var(--text-primary)] truncate">
                  {decodeStoredFileName(resume.fileName)}
                </p>
                <p className="text-xs text-[var(--text-muted)] mt-0.5 font-mono">
                  {formatSize(resume.sizeBytes)} · uploaded{" "}
                  {new Date(resume.uploadedAt).toLocaleDateString()}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setPreview((open) => !open)}
                aria-expanded={preview}
                className="flex items-center gap-2 px-4 py-2.5 rounded-sm border border-[var(--border-medium)] bg-[var(--bg-card)] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:border-[var(--border-hover)] transition-ui text-xs font-bold uppercase tracking-widest"
              >
                {preview ? (
                  <>
                    <EyeOff className="w-3.5 h-3.5" /> Hide
                  </>
                ) : (
                  <>
                    <Eye className="w-3.5 h-3.5" /> Preview
                  </>
                )}
              </button>
              <button
                onClick={() => inputRef.current?.click()}
                disabled={busy}
                className="flex items-center gap-2 px-4 py-2.5 rounded-sm border border-[var(--border-medium)] bg-[var(--bg-card)] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:border-[var(--border-hover)] transition-ui text-xs font-bold uppercase tracking-widest disabled:opacity-50"
              >
                <Upload className="w-3.5 h-3.5" /> Replace
              </button>
              <button
                onClick={handleRemove}
                disabled={busy}
                aria-label="Remove resume"
                className="flex items-center gap-2 px-4 py-2.5 rounded-sm border border-red-500/20 bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-ui text-xs font-bold uppercase tracking-widest disabled:opacity-50"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {preview && (
            <iframe
              src="/api/resume/me"
              title="Your resume"
              className="w-full h-[70vh] min-h-[420px] rounded-sm border border-[var(--border-subtle)] bg-[var(--bg-secondary)]"
            />
          )}
        </>
      ) : (
        <button
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          className="w-full flex flex-col items-center justify-center gap-2 p-8 rounded-sm border-2 border-dashed border-[var(--border-subtle)] bg-[var(--bg-secondary)] text-[var(--text-muted)] hover:border-accent hover:text-[var(--text-primary)] transition-ui disabled:opacity-50"
        >
          <Upload className="w-6 h-6 text-[var(--text-subtle)]" />
          <span className="text-sm font-bold uppercase tracking-widest">
            {busy ? "Uploading…" : "Upload your resume"}
          </span>
          <span className="text-[10px] font-mono text-[var(--text-subtle)]">
            PDF only, max {formatSize(MAX_RESUME_BYTES)}
          </span>
        </button>
      )}

      {error && (
        <div className="px-4 py-3 rounded-sm bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
          {error}
        </div>
      )}
      {notice && (
        <div className="px-4 py-3 rounded-sm bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm">
          {notice}
        </div>
      )}
    </div>
  );
}
