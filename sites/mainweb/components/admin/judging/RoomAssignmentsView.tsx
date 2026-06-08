'use client';

import React from 'react';
import { LiquidGlass } from '@/components/portal/LiquidGlass';

type Project = {
    id: string;
    name: string;
    tableNumber: number;
    zone: string | null;
    teamMembers?: string | null;
    tracks?: string[] | null;
    challenges?: string[] | null;
    isCreateX?: boolean | null;
};

type Ranking = {
    project: Project;
    voteCount: number;
    avgScore: number;
    weightedScore: number;
    confidenceLevel: string;
};

type RankingsData = {
    rankings: Ranking[];
};

type RoomAssignmentsViewProps = {
    rankings: RankingsData | null;
};

export function RoomAssignmentsView({ rankings }: RoomAssignmentsViewProps) {
    if (!rankings) return null;

    return (
        <LiquidGlass className="rounded-none overflow-hidden mb-12">
            <div className="p-6 border-b border-white/5">
                <h2 className="text-xl font-black text-white uppercase tracking-tight">
                    Room <span className="text-[#EAFF2B] italic">Assignments</span>
                </h2>
                <p className="text-xs text-gray-500 font-mono mt-1">{rankings.rankings.length} projects assigned</p>
            </div>
            <div className="overflow-x-auto">
                <table className="w-full">
                    <thead>
                        <tr className="text-[10px] text-gray-600 uppercase tracking-widest border-b border-white/5">
                            <th className="text-left py-3 px-6 font-mono">Table</th>
                            <th className="text-left py-3 px-6 font-mono">Project</th>
                            <th className="text-left py-3 px-6 font-mono">Team</th>
                            <th className="text-left py-3 px-6 font-mono">Main Track</th>
                            <th className="text-left py-3 px-6 font-mono">Extra Tracks</th>
                            <th className="text-left py-3 px-6 font-mono">Votes</th>
                            <th className="text-left py-3 px-6 font-mono">Avg Score</th>
                            <th className="text-left py-3 px-6 font-mono">Bayesian Fair</th>
                        </tr>
                    </thead>
                    <tbody>
                        {[...rankings.rankings]
                            .sort((a, b) => (a.project.tableNumber || 0) - (b.project.tableNumber || 0))
                            .map((r) => (
                                <tr key={r.project.id} className="border-b border-white/5 hover:bg-white/[0.02] transition-colors">
                                    <td className="py-4 px-6">
                                        <span className="text-lg font-black text-white tabular-nums">
                                            {r.project.zone || ''}{r.project.tableNumber || '?'}
                                        </span>
                                    </td>
                                    <td className="py-4 px-6">
                                        <p className="text-sm font-bold text-white">{r.project.name}</p>
                                    </td>
                                    <td className="py-4 px-6">
                                        <p className="text-xs text-gray-500 font-mono">{r.project.teamMembers || '-'}</p>
                                    </td>
                                    <td className="py-4 px-6">
                                        {r.project.tracks?.[0] ? (
                                            <span className="px-3 py-1 rounded-sm text-[9px] font-bold bg-[#EAFF2B]/10 text-[#EAFF2B] border border-[#EAFF2B]/20 uppercase tracking-widest">
                                                {r.project.tracks[0]}
                                            </span>
                                        ) : <span className="text-gray-600">-</span>}
                                    </td>
                                    <td className="py-4 px-6">
                                        <div className="flex flex-wrap gap-1">
                                            {(r.project.tracks?.slice(1) || []).concat(r.project.challenges || []).map((t: string, i: number) => (
                                                <span key={i} className="px-2 py-0.5 rounded-sm text-[8px] font-bold bg-white/5 text-gray-400 border border-white/10 uppercase tracking-widest">
                                                    {t}
                                                </span>
                                            ))}
                                            {r.project.isCreateX && (
                                                <span className="px-2 py-0.5 rounded-sm text-[8px] font-bold bg-purple-500/10 text-purple-400 border border-purple-500/20 uppercase tracking-widest">
                                                    CREATE-X
                                                </span>
                                            )}
                                            {!(r.project.tracks?.slice(1)?.length || r.project.challenges?.length || r.project.isCreateX) && (
                                                <span className="text-gray-600 text-xs">-</span>
                                            )}
                                        </div>
                                    </td>
                                    <td className="py-4 px-6">
                                        <span className="text-sm font-bold text-gray-400 tabular-nums">{r.voteCount}</span>
                                    </td>
                                    <td className="py-4 px-6">
                                        <span className="text-lg font-black text-white tabular-nums">{r.avgScore}</span>
                                        <span className="text-xs text-gray-600 ml-1">/50</span>
                                    </td>
                                    <td className="py-4 px-6">
                                        <div className="flex items-center gap-2">
                                            <span className="text-lg font-black text-[#EAFF2B] tabular-nums">{r.weightedScore}</span>
                                            <span className={`px-2 py-0.5 rounded-sm text-[8px] font-bold uppercase tracking-widest border ${r.confidenceLevel === 'HIGH' ? 'bg-green-500/20 text-green-400 border-green-500/30'
                                                : r.confidenceLevel === 'MEDIUM' ? 'bg-blue-500/20 text-blue-400 border-blue-500/30'
                                                    : 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30'
                                                }`}>{r.confidenceLevel}</span>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                    </tbody>
                </table>
            </div>
        </LiquidGlass>
    );
}
