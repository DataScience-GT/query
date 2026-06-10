"use client";

import { useSession } from "next-auth/react";
import { trpc } from "@/lib/trpc";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { LiquidGlass } from "@/components/portal/LiquidGlass";
import { Clock, AlertCircle, Zap } from "lucide-react";
import { skipToken } from "@tanstack/react-query";

export default function ProjectsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [selectedHackathon, setSelectedHackathon] = useState<string | null>(
    null,
  );

  const { data: hackathonList } = trpc.hackathon.listAll.useQuery(undefined, {
    enabled: !!session,
  });

  const { data: projects, isLoading } = trpc.hackathon.projects.useQuery(
    selectedHackathon ? { hackathonId: selectedHackathon } : skipToken,
  );

  if (status === "unauthenticated") {
    router.push("/login");
    return null;
  }

  const getStatusColor = (projectStatus: string) => {
    switch (projectStatus) {
      case "submitted":
        return "bg-accent/10 text-accent border border-accent/20";
      case "judging":
        return "bg-amber-500/10 text-amber-400 border border-amber-500/20";
      case "winner":
        return "bg-yellow-500/10 text-yellow-400 border border-yellow-500/20";
      case "draft":
        return "bg-gray-500/10 text-[var(--text-muted)] border border-gray-500/20";
      default:
        return "bg-blue-500/10 text-blue-400 border border-blue-500/20";
    }
  };

  return (
    <>
      <div className="relative z-10 max-w-7xl mx-auto">
        {/* Animated Background */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-[-15%] left-[-10%] w-[700px] h-[700px] bg-gradient-to-r from-accent/6 via-emerald-900/12 to-purple-900/8 blur-[350px] rounded-sm" />
          <div className="absolute bottom-[-20%] right-[-8%] w-[600px] h-[600px] bg-gradient-to-r from-emerald-900/12 via-emerald-900/10 to-indigo-900/8 blur-[300px] rounded-sm" />
        </div>

        {/* Page Header - Enhanced */}
        <div className="relative mb-6 p-6 border border-[var(--border-subtle)] bg-gradient-to-br from-accent/8 via-emerald-900/12 to-transparent rounded-none overflow-hidden group hover:border-accent/40 transition-all duration-500">
          <div className="absolute inset-0 bg-gradient-to-r from-accent/5 via-transparent to-accent/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
          <div className="absolute -bottom-20 -right-20 w-56 h-56 bg-accent/10 rounded-sm blur-[100px] opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
          <p className="text-[10px] font-mono text-accent/60 uppercase tracking-[0.2em] mb-1 relative z-10 flex items-center gap-2">
            <Zap className="w-3 h-3" /> Hackathon Hub
          </p>
          <h1 className="relative text-3xl font-black text-[var(--text-primary)] tracking-tighter mb-3 group-hover:text-transparent group-hover:bg-clip-text group-hover:bg-gradient-to-r group-hover:from-accent group-hover:via-emerald-400 group-hover:to-accent transition-all duration-500">
            Projects{" "}
            <span className="text-accent italic font-bold">Manager</span>
          </h1>
          <p className="relative text-text-muted text-sm font-mono">
            Browse and manage hackathon projects submitted by participants.
          </p>
        </div>

        <div className="space-y-6">
          {/* Hackathon Selector */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 bg-[var(--bg-primary)]/30 border border-[var(--border-subtle)] rounded-none p-1">
              <select
                value={selectedHackathon || ""}
                onChange={(e) => setSelectedHackathon(e.target.value || null)}
                className="bg-transparent text-[var(--text-primary)] text-sm font-medium px-4 py-2 focus:outline-none cursor-pointer"
              >
                <option value="">Select a hackathon...</option>
                {hackathonList?.map((h) => (
                  <option key={h.id} value={h.id}>
                    {h.name}
                  </option>
                ))}
              </select>
            </div>
            <p className="text-[var(--text-subtle)] text-sm">
              {projects?.length || 0} total projects
            </p>
          </div>

          <div className="space-y-4">
            {!selectedHackathon ? (
              <LiquidGlass className="p-16 text-center">
                <h3 className="text-[var(--text-primary)] font-semibold mb-1">
                  Select a hackathon
                </h3>
                <p className="text-[var(--text-subtle)] text-sm">
                  Choose a hackathon above to view its submitted projects.
                </p>
              </LiquidGlass>
            ) : isLoading ? (
              <div className="py-12 text-center">
                <p className="text-gray-600 font-mono text-sm animate-pulse">
                  Loading projects...
                </p>
              </div>
            ) : !projects || projects.length === 0 ? (
              <LiquidGlass className="p-16 text-center">
                <div className="w-16 h-16 rounded-sm bg-white/5 flex items-center justify-center mx-auto mb-4 border border-[var(--border-subtle)]">
                  <svg
                    className="w-8 h-8 text-gray-600"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1}
                      d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                    />
                  </svg>
                </div>
                <h3 className="text-[var(--text-primary)] font-semibold mb-1">
                  No projects yet
                </h3>
                <p className="text-[var(--text-subtle)] text-sm">
                  Hackathon projects will appear here once participants submit
                  them.
                </p>
              </LiquidGlass>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {projects.map((project) => (
                  <LiquidGlass
                    key={project.id}
                    className="p-5 hover:border-accent/30 transition-all group"
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1">
                        <h3 className="text-lg font-bold text-[var(--text-primary)] group-hover:text-accent transition-colors">
                          {project.name}
                        </h3>
                        <p className="text-sm text-[var(--text-subtle)] mt-1 line-clamp-2">
                          {project.description || "No description"}
                        </p>
                      </div>
                      <span
                        className={`px-2 py-1 rounded-sm text-xs font-semibold ${getStatusColor(project.status)}`}
                      >
                        {project.status}
                      </span>
                    </div>

                    <div className="space-y-2 text-xs text-[var(--text-subtle)] font-mono">
                      {project.tracks && project.tracks.length > 0 && (
                        <div className="flex items-center gap-2">
                          <Clock className="h-3 w-3" />
                          <span>{project.tracks.join(", ")}</span>
                        </div>
                      )}
                      <div className="flex items-center gap-2">
                        <AlertCircle className="h-3 w-3" />
                        <span>Team: {project.team?.name || "Unknown"}</span>
                      </div>
                    </div>
                  </LiquidGlass>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
