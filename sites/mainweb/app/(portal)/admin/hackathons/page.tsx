"use client";

import { useSession } from "next-auth/react";
import { loginHref } from "@/lib/safe-callback";
import { trpc } from "@/lib/trpc";
import { LoadingScreen } from "@/components/portal/LoadingScreen";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { LiquidGlass } from "@/components/portal/LiquidGlass";

// Extracted Components

import { HackathonCard } from "@/components/admin/hackathons/HackathonCard";
import { CreateHackathonForm } from "@/components/admin/hackathons/CreateHackathonForm";
import { EditHackathonForm } from "@/components/admin/hackathons/EditHackathonForm";
import { Layers, Plus, Zap } from "lucide-react";

export default function AdminHackathonsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const utils = trpc.useUtils();

  const [showCreate, setShowCreate] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const { data: hackathons, isLoading } = trpc.hackathon.listAll.useQuery(
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
      <div className="relative z-10 max-w-7xl mx-auto">
        <div className="mb-6">
          <p className="text-[10px] font-mono text-accent/60 uppercase tracking-[0.2em] mb-2 flex items-center gap-2">
            <Zap className="w-3 h-3" /> Admin
          </p>
          <h1 className="text-3xl font-black text-[var(--text-primary)] tracking-wider font-oswald uppercase">
            Hackathons
          </h1>
          <p className="text-sm text-[var(--text-muted)] mt-1">
            Manage your hackathons, participants, and event check-in locations.
          </p>
        </div>
        <div className="flex items-center justify-between">
          <button
            onClick={() => setShowCreate(true)}
            className="inline-flex items-center gap-2 px-6 py-3 bg-accent text-[var(--text-on-accent)] rounded-sm font-bold text-sm uppercase tracking-widest hover:bg-[var(--accent-secondary)] transition-ui disabled:opacity-50"
          >
            <Plus className="w-4 h-4" />
            New hackathon
          </button>
        </div>

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

        <div className="space-y-8">
          {isLoading || hackathons === undefined ? (
            <div className="space-y-4">
              {[1, 2, 3].map((n) => (
                <div
                  key={n}
                  className="animate-pulse bg-white/5 border border-[var(--border-subtle)] rounded-sm p-6 h-36"
                />
              ))}
            </div>
          ) : hackathons.length === 0 ? (
            <LiquidGlass
              printed
              className="p-8 text-center flex flex-col items-center gap-3"
            >
              <div className="w-12 h-12 rounded-full bg-[var(--bg-secondary)] border border-[var(--border-subtle)] flex items-center justify-center">
                <Layers className="w-5 h-5 text-[var(--text-subtle)]" />
              </div>
              <p className="text-sm text-[var(--text-muted)]">
                No hackathons yet. Create your first one to get started.
              </p>
            </LiquidGlass>
          ) : (
            <div className="space-y-12">
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
