"use client";

import Link from "next/link";
import { Download } from "lucide-react";
import { trpc } from "@/lib/trpc";
import {
  body,
  btnSecondary,
  meta,
  pageDek,
  sectionRule,
  textLink,
} from "@query/ui/classes";

const th = "px-4 py-3 text-[13px] font-medium text-[var(--text-subtle)]";
const td = "px-4 py-3 align-top";

/**
 * A spreadsheet runs a cell that starts with = + - or @ as a formula, and
 * these cells are typed by strangers. A leading apostrophe keeps them text.
 */
const csvCell = (value: unknown) => {
  const text = String(value ?? "");
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return `"${safe.replace(/"/g, '""')}"`;
};

// Leads from the public form on the Hacklytics site. AdminLayout gates this
// page to staff; the procedure is gated on the server.
export default function JudgeInterestPage() {
  const { data, isLoading, isError, refetch } =
    trpc.judge.interestList.useQuery();

  const downloadCsv = () => {
    if (!data || data.rows.length === 0) return;
    const header = [
      "Submitted",
      "Edition",
      "Name",
      "Email",
      "Company",
      "Title",
      "Expertise",
      "LinkedIn",
      "Message",
    ];
    const lines = data.rows.map((r) =>
      [
        new Date(r.createdAt).toISOString(),
        r.edition,
        r.name,
        r.email,
        r.company,
        r.title,
        r.expertise,
        r.linkedinUrl,
        r.message,
      ].map(csvCell),
    );
    const csv = [header.map(csvCell), ...lines].map((l) => l.join(",")).join("\n");
    const url = URL.createObjectURL(
      new Blob([csv], { type: "text/csv;charset=utf-8;" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = "judge_interest.csv";
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="max-w-5xl mx-auto">
      <header className="mb-8">
        <h1 className="font-[family-name:var(--font-display)] text-[32px] md:text-[40px] font-semibold leading-tight tracking-[-0.02em] text-[var(--text-primary)]">
          Judge interest
        </h1>
        <p className={pageDek}>
          People who filled in the short form on the Hacklytics site. They have
          no account yet: invite them to apply on the portal. Back to{" "}
          <Link href="/admin/judging" className={textLink}>
            Judging
          </Link>
          .
        </p>
      </header>

      <section className={`${sectionRule} space-y-6`}>
        {isLoading ? (
          <p className={body}>Loading…</p>
        ) : isError || !data ? (
          <p className={body}>
            Could not load the list.{" "}
            <button type="button" onClick={() => refetch()} className={textLink}>
              Try again
            </button>
          </p>
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-4">
              <p className={meta} aria-live="polite">
                {data.total} {data.total === 1 ? "person" : "people"}, newest
                first
                {data.total > data.rows.length
                  ? ` (showing ${data.rows.length})`
                  : ""}
              </p>
              {data.rows.length > 0 && (
                <button
                  type="button"
                  onClick={downloadCsv}
                  className={btnSecondary}
                >
                  <Download
                    aria-hidden="true"
                    strokeWidth={1.75}
                    className="h-4 w-4"
                  />
                  Export CSV
                </button>
              )}
            </div>

            {data.rows.length === 0 ? (
              <p className={body}>
                Nobody yet. Submissions from the Hacklytics site appear here.
              </p>
            ) : (
              <div className="overflow-x-auto border-y border-[var(--border-subtle)]">
                <table className="w-full min-w-[720px] text-left text-[15px]">
                  <thead className="border-b border-[var(--border-subtle)]">
                    <tr>
                      <th scope="col" className={th}>Name</th>
                      <th scope="col" className={th}>Company</th>
                      <th scope="col" className={th}>Expertise</th>
                      <th scope="col" className={th}>Submitted</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.rows.map((r) => (
                      <tr
                        key={r.id}
                        className="border-b border-[var(--border-subtle)] last:border-b-0 hover:bg-[var(--bg-secondary)]"
                      >
                        <td className={td}>
                          <p className="font-semibold text-[var(--text-primary)]">
                            {r.name}
                          </p>
                          <a href={`mailto:${r.email}`} className={textLink}>
                            {r.email}
                          </a>
                          {r.linkedinUrl && (
                            <>
                              {" · "}
                              <a
                                href={r.linkedinUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className={textLink}
                              >
                                LinkedIn
                              </a>
                            </>
                          )}
                        </td>
                        <td className={`${td} text-[var(--text-muted)]`}>
                          {r.company}
                          {r.title ? <span className="block">{r.title}</span> : null}
                        </td>
                        <td className={`${td} text-[var(--text-muted)]`}>
                          {r.expertise ?? "—"}
                          {r.message ? (
                            <span className="mt-1 block text-[13px] text-[var(--text-subtle)]">
                              {r.message}
                            </span>
                          ) : null}
                        </td>
                        <td
                          className={`${td} whitespace-nowrap tabular-nums text-[var(--text-muted)]`}
                        >
                          {new Date(r.createdAt).toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}
