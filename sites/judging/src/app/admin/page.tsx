'use client';

import React, { useState, useEffect } from 'react';
import { useSession, signOut } from 'next-auth/react';
import { trpc } from '@/lib/trpc';
import { useRouter } from 'next/navigation';

export default function AdminResultsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [selectedHackathon, setSelectedHackathon] = useState<string | null>(null);
  const [expandedProject, setExpandedProject] = useState<string | null>(null);

  // Check if admin
  const { data: adminStatus, isLoading: adminLoading } = trpc.admin.isAdmin.useQuery(undefined, {
    enabled: !!session,
  });

  // Get hackathons (using the hackathon router)
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
      router.push('/');
    }
  }, [status, router]);

  // Auto-select first hackathon
  useEffect(() => {
    if (hackathons?.length && !selectedHackathon) {
      setSelectedHackathon(hackathons[0].id);
    }
  }, [hackathons, selectedHackathon]);

  if (!mounted || status === 'loading' || adminLoading) {
    return (
      <div className="min-h-screen bg-[#050505] flex items-center justify-center font-mono text-[#00A8A8] animate-pulse uppercase tracking-[0.5em]">
        Syncing_Identity...
      </div>
    );
  }

  if (!session) return null;

  if (!adminStatus?.isAdmin) {
    return (
      <div className="min-h-screen bg-[#050505] flex flex-col items-center justify-center px-6 text-center">
        <div className="w-16 h-16 rounded-full bg-red-500/10 border border-red-500/30 flex items-center justify-center mb-6">
          <svg className="w-8 h-8 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
        </div>
        <h1 className="text-2xl font-black text-white uppercase tracking-tight mb-2">Admin_Access_Required</h1>
        <p className="text-gray-500 font-mono text-sm mb-8">You don't have permission to view this page.</p>
        <button
          onClick={() => signOut({ callbackUrl: '/' })}
          className="px-8 py-3 border border-red-500/20 text-red-500 font-mono text-[10px] uppercase tracking-[0.3em] hover:bg-red-500/10 transition-all"
        >
          Terminate_Session
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#050505] selection:bg-[#00A8A8]/30">
      {/* Background */}
      <div className="fixed inset-0 z-0 pointer-events-none">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(0,168,168,0.03)_0%,transparent_70%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808008_1px,transparent_1px),linear-gradient(to_bottom,#80808008_1px,transparent_1px)] bg-[size:40px_40px]" />
      </div>

      {/* Header */}
      <header className="sticky top-0 z-40 bg-[#050505]/90 backdrop-blur-md border-b border-white/5">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="h-px w-8 bg-[#00A8A8]/30" />
            <h1 className="text-lg font-black text-white uppercase tracking-tight">Judging_Results</h1>
          </div>
          <button
            onClick={() => signOut({ callbackUrl: '/' })}
            className="text-[10px] text-gray-500 font-mono uppercase tracking-[0.3em] hover:text-[#00A8A8] transition-colors"
          >
            Terminate_Session
          </button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8 relative z-10">
        {/* Hackathon Selector */}
        {hackathons && hackathons.length > 1 && (
          <div className="mb-8">
            <label className="block text-[9px] text-gray-500 uppercase tracking-[0.3em] font-mono mb-3">
              Select_Hackathon
            </label>
            <select
              value={selectedHackathon || ''}
              onChange={(e) => setSelectedHackathon(e.target.value)}
              className="w-full max-w-xs bg-black/60 border border-white/10 rounded px-4 py-3 text-white font-mono text-sm focus:border-[#00A8A8]/30 focus:outline-none"
            >
              {hackathons.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Tie Warning */}
        {rankings?.hasTies && (
          <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-5 mb-8">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-2 h-2 bg-yellow-500 rounded-full animate-pulse" />
              <h3 className="font-bold text-yellow-500 uppercase text-sm tracking-wide">Ties_Detected</h3>
            </div>
            <ul className="text-sm text-yellow-500/80 font-mono space-y-1">
              {rankings.ties.map((tie: { score: number; projects: string[] }, i: number) => (
                <li key={i}>
                  &gt; Score {tie.score}: {tie.projects.join(', ')}
                </li>
              ))}
            </ul>
            <p className="text-[10px] text-yellow-500/60 mt-3 font-mono uppercase tracking-widest">
              Manual_Tiebreaker_Required
            </p>
          </div>
        )}

        {/* Rankings Table */}
        {rankingsLoading ? (
          <div className="text-center py-20">
            <p className="text-[#00A8A8] font-mono animate-pulse uppercase tracking-[0.5em]">Loading_Results...</p>
          </div>
        ) : rankings?.rankings.length === 0 ? (
          <div className="text-center py-20">
            <p className="text-gray-500 font-mono uppercase tracking-widest">No projects or votes yet.</p>
          </div>
        ) : (
          <div className="bg-black/60 backdrop-blur-md border border-white/5 rounded-lg overflow-hidden">
            <table className="w-full">
              <thead className="border-b border-white/5">
                <tr>
                  <th className="text-left px-5 py-4 text-[9px] font-mono text-gray-500 uppercase tracking-[0.3em]">Rank</th>
                  <th className="text-left px-5 py-4 text-[9px] font-mono text-gray-500 uppercase tracking-[0.3em]">Table</th>
                  <th className="text-left px-5 py-4 text-[9px] font-mono text-gray-500 uppercase tracking-[0.3em]">Project</th>
                  <th className="text-right px-5 py-4 text-[9px] font-mono text-gray-500 uppercase tracking-[0.3em]">Total</th>
                  <th className="text-right px-5 py-4 text-[9px] font-mono text-gray-500 uppercase tracking-[0.3em]">Avg</th>
                  <th className="text-right px-5 py-4 text-[9px] font-mono text-gray-500 uppercase tracking-[0.3em]">Votes</th>
                </tr>
              </thead>
              <tbody>
                {rankings?.rankings.map((r, idx) => {
                  const isExpanded = expandedProject === r.project.id;
                  const isTied = rankings.ties.some((t: { projects: string[] }) =>
                    t.projects.includes(r.project.name)
                  );

                  return (
                    <React.Fragment key={r.project.id}>
                      <tr
                        className={`border-b border-white/5 cursor-pointer transition-colors ${isTied ? 'bg-yellow-500/5' : 'hover:bg-white/5'
                          }`}
                        onClick={() =>
                          setExpandedProject(isExpanded ? null : r.project.id)
                        }
                      >
                        <td className="px-5 py-4">
                          <span className={`font-black text-lg ${idx === 0 ? 'text-[#00A8A8] drop-shadow-[0_0_10px_rgba(0,168,168,0.5)]' :
                            idx < 3 ? 'text-white' : 'text-gray-500'
                            }`}>
                            #{idx + 1}
                          </span>
                        </td>
                        <td className="px-5 py-4 text-gray-400 font-mono">{r.project.tableNumber}</td>
                        <td className="px-5 py-4">
                          <div>
                            <p className="font-bold text-white">{r.project.name}</p>
                            {r.project.teamMembers && (
                              <p className="text-sm text-gray-500 font-mono">{r.project.teamMembers}</p>
                            )}
                          </div>
                        </td>
                        <td className="px-5 py-4 text-right">
                          <span className="font-black text-xl text-[#00A8A8]">{r.totalScore}</span>
                        </td>
                        <td className="px-5 py-4 text-right text-gray-400 font-mono">{r.avgScore}</td>
                        <td className="px-5 py-4 text-right text-gray-500 font-mono">{r.voteCount}</td>
                      </tr>

                      {/* Expanded row with individual votes */}
                      {isExpanded && (
                        <tr className="bg-black/40">
                          <td colSpan={6} className="px-5 py-5">
                            <div>
                              <p className="text-[9px] text-gray-500 uppercase tracking-[0.3em] font-mono mb-4">Individual_Votes</p>
                              {r.votes.length === 0 ? (
                                <p className="text-gray-600 font-mono text-sm">No votes yet</p>
                              ) : (
                                <div className="space-y-3">
                                  {r.votes.map((v: { judgeName: string; score: number; comment: string | null }, vi: number) => (
                                    <div
                                      key={vi}
                                      className="flex items-start gap-4 bg-black/40 border border-white/5 p-4 rounded-lg"
                                    >
                                      <div className="flex-1">
                                        <div className="flex items-center gap-3">
                                          <span className="font-bold text-white">
                                            {v.judgeName}
                                          </span>
                                          <span className="text-2xl font-black text-[#00A8A8]">
                                            {v.score}
                                          </span>
                                        </div>
                                        {v.comment && (
                                          <p className="text-gray-400 text-sm font-mono mt-2 italic">"{v.comment}"</p>
                                        )}
                                      </div>
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
        )}
        {/* Summary Stats */}
        {rankings && rankings.rankings.length > 0 && (
          <div className="mt-8 grid grid-cols-3 gap-4">
            <div className="bg-black/60 backdrop-blur-md border border-white/5 rounded-lg p-5 text-center">
              <p className="text-3xl font-black text-white">{rankings.rankings.length}</p>
              <p className="text-[9px] text-gray-500 uppercase tracking-[0.3em] font-mono mt-2">Projects</p>
            </div>
            <div className="bg-black/60 backdrop-blur-md border border-white/5 rounded-lg p-5 text-center">
              <p className="text-3xl font-black text-[#00A8A8]">
                {rankings.rankings.reduce((sum: number, r: { voteCount: number }) => sum + r.voteCount, 0)}
              </p>
              <p className="text-[9px] text-gray-500 uppercase tracking-[0.3em] font-mono mt-2">Total_Votes</p>
            </div>
            <div className="bg-black/60 backdrop-blur-md border border-white/5 rounded-lg p-5 text-center">
              <p className={`text-3xl font-black ${rankings.ties.length > 0 ? 'text-yellow-500' : 'text-gray-600'}`}>
                {rankings.ties.length}
              </p>
              <p className="text-[9px] text-gray-500 uppercase tracking-[0.3em] font-mono mt-2">Ties</p>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
