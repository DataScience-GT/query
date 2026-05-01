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
                <div className="mb-6 p-5 border border-white/5 bg-gradient-to-br from-[#00A8A8]/5 to-transparent rounded-2xl">
                  <h1 className="text-2xl font-black text-white tracking-tighter mb-2">
                    Hackathon <span className="text-[#00A8A8] italic">Manager</span>
                  </h1>
                  <p className="text-gray-400 text-sm">
                    Manage your hackathons, participants, and event check-in locations.
                  </p>
                </div>
                <div className="flex items-center justify-between">
                  <button
                    onClick={() => setShowCreate(true)}
                    className="px-6 py-3 bg-gradient-to-r from-[#00A8A8] to-emerald-500 text-white font-semibold text-sm rounded-xl active:scale-[0.98] transition-transform shadow-[0_0_20px_rgba(0,168,168,0.2)]"
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

                <div className="space-y-4">
                    <div className="flex items-center justify-between">
                        <div>
                            <h2 className="text-xl font-bold text-white">Hackathons</h2>
                            <p className="text-gray-500 text-sm">{hackathons?.length || 0} total</p>
                        </div>
                    </div>

                    {!hackathons || hackathons.length === 0 ? (
                        <LiquidGlass className="p-16 text-center">
                            <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mx-auto mb-4 border border-white/10">
                                <svg className="w-8 h-8 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>
                            </div>
                            <h3 className="text-white font-semibold mb-1">No hackathons yet</h3>
                            <p className="text-gray-500 text-sm font-mono">Create your first hackathon to get started.</p>
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
