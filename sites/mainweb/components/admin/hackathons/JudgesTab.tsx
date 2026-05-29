'use client';

import React, { useState } from 'react';
import Image from 'next/image';
import { trpc } from '@/lib/trpc';
import { LiquidGlass } from '@/components/portal/LiquidGlass';
import { Shield, UserPlus, Trash2, Eye, EyeOff, Gavel } from 'lucide-react';

export function JudgesTab({ hackathonId }: { hackathonId: string }) {
    const utils = trpc.useUtils();

    const { data: allJudges, isLoading: judgesLoading } = trpc.judge.list.useQuery();
    const { data: judgingStatus } = trpc.judge.getJudgingStatus.useQuery({ hackathonId });
    const { data: rankings } = trpc.judge.getRankings.useQuery({ hackathonId });

    const toggleJudging = trpc.judge.toggleJudging.useMutation({
        onSuccess: () => {
            utils.judge.getJudgingStatus.invalidate({ hackathonId });
        },
    });

    const assignJudge = trpc.judge.assignToHackathon.useMutation({
        onSuccess: () => {
            utils.judge.list.invalidate();
        },
    });

    const [showAddForm, setShowAddForm] = useState(false);
    const [selectedJudgeId, setSelectedJudgeId] = useState('');
    const [assignTrack, setAssignTrack] = useState('');

    // Find judges assigned to THIS hackathon
    const assignedJudges = allJudges?.filter((j) =>
        j.assignments.some((a) => a.hackathon?.id === hackathonId)
    ) || [];

    // Find judges NOT yet assigned to this hackathon
    const unassignedJudges = allJudges?.filter((j) =>
        !j.assignments.some((a) => a.hackathon?.id === hackathonId)
    ) || [];

    // Judge stats from rankings
    const judgeStatsMap = new Map<string, { projectsJudged: number; avgScore: number }>();
    if (rankings?.rankings) {
        rankings.rankings.forEach((r) => {
            r.votes.forEach((v) => {
                const existing = judgeStatsMap.get(v.judgeName) || { projectsJudged: 0, avgScore: 0 };
                existing.projectsJudged += 1;
                existing.avgScore = ((existing.avgScore * (existing.projectsJudged - 1)) + v.score) / existing.projectsJudged;
                judgeStatsMap.set(v.judgeName, existing);
            });
        });
    }

    if (judgesLoading) {
        return <div className="text-gray-500 font-mono text-center py-20 animate-pulse">Loading Judges...</div>;
    }

    return (
        <div className="animate-in fade-in slide-in-from-bottom-4 duration-300 space-y-6">
            {/* Judging Control Panel */}
            <LiquidGlass className="p-6 border-white/5 relative overflow-hidden">
                <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-purple-500/30 to-transparent" />
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                    <div>
                        <h3 className="text-sm font-bold text-white uppercase tracking-widest flex items-center gap-2 mb-2">
                            <Gavel className="w-4 h-4 text-purple-400" />
                            Judging Controls
                        </h3>
                        <div className="flex items-center gap-2">
                            <span className="text-xs font-mono text-gray-500 uppercase tracking-wider">Status:</span>
                            <span className={`px-2 py-1 rounded text-xs font-mono font-bold uppercase tracking-wider ${judgingStatus?.active ? 'text-green-400 bg-green-500/10 border border-green-500/20' : 'text-red-400 bg-red-500/10 border border-red-500/20'}`}>
                                {judgingStatus?.active ? 'LIVE' : 'INACTIVE'}
                            </span>
                        </div>
                    </div>
                    <button
                        onClick={() => toggleJudging.mutate({ hackathonId, active: !judgingStatus?.active })}
                        disabled={toggleJudging.isPending}
                        className={`px-6 py-3 text-sm font-bold uppercase tracking-wider rounded-xl transition-all disabled:opacity-50 ${
                            judgingStatus?.active
                                ? 'bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20'
                                : 'bg-green-500/10 border border-green-500/20 text-green-400 hover:bg-green-500/20'
                        }`}
                    >
                        {judgingStatus?.active ? 'Stop Judging' : 'Start Judging'}
                    </button>
                </div>
            </LiquidGlass>

            {/* Stats */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-4 rounded-xl bg-purple-500/5 border border-purple-500/15 text-left">
                    <p className="text-2xl font-black font-mono text-purple-400">{assignedJudges.length}</p>
                    <p className="text-[10px] font-mono text-gray-500 uppercase tracking-widest mt-1">Assigned Judges</p>
                </div>
                <div className="p-4 rounded-xl bg-white/5 border border-white/10 text-left">
                    <p className="text-2xl font-black font-mono text-white">{allJudges?.length || 0}</p>
                    <p className="text-[10px] font-mono text-gray-500 uppercase tracking-widest mt-1">Total Judges</p>
                </div>
                <div className="p-4 rounded-xl bg-cyan-500/5 border border-cyan-500/15 text-left">
                    <p className="text-2xl font-black font-mono text-cyan-400">{rankings?.rankings?.length || 0}</p>
                    <p className="text-[10px] font-mono text-gray-500 uppercase tracking-widest mt-1">Projects</p>
                </div>
                <div className="p-4 rounded-xl bg-amber-500/5 border border-amber-500/15 text-left">
                    <p className="text-2xl font-black font-mono text-amber-400">
                        {rankings?.rankings?.reduce((sum, r) => sum + r.votes.length, 0) || 0}
                    </p>
                    <p className="text-[10px] font-mono text-gray-500 uppercase tracking-widest mt-1">Total Votes</p>
                </div>
            </div>

            {/* Assigned Judges */}
            <div>
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-xl font-bold text-white uppercase tracking-wider">Assigned Judges</h2>
                    <button
                        onClick={() => setShowAddForm(!showAddForm)}
                        className="px-4 py-2 bg-purple-500/10 border border-purple-500/20 text-purple-400 rounded-xl text-xs font-bold uppercase tracking-wider hover:bg-purple-500/20 transition-colors flex items-center gap-1.5"
                    >
                        <UserPlus className="w-3.5 h-3.5" /> Assign Judge
                    </button>
                </div>

                {/* Quick Assign Form */}
                {showAddForm && unassignedJudges.length > 0 && (
                    <LiquidGlass className="p-6 mb-4 border-white/5">
                        <div className="flex flex-col sm:flex-row gap-4 items-end">
                            <div className="flex-1">
                                <label className="block text-xs uppercase tracking-[0.15em] font-bold text-gray-500 mb-2 font-mono">Select Judge</label>
                                <select
                                    value={selectedJudgeId}
                                    onChange={(e) => setSelectedJudgeId(e.target.value)}
                                    className="w-full px-4 py-3 bg-black/40 border border-white/10 rounded-lg text-white text-sm font-mono focus:border-purple-500/50 focus:outline-none transition-colors"
                                >
                                    <option value="">Choose a judge...</option>
                                    {unassignedJudges.map((j) => (
                                        <option key={j.id} value={j.id}>{j.user?.name || j.name || j.user?.email || 'Unknown'}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="w-40">
                                <label className="block text-xs uppercase tracking-[0.15em] font-bold text-gray-500 mb-2 font-mono">Track</label>
                                <input
                                    type="text"
                                    value={assignTrack}
                                    onChange={(e) => setAssignTrack(e.target.value)}
                                    placeholder="e.g. AI, Web3"
                                    className="w-full px-4 py-3 bg-black/40 border border-white/10 rounded-lg text-white text-sm font-mono placeholder:text-gray-600 focus:border-purple-500/50 focus:outline-none transition-colors"
                                />
                            </div>
                            <button
                                onClick={() => {
                                    if (!selectedJudgeId) return;
                                    assignJudge.mutate({
                                        judgeId: selectedJudgeId,
                                        hackathonId,
                                        track: assignTrack || undefined,
                                    });
                                    setSelectedJudgeId('');
                                    setAssignTrack('');
                                    setShowAddForm(false);
                                }}
                                disabled={!selectedJudgeId || assignJudge.isPending}
                                className="px-6 py-3 bg-gradient-to-r from-purple-500 to-purple-600 text-white font-semibold text-sm rounded-xl active:scale-[0.98] transition-transform shadow-lg shadow-purple-500/20 disabled:opacity-50 whitespace-nowrap"
                            >
                                Assign
                            </button>
                        </div>
                    </LiquidGlass>
                )}

                {/* Judges Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {assignedJudges.length === 0 ? (
                        <div className="md:col-span-2 lg:col-span-3 p-8 bg-white/[0.01] border border-dashed border-white/5 rounded-xl text-center">
                            <p className="text-gray-500 font-mono text-xs uppercase tracking-widest">No judges assigned yet. Click "Assign Judge" to add one.</p>
                        </div>
                    ) : (
                        assignedJudges.map((judge) => {
                            const assignment = judge.assignments.find((a) => a.hackathon?.id === hackathonId);
                            const stats = judgeStatsMap.get(judge.user?.name || judge.name || '');

                            return (
                                <LiquidGlass key={judge.id} className="p-5 border-white/5 hover:border-purple-500/20 transition-all">
                                    <div className="flex items-start gap-3">
                                        <Image
                                            src={judge.user?.image || '/avatar-placeholder.png'}
                                            alt="Judge"
                                            width={40}
                                            height={40}
                                            className="rounded-full bg-black shrink-0"
                                        />
                                        <div className="flex-1 min-w-0">
                                            <p className="text-white font-bold text-sm truncate">{judge.user?.name || judge.name}</p>
                                            <p className="text-gray-500 text-xs font-mono truncate">{judge.user?.email}</p>
                                            <div className="flex items-center gap-2 mt-2 flex-wrap">
                                                {assignment?.track && (
                                                    <span className="px-2 py-0.5 text-[9px] font-mono rounded bg-purple-500/10 text-purple-400 border border-purple-500/20 uppercase tracking-widest">
                                                        {assignment.track}
                                                    </span>
                                                )}
                                                {assignment?.isLead && (
                                                    <span className="px-2 py-0.5 text-[9px] font-mono rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 uppercase tracking-widest">
                                                        Lead
                                                    </span>
                                                )}
                                                <span className={`px-2 py-0.5 text-[9px] font-mono rounded uppercase tracking-widest ${judge.isActive ? 'bg-green-500/10 text-green-400 border border-green-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'}`}>
                                                    {judge.isActive ? 'Active' : 'Inactive'}
                                                </span>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Stats */}
                                    {stats && (
                                        <div className="grid grid-cols-2 gap-2 mt-4 pt-3 border-t border-white/5">
                                            <div>
                                                <p className="text-[8px] font-mono text-gray-500 uppercase tracking-widest">Judged</p>
                                                <p className="text-sm font-bold text-white font-mono">{stats.projectsJudged} projects</p>
                                            </div>
                                            <div>
                                                <p className="text-[8px] font-mono text-gray-500 uppercase tracking-widest">Avg Score</p>
                                                <p className="text-sm font-bold text-accent font-mono">{Math.round(stats.avgScore)}/50</p>
                                            </div>
                                        </div>
                                    )}
                                </LiquidGlass>
                            );
                        })
                    )}
                </div>
            </div>
        </div>
    );
}
