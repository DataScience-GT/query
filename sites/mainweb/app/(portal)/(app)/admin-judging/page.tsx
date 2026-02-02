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
  const [expandedProject, setExpandedProject] = useState<string | null>(null);

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

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/portal');
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

  const filteredRankings = useMemo(() => {
    if (!rankings?.rankings) return [];
    if (selectedCategory === 'ALL') return rankings.rankings;
    return rankings.rankings.filter(r => r.project.category === selectedCategory);
  }, [rankings, selectedCategory]);

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
          onClick={() => signOut({ callbackUrl: '/portal' })}
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
                onClick={() => router.push('/portal/admin')}
                className="px-8 py-5 bg-black/40 border border-white/10 text-white font-bold text-sm uppercase tracking-widest hover:bg-[#00A8A8]/10 hover:border-[#00A8A8]/30 hover:text-[#00A8A8] transition-all rounded-xl font-mono"
              >
                &lt; Admin Control
              </button>
              <button
                onClick={() => signOut({ callbackUrl: '/portal' })}
                className="px-8 py-5 border border-red-500/20 text-red-500/60 font-bold text-sm uppercase tracking-widest hover:bg-red-500/10 hover:text-red-500 transition-all rounded-xl font-mono"
              >
                SIGNOUT TERMINAL
              </button>
            </div>
          </div>
        </LiquidGlass>

        {/* Filters */}
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
        </div>

        {/* Tie Warning */}
        {rankings?.hasTies && (
          <LiquidGlass className="border border-yellow-500/30 rounded-lg p-8 mb-12 shadow-[0_0_40px_rgba(234,179,8,0.05)] animate-in slide-in-from-top-4 duration-500">
            <div className="flex items-center gap-4 mb-6">
              <div className="w-3 h-3 bg-yellow-500 rounded-full animate-pulse shadow-[0_0_15px_rgba(234,179,8,0.5)]" />
              <h3 className="text-2xl font-black text-yellow-500 uppercase italic tracking-tighter">Collision Detected</h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {rankings.ties.map((tie: { score: number; projects: string[] }, i: number) => (
                <div key={i} className="bg-white/5 border border-white/5 p-4 rounded-xl font-mono">
                  <p className="text-[10px] text-gray-500 uppercase tracking-widest mb-2 font-black">Score Value: {tie.score}</p>
                  <div className="space-y-1">
                    {tie.projects.map((p, pi) => (
                      <p key={pi} className="text-white text-sm">&gt; {p}</p>
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

        {/* Rankings Table */}
        <div className="space-y-6">
          <div className="flex justify-between items-end mb-4">
            <div>
              <p className="text-xs text-gray-600 uppercase tracking-[0.4em] mb-2 font-mono">Metrics Log</p>
              <h2 className="text-3xl font-black text-white italic uppercase tracking-tighter">
                Evaluated Rankings
              </h2>
            </div>
            <div className="px-4 py-2 bg-white/5 border border-white/5 rounded-lg text-[10px] font-mono uppercase tracking-widest text-[#00A8A8]">
              Displaying: {filteredRankings.length} Nodes
            </div>
          </div>

          {rankingsLoading ? (
            <div className="bg-black/40 border border-white/5 rounded-lg p-24 text-center backdrop-blur-md">
              <p className="text-[#00A8A8] font-mono animate-pulse uppercase tracking-[0.5em] text-xs">Awaiting Data Packet...</p>
            </div>
          ) : filteredRankings.length === 0 ? (
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
                      <th className="px-8 py-6 text-sm font-mono text-gray-500 uppercase tracking-[0.3em]">Pos</th>
                      <th className="px-8 py-6 text-sm font-mono text-gray-500 uppercase tracking-[0.3em]">Node</th>
                      <th className="px-8 py-6 text-sm font-mono text-gray-500 uppercase tracking-[0.3em]">Identifier</th>
                      <th className="px-8 py-6 text-sm font-mono text-gray-500 uppercase tracking-[0.3em] text-right">Sum</th>
                      <th className="px-8 py-6 text-sm font-mono text-gray-500 uppercase tracking-[0.3em] text-right">Avg</th>
                      <th className="px-8 py-6 text-sm font-mono text-gray-500 uppercase tracking-[0.3em] text-right">Count</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {filteredRankings.map((r, idx) => {
                      const isExpanded = expandedProject === r.project.id;
                      const isTied = rankings?.ties.some((t: { projects: string[] }) =>
                        t.projects.includes(r.project.name)
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
                                <p className="text-sm font-mono text-gray-500 uppercase tracking-widest font-bold">Node {r.project.tableNumber}</p>
                                <p className="text-xs text-gray-700 font-mono">ID: {r.project.id.slice(-6).toUpperCase()}</p>
                              </div>
                            </td>
                            <td className="px-8 py-8">
                              <div>
                                <div className="flex items-center gap-3 mb-1">
                                  <p className="text-xl font-bold text-white uppercase group-hover:text-[#00A8A8] transition-colors duration-300">{r.project.name}</p>
                                  {r.project.category && (
                                    <span className="px-2 py-0.5 rounded bg-white/5 border border-white/10 text-[8px] font-mono text-gray-400 uppercase tracking-widest">
                                      {r.project.category}
                                    </span>
                                  )}
                                </div>
                                {r.project.teamMembers && (
                                  <p className="text-xs text-gray-500 font-mono uppercase tracking-widest">{r.project.teamMembers}</p>
                                )}
                              </div>
                            </td>
                            <td className="px-8 py-8 text-right">
                              <span className="text-3xl font-black text-[#00A8A8] tabular-nums">{r.totalScore}</span>
                            </td>
                            <td className="px-8 py-8 text-right text-gray-400 font-mono tabular-nums text-lg">{r.avgScore}</td>
                            <td className="px-8 py-8 text-right text-gray-600 font-mono tabular-nums text-lg">{r.voteCount}</td>
                          </tr>

                          {/* Expanded row with individual votes */}
                          {isExpanded && (
                            <tr>
                              <td colSpan={6} className="px-8 py-8 bg-black/40 border-t border-white/5">
                                <div className="animate-in fade-in slide-in-from-top-4 duration-300">
                                  <p className="text-xs text-gray-600 uppercase tracking-[0.4em] font-mono mb-6">Vote Audit Log</p>
                                  {r.votes.length === 0 ? (
                                    <p className="text-gray-600 font-mono text-sm uppercase">&gt; 0 records found for this node</p>
                                  ) : (
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                      {r.votes.map((v: { judgeName: string; score: number; comment: string | null }, vi: number) => (
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

        {/* Global Stats */}
        {rankings && rankings.rankings.length > 0 && (
          <div className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-6">
            <LiquidGlass className="rounded-lg p-8 text-center group hover:border-[#00A8A8]/20 transition-all">
              <p className="text-4xl font-black text-white group-hover:text-[#00A8A8] transition-colors tabular-nums">{rankings.rankings.length}</p>
              <p className="text-[10px] text-gray-500 uppercase tracking-[0.4em] font-mono mt-3">Projects Logged</p>
            </LiquidGlass>
            <LiquidGlass className="rounded-lg p-8 text-center group hover:border-[#00A8A8]/20 transition-all">
              <p className="text-4xl font-black text-[#00A8A8] tabular-nums">
                {rankings.rankings.reduce((sum: number, r: { voteCount: number }) => sum + r.voteCount, 0)}
              </p>
              <p className="text-[10px] text-gray-500 uppercase tracking-[0.4em] font-mono mt-3">Balls Aggregated</p>
            </LiquidGlass>
            <LiquidGlass className="rounded-lg p-8 text-center group hover:border-yellow-500/20 transition-all">
              <p className={`text-4xl font-black tabular-nums ${rankings.ties.length > 0 ? 'text-yellow-500 animate-pulse' : 'text-gray-600'}`}>
                {rankings.ties.length}
              </p>
              <p className="text-[10px] text-gray-500 uppercase tracking-[0.4em] font-mono mt-3">Active Collisions</p>
            </LiquidGlass>
          </div>
        )}
      </main>
    </div>
  );
}
