"use client";

import { useRef, useState } from "react";
import { Download, Paperclip, Trash2, Upload } from "lucide-react";
import {
  MATERIAL_EXTENSIONS,
  MAX_MATERIAL_BYTES,
  formatMaterialSize,
} from "@/lib/bootcamp-materials";

export type SessionMaterial = {
  id: string;
  fileName: string;
  sizeBytes: number;
};

const accept = MATERIAL_EXTENSIONS.map((ext) => `.${ext}`).join(",");

/** One gated route, one URL — members and officers use the same link. */
export const materialHref = (id: string) => `/api/bootcamp/materials/${id}`;

/**
 * Handouts on one session, as staff see them. Uploads go straight to the route
 * handler: a slide deck does not survive superjson's base64 of the body.
 */
export function SessionMaterialsEditor({
  eventId,
  materials,
  onChange,
}: {
  eventId: string;
  materials: SessionMaterial[];
  onChange: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const upload = async (file: File) => {
    setError(null);

    // A courtesy check; the route enforces it.
    if (file.size > MAX_MATERIAL_BYTES) {
      setError(`${file.name} is larger than 25MB.`);
      return;
    }

    setBusy(true);
    try {
      const response = await fetch("/api/bootcamp/materials", {
        method: "POST",
        headers: {
          "content-type": "application/octet-stream",
          "x-material-event": eventId,
          // A raw é or a stray newline in a header is mangled or rejected.
          "x-material-filename": encodeURIComponent(file.name),
        },
        body: file,
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        setError(body?.error ?? "Upload failed.");
        return;
      }

      onChange();
    } catch {
      setError("Upload failed. Check your connection and try again.");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  };

  const remove = async (material: SessionMaterial) => {
    setError(null);
    setBusy(true);
    try {
      const response = await fetch(materialHref(material.id), {
        method: "DELETE",
      });
      if (!response.ok) {
        setError("Could not remove that file.");
        return;
      }
      onChange();
    } catch {
      setError("Could not remove that file.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-3">
      {materials.length > 0 && (
        <ul className="mb-3 space-y-1.5">
          {materials.map((material) => (
            <li
              key={material.id}
              className="flex items-center justify-between gap-3 border border-[var(--border-subtle)] bg-white/[0.03] px-3 py-2"
            >
              <a
                href={materialHref(material.id)}
                className="flex min-w-0 items-center gap-2 text-xs font-bold text-accent hover:underline"
              >
                <Paperclip
                  aria-hidden="true"
                  className="h-3.5 w-3.5 shrink-0"
                />
                <span className="truncate">{material.fileName}</span>
              </a>
              <div className="flex shrink-0 items-center gap-3">
                <span className="font-mono text-[10px] text-[var(--text-subtle)]">
                  {formatMaterialSize(material.sizeBytes)}
                </span>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => remove(material)}
                  className="text-[var(--text-subtle)] transition-colors hover:text-red-300 disabled:opacity-50"
                >
                  <Trash2 aria-hidden="true" className="h-3.5 w-3.5" />
                  <span className="sr-only">Remove {material.fileName}</span>
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <label className="inline-flex cursor-pointer items-center gap-2 border border-[var(--border-subtle)] bg-white/5 px-3 py-2 font-mono text-[10px] font-bold uppercase tracking-widest text-[var(--text-primary)] transition-colors hover:bg-white/10">
        <Upload aria-hidden="true" className="h-3.5 w-3.5" />
        {busy ? "Working…" : "Add file"}
        <input
          ref={input}
          type="file"
          accept={accept}
          disabled={busy}
          className="sr-only"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void upload(file);
          }}
        />
      </label>

      <p className="mt-2 font-mono text-[10px] text-[var(--text-subtle)]">
        PDF, notebook, script, dataset, archive, Office file or image. 25MB max.
      </p>

      {error && (
        <p role="alert" className="mt-2 text-xs text-red-300">
          {error}
        </p>
      )}
    </div>
  );
}

/** The same files, read-only, for the member page. */
export function SessionMaterialsList({
  materials,
}: {
  materials: SessionMaterial[];
}) {
  if (materials.length === 0) return null;

  return (
    <ul className="mt-3 space-y-1.5">
      {materials.map((material) => (
        <li key={material.id}>
          <a
            href={materialHref(material.id)}
            className="inline-flex items-center gap-2 text-xs font-bold text-accent hover:underline"
          >
            <Download aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
            <span className="break-all">{material.fileName}</span>
            <span className="font-mono text-[10px] font-normal text-[var(--text-subtle)]">
              {formatMaterialSize(material.sizeBytes)}
            </span>
          </a>
        </li>
      ))}
    </ul>
  );
}
