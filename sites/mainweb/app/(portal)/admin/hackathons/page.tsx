"use client";

import { useSession } from "next-auth/react";
import { loginHref } from "@/lib/safe-callback";
import { trpc } from "@/lib/trpc";
import { READ_ONLY_TITLE, useReadOnly } from "@/lib/use-portal-context";
import { LoadingScreen } from "@/components/portal/LoadingScreen";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { body, btnPrimary, btnSecondary, pageDek } from "@/components/portal/ui";

// Extracted Components

import { HackathonCard } from "@/components/admin/hackathons/HackathonCard";
import { CreateHackathonForm } from "@/components/admin/hackathons/CreateHackathonForm";
import { EditHackathonForm } from "@/components/admin/hackathons/EditHackathonForm";

const adminTitle =
  "font-[family-name:var(--font-display)] text-[32px] md:text-[40px] font-semibold leading-tight tracking-[-0.02em] text-[var(--text-primary)]";

export default function AdminHackathonsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const utils = trpc.useUtils();
  const readOnly = useReadOnly();

  const [showCreate, setShowCreate] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const {
    data: hackathons,
    isLoading,
    isError,
    error,
    refetch,
  } = trpc.hackathon.listAll.useQuery(
    undefined,
    { enabled: !!session },
  );

  if (status === "loading") return <LoadingScreen message="Loading hackathons…" />;
  if (status === "unauthenticated") {
    router.push(loginHref());
    return null;
  }

  return (
    <>
      <div className="mx-auto w-full max-w-5xl py-4 md:py-8">
        <header className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className={adminTitle}>Hackathons</h1>
            <p className={pageDek}>
              Every edition, its schedule and who has signed up. Open one to
              review applications, check people in and run judging.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            disabled={readOnly}
            title={readOnly ? READ_ONLY_TITLE : undefined}
            className={`shrink-0 self-start sm:self-auto ${btnPrimary}`}
          >
            New hackathon
          </button>
        </header>

        {showCreate && (
          <CreateHackathonForm
            onClose={() => setShowCreate(false)}
            onCreated={() => {
              setShowCreate(false);
              utils.hackathon.listAll.invalidate();
            }}
          />
        )}

        {editingId && (
          <EditHackathonForm
            hackathonId={editingId}
            onClose={() => setEditingId(null)}
            onSaved={() => {
              // The form seeds itself from getById; left cached, reopening it
              // shows the old values and a second save writes them back.
              utils.hackathon.getById.invalidate({ id: editingId });
              setEditingId(null);
              utils.hackathon.listAll.invalidate();
            }}
          />
        )}

        <div className="mt-10">
          {/* Checked before the skeleton: a failed query leaves data
              undefined, which used to hold the skeleton up forever. */}
          {isError ? (
            <div className="flex flex-col items-start gap-4 border-t border-[var(--border-subtle)] pt-6">
              <p role="alert" className="text-[15px] text-[var(--danger)]">
                Couldn&apos;t load hackathons. {error.message}
              </p>
              <button
                type="button"
                onClick={() => refetch()}
                className={btnSecondary}
              >
                Try again
              </button>
            </div>
          ) : isLoading || hackathons === undefined ? (
            <div className="space-y-6">
              {[1, 2, 3].map((n) => (
                <div
                  key={n}
                  className="h-36 animate-pulse rounded-[var(--radius-md)] bg-[var(--bg-secondary)]"
                />
              ))}
            </div>
          ) : hackathons.length === 0 ? (
            <div className="flex flex-col items-start gap-4 border-t border-[var(--border-subtle)] pt-6">
              <p className={body}>
                No hackathons yet. Each edition you create will be listed here.
              </p>
              <button
                type="button"
                onClick={() => setShowCreate(true)}
                disabled={readOnly}
                title={readOnly ? READ_ONLY_TITLE : undefined}
                className={btnSecondary}
              >
                Create the first one
              </button>
            </div>
          ) : (
            <div className="space-y-8">
              {hackathons.map((h: NonNullable<typeof hackathons>[number]) => {
                return (
                  <HackathonCard
                    key={h.id}
                    hackathon={h}
                    onEdit={() => setEditingId(h.id)}
                    onStatusChange={(_newStatus) => {
                      utils.hackathon.listAll.invalidate();
                    }}
                  />
                );
              })}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
