'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { trpc } from '@/lib/trpc';
import { LiquidGlass } from '@/components/portal/LiquidGlass';
import type { HackathonStatus } from '@/components/admin/hackathons/constants';
import { STATUSES } from '@/components/admin/hackathons/constants';

export function HackathonCard({
    hackathon,
    statusMeta,
    onEdit,
    onStatusChange,
}: {
    hackathon: {
        id: string;
        name: string;
        description?: string | null;
        location?: string | null;
        startDate: Date | string;
        endDate: Date | string;
        status: HackathonStatus;
        isPublic: boolean;
        currentParticipants: number;
        maxParticipants?: number | null;
    };
    statusMeta: (typeof STATUSES)[number];
    onEdit: () => void;
    onStatusChange: (s: HackathonStatus) => void;
}) {
    const [showStatusMenu, setShowStatusMenu] = useState(false);
    const utils = trpc.useUtils();

    const updateMutation = trpc.hackathon.update.useMutation({
        onSuccess: () => {
            utils.hackathon.listAll.invalidate();
            setShowStatusMenu(false);
            onStatusChange(hackathon.status);
        },
    });

    return (
        <LiquidGlass className="p-6 hover:border-white/20 transition-all">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-2">
                        <Link href={`/hackathons/${hackathon.id}`}>
                            <h3 className="text-lg font-bold text-white hover:text-[#00A8A8] transition-colors truncate">{hackathon.name}</h3>
                        </Link>
                    </div>
                    {hackathon.description && <p className="text-gray-400 text-sm mb-3 line-clamp-2">{hackathon.description}</p>}
                    <div className="flex flex-wrap gap-4 text-xs text-gray-500 font-mono">
                        <span>{hackathon.location || 'No location'}</span>
                        <span>•</span>
                        <span>{new Date(hackathon.startDate).toLocaleDateString()} – {new Date(hackathon.endDate).toLocaleDateString()}</span>
                        <span>•</span>
                        <span className="text-[#00A8A8]">{hackathon.currentParticipants}{hackathon.maxParticipants ? `/${hackathon.maxParticipants}` : ''} participants</span>
                    </div>
                </div>

                <div className="flex flex-wrap gap-3 relative">
                    <div className="relative">
                        <button
                            onClick={() => setShowStatusMenu(!showStatusMenu)}
                            className={`px-5 py-3 ${statusMeta.bg} border ${statusMeta.border} ${statusMeta.color} text-base font-semibold rounded-xl transition-colors flex items-center gap-2`}
                        >
                            {statusMeta.label} ▾
                        </button>
                        {showStatusMenu && (
                            <>
                                <div className="fixed inset-0 z-40" onClick={() => setShowStatusMenu(false)} />
                                <div className="absolute right-0 top-14 z-50 w-56 bg-[#111] border border-white/10 rounded-xl shadow-2xl overflow-hidden">
                                    {STATUSES.map((s) => (
                                        <button
                                            key={s.value}
                                            onClick={() => updateMutation.mutate({ id: hackathon.id, status: s.value })}
                                            disabled={hackathon.status === s.value || updateMutation.isPending}
                                            className={`w-full px-5 py-3.5 text-left text-base flex items-center gap-3 transition-colors disabled:opacity-30 ${hackathon.status === s.value ? 'bg-white/5' : 'hover:bg-white/5'
                                                }`}
                                        >
                                            <span className={`w-2 h-2 rounded-full ${s.bg.replace('/10', '')} ${s.color.replace('text-', 'bg-').replace('-400', '-500')}`} />
                                            <span className={hackathon.status === s.value ? 'text-white font-semibold' : 'text-gray-400'}>{s.label}</span>
                                        </button>
                                    ))}
                                </div>
                            </>
                        )}
                    </div>

                    <Link
                        href={`/admin/hackathons/${hackathon.id}`}
                        className="px-5 py-3 bg-white/5 border border-white/10 text-white text-base font-bold tracking-wider uppercase rounded-xl hover:bg-white/10 hover:border-white/20 transition-all flex items-center gap-2"
                    >
                        Dashboard <span className="text-lg leading-none">→</span>
                    </Link>

                    <button
                        onClick={onEdit}
                        className="px-5 py-3 border border-white/10 text-gray-400 text-base font-medium rounded-xl hover:bg-white/5 hover:text-white transition-colors"
                    >
                        Edit
                    </button>

                    <button
                        onClick={() => {
                            updateMutation.mutate({
                                id: hackathon.id,
                                isPublic: !hackathon.isPublic,
                            });
                        }}
                        className={`px-5 py-3 border text-base font-semibold rounded-xl transition-colors ${hackathon.isPublic
                            ? 'border-green-500/20 text-green-400 hover:bg-green-500/10'
                            : 'border-red-500/20 text-red-400 hover:bg-red-500/10'
                            }`}
                    >
                        {hackathon.isPublic ? 'Public' : 'Hidden'}
                    </button>
                </div>
            </div>
        </LiquidGlass>
    );
}
