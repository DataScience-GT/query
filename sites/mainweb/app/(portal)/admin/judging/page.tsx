"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { hackathonStatus } from "@/lib/hackathon-status";
import {
  body,
  itemTitle,
  meta,
  pageDek,
  sectionRule,
  status,
  textLink,
} from "@/components/portal/ui";

// Judging is run per edition. AdminLayout gates this page to staff.
export default function AdminJudgingPage() {
  const { data: hackathons, isLoading, isError, refetch } =
    trpc.hackathon.list.useQuery({ limit: 50 });

  return (
    <div className="max-w-3xl mx-auto">
      <header className="mb-8">
        <h1 className="font-[family-name:var(--font-display)] text-[32px] md:text-[40px] font-semibold leading-tight tracking-[-0.02em] text-[var(--text-primary)]">
          Judging
        </h1>
        <p className={pageDek}>
          Pick an edition to open its judging console: projects, challenges,
          rooms, the schedule, launch and results. Each edition&apos;s judge
          roster is on its hackathon page, under Judges.
        </p>
      </header>

      <section className={sectionRule}>
        {isLoading ? (
          <p className={body}>Loading editions…</p>
        ) : isError ? (
          <p className={body}>
            Could not load the editions.{" "}
            <button
              type="button"
              onClick={() => refetch()}
              className={textLink}
            >
              Try again
            </button>
          </p>
        ) : !hackathons || hackathons.length === 0 ? (
          <p className={body}>
            No editions yet. Create one from{" "}
            <Link
              href="/admin/hackathons"
              className={textLink}
            >
              Hackathons
            </Link>{" "}
            first.
          </p>
        ) : (
          <ul className="border-t border-[var(--border-subtle)]">
            {hackathons.map((h) => {
              const conf = hackathonStatus(h.status);
              return (
                <li key={h.id} className="border-b border-[var(--border-subtle)]">
                  <Link
                    href={`/admin/judging/${h.id}`}
                    className="flex items-center gap-4 py-4 min-h-11 hover:bg-[var(--bg-secondary)] transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <p className={`${itemTitle} truncate`}>{h.name}</p>
                      <p className={`mt-1 ${meta}`}>
                        <span className={status(conf.tone)}>{conf.label}</span>
                        {" · "}
                        {new Date(h.startDate).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })}
                      </p>
                    </div>
                    <ChevronRight
                      className="h-4 w-4 shrink-0 text-[var(--text-subtle)]"
                      strokeWidth={1.75}
                      aria-hidden="true"
                    />
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
