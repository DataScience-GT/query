"use client";

import { useEffect, useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { ResumePreview } from "@/components/portal/ResumePreview";
import {
  btnPrimary,
  btnSecondary,
  label,
  meta,
  page,
  pageDek,
  status,
  tab,
  tabList,
  textLink,
} from "@/components/portal/ui";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  Search,
  X,
} from "lucide-react";

type Scope = "members" | "all";

const PAGE_SIZE = 100;

const adminTitle =
  "font-[family-name:var(--font-display)] text-[32px] md:text-[40px] font-semibold leading-[1.05] tracking-[-0.02em] text-[var(--text-primary)] text-balance";

function formatSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function AdminResumesPage() {
  const [scope, setScope] = useState<Scope>("members");
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [offset, setOffset] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [preview, setPreview] = useState<{
    userId: string;
    name: string;
  } | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 250);
    return () => clearTimeout(t);
  }, [search]);

  const list = trpc.resume.adminList.useQuery({
    scope,
    search: debounced || undefined,
    limit: PAGE_SIZE,
    offset,
  });

  const rows = useMemo(() => list.data?.rows ?? [], [list.data]);
  const total = list.data?.total ?? 0;

  // A selection or page carried across a filter change would put people in a
  // book the list said it would not.
  const [filterShown, setFilterShown] = useState({ scope, debounced });
  if (filterShown.scope !== scope || filterShown.debounced !== debounced) {
    setFilterShown({ scope, debounced });
    setSelected(new Set());
    setPreview(null);
    setOffset(0);
  }

  const allChecked = rows.length > 0 && rows.every((r) => selected.has(r.userId));

  const toggle = (userId: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  };

  const togglePage = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const row of rows) {
        if (allChecked) next.delete(row.userId);
        else next.add(row.userId);
      }
      return next;
    });
  };

  const bookHref = (ids?: Set<string>) => {
    const params = new URLSearchParams({ scope });
    if (debounced) params.set("search", debounced);
    if (ids?.size) params.set("ids", [...ids].join(","));
    return `/api/resume-book?${params}`;
  };

  return (
    <div className={page}>
      <h1 className={adminTitle}>Resume book</h1>
      <p className={pageDek}>
        Every resume uploaded from a profile. Download a filtered set as one
        ZIP, with an index.csv listing who is in it.
      </p>

      <div className="mt-10 space-y-6">
        <div>
          <div className={tabList}>
            {(
              [
                { id: "members", label: "Members" },
                { id: "all", label: "All" },
              ] as const
            ).map((option) => (
              <button
                key={option.id}
                onClick={() => setScope(option.id)}
                className={tab(scope === option.id)}
              >
                {option.label}
              </button>
            ))}
          </div>
          <p className={`${meta} mt-2`}>
            {scope === "members"
              ? "Paid, unexpired memberships only."
              : "Everyone with a resume on file, membership or not."}
          </p>
        </div>

        <div className="relative">
          <Search
            strokeWidth={1.75}
            className="w-4 h-4 text-[var(--text-subtle)] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
          />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, email or major…"
            className="w-full rounded-[var(--radius-sm)] border border-[var(--border-medium)] bg-[var(--bg-input)] pl-10 pr-3.5 py-2.5 text-[15px] text-[var(--text-primary)] placeholder:text-[var(--text-subtle)] focus:border-accent focus:outline-none focus:ring-2 focus:ring-[var(--accent-dim)] transition-colors"
          />
        </div>

        {list.isLoading ? (
          <p className={`${meta} py-8`}>Loading…</p>
        ) : rows.length === 0 ? (
          <p className="py-8 text-[15px] text-[var(--text-muted)]">
            {debounced
              ? "Nobody matches that search. Try a shorter name or another major."
              : scope === "members"
                ? "No current member has uploaded a resume yet. They will appear here once they add one from their profile."
                : "No resumes uploaded yet. They will appear here once members add one from their profile."}
          </p>
        ) : (
          <>
            <div className="overflow-x-auto border-y border-[var(--border-subtle)]">
              <table className="w-full text-[14px]">
                <thead>
                  <tr className="border-b border-[var(--border-subtle)]">
                    <th className="py-2.5 pl-1 pr-3 w-10 text-left">
                      <input
                        type="checkbox"
                        checked={allChecked}
                        onChange={togglePage}
                        aria-label="Select this page"
                        className="accent-[var(--accent)] w-4 h-4"
                      />
                    </th>
                    {["Name", "Major", "Grad", "Status", "File", ""].map(
                      (heading, i) => (
                        <th
                          key={heading || `col-${i}`}
                          className={`py-2.5 px-3 text-left whitespace-nowrap ${label}`}
                        >
                          {heading}
                        </th>
                      ),
                    )}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr
                      key={row.userId}
                      className={`border-b border-[var(--border-subtle)] last:border-0 transition-colors ${
                        preview?.userId === row.userId
                          ? "bg-[var(--bg-secondary)]"
                          : "hover:bg-[var(--bg-secondary)]"
                      }`}
                    >
                      <td className="py-3 pl-1 pr-3">
                        <input
                          type="checkbox"
                          checked={selected.has(row.userId)}
                          onChange={() => toggle(row.userId)}
                          aria-label={`Include ${row.displayName}`}
                          className="accent-[var(--accent)] w-4 h-4"
                        />
                      </td>
                      <td className="py-3 px-3">
                        <p className="font-semibold text-[var(--text-primary)]">
                          {row.displayName}
                        </p>
                        <p className={meta}>{row.email}</p>
                      </td>
                      <td className="py-3 px-3 text-[var(--text-muted)]">
                        {row.major ?? "—"}
                      </td>
                      <td className="py-3 px-3 text-[var(--text-muted)] tabular-nums">
                        {row.graduationYear ?? "—"}
                      </td>
                      <td className="py-3 px-3 whitespace-nowrap">
                        <span
                          className={status(
                            row.isCurrentMember ? "success" : "neutral",
                          )}
                        >
                          {row.isCurrentMember ? "Member" : "Non-member"}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-[13px] text-[var(--text-subtle)] whitespace-nowrap">
                        <span className="font-mono">
                          {formatSize(row.sizeBytes)}
                        </span>{" "}
                        · {new Date(row.uploadedAt).toLocaleDateString()}
                      </td>
                      <td className="py-3 px-3">
                        <button
                          onClick={() =>
                            setPreview(
                              preview?.userId === row.userId
                                ? null
                                : { userId: row.userId, name: row.displayName },
                            )
                          }
                          className={textLink}
                        >
                          {preview?.userId === row.userId ? "Hide" : "View"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-between gap-4">
              <p className={`${meta} tabular-nums`}>
                {offset + 1}–{offset + rows.length} of {total}
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
                  disabled={offset === 0}
                  aria-label="Previous page"
                  className={btnSecondary}
                >
                  <ChevronLeft strokeWidth={1.75} className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setOffset(offset + PAGE_SIZE)}
                  disabled={offset + rows.length >= total}
                  aria-label="Next page"
                  className={btnSecondary}
                >
                  <ChevronRight strokeWidth={1.75} className="w-4 h-4" />
                </button>
              </div>
            </div>
          </>
        )}

        {preview && (
          <div className="space-y-3 border-t border-[var(--border-subtle)] pt-6">
            <div className="flex items-center justify-between gap-4">
              <p className="text-[15px] font-semibold text-[var(--text-primary)]">
                {preview.name}
              </p>
              <div className="flex items-center gap-4">
                <a
                  href={`/api/resume/${preview.userId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={textLink}
                >
                  Open
                </a>
                <button
                  onClick={() => setPreview(null)}
                  aria-label="Close preview"
                  className="p-1.5 rounded-[var(--radius-sm)] text-[var(--text-subtle)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-secondary)] transition-colors"
                >
                  <X strokeWidth={1.75} className="w-4 h-4" />
                </button>
              </div>
            </div>
            <ResumePreview
              key={preview.userId}
              src={`/api/resume/${preview.userId}`}
              title={`${preview.name} resume`}
            />
          </div>
        )}

        {total > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-4 border-t border-[var(--border-subtle)] pt-6">
            <p className={meta}>
              {selected.size > 0
                ? `${selected.size} picked`
                : "Nothing picked. The download takes everything that matches."}
            </p>
            <div className="flex flex-wrap items-center gap-3">
              {selected.size > 0 && (
                <a href={bookHref(selected)} className={btnSecondary}>
                  <Download strokeWidth={1.75} className="w-4 h-4" /> Download
                  picked ({selected.size})
                </a>
              )}
              {/* A plain link, so the browser streams gigabytes to disk rather
                  than holding the ZIP in a Blob in the tab. */}
              <a href={bookHref()} className={btnPrimary}>
                <Download strokeWidth={1.75} className="w-4 h-4" /> Download
                all {total} as ZIP
              </a>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
