"use client";

import { useSession } from "next-auth/react";
import { trpc } from "@/lib/trpc";
import { LoadingScreen } from "@/components/portal/LoadingScreen";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { LiquidGlass } from "@/components/portal/LiquidGlass";

// Extracted Components

import { HackathonCard } from "@/components/admin/hackathons/HackathonCard";
import { CreateHackathonForm } from "@/components/admin/hackathons/CreateHackathonForm";
import { EditHackathonForm } from "@/components/admin/hackathons/EditHackathonForm";
import { Zap } from "lucide-react";

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
    router.push("/login");
    return null;
  }

  return (
    <>
      <div className="relative z-10 max-w-7xl mx-auto">
        {/* Ambient Background */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-[-20%] left-[-10%] w-[700px] h-[700px] bg-gradient-to-r from-accent/6 via-emerald-900/12 to-purple-900/10 blur-[350px] rounded-sm" />
          <div className="absolute bottom-[-15%] right-[-8%] w-[600px] h-[600px] bg-gradient-to-r from-emerald-900/12 via-emerald-900/10 to-indigo-900/8 blur-[300px] rounded-sm" />
        </div>

        <div className="relative mb-6 p-6 border border-[var(--border-subtle)] bg-gradient-to-br from-accent/8 via-emerald-900/10 to-transparent rounded-none overflow-hidden group hover:border-accent/40 transition-ui duration-500">
          <div className="absolute inset-0 bg-gradient-to-r from-accent/5 via-transparent to-accent/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
          <div className="absolute -top-24 -right-24 w-56 h-56 bg-accent/10 rounded-sm blur-[100px] opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

          <p className="text-[10px] font-mono text-accent/60 uppercase tracking-[0.2em] mb-1 relative z-10 flex items-center gap-2">
            <Zap className="w-3 h-3" /> Hackathon Hub
          </p>
          <h1 className="relative text-3xl font-black text-[var(--text-primary)] tracking-tighter mb-2 group-hover:text-transparent group-hover:bg-clip-text group-hover:bg-gradient-to-r group-hover:from-white group-hover:via-emerald-100 to-gray-400 transition-ui duration-500">
            Hackathon <span className="text-accent italic">Manager</span>
          </h1>
          <p className="relative text-text-muted text-sm font-mono">
            Manage your hackathons, participants, and event check-in locations.
          </p>
        </div>
        <div className="flex items-center justify-between">
          <button
            onClick={() => setShowCreate(true)}
            className="px-6 py-3 bg-gradient-to-r from-accent to-accent text-[var(--text-primary)] font-semibold text-sm rounded-none active:scale-[0.98] transition-transform shadow-[4px_4px_0_0_var(--accent)]"
          >
            + New Hackathon
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
                  className="animate-pulse bg-white/5 border border-[var(--border-subtle)] rounded-none p-6 h-36"
                />
              ))}
            </div>
          ) : hackathons.length === 0 ? (
            <LiquidGlass className="p-16 text-center">
              <div className="w-16 h-16 rounded-sm bg-white/5 flex items-center justify-center mx-auto mb-4 border border-[var(--border-subtle)]">
                <svg
                  className="w-8 h-8 text-text-muted"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1}
                    d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
                  />
                </svg>
              </div>
              <h3 className="text-[var(--text-primary)] font-semibold mb-1">
                No hackathons yet
              </h3>
              <p className="text-text-muted text-sm font-mono">
                Create your first hackathon to get started.
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
