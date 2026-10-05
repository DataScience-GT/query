"use client";

import { ExternalLink, Pencil, Trash2 } from "lucide-react";
import { status } from "./ui";

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
  const label = name ?? "Download ZIP";
  if (!size) return label;
  const megabytes = size / (1024 * 1024);
  return (
    <>
      {label}{" "}
      <span className="font-mono text-[12px] font-normal text-[var(--text-subtle)]">
        {megabytes.toFixed(megabytes >= 10 ? 0 : 1)} MB
      </span>
    </>
  );
};

const fileLink =
  "font-semibold text-[var(--text-primary)] underline decoration-accent decoration-2 underline-offset-[5px] hover:decoration-[var(--text-primary)] transition-colors";
const pending = "text-[13px] text-[var(--text-subtle)]";
const cell = "py-3.5 pr-4 align-top";

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
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-[15px]">
        <caption className="sr-only">
          Bootcamp workshop materials for {term}, one row per week.
        </caption>
        <thead>
          <tr className="border-b border-[var(--border-subtle)]">
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
                className="py-2.5 pr-4 text-left text-[13px] font-medium text-[var(--text-subtle)]"
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
                className="py-8 text-[var(--text-muted)]"
              >
                No workshop materials have been posted yet.
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr
                key={row.id}
                className="border-b border-[var(--border-subtle)]"
              >
                <th
                  scope="row"
                  className={`${cell} text-left font-semibold tabular-nums text-[var(--text-primary)]`}
                >
                  {row.week}
                </th>
                <td className={`${cell} whitespace-nowrap text-[var(--text-muted)]`}>
                  {dateLabel(row.eventDate)}
                </td>
                <td className={`${cell} min-w-48 font-semibold text-[var(--text-primary)]`}>
                  {row.title}
                </td>
                <td className={`${cell} min-w-48`}>
                  {row.materialsKey ? (
                    <a
                      href={`/api/bootcamp/materials/${row.id}/materials`}
                      className={fileLink}
                    >
                      {fileLabel(row.materialsFileName, row.materialsSizeBytes)}
                    </a>
                  ) : (
                    <span className={pending}>
                      Posted after the workshop
                    </span>
                  )}
                </td>
                <td className={`${cell} min-w-48`}>
                  {row.solutionKey ? (
                    <a
                      href={`/api/bootcamp/materials/${row.id}/solution`}
                      className={fileLink}
                    >
                      {fileLabel(row.solutionFileName, row.solutionSizeBytes)}
                    </a>
                  ) : (
                    <span className={pending}>
                      Posted after the workshop
                    </span>
                  )}
                </td>
                <td className={cell}>
                  {row.recordingUrl ? (
                    <a
                      href={row.recordingUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={`${fileLink} inline-flex items-center gap-1.5`}
                    >
                      Watch
                      <ExternalLink
                        aria-hidden="true"
                        strokeWidth={1.75}
                        className="h-4 w-4"
                      />
                    </a>
                  ) : (
                    <span className={pending}>
                      Posted after the workshop
                    </span>
                  )}
                </td>
                {admin && (
                  <>
                    <td className={cell}>
                      <button
                        type="button"
                        disabled={!onSetPublished || isUpdating}
                        onClick={() => onSetPublished?.(row, !row.isPublished)}
                        className="rounded-[var(--radius-sm)] border border-[var(--border-medium)] px-3 py-1.5 transition-colors hover:border-[var(--border-hover)] hover:bg-[var(--bg-secondary)] disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <span
                          className={status(
                            row.isPublished ? "success" : "neutral",
                          )}
                        >
                          {row.isPublished ? "Published" : "Draft"}
                        </span>
                      </button>
                    </td>
                    <td className={cell}>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => onEdit?.(row)}
                          disabled={!onEdit || isUpdating}
                          aria-label={`Edit week ${row.week}`}
                          className="rounded-[var(--radius-sm)] border border-[var(--border-medium)] p-2 text-[var(--text-muted)] transition-colors hover:border-[var(--border-hover)] hover:text-[var(--text-primary)] disabled:opacity-50"
                        >
                          <Pencil
                            aria-hidden="true"
                            strokeWidth={1.75}
                            className="h-4 w-4"
                          />
                        </button>
                        <button
                          type="button"
                          onClick={() => onDelete?.(row)}
                          disabled={!onDelete || isUpdating}
                          aria-label={`Delete week ${row.week}`}
                          className="rounded-[var(--radius-sm)] border border-[var(--border-medium)] p-2 text-[var(--text-muted)] transition-colors hover:border-[var(--danger)] hover:text-[var(--danger)] disabled:opacity-50"
                        >
                          <Trash2
                            aria-hidden="true"
                            strokeWidth={1.75}
                            className="h-4 w-4"
                          />
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
