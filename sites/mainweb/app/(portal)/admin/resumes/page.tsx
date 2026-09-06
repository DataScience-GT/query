"use client";

import { useEffect, useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { LiquidGlass } from "@/components/portal/LiquidGlass";
import {
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Download,
  Eye,
  Search,
  X,
} from "lucide-react";

type Scope = "members" | "all";

const PAGE_SIZE = 100;

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
  useEffect(() => {
    setSelected(new Set());
    setPreview(null);
    setOffset(0);
  }, [scope, debounced]);

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
    <div className="max-w-6xl mx-auto py-16 px-6 space-y-8">
      <div>
        <h1 className="text-3xl font-black uppercase tracking-tight text-[var(--text-primary)] flex items-center gap-3">
          <BookOpen className="w-6 h-6 text-accent" />
          Resume Book
        </h1>
        <p className="mt-2 text-sm text-[var(--text-muted)] font-mono">
          Every resume uploaded from a profile. Download a filtered set as one
          ZIP, with an index.csv listing who is in it.
        </p>
      </div>

      <LiquidGlass className="p-6 border-[var(--border-subtle)] space-y-5">
        <div className="flex flex-wrap items-center gap-2">
          {(
            [
              { id: "members", label: "Members" },
              { id: "all", label: "All" },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              onClick={() => setScope(tab.id)}
              className={`px-5 py-2.5 rounded-sm text-xs font-bold uppercase tracking-widest transition-ui ${
                scope === tab.id
                  ? "bg-accent text-[var(--text-on-accent)]"
                  : "bg-[var(--bg-secondary)] border border-[var(--border-subtle)] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:border-[var(--border-medium)]"
              }`}
            >
              {tab.label}
            </button>
          ))}
          <p className="text-[10px] font-mono text-[var(--text-subtle)] ml-2">
            {scope === "members"
              ? "Paid, unexpired memberships only."
              : "Everyone with a resume on file, membership or not."}
          </p>
        </div>

        <div className="relative">
          <Search className="w-4 h-4 text-[var(--text-subtle)] absolute left-4 top-1/2 -translate-y-1/2" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, email or major…"
            className="w-full bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-sm pl-11 pr-4 py-3 text-[var(--text-primary)] placeholder:text-[var(--text-subtle)] focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/30 transition-ui text-sm"
          />
        </div>

        {list.isLoading ? (
          <p className="text-sm text-[var(--text-muted)] font-mono py-8 text-center">
            Loading…
          </p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-[var(--text-muted)] font-mono py-8 text-center">
            {debounced
              ? "Nobody matches that search."
              : scope === "members"
                ? "No current member has uploaded a resume yet."
                : "No resumes uploaded yet."}
          </p>
        ) : (
          <>
            <div className="border border-[var(--border-subtle)] rounded-sm overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--border-subtle)] bg-[var(--bg-secondary)]">
                    <th className="p-3 w-10">
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
                          className="p-3 text-left text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)]"
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
                      className={`border-b border-[var(--border-subtle)] last:border-0 transition-ui ${
                        preview?.userId === row.userId
                          ? "bg-accent/10"
                          : "hover:bg-[var(--bg-secondary)]"
                      }`}
                    >
                      <td className="p-3">
                        <input
                          type="checkbox"
                          checked={selected.has(row.userId)}
                          onChange={() => toggle(row.userId)}
                          aria-label={`Include ${row.displayName}`}
                          className="accent-[var(--accent)] w-4 h-4"
                        />
                      </td>
                      <td className="p-3">
                        <p className="font-bold text-[var(--text-primary)]">
                          {row.displayName}
                        </p>
                        <p className="text-xs text-[var(--text-muted)] font-mono">
                          {row.email}
                        </p>
                      </td>
                      <td className="p-3 text-[var(--text-muted)]">
                        {row.major ?? "—"}
                      </td>
                      <td className="p-3 text-[var(--text-muted)] font-mono">
                        {row.graduationYear ?? "—"}
                      </td>
                      <td className="p-3">
                        <span
                          className={`px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider rounded-sm ${
                            row.isCurrentMember
                              ? "text-emerald-500 bg-emerald-500/10 border border-emerald-500/20"
                              : "text-[var(--text-subtle)] bg-[var(--bg-elevated)] border border-[var(--border-subtle)]"
                          }`}
                        >
                          {row.isCurrentMember ? "Member" : "Non-member"}
                        </span>
                      </td>
                      <td className="p-3 text-xs font-mono text-[var(--text-subtle)] whitespace-nowrap">
                        {formatSize(row.sizeBytes)} ·{" "}
                        {new Date(row.uploadedAt).toLocaleDateString()}
                      </td>
                      <td className="p-3">
                        <button
                          onClick={() =>
                            setPreview(
                              preview?.userId === row.userId
                                ? null
                                : { userId: row.userId, name: row.displayName },
                            )
                          }
                          className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest text-accent hover:underline"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          {preview?.userId === row.userId ? "Hide" : "View"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-between gap-4">
              <p className="text-xs font-mono text-[var(--text-muted)]">
                {offset + 1}–{offset + rows.length} of {total}
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
                  disabled={offset === 0}
                  aria-label="Previous page"
                  className="p-2 rounded-sm border border-[var(--border-medium)] bg-[var(--bg-card)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-ui disabled:opacity-40"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setOffset(offset + PAGE_SIZE)}
                  disabled={offset + rows.length >= total}
                  aria-label="Next page"
                  className="p-2 rounded-sm border border-[var(--border-medium)] bg-[var(--bg-card)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-ui disabled:opacity-40"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </>
        )}

        {preview && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold uppercase tracking-widest text-[var(--text-muted)]">
                {preview.name}
              </p>
              <button
                onClick={() => setPreview(null)}
                aria-label="Close preview"
                className="p-1.5 rounded-sm text-[var(--text-subtle)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-secondary)] transition-ui"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <iframe
              key={preview.userId}
              src={`/api/resume/${preview.userId}`}
              title={`${preview.name} resume`}
              className="w-full h-[70vh] min-h-[420px] rounded-sm border border-[var(--border-subtle)] bg-[var(--bg-secondary)]"
            />
          </div>
        )}

        {total > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-4 border-t border-[var(--border-subtle)] pt-5">
            <p className="text-xs font-mono text-[var(--text-muted)]">
              {selected.size > 0
                ? `${selected.size} picked`
                : "Nothing picked — the button takes everything matching."}
            </p>
            <div className="flex flex-wrap items-center gap-3">
              {selected.size > 0 && (
                <a
                  href={bookHref(selected)}
                  className="flex items-center gap-2 px-5 py-3 rounded-sm border border-[var(--border-medium)] bg-[var(--bg-card)] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:border-[var(--border-hover)] transition-ui text-xs font-bold uppercase tracking-widest"
                >
                  <Download className="w-4 h-4" /> Picked ({selected.size})
                </a>
              )}
              {/* A plain link, so the browser streams gigabytes to disk rather
                  than holding the ZIP in a Blob in the tab. */}
              <a
                href={bookHref()}
                className="flex items-center gap-2 px-6 py-3 bg-accent text-[var(--text-on-accent)] rounded-sm font-bold text-sm uppercase tracking-widest hover:bg-accent-secondary transition-ui"
              >
                <Download className="w-4 h-4" /> Download all {total} as ZIP
              </a>
            </div>
          </div>
        )}
      </LiquidGlass>
    </div>
  );
}
