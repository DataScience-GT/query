'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useSession, signOut } from 'next-auth/react';
import { trpc } from '@/lib/trpc';
import { useRouter } from 'next/navigation';
import { LiquidGlass } from '@/components/portal/LiquidGlass';
import AdminLayout from '@/components/portal/AdminLayout';
import { JudgingTools } from '@/components/admin/judging/JudgingTools';
import { RoomAssignmentsView } from '@/components/admin/judging/RoomAssignmentsView';
import { JudgeMatrixView } from '@/components/admin/judging/JudgeMatrixView';
import { RankingsView } from '@/components/admin/judging/RankingsView';

export default function AdminResultsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [selectedHackathon, setSelectedHackathon] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [selectedTrack, setSelectedTrack] = useState<string>('ALL');
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

  if (!mounted) return null;

  return (
    <AdminLayout>
      <div className="relative z-10 max-w-7xl mx-auto">
        <div className="mb-12">
          <h1 className="text-5xl font-black text-white uppercase tracking-tighter mb-2">
            Voting <span className="text-[#00A8A8] italic">Results</span>
          </h1>
          <p className="text-sm font-mono text-gray-500 uppercase tracking-widest">
            Data Evaluation Layer // {selectedHackathon ? 'SYNC ACTIVE' : 'IDLE'}
          </p>
        </div>

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
        {/* Judging Tools */}
        <JudgingTools
          hackathons={hackathons || []}
          selectedHackathon={selectedHackathon}
          setSelectedHackathon={setSelectedHackathon}
          viewMode={viewMode}
          setViewMode={setViewMode}
          categories={categories}
          selectedCategory={selectedCategory}
          setSelectedCategory={setSelectedCategory}
          tracks={tracks}
          selectedTrack={selectedTrack}
          setSelectedTrack={setSelectedTrack}
        />


        {/* ===== ROOMS VIEW ===== */}
        {viewMode === 'rooms' && rankings && (
          <RoomAssignmentsView rankings={rankings} />
        )}

        {/* ===== JUDGES VIEW ===== */}
        {viewMode === 'judges' && rankings && (
          <JudgeMatrixView rankings={rankings} />
        )}

        {viewMode === 'results' && (
          <RankingsView
            rankings={rankings}
            processedRankings={processedRankings}
            selectedTrack={selectedTrack}
            judges={judges || []}
            selectedHackathon={selectedHackathon}
          />
        )}
      </div>
    </AdminLayout>
  );
}
