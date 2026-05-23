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
            <div className="flex flex-col gap-5">
                {/* Info Section */}
                <div className="min-w-0">
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

                {/* Actions Section — full width row */}
                <div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-white/5">
                    {/* Left group: Status + Visibility */}
                    <div className="flex items-center gap-3">
                        <div className="relative">
                            <button
                                onClick={() => setShowStatusMenu(!showStatusMenu)}
                                className={`whitespace-nowrap px-5 py-3 ${statusMeta.bg} border ${statusMeta.border} ${statusMeta.color} text-base font-semibold rounded-xl transition-colors flex items-center gap-2`}
                            >
                                {statusMeta.label} ▾
                            </button>
                            {showStatusMenu && (
                                <>
                                    <div className="fixed inset-0 z-40" onClick={() => setShowStatusMenu(false)} />
                                    <div className="absolute left-0 top-14 z-50 w-56 bg-[#111] border border-white/10 rounded-xl shadow-2xl overflow-hidden">
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

                        <button
                            onClick={() => {
                                updateMutation.mutate({
                                    id: hackathon.id,
                                    isPublic: !hackathon.isPublic,
                                });
                            }}
                            className={`whitespace-nowrap px-5 py-3 border text-base font-semibold rounded-xl transition-colors ${hackathon.isPublic
                                ? 'border-green-500/20 text-green-400 hover:bg-green-500/10'
                                : 'border-red-500/20 text-red-400 hover:bg-red-500/10'
                                }`}
                        >
                            {hackathon.isPublic ? '● Public' : '● Hidden'}
                        </button>
                    </div>

                    {/* Right group: Dashboard + Edit */}
                    <div className="flex items-center gap-3">
                        <button
                            onClick={onEdit}
                            className="whitespace-nowrap px-5 py-3 border border-white/10 text-gray-400 text-base font-medium rounded-xl hover:bg-white/5 hover:text-white transition-colors"
                        >
                            Edit
                        </button>

                        <Link
                            href={`/admin/hackathons/${hackathon.id}`}
                            className="whitespace-nowrap px-5 py-3 bg-gradient-to-r from-[#00A8A8] to-emerald-500 text-white text-base font-bold rounded-xl hover:shadow-[0_0_20px_rgba(0,168,168,0.3)] transition-all flex items-center gap-2"
                        >
                            Dashboard <span className="text-lg leading-none">→</span>
                        </Link>
                    </div>
                </div>
            </div>
        </LiquidGlass>
    );
}
