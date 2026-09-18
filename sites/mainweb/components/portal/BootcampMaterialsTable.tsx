"use client";

import { ExternalLink, Pencil, Trash2 } from "lucide-react";

export interface BootcampMaterialRow {
  id: string;
  week: number;
  title: string;
  eventDate: Date | string | null;
  location: string | null;
  materialsKey: string | null;
  materialsFileName: string | null;
  materialsSizeBytes: number | null;
  solutionKey: string | null;
  solutionFileName: string | null;
  solutionSizeBytes: number | null;
  recordingUrl: string | null;
  isPublished: boolean;
}

interface BootcampMaterialsTableProps {
  rows: BootcampMaterialRow[];
  term: string;
  onEdit?: (row: BootcampMaterialRow) => void;
  onDelete?: (row: BootcampMaterialRow) => void;
  onSetPublished?: (row: BootcampMaterialRow, published: boolean) => void;
  isUpdating?: boolean;
}

const dateLabel = (date: Date | string | null) =>
  date
    ? new Date(date).toLocaleDateString(undefined, {
        weekday: "short",
        month: "short",
        day: "numeric",
      })
    : "TBA";

const fileLabel = (name: string | null, size: number | null) => {
  if (!name) return "Download ZIP";
  if (!size) return name;
  const megabytes = size / (1024 * 1024);
  return `${name} (${megabytes.toFixed(megabytes >= 10 ? 0 : 1)} MB)`;
};

export function BootcampMaterialsTable({
  rows,
  term,
  onEdit,
  onDelete,
  onSetPublished,
  isUpdating = false,
}: BootcampMaterialsTableProps) {
  const admin = !!(onEdit || onDelete || onSetPublished);

  return (
    <div className="overflow-x-auto border border-[var(--border-subtle)]">
      <table className="w-full border-collapse text-sm">
        <caption className="sr-only">
          Bootcamp workshop materials for {term}, one row per week.
        </caption>
        <thead>
          <tr className="border-b border-[var(--border-subtle)] bg-white/5">
            {[
              "Week",
              "Date",
              "Workshop",
              "Materials",
              "Solution",
              "Recording",
              ...(admin ? ["Status", "Actions"] : []),
            ].map((heading) => (
              <th
                key={heading}
                scope="col"
                className="px-4 py-3 text-left font-mono text-[10px] uppercase tracking-widest text-[var(--text-subtle)]"
              >
                {heading}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td
                colSpan={admin ? 8 : 6}
                className="px-4 py-8 text-center text-[var(--text-muted)]"
              >
                No workshop materials have been posted yet.
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr
                key={row.id}
                className="border-b border-[var(--border-subtle)] last:border-b-0"
              >
                <th
                  scope="row"
                  className="px-4 py-4 text-left font-mono font-bold text-accent"
                >
                  {row.week}
                </th>
                <td className="whitespace-nowrap px-4 py-4 text-[var(--text-muted)]">
                  {dateLabel(row.eventDate)}
                </td>
                <td className="min-w-48 px-4 py-4 font-bold text-[var(--text-primary)]">
                  {row.title}
                </td>
                <td className="min-w-48 px-4 py-4">
                  {row.materialsKey ? (
                    <a
                      href={`/api/bootcamp/materials/${row.id}/materials`}
                      className="font-bold text-accent hover:underline"
                    >
                      {fileLabel(row.materialsFileName, row.materialsSizeBytes)}
                    </a>
                  ) : (
                    <span className="text-[var(--text-subtle)]">
                      Posted after the workshop
                    </span>
                  )}
                </td>
                <td className="min-w-48 px-4 py-4">
                  {row.solutionKey ? (
                    <a
                      href={`/api/bootcamp/materials/${row.id}/solution`}
                      className="font-bold text-accent hover:underline"
                    >
                      {fileLabel(row.solutionFileName, row.solutionSizeBytes)}
                    </a>
                  ) : (
                    <span className="text-[var(--text-subtle)]">
                      Posted after the workshop
                    </span>
                  )}
                </td>
                <td className="px-4 py-4">
                  {row.recordingUrl ? (
                    <a
                      href={row.recordingUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 font-bold text-accent hover:underline"
                    >
                      Watch
                      <ExternalLink aria-hidden="true" className="h-4 w-4" />
                    </a>
                  ) : (
                    <span className="text-[var(--text-subtle)]">
                      Posted after the workshop
                    </span>
                  )}
                </td>
                {admin && (
                  <>
                    <td className="px-4 py-4">
                      <button
                        type="button"
                        disabled={!onSetPublished || isUpdating}
                        onClick={() => onSetPublished?.(row, !row.isPublished)}
                        className="border border-[var(--border-subtle)] px-3 py-1.5 font-mono text-[10px] font-bold uppercase tracking-widest text-[var(--text-primary)] transition-ui hover:border-accent disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {row.isPublished ? "Published" : "Draft"}
                      </button>
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => onEdit?.(row)}
                          disabled={!onEdit || isUpdating}
                          aria-label={`Edit week ${row.week}`}
                          className="border border-[var(--border-subtle)] p-2 text-[var(--text-muted)] transition-ui hover:border-accent hover:text-accent disabled:opacity-50"
                        >
                          <Pencil aria-hidden="true" className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => onDelete?.(row)}
                          disabled={!onDelete || isUpdating}
                          aria-label={`Delete week ${row.week}`}
                          className="border border-[var(--border-subtle)] p-2 text-[var(--text-muted)] transition-ui hover:border-red-400 hover:text-red-300 disabled:opacity-50"
                        >
                          <Trash2 aria-hidden="true" className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </>
                )}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
