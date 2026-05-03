'use client';

import { useSession } from 'next-auth/react';
import { trpc } from '@/lib/trpc';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { LiquidGlass } from '@/components/portal/LiquidGlass';
import AdminLayout from '@/components/portal/AdminLayout';

// Extracted Components
import { getStatusMeta } from '@/components/admin/hackathons/constants';
import { HackathonCard } from '@/components/admin/hackathons/HackathonCard';
import { CreateHackathonForm } from '@/components/admin/hackathons/CreateHackathonForm';
import { EditHackathonForm } from '@/components/admin/hackathons/EditHackathonForm';

export default function AdminHackathonsPage() {
    const { data: session, status } = useSession();
    const router = useRouter();
    const utils = trpc.useUtils();

    const [showCreate, setShowCreate] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);

    const { data: hackathons, isLoading } = trpc.hackathon.listAll.useQuery(undefined, { enabled: !!session });

    if (status === 'loading') return null;
    if (status === 'unauthenticated') {
        router.push('/login');
        return null;
    }

    return (
        <AdminLayout>
            <div className="relative z-10 max-w-7xl mx-auto">
                {/* Ambient Background */}
                <div className="absolute inset-0 overflow-hidden pointer-events-none">
                    <div className="absolute top-[-20%] left-[-10%] w-[700px] h-[700px] bg-gradient-to-r from-accent/6 via-cyan-900/12 to-purple-900/10 blur-[350px] rounded-full" />
                    <div className="absolute bottom-[-15%] right-[-8%] w-[600px] h-[600px] bg-gradient-to-r from-emerald-900/12 via-cyan-900/10 to-indigo-900/8 blur-[300px] rounded-full" />
                </div>

                <div className="relative mb-6 p-6 border border-white/5 bg-gradient-to-br from-accent/8 via-cyan-900/10 to-transparent rounded-2xl overflow-hidden group hover:border-accent/40 transition-all duration-500">
                  <div className="absolute inset-0 bg-gradient-to-r from-accent/5 via-transparent to-emerald-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                  <div className="absolute -top-24 -right-24 w-56 h-56 bg-accent/10 rounded-full blur-[100px] opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

                  <h1 className="relative text-3xl font-black text-white tracking-tighter mb-2 group-hover:text-transparent group-hover:bg-clip-text group-hover:bg-gradient-to-r group-hover:from-white group-hover:via-cyan-100 to-gray-400 transition-all duration-500">
                    Hackathon <span className="text-accent italic">Manager</span>
                  </h1>
                  <p className="relative text-text-muted text-sm font-mono">
                    Manage your hackathons, participants, and event check-in locations.
                  </p>
                </div>
                <div className="flex items-center justify-between gap-4 animate-in fade-in slide-in-from-bottom-2">
                  <button
                    onClick={() => setShowCreate(true)}
                    className="group relative px-8 py-3 bg-gradient-to-r from-accent to-emerald-500 text-white font-semibold text-sm rounded-xl active:scale-[0.98] transition-all duration-300 shadow-[0_0_25px_rgba(0,168,168,0.25)] hover:shadow-[0_0_35px_rgba(0,168,168,0.35)] hover:from-accent/90 hover:to-emerald-500/90 overflow-hidden"
                  >
                    <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/5 to-white/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700" />
                    <span className="relative flex items-center gap-2">
                      <svg className="w-4 h-4 group-hover:rotate-90 transition-transform duration-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                      </svg>
                      New Hackathon
                    </span>
                  </button>
                  {/* Ambient button glow */}
                  <div className="absolute inset-0 bg-accent/5 rounded-xl blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
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

                <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4">
                    <div className="flex items-center justify-between group">
                        <div className="space-y-1">
                            <h2 className="text-xl font-black text-white uppercase tracking-wide group-hover:text-transparent group-hover:bg-clip-text group-hover:bg-gradient-to-r group-hover:from-white group-hover:via-cyan-200 to-gray-400 transition-all duration-300">
                              Hackathons
                            </h2>
                            <p className="text-text-muted text-sm font-mono flex items-center gap-2">
                              <span className="w-1.5 h-1.5 rounded-full bg-accent shadow-[0_0_8px_#00A8A8]" />
                              {hackathons?.length || 0} {hackathons?.length === 1 ? 'event' : 'events'}
                            </p>
                        </div>
                        {/* Decorative element */}
                        <div className="hidden group-hover:flex items-center gap-2 text-accent/70 transition-all duration-300">
                          <svg className="w-4 h-4 animate-in slide-in-from-right-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H3" />
                          </svg>
                        </div>
                    </div>

                    {!hackathons || hackathons.length === 0 ? (
                        <LiquidGlass className="p-16 text-center">
                            <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mx-auto mb-4 border border-white/10">
                                <svg className="w-8 h-8 text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>
                            </div>
                            <h3 className="text-white font-semibold mb-1">No hackathons yet</h3>
                            <p className="text-text-muted text-sm font-mono">Create your first hackathon to get started.</p>
                        </LiquidGlass>
                    ) : (
                        <div className="space-y-4">
                            {hackathons.map((h: NonNullable<typeof hackathons>[number]) => {
                                const sm = getStatusMeta(h.status);
                                return (
                                    <HackathonCard
                                        key={h.id}
                                        hackathon={h}
                                        statusMeta={sm}
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
        </AdminLayout>
    );
}
