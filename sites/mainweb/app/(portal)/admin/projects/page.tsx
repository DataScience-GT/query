'use client';

import { useSession } from 'next-auth/react';
import { trpc } from '@/lib/trpc';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import AdminLayout from '@/components/portal/AdminLayout';
import { LiquidGlass } from '@/components/portal/LiquidGlass';
import { Plus, Star, Clock, AlertCircle } from 'lucide-react';

export default function ProjectsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const utils = trpc.useUtils();

  const { data: projects, isLoading, refetch } = trpc.project.listAll.useQuery(
    undefined,
    { enabled: !!session }
  );

  const [showCreateProject, setShowCreateProject] = useState(false);
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);

  const createProjectMutation = trpc.project.create.useMutation({
    onSuccess: () => {
      setShowCreateProject(false);
      utils.project.listAll.invalidate();
    },
  });

  const updateProjectMutation = trpc.project.update.useMutation({
    onSuccess: () => {
      setEditingProjectId(null);
      utils.project.listAll.invalidate();
    },
  });

  const deleteProjectMutation = trpc.project.delete.useMutation({
    onSuccess: () => {
      utils.project.listAll.invalidate();
    },
  });

  if (status === 'unauthenticated') {
    router.push('/login');
    return null;
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'accepted':
        return 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20';
      case 'reviewing':
        return 'bg-amber-500/10 text-amber-400 border border-amber-500/20';
      case 'rejected':
        return 'bg-red-500/10 text-red-400 border border-red-500/20';
      default:
        return 'bg-blue-500/10 text-blue-400 border border-blue-500/20';
    }
  };

  return (
    <AdminLayout>
      {showCreateProject && (
        <LiquidGlass className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowCreateProject(false)} />
          <div className="relative w-full max-w-2xl bg-[#0a0c10] border border-white/10 rounded-2xl p-6 max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-bold text-white mb-6">Create New Project</h2>
            {/* Form would go here - simplified for now */}
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-gray-400 mb-2">Project Name</label>
                <input
                  type="text"
                  className="w-full px-4 py-3 bg-black/30 border border-white/10 rounded-xl text-white placeholder:text-gray-500 focus:outline-none focus:border-[#00A8A8] focus:ring-2 focus:ring-[#00A8A8]/20"
                  placeholder="Enter project name..."
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-2">Description</label>
                <textarea
                  className="w-full px-4 py-3 bg-black/30 border border-white/10 rounded-xl text-white placeholder:text-gray-500 focus:outline-none focus:border-[#00A8A8] focus:ring-2 focus:ring-[#00A8A8]/20 min-h-[100px]"
                  placeholder="Project description..."
                />
              </div>
              <div className="flex justify-end gap-3">
                <button
                  onClick={() => setShowCreateProject(false)}
                  className="px-6 py-2 text-gray-400 hover:text-white transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => createProjectMutation.mutate({ name: '', description: '' })}
                  disabled={createProjectMutation.isPending}
                  className="px-6 py-2 bg-gradient-to-r from-[#00A8A8] to-emerald-600 text-white rounded-xl font-medium disabled:opacity-50"
                >
                  Create
                </button>
              </div>
            </div>
          </div>
        </LiquidGlass>
      )}

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
          <div className="flex items-center justify-between">
            <p className="text-gray-500 text-sm">{projects?.length || 0} total projects</p>
            <button
              onClick={() => setShowCreateProject(true)}
              className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-[#00A8A8] to-emerald-600 text-white text-sm font-medium rounded-xl hover:opacity-90 transition-opacity shadow-lg shadow-[#00A8A8]/20"
            >
              <Plus className="h-5 w-5" />
              New Project
            </button>
          </div>

          <div className="space-y-4">
            {isLoading ? (
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
                      {project.category && (
                        <div className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-[#00A8A8]" />
                          <span>{project.category}</span>
                        </div>
                      )}
                      {project.track && (
                        <div className="flex items-center gap-2">
                          <Clock className="h-3 w-3" />
                          <span>{project.track}</span>
                        </div>
                      )}
                      <div className="flex items-center gap-2">
                        <AlertCircle className="h-3 w-3" />
                        <span>{project.teamSize || 0} members</span>
                      </div>
                    </div>

                    <div className="flex gap-2 mt-4 pt-4 border-t border-white/5">
                      <button
                        onClick={() => setEditingProjectId(project.id)}
                        className="flex-1 px-3 py-2 text-xs text-[#00A8A8] border border-[#00A8A8]/20 rounded-lg hover:bg-[#00A8A8]/10 transition-colors text-center"
                      >
                        Edit
                      </button>
                      <button className="flex-1 px-3 py-2 text-xs text-red-400/70 border border-red-500/10 rounded-lg hover:bg-red-500/10 hover:text-red-400 transition-colors text-center">
                        Delete
                      </button>
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
