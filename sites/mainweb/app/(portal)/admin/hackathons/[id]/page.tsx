'use client';

import { useSession } from 'next-auth/react';
import { trpc } from '@/lib/trpc';
import { useRouter, useParams } from 'next/navigation';
import { useState } from 'react';
import Link from 'next/link';
import Background from '@/components/portal/Background';
import { LoadingScreen } from '@/components/portal/LoadingScreen';

// Extracted Components
import { ScannerTab } from '@/components/admin/hackathons/ScannerTab';
import { AttendeesTab } from '@/components/admin/hackathons/AttendeesTab';
import { AnalyticsTab } from '@/components/admin/hackathons/AnalyticsTab';

type Tab = 'scanner' | 'attendees' | 'analytics';

export default function AdminHackathonUnifiedDashboard() {
    const { data: session, status: authStatus } = useSession();
    const router = useRouter();
    const params = useParams();
    const hackathonId = params?.id as string;

    const [activeTab, setActiveTab] = useState<Tab>('scanner');

    // Authentication Checks
    const { data: adminStatus, isLoading: adminLoading } = trpc.admin.isAdmin.useQuery(undefined, { enabled: !!session });
    const { data: hackathon, isLoading: loadingHackathon } = trpc.hackathon.getById.useQuery({ id: hackathonId }, { enabled: !!hackathonId && !!adminStatus?.isAdmin });

    if (authStatus === 'loading' || adminLoading || loadingHackathon) {
        return <LoadingScreen message="Initializing Admin Dashboard..." />;
    }

    if (!session || !adminStatus?.isAdmin) {
        router.push('/dashboard');
        return null;
    }

    if (!hackathon) {
        return (
            <div className="min-h-screen bg-[#050505] flex items-center justify-center text-white font-mono">
                Hackathon not found.
            </div>
        );
    }

    return (
        <div className="relative min-h-screen bg-[#050505] text-gray-400 font-sans selection:bg-[#00A8A8]/30 overflow-x-hidden flex flex-col">
            <Background className="fixed inset-0 z-0 opacity-[0.03]" />

            {/* HEADER */}
            <header className="relative z-10 w-full pt-8 pb-4 px-4 md:px-6 bg-[#050505]/90 backdrop-blur-md border-b border-white/5 sticky top-0 md:static">
              <div className="max-w-7xl mx-auto flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                <div>
                  <Link href="/admin/hackathons" className="mb-2 md:mb-0 flex items-center gap-2 text-gray-500 hover:text-white transition-colors text-xs font-mono uppercase tracking-wider group w-fit" aria-label="Back to hackathons hub">
                    <svg className="w-4 h-4 shrink-0 md:scale-110" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
                    <span className="hidden md:inline">Back to Hub</span>
                  </Link>
                  <p className="text-[#00A8A8] font-mono text-xs tracking-[0.2em] uppercase mb-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#00A8A8] animate-pulse" />
                    <span className="hidden sm:inline">Operations Dashboard</span>
                    <span className="sm:hidden">Stats</span>
                  </p>
                  <h1 className="text-xl md:text-3xl lg:text-4xl font-black text-white uppercase tracking-tight italic">
                    {hackathon.name}
                  </h1>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Link
                    href={`/admin/hackathons/${hackathon.id}/scanner`}
                    className="px-3 py-2 rounded-lg bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 text-xs font-medium hover:bg-cyan-500/20 active:scale-95 transition-all"
                  >
                    Quick Scan
                  </Link>
                </div>
              </div>
            </header>

            {/* DESKTOP TABS */}
            <div className="relative z-10 w-full bg-[#111] border-b border-white/5 hidden md:block">
                <div className="max-w-7xl mx-auto px-6 flex gap-8">
                    <button
                        onClick={() => setActiveTab('scanner')}
                        className={`py-4 px-2 text-sm font-bold uppercase tracking-widest border-b-2 transition-colors ${activeTab === 'scanner' ? 'border-[#00A8A8] text-white' : 'border-transparent text-gray-500 hover:text-gray-300'}`}
                    >
                        Scanner
                    </button>
                    <button
                        onClick={() => setActiveTab('attendees')}
                        className={`py-4 px-2 text-sm font-bold uppercase tracking-widest border-b-2 transition-colors ${activeTab === 'attendees' ? 'border-[#00A8A8] text-white' : 'border-transparent text-gray-500 hover:text-gray-300'}`}
                    >
                        Attendees
                    </button>
                    <button
                        onClick={() => setActiveTab('analytics')}
                        className={`py-4 px-2 text-sm font-bold uppercase tracking-widest border-b-2 transition-colors ${activeTab === 'analytics' ? 'border-[#00A8A8] text-white' : 'border-transparent text-gray-500 hover:text-gray-300'}`}
                    >
                        Analytics
                    </button>
                </div>
            </div>

            {/* MAIN CONTENT AREA */}
            <main className="relative z-10 flex-1 w-full max-w-7xl mx-auto p-4 md:p-6 pb-32 md:pb-6">
                {activeTab === 'scanner' && <ScannerTab hackathonId={hackathon.id} />}
                {activeTab === 'attendees' && <AttendeesTab hackathonId={hackathon.id} hackathonName={hackathon.name} />}
                {activeTab === 'analytics' && <AnalyticsTab hackathonId={hackathon.id} />}
            </main>

            {/* MOBILE BOTTOM NAVIGATION */}
            <div className="fixed bottom-0 left-0 w-full bg-[#111]/90 backdrop-blur-xl border-t border-white/10 z-40 md:hidden grid grid-cols-3 pb-safe">
                <button
                    onClick={() => setActiveTab('scanner')}
                    className={`flex flex-col items-center justify-center py-4 gap-1 transition-colors ${activeTab === 'scanner' ? 'text-[#00A8A8]' : 'text-gray-500'}`}
                >
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm14 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" /></svg>
                    <span className="text-[10px] font-bold uppercase tracking-wider">Scan</span>
                </button>
                <button
                    onClick={() => setActiveTab('attendees')}
                    className={`flex flex-col items-center justify-center py-4 gap-1 transition-colors ${activeTab === 'attendees' ? 'text-[#00A8A8]' : 'text-gray-500'}`}
                >
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
                    <span className="text-[10px] font-bold uppercase tracking-wider">Users</span>
                </button>
                <button
                    onClick={() => setActiveTab('analytics')}
                    className={`flex flex-col items-center justify-center py-4 gap-1 transition-colors ${activeTab === 'analytics' ? 'text-[#00A8A8]' : 'text-gray-500'}`}
                >
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
                    <span className="text-[10px] font-bold uppercase tracking-wider">Stats</span>
                </button>
            </div>
        </div>
    );
}
