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
  const { data: hackathons } = trpc.hackathon.list.useQuery(undefined, {
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
      <div className="min-h-screen bg-white flex items-center justify-center">
        <p className="text-gray-500">Loading...</p>
      </div>
    );
  }

  if (!session) return null;

  if (!adminStatus?.isAdmin) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center px-4">
        <div className="text-center">
          <h1 className="text-xl font-bold text-gray-900 mb-2">Admin Access Required</h1>
          <p className="text-gray-500 mb-4">You don't have permission to view this page.</p>
          <button
            onClick={() => signOut({ callbackUrl: '/' })}
            className="text-sm text-gray-600 underline"
          >
            Sign Out
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-40">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <h1 className="text-lg font-bold text-gray-900">Judging Results</h1>
          <button
            onClick={() => signOut({ callbackUrl: '/' })}
            className="text-sm text-gray-500 hover:text-gray-900"
          >
            Sign Out
          </button>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-6">
        {/* Hackathon Selector */}
        {hackathons && hackathons.length > 1 && (
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Select Hackathon
            </label>
            <select
              value={selectedHackathon || ''}
              onChange={(e) => setSelectedHackathon(e.target.value)}
              className="w-full max-w-xs border border-gray-300 rounded-lg px-3 py-2"
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
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
            <h3 className="font-medium text-yellow-800 mb-2">Ties Detected</h3>
            <ul className="text-sm text-yellow-700">
              {rankings.ties.map((tie, i) => (
                <li key={i}>
                  Score {tie.score}: {tie.projects.join(', ')}
                </li>
              ))}
            </ul>
            <p className="text-sm text-yellow-600 mt-2">
              Manual tiebreaker needed for these projects.
            </p>
          </div>
        )}

        {/* Rankings Table */}
        {rankingsLoading ? (
          <p className="text-gray-500 text-center py-12">Loading results...</p>
        ) : rankings?.rankings.length === 0 ? (
          <p className="text-gray-500 text-center py-12">No projects or votes yet.</p>
        ) : (
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Rank</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Table</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Project</th>
                  <th className="text-right px-4 py-3 text-sm font-medium text-gray-600">Total</th>
                  <th className="text-right px-4 py-3 text-sm font-medium text-gray-600">Avg</th>
                  <th className="text-right px-4 py-3 text-sm font-medium text-gray-600">Votes</th>
                </tr>
              </thead>
              <tbody>
                {rankings?.rankings.map((r, idx) => {
                  const isExpanded = expandedProject === r.project.id;
                  const isTied = rankings.ties.some((t) =>
                    t.projects.includes(r.project.name)
                  );

                  return (
                    <React.Fragment key={r.project.id}>
                      <tr
                        className={`border-b border-gray-100 cursor-pointer hover:bg-gray-50 ${
                          isTied ? 'bg-yellow-50' : ''
                        }`}
                        onClick={() =>
                          setExpandedProject(isExpanded ? null : r.project.id)
                        }
                      >
                        <td className="px-4 py-3">
                          <span className={`font-bold ${idx < 3 ? 'text-gray-900' : 'text-gray-500'}`}>
                            #{idx + 1}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-gray-600">{r.project.tableNumber}</td>
                        <td className="px-4 py-3">
                          <div>
                            <p className="font-medium text-gray-900">{r.project.name}</p>
                            {r.project.teamMembers && (
                              <p className="text-sm text-gray-500">{r.project.teamMembers}</p>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right font-bold text-gray-900">
                          {r.totalScore}
                        </td>
                        <td className="px-4 py-3 text-right text-gray-600">{r.avgScore}</td>
                        <td className="px-4 py-3 text-right text-gray-500">{r.voteCount}</td>
                      </tr>

                      {/* Expanded row with individual votes */}
                      {isExpanded && (
                        <tr className="bg-gray-50">
                          <td colSpan={6} className="px-4 py-4">
                            <div className="text-sm">
                              <p className="font-medium text-gray-700 mb-2">Individual Votes:</p>
                              {r.votes.length === 0 ? (
                                <p className="text-gray-500">No votes yet</p>
                              ) : (
                                <div className="space-y-2">
                                  {r.votes.map((v, vi) => (
                                    <div
                                      key={vi}
                                      className="flex items-start gap-4 bg-white p-3 rounded border border-gray-200"
                                    >
                                      <div className="flex-1">
                                        <div className="flex items-center gap-2">
                                          <span className="font-medium text-gray-900">
                                            {v.judgeName}
                                          </span>
                                          <span className="text-lg font-bold text-gray-900">
                                            {v.score}
                                          </span>
                                        </div>
                                        {v.comment && (
                                          <p className="text-gray-600 mt-1">{v.comment}</p>
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
          <div className="mt-6 grid grid-cols-3 gap-4">
            <div className="bg-white rounded-lg border border-gray-200 p-4 text-center">
              <p className="text-2xl font-bold text-gray-900">{rankings.rankings.length}</p>
              <p className="text-sm text-gray-500">Projects</p>
            </div>
            <div className="bg-white rounded-lg border border-gray-200 p-4 text-center">
              <p className="text-2xl font-bold text-gray-900">
                {rankings.rankings.reduce((sum, r) => sum + r.voteCount, 0)}
              </p>
              <p className="text-sm text-gray-500">Total Votes</p>
            </div>
            <div className="bg-white rounded-lg border border-gray-200 p-4 text-center">
              <p className="text-2xl font-bold text-yellow-600">{rankings.ties.length}</p>
              <p className="text-sm text-gray-500">Ties</p>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
