'use client';

import React from 'react';
import { LiquidGlass } from '@/components/portal/LiquidGlass';

type Project = {
    id: string;
    name: string;
    tableNumber: number;
    zone: string | null;
};

type Vote = {
    score: number;
    durationSeconds: number | null;
    judgeName: string;
};

type Ranking = {
    project: Project;
    votes: Vote[];
};

type RankingsData = {
    rankings: Ranking[];
};

type JudgeMatrixViewProps = {
    rankings: RankingsData | null;
};

export function JudgeMatrixView({ rankings }: JudgeMatrixViewProps) {
    if (!rankings) return null;

    // Build per-judge stats from vote data
    const judgeMap = new Map<string, { name: string; totalScore: number; count: number; totalTime: number; overtimeCount: number; projects: { name: string; tableNumber: number; zone: string | null }[] }>();

    rankings.rankings.forEach((r: { project: { name: string; tableNumber: number; zone: string | null }; votes: { judgeName: string; score: number | null; durationSeconds: number | null }[] }) => {
        r.votes.forEach((v: { judgeName: string; score: number | null; durationSeconds: number | null }) => {
            const existing = judgeMap.get(v.judgeName) || { name: v.judgeName, totalScore: 0, count: 0, totalTime: 0, overtimeCount: 0, projects: [] as { name: string; tableNumber: number; zone: string | null }[] };
            existing.totalScore += v.score || 0;
            existing.count += 1;
            existing.totalTime += v.durationSeconds || 0;
            if (v.durationSeconds && v.durationSeconds > 300) existing.overtimeCount += 1;
            existing.projects.push({ name: r.project.name, tableNumber: r.project.tableNumber, zone: r.project.zone });
            judgeMap.set(v.judgeName, existing);
        });
    });

    const judgeStats = Array.from(judgeMap.values()).sort((a, b) => b.count - a.count);
    const formatDuration = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s) % 60).padStart(2, '0')}`;

    return (
        <div className="space-y-6">
            {/* Summary Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <LiquidGlass className="rounded-lg p-6 text-center">
                    <p className="text-3xl font-black text-white tabular-nums">{judgeStats.length}</p>
                    <p className="text-[9px] text-gray-500 uppercase tracking-widest font-mono mt-2">Active Judges</p>
                </LiquidGlass>
                <LiquidGlass className="rounded-lg p-6 text-center">
                    <p className="text-3xl font-black text-[#00A8A8] tabular-nums">
                        {judgeStats.reduce((s, j) => s + j.count, 0)}
                    </p>
                    <p className="text-[9px] text-gray-500 uppercase tracking-widest font-mono mt-2">Total Votes</p>
                </LiquidGlass>
                <LiquidGlass className="rounded-lg p-6 text-center">
                    <p className="text-3xl font-black text-emerald-400 tabular-nums">
                        {judgeStats.length > 0 ? formatDuration(judgeStats.reduce((s, j) => s + j.totalTime, 0) / judgeStats.reduce((s, j) => s + j.count, 0)) : '0:00'}
                    </p>
                    <p className="text-[9px] text-gray-500 uppercase tracking-widest font-mono mt-2">Avg Time/Project</p>
                </LiquidGlass>
                <LiquidGlass className="rounded-lg p-6 text-center">
                    <p className={`text-3xl font-black tabular-nums ${judgeStats.reduce((s, j) => s + j.overtimeCount, 0) > 0 ? 'text-red-400' : 'text-gray-600'}`}>
                        {judgeStats.reduce((s, j) => s + j.overtimeCount, 0)}
                    </p>
                    <p className="text-[9px] text-gray-500 uppercase tracking-widest font-mono mt-2">Overtime Votes</p>
                </LiquidGlass>
            </div>

            {/* Per-Judge Table */}
            <LiquidGlass className="rounded-lg overflow-hidden">
                <div className="p-6 border-b border-white/5">
                    <h2 className="text-xl font-black text-white uppercase tracking-tight">
                        Judge <span className="text-[#00A8A8] italic">Performance</span>
                    </h2>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead>
                            <tr className="text-[10px] text-gray-600 uppercase tracking-widest border-b border-white/5">
                                <th className="text-left py-3 px-6 font-mono">Judge</th>
                                <th className="text-left py-3 px-6 font-mono">Projects</th>
                                <th className="text-left py-3 px-6 font-mono">Avg Score</th>
                                <th className="text-left py-3 px-6 font-mono">Avg Time</th>
                                <th className="text-left py-3 px-6 font-mono">Overtime</th>
                            </tr>
                        </thead>
                        <tbody>
                            {judgeStats.map((j) => (
                                <tr key={j.name} className="border-b border-white/5 hover:bg-white/[0.02] transition-colors">
                                    <td className="py-4 px-6">
                                        <p className="text-sm font-bold text-white">{j.name}</p>
                                    </td>
                                    <td className="py-4 px-6">
                                        <span className="text-lg font-black text-[#00A8A8] tabular-nums">{j.count}</span>
                                    </td>
                                    <td className="py-4 px-6">
                                        <span className="text-lg font-black text-white tabular-nums">{(j.totalScore / j.count).toFixed(1)}</span>
                                        <span className="text-xs text-gray-600 ml-1">/50</span>
                                    </td>
                                    <td className="py-4 px-6">
                                        <span className={`text-sm font-bold font-mono tabular-nums ${j.totalTime / j.count > 300 ? 'text-red-400' : j.totalTime / j.count > 240 ? 'text-yellow-400' : 'text-gray-400'
                                            }`}>
                                            {j.count > 0 ? formatDuration(j.totalTime / j.count) : '-'}
                                        </span>
                                    </td>
                                    <td className="py-4 px-6">
                                        {j.overtimeCount > 0 ? (
                                            <span className="px-3 py-1 rounded-full text-[9px] font-black bg-red-500/20 text-red-400 border border-red-500/30 uppercase tracking-widest">
                                                {j.overtimeCount} OVERTIME
                                            </span>
                                        ) : (
                                            <span className="text-gray-600 text-xs font-mono">None</span>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </LiquidGlass>
        </div>
    );
}
