'use client';

import { useSession } from 'next-auth/react';
import { trpc } from '@/lib/trpc';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import AdminLayout from '@/components/portal/AdminLayout';
import { LiquidGlass } from '@/components/portal/LiquidGlass';
import { Clock, AlertCircle } from 'lucide-react';
import { skipToken } from '@tanstack/react-query';

export default function ProjectsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [selectedHackathon, setSelectedHackathon] = useState<string | null>(null);

  const { data: hackathonList } = trpc.hackathon.listAll.useQuery(undefined, { enabled: !!session });

  const { data: projects, isLoading } = trpc.hackathon.projects.useQuery(
    selectedHackathon ? { hackathonId: selectedHackathon } : skipToken,
  );

  if (status === 'unauthenticated') {
    router.push('/login');
    return null;
  }

  const getStatusColor = (projectStatus: string) => {
    switch (projectStatus) {
      case 'submitted':
        return 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20';
      case 'judging':
        return 'bg-amber-500/10 text-amber-400 border border-amber-500/20';
      case 'winner':
        return 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/20';
      case 'draft':
        return 'bg-gray-500/10 text-gray-400 border border-gray-500/20';
      default:
        return 'bg-blue-500/10 text-blue-400 border border-blue-500/20';
    }
  };

  return (
    <AdminLayout>
      <div className="relative z-10 max-w-7xl mx-auto">
        {/* Page Header */}
        <div className="mb-6 p-5 border border-white/5 bg-gradient-to-br from-[#00A8A8]/5 to-transparent rounded-2xl">
          <h1 className="text-2xl font-black text-white tracking-tighter mb-2">
            Projects <span className="text-[#00A8A8] italic">Manager</span>
          </h1>
          <p className="text-gray-400 text-sm">
            Browse and manage hackathon projects submitted by participants.
          </p>
        </div>

        <div className="space-y-6">
          {/* Hackathon Selector */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 bg-black/30 border border-white/5 rounded-xl p-1">
              <select
                value={selectedHackathon || ''}
                onChange={(e) => setSelectedHackathon(e.target.value || null)}
                className="bg-transparent text-white text-sm font-medium px-4 py-2 focus:outline-none cursor-pointer"
              >
                <option value="">Select a hackathon...</option>
                {hackathonList?.map((h) => (
                  <option key={h.id} value={h.id}>{h.name}</option>
                ))}
              </select>
            </div>
            <p className="text-gray-500 text-sm">{projects?.length || 0} total projects</p>
          </div>

          <div className="space-y-4">
            {!selectedHackathon ? (
              <LiquidGlass className="p-16 text-center">
                <h3 className="text-white font-semibold mb-1">Select a hackathon</h3>
                <p className="text-gray-500 text-sm">Choose a hackathon above to view its submitted projects.</p>
              </LiquidGlass>
            ) : isLoading ? (
              <div className="py-12 text-center">
                <p className="text-gray-600 font-mono text-sm animate-pulse">Loading projects...</p>
              </div>
            ) : !projects || projects.length === 0 ? (
              <LiquidGlass className="p-16 text-center">
                <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mx-auto mb-4 border border-white/10">
                  <svg className="w-8 h-8 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                </div>
                <h3 className="text-white font-semibold mb-1">No projects yet</h3>
                <p className="text-gray-500 text-sm">Hackathon projects will appear here once participants submit them.</p>
              </LiquidGlass>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {projects.map((project) => (
                  <LiquidGlass key={project.id} className="p-5 hover:border-[#00A8A8]/30 transition-all group">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1">
                        <h3 className="text-lg font-bold text-white group-hover:text-[#00A8A8] transition-colors">
                          {project.name}
                        </h3>
                        <p className="text-sm text-gray-500 mt-1 line-clamp-2">{project.description || 'No description'}</p>
                      </div>
                      <span className={`px-2 py-1 rounded-full text-xs font-semibold ${getStatusColor(project.status)}`}>
                        {project.status}
                      </span>
                    </div>

                    <div className="space-y-2 text-xs text-gray-500 font-mono">
                      {project.tracks && project.tracks.length > 0 && (
                        <div className="flex items-center gap-2">
                          <Clock className="h-3 w-3" />
                          <span>{project.tracks.join(', ')}</span>
                        </div>
                      )}
                      <div className="flex items-center gap-2">
                        <AlertCircle className="h-3 w-3" />
                        <span>Team: {project.team?.name || 'Unknown'}</span>
                      </div>
                    </div>
                  </LiquidGlass>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
