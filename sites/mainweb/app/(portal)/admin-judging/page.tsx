'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useSession, signOut } from 'next-auth/react';
import { trpc } from '@/lib/trpc';
import { useRouter } from 'next/navigation';
import Background from '@/components/portal/Background';
import { LiquidGlass } from '@/components/portal/LiquidGlass';

export default function AdminResultsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [selectedHackathon, setSelectedHackathon] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [selectedTrack, setSelectedTrack] = useState<string>('ALL');
  const [expandedProject, setExpandedProject] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'results' | 'rooms' | 'judges'>('results');

  // Check if admin
  const { data: adminStatus, isLoading: adminLoading } = trpc.admin.isAdmin.useQuery(undefined, {
    enabled: !!session,
  });

  // Get hackathons
  const { data: hackathons } = trpc.hackathon.list.useQuery({}, {
    enabled: !!session && !!adminStatus?.isAdmin,
  });

  // Get rankings for selected hackathon
  const { data: rankings, isLoading: rankingsLoading } = trpc.judge.getRankings.useQuery(
    { hackathonId: selectedHackathon! },
    { enabled: !!selectedHackathon }
  );

  // Get judges
  const { data: judges } = trpc.judge.list.useQuery(undefined, {
    enabled: !!session && !!adminStatus?.isAdmin,
  });

  // Judging active status
  const { data: judgingStatus, refetch: refetchJudgingStatus } = trpc.judge.getJudgingStatus.useQuery(
    { hackathonId: selectedHackathon! },
    { enabled: !!selectedHackathon, refetchInterval: 10000 }
  );

  const toggleJudging = trpc.judge.toggleJudging.useMutation({
    onSuccess: () => refetchJudgingStatus(),
  });

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login');
    }
  }, [status, router]);

  // Auto-select first hackathon
  useEffect(() => {
    if (hackathons?.length && !selectedHackathon) {
      setSelectedHackathon(hackathons[0]!.id);
    }
  }, [hackathons, selectedHackathon]);

  const categories = useMemo(() => {
    if (!rankings?.rankings) return ['ALL'];
    const cats = new Set(rankings.rankings.map(r => r.project.category).filter((c): c is string => !!c));
    return ['ALL', ...Array.from(cats)];
  }, [rankings]);

  const tracks = useMemo(() => {
    if (!rankings?.rankings) return ['ALL'];
    const ts = new Set<string>();
    rankings.rankings.forEach(r => {
      r.project.tracks?.forEach(t => ts.add(t));
      r.project.challenges?.forEach(c => ts.add(c.toUpperCase()));
      if (r.project.isCreateX) ts.add('CREATE-X');
    });
    return ['ALL', ...Array.from(ts)];
  }, [rankings]);

  const processedRankings = useMemo(() => {
    if (!rankings?.rankings) return [];

    let filtered = rankings.rankings;

    if (selectedCategory !== 'ALL') {
      filtered = filtered.filter(r => r.project.category === selectedCategory);
    }

    if (selectedTrack !== 'ALL') {
      filtered = filtered.filter(r =>
        r.project.tracks?.includes(selectedTrack) ||
        r.project.challenges?.some(c => c.toUpperCase() === selectedTrack) ||
        (selectedTrack === 'CREATE-X' && r.project.isCreateX)
      );
    }

    // Calculate display score based on track
    return filtered.map(r => {
      return {
        ...r,
        displayScore: r.weightedScore,
      };
    }).sort((a, b) => b.displayScore - a.displayScore);
  }, [rankings, selectedCategory, selectedTrack]);

  if (!mounted || status === 'loading' || adminLoading) {
    return (
      <div className="min-h-screen bg-[#050505] flex items-center justify-center font-mono text-[#00A8A8] animate-pulse uppercase tracking-[0.5em]">
        Syncing Identity...
      </div>
    );
  }

  if (!session) return null;

  if (!adminStatus?.isAdmin) {
    return (
      <div className="min-h-screen bg-[#050505] flex flex-col items-center justify-center px-6 text-center">
        <Background className="fixed inset-0 z-0 opacity-[0.03]" />
        <div className="relative z-10 w-20 h-20 rounded-full bg-red-500/10 border border-red-500/30 flex items-center justify-center mb-8 shadow-[0_0_30px_rgba(239,68,68,0.1)]">
          <svg className="w-10 h-10 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
        </div>
        <h1 className="relative z-10 text-3xl font-black text-white uppercase tracking-tighter mb-4 italic">Security Breach</h1>
        <p className="relative z-10 text-gray-500 font-mono text-sm mb-12 uppercase tracking-widest">Unauthorized access to voting protocols detected.</p>
        <button
          onClick={() => signOut({ callbackUrl: '/login' })}
          className="relative z-10 px-10 py-4 bg-red-500/10 border border-red-500/30 text-red-500 font-bold text-xs uppercase tracking-[0.3em] hover:bg-red-500/20 transition-all rounded shadow-[0_0_20px_rgba(239,68,68,0.1)]"
        >
          TERMINATE SESSION
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#050505] text-gray-400 font-sans selection:bg-[#00A8A8]/30 overflow-x-hidden">
      <Background className="fixed inset-0 z-0 opacity-[0.03]" />

      {/* Header Section */}
      <main className="relative z-10 max-w-7xl mx-auto px-6 py-16">
        <LiquidGlass className="rounded-lg p-8 mb-12 relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-[#00A8A8]/20 to-transparent"></div>

          <div className="flex flex-col md:flex-row md:items-center justify-between gap-8">
            <div>
              <div className="flex items-center gap-3 mb-4">
                <div className="h-2 w-2 rounded-full bg-[#00A8A8] animate-pulse" />
                <span className="text-xs font-mono text-gray-500 uppercase tracking-widest">Judging Analysis Node</span>
              </div>
              <h1 className="text-5xl font-black text-white uppercase tracking-tighter mb-2">
                Voting <span className="text-[#00A8A8] italic">Results</span>
              </h1>
              <p className="text-sm font-mono text-gray-500 uppercase tracking-widest">
                Data Evaluation Layer // {selectedHackathon ? 'SYNC ACTIVE' : 'IDLE'}
              </p>
            </div>

            <div className="flex gap-4">
              <button
                onClick={() => router.push('/admin')}
                className="px-8 py-5 bg-black/40 border border-white/10 text-white font-bold text-sm uppercase tracking-widest hover:bg-[#00A8A8]/10 hover:border-[#00A8A8]/30 hover:text-[#00A8A8] transition-all rounded-xl font-mono"
              >
                Admin Control
              </button>
              <button
                onClick={() => router.push('/admin-setup')}
                className="px-8 py-5 bg-black/40 border border-white/10 text-white font-bold text-sm uppercase tracking-widest hover:bg-[#00A8A8]/10 hover:border-[#00A8A8]/30 hover:text-[#00A8A8] transition-all rounded-xl font-mono"
              >
                Event Builder
              </button>
              <button
                onClick={() => signOut({ callbackUrl: '/login' })}
                className="px-8 py-5 border border-red-500/20 text-red-500/60 font-bold text-sm uppercase tracking-widest hover:bg-red-500/10 hover:text-red-500 transition-all rounded-xl font-mono"
              >
                SIGNOUT TERMINAL
              </button>
            </div>
          </div>
        </LiquidGlass>

        {/* Judging Control Panel */}
        {selectedHackathon && (
          <LiquidGlass className={`rounded-lg p-8 mb-12 relative overflow-hidden border-t-4 transition-all duration-500 ${judgingStatus?.active
            ? 'border-emerald-500 shadow-[0_0_40px_rgba(16,185,129,0.1)]'
            : 'border-gray-700'
            }`}>
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
              <div className="flex items-center gap-5">
                <div className={`w-16 h-16 rounded-2xl flex items-center justify-center transition-all duration-500 ${judgingStatus?.active
                  ? 'bg-emerald-500/20 border border-emerald-500/40 shadow-[0_0_25px_rgba(16,185,129,0.3)]'
                  : 'bg-white/5 border border-white/10'
                  }`}>
                  <div className={`w-4 h-4 rounded-full transition-all duration-500 ${judgingStatus?.active
                    ? 'bg-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.8)] animate-pulse'
                    : 'bg-gray-600'
                    }`} />
                </div>
                <div>
                  <h2 className="text-2xl font-black text-white uppercase tracking-tight">
                    Judging {judgingStatus?.active ? <span className="text-emerald-400 italic">Active</span> : <span className="text-gray-500 italic">Inactive</span>}
                  </h2>
                  <p className="text-xs font-mono text-gray-500 uppercase tracking-widest mt-1">
                    {judgingStatus?.active
                      ? 'Judges are currently scoring projects in real-time'
                      : 'Judges are on standby — waiting for you to begin'}
                  </p>
                </div>
              </div>

              <button
                onClick={() => toggleJudging.mutate({ hackathonId: selectedHackathon, active: !judgingStatus?.active })}
                disabled={toggleJudging.isPending}
                className={`px-12 py-6 font-black text-lg uppercase tracking-widest transition-all rounded-2xl font-mono border-2 disabled:opacity-50 ${judgingStatus?.active
                  ? 'bg-red-500/10 border-red-500/40 text-red-400 hover:bg-red-500/20 hover:border-red-500/60 shadow-[0_0_30px_rgba(239,68,68,0.15)]'
                  : 'bg-emerald-500/10 border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/20 hover:border-emerald-500/60 shadow-[0_0_30px_rgba(16,185,129,0.15)]'
                  }`}
              >
                {toggleJudging.isPending ? 'Processing...' : judgingStatus?.active ? 'END JUDGING' : 'START JUDGING'}
              </button>
            </div>
          </LiquidGlass>
        )}
        <div className="flex flex-col gap-8 mb-12">
          {/* Hackathon Selector */}
          {hackathons && hackathons.length > 0 && (
            <div className="flex flex-col">
              <label className="text-xs text-gray-600 uppercase tracking-[0.4em] mb-4 font-mono">Select Target Event</label>
              <div className="flex flex-wrap gap-3">
                {hackathons.map((h) => (
                  <button
                    key={h.id}
                    onClick={() => setSelectedHackathon(h.id)}
                    className={`px-8 py-4 rounded-xl font-bold text-sm uppercase tracking-widest transition-all duration-300 border ${selectedHackathon === h.id
                      ? 'bg-[#00A8A8]/10 border-[#00A8A8]/50 text-white shadow-[0_0_20px_rgba(0,168,168,0.1)]'
                      : 'bg-white/[0.02] border-white/5 text-gray-500 hover:text-white hover:bg-white/5'
                      }`}
                  >
                    {h.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* View Mode Toggle */}
          {selectedHackathon && (
            <div className="flex flex-col">
              <label className="text-xs text-gray-600 uppercase tracking-[0.4em] mb-4 font-mono">View Mode</label>
              <div className="flex flex-wrap gap-3">
                {(['results', 'rooms', 'judges'] as const).map((mode) => (
                  <button
                    key={mode}
                    onClick={() => setViewMode(mode)}
                    className={`px-6 py-3 rounded-xl font-bold text-xs uppercase tracking-widest transition-all duration-300 border font-mono ${viewMode === mode
                      ? 'bg-[#00A8A8]/10 border-[#00A8A8]/50 text-white shadow-[0_0_20px_rgba(0,168,168,0.1)]'
                      : 'bg-white/[0.02] border-white/5 text-gray-500 hover:text-white hover:bg-white/5'
                      }`}
                  >
                    {mode === 'results' ? 'Results' : mode === 'rooms' ? 'Room Assignments' : 'Judge Performance'}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Category Filter */}
            {categories.length > 1 && (
              <div className="flex flex-col">
                <label className="text-xs text-gray-600 uppercase tracking-[0.4em] mb-4 font-mono">Filter By Category</label>
                <div className="flex flex-wrap gap-3">
                  {categories.map((cat) => (
                    <button
                      key={cat}
                      onClick={() => setSelectedCategory(cat)}
                      className={`px-5 py-2.5 rounded-lg font-bold text-[10px] uppercase tracking-widest transition-all duration-300 border ${selectedCategory === cat
                        ? 'bg-white/10 border-white/20 text-white shadow-lg'
                        : 'bg-white/[0.02] border-white/5 text-gray-600 hover:text-gray-400 hover:bg-white/5'
                        }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Track Filter */}
            {tracks.length > 1 && (
              <div className="flex flex-col">
                <label className="text-xs text-gray-600 uppercase tracking-[0.4em] mb-4 font-mono">Filter By Track</label>
                <div className="flex flex-wrap gap-3">
                  {tracks.map((track) => (
                    <button
                      key={track}
                      onClick={() => setSelectedTrack(track)}
                      className={`px-5 py-2.5 rounded-lg font-bold text-[10px] uppercase tracking-widest transition-all duration-300 border ${selectedTrack === track
                        ? 'bg-[#00A8A8]/20 border-[#00A8A8]/50 text-white shadow-lg'
                        : 'bg-white/[0.02] border-white/5 text-gray-600 hover:text-gray-400 hover:bg-white/5'
                        }`}
                    >
                      {track}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ===== ROOMS VIEW ===== */}
        {viewMode === 'rooms' && rankings && (
          <LiquidGlass className="rounded-lg overflow-hidden mb-12">
            <div className="p-6 border-b border-white/5">
              <h2 className="text-xl font-black text-white uppercase tracking-tight">
                Room <span className="text-[#00A8A8] italic">Assignments</span>
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
                            <span className="px-3 py-1 rounded-full text-[9px] font-bold bg-[#00A8A8]/10 text-[#00A8A8] border border-[#00A8A8]/20 uppercase tracking-widest">
                              {r.project.tracks[0]}
                            </span>
                          ) : <span className="text-gray-600">-</span>}
                        </td>
                        <td className="py-4 px-6">
                          <div className="flex flex-wrap gap-1">
                            {(r.project.tracks?.slice(1) || []).concat(r.project.challenges || []).map((t, i) => (
                              <span key={i} className="px-2 py-0.5 rounded-full text-[8px] font-bold bg-white/5 text-gray-400 border border-white/10 uppercase tracking-widest">
                                {t}
                              </span>
                            ))}
                            {r.project.isCreateX && (
                              <span className="px-2 py-0.5 rounded-full text-[8px] font-bold bg-purple-500/10 text-purple-400 border border-purple-500/20 uppercase tracking-widest">
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
                            <span className="text-lg font-black text-[#00A8A8] tabular-nums">{r.weightedScore}</span>
                            <span className={`px-2 py-0.5 rounded-full text-[8px] font-bold uppercase tracking-widest border ${r.confidenceLevel === 'HIGH' ? 'bg-green-500/20 text-green-400 border-green-500/30'
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
        )}

        {/* ===== JUDGES VIEW ===== */}
        {viewMode === 'judges' && rankings && (() => {
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
        })()}

        {/* ===== RESULTS VIEW (existing) ===== */}
        {viewMode === 'results' && (<>
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
                const overallWinnerIds = new Set(overallWinners.map(r => r.project.id));

                // 2. Identify Track Winners (Top 1 per Track, excluding Overall)
                const allTracks = Array.from(new Set(rankings.rankings.flatMap(r => r.project.tracks || [])));
                const trackWinners: Record<string, any> = {};
                const usedWinnerIds = new Set(overallWinnerIds);

                allTracks.forEach(track => {
                  const projectsInTrack = rankings.rankings.filter(r => r.project.tracks?.includes(track));

                  const sortedTrackProjects = [...projectsInTrack].sort((a, b) => {
                    return b.weightedScore - a.weightedScore;
                  });

                  const candidate = sortedTrackProjects.find(r => !usedWinnerIds.has(r.project.id));

                  if (candidate) {
                    trackWinners[track] = candidate;
                    usedWinnerIds.add(candidate.project.id);
                  }
                });

                const confidenceBadge = (level: string) => {
                  if (level === 'LOW') return <span className="ml-2 px-2 py-0.5 rounded-full text-[8px] font-bold bg-yellow-500/20 text-yellow-400 border border-yellow-500/30">⚠ LOW</span>;
                  if (level === 'MEDIUM') return <span className="ml-2 px-2 py-0.5 rounded-full text-[8px] font-bold bg-blue-500/20 text-blue-400 border border-blue-500/30">● MED</span>;
                  if (level === 'HIGH') return <span className="ml-2 px-2 py-0.5 rounded-full text-[8px] font-bold bg-green-500/20 text-green-400 border border-green-500/30">◉ HIGH</span>;
                  return <span className="ml-2 px-2 py-0.5 rounded-full text-[8px] font-bold bg-gray-500/20 text-gray-500 border border-gray-500/30">—</span>;
                };

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

            {rankingsLoading ? (
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
                                      {r.project.tracks?.map(t => (
                                        <span key={t} className="px-2 py-0.5 rounded bg-white/5 border border-white/10 text-[8px] font-mono text-gray-400 uppercase tracking-widest">
                                          {t}
                                        </span>
                                      ))}
                                      {r.project.challenges?.map(c => (
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
                                        {r.votes.map((v: any, vi: number) => (
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
                            {/* eslint-disable-next-line @next/next/no-img-element */}
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
                              .filter(a => a.hackathonId === selectedHackathon)
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
        </>)}
      </main>
    </div>
  );
}
