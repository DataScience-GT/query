'use client';

import React, { useState } from 'react';
import { LiquidGlass } from '@/components/portal/LiquidGlass';

type Project = {
    id: string;
    name: string;
    tableNumber: number;
    zone: string | null;
    category?: string | null;
    teamMembers?: string | null;
    tracks?: string[] | null;
    challenges?: string[] | null;
    isCreateX?: boolean | null;
};

type Vote = {
    score: number;
    scoreCreativity: number | null;
    scoreImpact: number | null;
    scoreScope: number | null;
    scoreClarity: number | null;
    scoreSoundness: number | null;
    comment: string | null;
    durationSeconds: number | null;
    judgeName: string;
};

type Ranking = {
    project: Project;
    totalScore: number;
    voteCount: number;
    avgScore: number;
    categoryAvg: {
        creativity: number;
        impact: number;
        scope: number;
        clarity: number;
        soundness: number;
    };
    votes: Vote[];
    weightedScore: number;
    confidenceLevel: "NONE" | "LOW" | "MEDIUM" | "HIGH";
};

type Tie = {
    score: number;
    projects: { id: string; name: string; tableNumber: number; zone: string | null }[];
};

type RankingsData = {
    rankings: Ranking[];
    globalAvg: number;
    ties: Tie[];
    hasTies: boolean;
};

type ProcessedRanking = Ranking & {
    displayScore: number;
};

type Judge = {
    id: string;
    name: string | null;
    isActive: boolean;
    specialty?: string | null;
    user?: {
        email: string;
        image?: string | null;
    };
    assignments: {
        hackathonId: string;
        track?: string | null;
    }[];
};

type RankingsViewProps = {
    rankings: RankingsData | null;
    processedRankings: ProcessedRanking[];
    selectedTrack: string;
    judges: Judge[];
    selectedHackathon: string | null;
};

export function RankingsView({
    rankings,
    processedRankings,
    selectedTrack,
    judges,
    selectedHackathon,
}: RankingsViewProps) {
    const [expandedProject, setExpandedProject] = useState<string | null>(null);

    const confidenceBadge = (level: string) => {
        if (level === 'LOW') return <span className="ml-2 px-2 py-0.5 rounded-full text-[8px] font-bold bg-yellow-500/20 text-yellow-400 border border-yellow-500/30">⚠ LOW</span>;
        if (level === 'MEDIUM') return <span className="ml-2 px-2 py-0.5 rounded-full text-[8px] font-bold bg-blue-500/20 text-blue-400 border border-blue-500/30">● MED</span>;
        if (level === 'HIGH') return <span className="ml-2 px-2 py-0.5 rounded-full text-[8px] font-bold bg-green-500/20 text-green-400 border border-green-500/30">◉ HIGH</span>;
        return <span className="ml-2 px-2 py-0.5 rounded-full text-[8px] font-bold bg-gray-500/20 text-gray-500 border border-gray-500/30">—</span>;
    };

    return (
        <>
            {/* Download CSV */}
            {rankings && rankings.rankings.length > 0 && (
                <div className="flex justify-end mb-6">
                    <button
                        onClick={() => {
                            const sorted = [...rankings.rankings].sort((a, b) => b.weightedScore - a.weightedScore);
                            const headers = ['Rank', 'Project', 'Table', 'Main Track', 'Extra Tracks', 'Votes', 'Avg Score', 'Bayesian Fair Score', 'Confidence', 'Judge Details'];
                            const rows = sorted.map((r, i) => {
                                const judgeDetails = r.votes.map((v: { judgeName: string; score: number | null; durationSeconds: number | null }) =>
                                    `${v.judgeName}: ${v.score}/50 (${v.durationSeconds ? Math.floor(v.durationSeconds / 60) + ':' + String(v.durationSeconds % 60).padStart(2, '0') : 'N/A'})`
                                ).join(' | ');
                                return [
                                    i + 1,
                                    `"${r.project.name} (${r.project.zone || ''}${r.project.tableNumber})"`,

                                    r.project.zone ? `${r.project.zone}${r.project.tableNumber}` : r.project.tableNumber,
                                    r.project.tracks?.[0] || '',
                                    `"${(r.project.tracks?.slice(1) || []).concat(r.project.challenges || []).join(', ')}"`,
                                    r.voteCount,
                                    r.avgScore,
                                    r.weightedScore,
                                    r.confidenceLevel,
                                    `"${judgeDetails}"`,
                                ].join(',');
                            });
                            const csv = [headers.join(','), ...rows].join('\n');
                            const blob = new Blob([csv], { type: 'text/csv' });
                            const url = URL.createObjectURL(blob);
                            const a = document.createElement('a');
                            a.href = url;
                            a.download = `rankings_${new Date().toISOString().slice(0, 10)}.csv`;
                            a.click();
                            URL.revokeObjectURL(url);
                        }}
                        className="px-8 py-4 bg-[#00A8A8]/10 border border-[#00A8A8]/40 text-[#00A8A8] font-bold text-xs uppercase tracking-widest rounded-xl hover:bg-[#00A8A8]/20 transition-all font-mono"
                    >
                        Download Results CSV
                    </button>
                </div>
            )}
            {/* Tie Warning — Overall */}
            {rankings?.hasTies && (
                <LiquidGlass className="border border-yellow-500/30 rounded-lg p-8 mb-6 shadow-[0_0_40px_rgba(234,179,8,0.05)] animate-in slide-in-from-top-4 duration-500">
                    <div className="flex items-center gap-4 mb-6">
                        <div className="w-3 h-3 bg-yellow-500 rounded-full animate-pulse shadow-[0_0_15px_rgba(234,179,8,0.5)]" />
                        <h3 className="text-2xl font-black text-yellow-500 uppercase italic tracking-tighter">Weighted Score Collision</h3>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {rankings.ties.map((tie: { score: number; projects: { id: string; name: string; tableNumber: number; zone: string | null }[] }, i: number) => (
                            <div key={i} className="bg-white/5 border border-white/5 p-4 rounded-xl font-mono">
                                <p className="text-[10px] text-gray-500 uppercase tracking-widest mb-2 font-black">Weighted Score: {tie.score}</p>
                                <div className="space-y-1">
                                    {tie.projects.map((p) => (
                                        <p key={p.id} className="text-white text-sm">&gt; {p.name} <span className="text-gray-500">({p.zone || ''}{p.tableNumber})</span></p>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                    <p className="text-[10px] text-yellow-500/40 mt-6 font-mono uppercase tracking-[0.4em] text-center border-t border-white/5 pt-4">
                        Manual Tiebreaker Protocol Recommended
                    </p>
                </LiquidGlass>
            )}

            {/* Projected Winners Section */}
            {rankings && rankings.rankings.length > 0 && (
                <div className="mb-12">
                    <h2 className="text-3xl font-black text-white italic uppercase tracking-tighter mb-6">
                        Projected <span className="text-[#00A8A8]">Winners</span>
                    </h2>

                    {/* Logic Calculation */}
                    {(() => {
                        // 1. Identify Overall Winners (Top 3) by weighted score
                        const sortedByScore = [...rankings.rankings].sort((a, b) => b.weightedScore - a.weightedScore);
                        const overallWinners = sortedByScore.slice(0, 3);
                        const overallWinnerIds = new Set(overallWinners.map((r) => r.project.id));

                        // 2. Identify Track Winners (Top 1 per Track, excluding Overall)
                        const allTracks = Array.from(new Set(rankings.rankings.flatMap((r) => r.project.tracks || []))) as string[];
                        const trackWinners: Record<string, Ranking> = {};
                        const usedWinnerIds = new Set(overallWinnerIds);

                        allTracks.forEach(track => {
                            const projectsInTrack = rankings.rankings.filter((r) => r.project.tracks?.includes(track));

                            const sortedTrackProjects = [...projectsInTrack].sort((a, b) => {
                                return b.weightedScore - a.weightedScore;
                            });

                            const candidate = sortedTrackProjects.find(r => !usedWinnerIds.has(r.project.id));

                            if (candidate) {
                                trackWinners[track] = candidate;
                                usedWinnerIds.add(candidate.project.id);
                            }
                        });


                        return (
                            <div className="space-y-8">
                                {/* Scoring Method Info */}
                                <div className="flex items-center gap-3 px-4 py-3 bg-white/[0.02] border border-white/5 rounded-lg">
                                    <div className="w-2 h-2 rounded-full bg-[#00A8A8]" />
                                    <p className="text-[10px] font-mono text-gray-500 uppercase tracking-widest">
                                        Bayesian Weighted Ranking // Global Avg: <span className="text-[#00A8A8] font-bold">{rankings.globalAvg}</span> // C=2
                                    </p>
                                </div>

                                {/* Overall Winners */}
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                    {overallWinners.map((w, i) => (
                                        <LiquidGlass key={w.project.id} className={`p-6 rounded-xl border-t-4 ${i === 0 ? 'border-yellow-500 shadow-[0_0_30px_rgba(234,179,8,0.2)]' :
                                            i === 1 ? 'border-gray-400' :
                                                'border-orange-700'
                                            }`}>
                                            <p className="text-[10px] text-gray-500 uppercase tracking-widest mb-2 font-bold">
                                                {i === 0 ? 'Grand Prize' : i === 1 ? '2nd Place' : '3rd Place'}
                                            </p>
                                            <h3 className="text-xl font-black text-white uppercase mb-1">{w.project.name}</h3>
                                            <div className="flex items-end gap-3 mb-2">
                                                <p className="text-3xl font-black text-[#00A8A8] tabular-nums">{w.weightedScore}</p>
                                                <p className="text-sm text-gray-600 font-mono tabular-nums mb-1">avg {w.avgScore}</p>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <p className="text-xs text-gray-500 font-mono">{w.voteCount} judge{w.voteCount !== 1 ? 's' : ''}</p>
                                                {confidenceBadge(w.confidenceLevel)}
                                            </div>
                                        </LiquidGlass>
                                    ))}
                                </div>

                                {/* Track Winners */}
                                {Object.keys(trackWinners).length > 0 && (
                                    <div>
                                        <h3 className="text-sm text-gray-400 uppercase tracking-widest mb-4 font-mono font-bold pl-2 border-l-2 border-[#00A8A8]">
                                            Track Winners (Excl. Overall)
                                        </h3>
                                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                                            {Object.entries(trackWinners).map(([track, w]) => (
                                                <div key={track} className="bg-white/5 border border-white/5 rounded-lg p-5 hover:bg-white/10 transition-colors">
                                                    <p className="text-[10px] text-blue-400 uppercase tracking-widest mb-2 font-bold">{track}</p>
                                                    <h4 className="text-lg font-bold text-white mb-1 truncate" title={w.project.name}>{w.project.name}</h4>
                                                    <div className="flex items-end gap-2">
                                                        <p className="text-xl font-bold text-gray-400 tabular-nums">{w.weightedScore}</p>
                                                    </div>
                                                    <div className="flex items-center gap-1 mt-1">
                                                        <p className="text-[10px] text-gray-600 font-mono">{w.voteCount}J</p>
                                                        {confidenceBadge(w.confidenceLevel)}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })()}
                </div>
            )}

            {/* Rankings Table */}
            <div className="space-y-6">
                <div className="flex justify-between items-end mb-4">
                    <div>
                        <p className="text-xs text-gray-600 uppercase tracking-[0.4em] mb-2 font-mono">Metrics Log</p>
                        <h2 className="text-3xl font-black text-white italic uppercase tracking-tighter">
                            Evaluated Rankings {selectedTrack !== 'ALL' && <span className="text-[#00A8A8]">:: {selectedTrack}</span>}
                        </h2>
                    </div>
                    <div className="px-4 py-2 bg-white/5 border border-white/5 rounded-lg text-[10px] font-mono uppercase tracking-widest text-[#00A8A8]">
                        Displaying: {processedRankings.length} Nodes
                    </div>
                </div>

                {!rankings ? (
                    <div className="bg-black/40 border border-white/5 rounded-lg p-24 text-center backdrop-blur-md">
                        <p className="text-[#00A8A8] font-mono animate-pulse uppercase tracking-[0.5em] text-xs">Awaiting Data Packet...</p>
                    </div>
                ) : processedRankings.length === 0 ? (
                    <div className="bg-black/40 border border-white/5 rounded-lg p-24 text-center backdrop-blur-md">
                        <p className="text-gray-500 font-mono uppercase tracking-widest text-xs mb-2">0 Records Found</p>
                        <p className="text-gray-700 text-[10px] uppercase font-mono">No submissions detected for the specified search parameters.</p>
                    </div>
                ) : (
                    <LiquidGlass className="rounded-lg overflow-hidden shadow-[0_20px_50px_rgba(0,0,0,0.5)]">
                        <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="border-b border-white/5 bg-white/[0.02]">
                                        <th className="px-6 py-6 text-[10px] font-mono text-gray-500 uppercase tracking-[0.2em]">Pos</th>
                                        <th className="px-4 py-6 text-[10px] font-mono text-gray-500 uppercase tracking-[0.2em]">Node</th>
                                        <th className="px-4 py-6 text-[10px] font-mono text-gray-500 uppercase tracking-[0.2em]">Identifier</th>
                                        <th className="px-4 py-6 text-[10px] font-mono text-[#00A8A8] uppercase tracking-[0.2em] text-right" title="Bayesian Weighted Score">Weighted</th>
                                        <th className="px-4 py-6 text-[10px] font-mono text-gray-500 uppercase tracking-[0.2em] text-right">Avg</th>

                                        {/* Rubric Headers */}
                                        <th className="px-3 py-6 text-[10px] font-mono text-gray-500 uppercase tracking-[0.2em] text-center" title="Creativity">CRE</th>
                                        <th className="px-3 py-6 text-[10px] font-mono text-gray-500 uppercase tracking-[0.2em] text-center" title="Impact">IMP</th>
                                        <th className="px-3 py-6 text-[10px] font-mono text-gray-500 uppercase tracking-[0.2em] text-center" title="Scope">SCP</th>
                                        <th className="px-3 py-6 text-[10px] font-mono text-gray-500 uppercase tracking-[0.2em] text-center" title="Clarity">CLR</th>
                                        <th className="px-3 py-6 text-[10px] font-mono text-gray-500 uppercase tracking-[0.2em] text-center" title="Soundness">SND</th>

                                        <th className="px-4 py-6 text-[10px] font-mono text-gray-500 uppercase tracking-[0.2em] text-right">Judges</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-white/5">
                                    {processedRankings.map((r, idx) => {
                                        const isExpanded = expandedProject === r.project.id;
                                        const isTied = rankings?.ties.some((t: { projects: { id: string }[] }) =>
                                            t.projects.some(p => p.id === r.project.id)
                                        );

                                        return (
                                            <React.Fragment key={r.project.id}>
                                                <tr
                                                    className={`group cursor-pointer transition-all duration-300 ${isTied ? 'bg-yellow-500/[0.03]' : 'hover:bg-black/40'
                                                        } ${isExpanded ? 'bg-white/[0.05]' : ''}`}
                                                    onClick={() =>
                                                        setExpandedProject(isExpanded ? null : r.project.id)
                                                    }
                                                >
                                                    <td className="px-8 py-8">
                                                        <span className={`text-4xl font-black italic tracking-tighter ${idx === 0 ? 'text-[#00A8A8] drop-shadow-[0_0_15px_rgba(0,168,168,0.4)]' :
                                                            idx < 3 ? 'text-white/80' : 'text-gray-600'
                                                            }`}>
                                                            {String(idx + 1).padStart(2, '0')}
                                                        </span>
                                                    </td>
                                                    <td className="px-8 py-8">
                                                        <div className="space-y-1">
                                                            <p className="text-sm font-mono text-gray-500 uppercase tracking-widest font-bold">Node {r.project.zone}{r.project.tableNumber}</p>
                                                            <p className="text-xs text-gray-700 font-mono">ID: {r.project.id.slice(-6).toUpperCase()}</p>
                                                        </div>
                                                    </td>
                                                    <td className="px-8 py-8">
                                                        <div>
                                                            <div className="flex items-center gap-3 mb-1">
                                                                <p className="text-xl font-bold text-white uppercase group-hover:text-[#00A8A8] transition-colors duration-300">{r.project.name}</p>
                                                                <div className="flex flex-wrap gap-1">
                                                                    {r.project.tracks?.map((t: string) => (
                                                                        <span key={t} className="px-2 py-0.5 rounded bg-white/5 border border-white/10 text-[8px] font-mono text-gray-400 uppercase tracking-widest">
                                                                            {t}
                                                                        </span>
                                                                    ))}
                                                                    {r.project.challenges?.map((c: string) => (
                                                                        <span key={c} className="px-2 py-0.5 rounded bg-[#00A8A8]/10 border border-[#00A8A8]/30 text-[8px] font-mono text-[#00A8A8] uppercase tracking-widest">
                                                                            {c}
                                                                        </span>
                                                                    ))}
                                                                    {r.project.isCreateX && (
                                                                        <span className="px-2 py-0.5 rounded bg-yellow-500/10 border border-yellow-500/30 text-[8px] font-mono text-yellow-500 uppercase tracking-widest">
                                                                            CREATE-X
                                                                        </span>
                                                                    )}
                                                                </div>
                                                            </div>
                                                            {r.project.teamMembers && (
                                                                <p className="text-xs text-gray-500 font-mono uppercase tracking-widest">{r.project.teamMembers}</p>
                                                            )}
                                                        </div>
                                                    </td>
                                                    <td className="px-4 py-8 text-right">
                                                        <span className={`text-3xl font-black tabular-nums text-[#00A8A8]`}>
                                                            {r.displayScore}
                                                        </span>
                                                    </td>
                                                    <td className="px-4 py-8 text-right text-gray-400 font-mono tabular-nums text-lg">{r.avgScore}</td>

                                                    <td className="px-3 py-8 text-center text-gray-400 font-mono tabular-nums text-sm">{r.categoryAvg?.creativity ?? '-'}</td>
                                                    <td className="px-3 py-8 text-center text-gray-400 font-mono tabular-nums text-sm">{r.categoryAvg?.impact ?? '-'}</td>
                                                    <td className="px-3 py-8 text-center text-gray-400 font-mono tabular-nums text-sm">{r.categoryAvg?.scope ?? '-'}</td>
                                                    <td className="px-3 py-8 text-center text-gray-400 font-mono tabular-nums text-sm">{r.categoryAvg?.clarity ?? '-'}</td>
                                                    <td className="px-3 py-8 text-center text-gray-400 font-mono tabular-nums text-sm">{r.categoryAvg?.soundness ?? '-'}</td>

                                                    <td className="px-4 py-8 text-right">
                                                        <span className="text-gray-600 font-mono tabular-nums text-lg">{r.voteCount}</span>
                                                        <div className="mt-1">
                                                            {r.confidenceLevel === 'LOW' && <span className="px-2 py-0.5 rounded-full text-[7px] font-bold bg-yellow-500/20 text-yellow-400 border border-yellow-500/30">⚠ LOW</span>}
                                                            {r.confidenceLevel === 'MEDIUM' && <span className="px-2 py-0.5 rounded-full text-[7px] font-bold bg-blue-500/20 text-blue-400 border border-blue-500/30">● MED</span>}
                                                            {r.confidenceLevel === 'HIGH' && <span className="px-2 py-0.5 rounded-full text-[7px] font-bold bg-green-500/20 text-green-400 border border-green-500/30">◉ HIGH</span>}
                                                            {r.confidenceLevel === 'NONE' && <span className="px-2 py-0.5 rounded-full text-[7px] font-bold bg-gray-500/20 text-gray-500 border border-gray-500/30">—</span>}
                                                        </div>
                                                    </td>
                                                </tr>

                                                {/* Expanded row with individual votes */}
                                                {isExpanded && (
                                                    <tr>
                                                        <td colSpan={12} className="px-8 py-8 bg-black/40 border-t border-white/5">
                                                            <div className="animate-in fade-in slide-in-from-top-4 duration-300">
                                                                <p className="text-xs text-gray-600 uppercase tracking-[0.4em] font-mono mb-6">Vote Audit Log</p>
                                                                {r.votes.length === 0 ? (
                                                                    <p className="text-gray-600 font-mono text-sm uppercase">&gt; 0 records found for this node</p>
                                                                ) : (
                                                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                                        {r.votes.map((v, vi) => (
                                                                            <div
                                                                                key={vi}
                                                                                className="relative bg-black/40 border border-white/5 p-6 rounded-xl hover:border-[#00A8A8]/20 transition-all group/vote"
                                                                            >
                                                                                <div className="flex items-center justify-between mb-4">
                                                                                    <div className="flex items-center gap-3">
                                                                                        <div className="w-1.5 h-1.5 rounded-full bg-[#00A8A8]" />
                                                                                        <span className="text-sm font-bold text-white uppercase tracking-tight">
                                                                                            {v.judgeName}
                                                                                        </span>
                                                                                    </div>
                                                                                    <span className="text-3xl font-black text-[#00A8A8] group-hover/vote:scale-110 transition-transform tabular-nums">
                                                                                        {v.score}
                                                                                    </span>
                                                                                </div>
                                                                                {/* Per-category breakdown */}
                                                                                <div className="grid grid-cols-5 gap-2 mt-3 mb-3">
                                                                                    {[
                                                                                        { label: 'CRE', value: v.scoreCreativity },
                                                                                        { label: 'IMP', value: v.scoreImpact },
                                                                                        { label: 'SCP', value: v.scoreScope },
                                                                                        { label: 'CLR', value: v.scoreClarity },
                                                                                        { label: 'SND', value: v.scoreSoundness },
                                                                                    ].map((cat) => (
                                                                                        <div key={cat.label} className="rounded-lg px-2 py-1.5 text-center bg-white/5">
                                                                                            <p className="text-[8px] font-mono uppercase tracking-widest text-gray-600">{cat.label}</p>
                                                                                            <p className="text-sm font-bold tabular-nums mt-0.5 text-white">{cat.value ?? '-'}</p>
                                                                                        </div>
                                                                                    ))}
                                                                                </div>
                                                                                {v.durationSeconds != null && v.durationSeconds > 300 && (
                                                                                    <div className="flex items-center gap-2 mt-2">
                                                                                        <span className="px-2 py-0.5 rounded-full text-[8px] font-black bg-red-500/20 text-red-400 border border-red-500/30 uppercase tracking-widest">OVERTIME {Math.floor(v.durationSeconds / 60)}:{String(v.durationSeconds % 60).padStart(2, '0')}</span>
                                                                                    </div>
                                                                                )}
                                                                                {v.comment && (
                                                                                    <p className="text-gray-500 text-sm font-mono mt-2 italic leading-relaxed"> &gt; "{v.comment}"</p>
                                                                                )}
                                                                            </div>
                                                                        ))}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </td>
                                                    </tr>
                                                )}
                                            </React.Fragment>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </LiquidGlass>
                )}
            </div>

            {/* Judge Roster Section */}
            <div className="mt-16 space-y-6">
                <div className="flex justify-between items-end mb-4">
                    <div>
                        <p className="text-xs text-gray-600 uppercase tracking-[0.4em] mb-2 font-mono">Operations Personnel</p>
                        <h2 className="text-3xl font-black text-white italic uppercase tracking-tighter">
                            Judge <span className="text-[#00A8A8]">Roster</span>
                        </h2>
                    </div>
                    <div className="px-4 py-2 bg-white/5 border border-white/5 rounded-lg text-[10px] font-mono uppercase tracking-widest text-[#00A8A8]">
                        Active: {judges?.filter(j => j.isActive).length || 0} Nodes
                    </div>
                </div>

                <LiquidGlass className="rounded-lg overflow-hidden shadow-[0_20px_50px_rgba(0,0,0,0.5)]">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="border-b border-white/5 bg-white/[0.02]">
                                    <th className="px-8 py-6 text-[10px] font-mono text-gray-500 uppercase tracking-[0.2em]">Judge</th>
                                    <th className="px-8 py-6 text-[10px] font-mono text-gray-500 uppercase tracking-[0.2em]">Contact</th>
                                    <th className="px-8 py-6 text-[10px] font-mono text-gray-500 uppercase tracking-[0.2em]">Assigned Tracks</th>
                                    <th className="px-8 py-6 text-[10px] font-mono text-gray-500 uppercase tracking-[0.2em] text-right">Status</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-white/5">
                                {judges?.map((j) => (
                                    <tr key={j.id} className="hover:bg-black/40 transition-colors duration-300">
                                        <td className="px-8 py-6">
                                            <div className="flex items-center gap-4">
                                                { }
                                                <img
                                                    src={j.user?.image || `https://ui-avatars.com/api/?name=${encodeURIComponent(j.name || 'J')}`}
                                                    alt={j.name || ''}
                                                    className="w-10 h-10 rounded-full border border-white/10 ring-1 ring-[#00A8A8]/20"
                                                />
                                                <div>
                                                    <p className="text-sm font-bold text-white uppercase tracking-tight">{j.name}</p>
                                                    <p className="text-[10px] text-gray-600 font-mono tracking-widest uppercase">{j.specialty || 'Generalist'}</p>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-8 py-6">
                                            <p className="text-xs text-gray-400 font-mono">{j.user?.email}</p>
                                        </td>
                                        <td className="px-8 py-6">
                                            <div className="flex flex-wrap gap-2">
                                                {j.assignments
                                                    .filter((a) => a.hackathonId === selectedHackathon)
                                                    .map((a, i) => (
                                                        <span key={i} className="px-3 py-1 rounded bg-white/5 border border-white/10 text-[9px] font-mono text-[#00A8A8] uppercase tracking-widest">
                                                            {a.track || 'Unassigned'}
                                                        </span>
                                                    ))}
                                            </div>
                                        </td>
                                        <td className="px-8 py-6 text-right">
                                            <span className={`px-3 py-1 rounded-full text-[8px] font-black uppercase tracking-widest ${j.isActive ? 'bg-green-500/10 text-green-500 border border-green-500/20' : 'bg-red-500/10 text-red-500 border border-red-500/20'
                                                }`}>
                                                {j.isActive ? 'Active' : 'Offline'}
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                                {!judges?.length && (
                                    <tr>
                                        <td colSpan={4} className="px-8 py-12 text-center text-gray-500 font-mono uppercase tracking-widest text-xs">
                                            No judges registered in the central database.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </LiquidGlass>
            </div>

            {/* Global Stats */}
            {rankings && rankings.rankings.length > 0 && (
                <div className="mt-12 grid grid-cols-1 md:grid-cols-4 gap-6">
                    <LiquidGlass className="rounded-lg p-8 text-center group hover:border-[#00A8A8]/20 transition-all">
                        <p className="text-4xl font-black text-white group-hover:text-[#00A8A8] transition-colors tabular-nums">{rankings.rankings.length}</p>
                        <p className="text-[10px] text-gray-500 uppercase tracking-[0.4em] font-mono mt-3">Projects Logged</p>
                    </LiquidGlass>
                    <LiquidGlass className="rounded-lg p-8 text-center group hover:border-[#00A8A8]/20 transition-all">
                        <p className="text-4xl font-black text-[#00A8A8] tabular-nums">
                            {rankings.rankings.reduce((sum: number, r: { voteCount: number }) => sum + r.voteCount, 0)}
                        </p>
                        <p className="text-[10px] text-gray-500 uppercase tracking-[0.4em] font-mono mt-3">Votes Aggregated</p>
                    </LiquidGlass>
                    <LiquidGlass className="rounded-lg p-8 text-center group hover:border-[#00A8A8]/20 transition-all">
                        <p className="text-4xl font-black text-emerald-400 tabular-nums">{rankings.globalAvg}</p>
                        <p className="text-[10px] text-gray-500 uppercase tracking-[0.4em] font-mono mt-3">Global Avg Score</p>
                    </LiquidGlass>
                    <LiquidGlass className="rounded-lg p-8 text-center group hover:border-yellow-500/20 transition-all">
                        <p className={`text-4xl font-black tabular-nums ${rankings.ties.length > 0 ? 'text-yellow-500 animate-pulse' : 'text-gray-600'}`}>
                            {rankings.ties.length}
                        </p>
                        <p className="text-[10px] text-gray-500 uppercase tracking-[0.4em] font-mono mt-3">Active Collisions</p>
                    </LiquidGlass>
                </div>
            )}
        </>
    );
}
