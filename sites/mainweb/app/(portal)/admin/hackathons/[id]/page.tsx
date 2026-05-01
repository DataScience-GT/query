'use client';

import { useSession } from 'next-auth/react';
import { trpc } from '@/lib/trpc';
import { useRouter, useParams } from 'next/navigation';
import { useState } from 'react';
import Link from 'next/link';
import Background from '@/components/portal/Background';
import { LoadingScreen } from '@/components/portal/LoadingScreen';
import { ScannerTab } from '@/components/admin/hackathons/ScannerTab';
import { AttendeesTab } from '@/components/admin/hackathons/AttendeesTab';
import { AnalyticsTab } from '@/components/admin/hackathons/AnalyticsTab';

type Tab = 'scanner' | 'attendees' | 'analytics';

export default function AdminHackathonDashboard() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const params = useParams();
  const hackathonId = params?.id as string;
  const [activeTab, setActiveTab] = useState<Tab>('scanner');

  const { data: adminStatus } = trpc.admin.isAdmin.useQuery(undefined, { enabled: !!session });
  const { data: hackathon, isLoading } = trpc.hackathon.getById.useQuery(
    { id: hackathonId },
    { enabled: !!hackathonId && !!adminStatus?.isAdmin }
  );

  if (status === 'loading' || isLoading || !adminStatus?.isAdmin) {
    return <LoadingScreen message="Loading..." />;
  }

  if (!hackathon) return null;

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'scanner', label: 'Scan', icon: <IconScanner className="w-5 h-5" /> },
    { id: 'attendees', label: 'Attendees', icon: <IconUsers className="w-5 h-5" /> },
    { id: 'analytics', label: 'Stats', icon: <IconChart className="w-5 h-5" /> },
  ];

  return (
    <div className="relative min-h-screen bg-[#050505] text-gray-400 font-sans flex flex-col pb-20 md:pb-0">

      {/* HEADER */}
      <header className="sticky top-0 z-30 bg-[#050505]/95 backdrop-blur border-b border-white/5">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <Link href="/admin/hackathons" className="flex items-center gap-2 text-gray-500 hover:text-white transition-colors text-xs font-mono uppercase tracking-wider group w-fit" aria-label="Back to hackathons hub">
                <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
                <span className="hidden md:inline">Hackathons</span>
              </Link>
              <h1 className="text-lg md:text-2xl font-black text-white uppercase tracking-tight italic truncate">
                {hackathon.name}
              </h1>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {['scanner', 'attendees'].includes(activeTab) && (
                <Link
                  href={`/admin/hackathons/${hackathon.id}/scanner`}
                  className="px-3 py-2 rounded-lg bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 text-xs font-medium hover:bg-cyan-500/20 active:scale-95 transition-all"
                >
                  Quick Scan
                </Link>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* DESKTOP TABS - Hidden on mobile */}
      <div className="hidden md:block border-b border-white/5 bg-[#111]/30">
        <div className="max-w-7xl mx-auto px-4 flex gap-2">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 min-h-[56px] flex items-center justify-center gap-3 px-4 py-4 text-sm font-bold uppercase tracking-widest transition-all border-b-2 ${
                activeTab === tab.id
                  ? 'border-[#00A8A8] text-white bg-white/[0.02]'
                  : 'border-transparent text-gray-500 hover:text-gray-300 hover:bg-white/[0.02]'
              }`}
            >
              {tab.icon}
              <span>{tab.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* MAIN CONTENT AREA */}
      <main className="flex-1 p-4 md:p-6 min-h-[calc(100vh-200px)]">
        <div className="max-w-4xl mx-auto">
          {activeTab === 'scanner' && <ScannerTab hackathonId={hackathon.id} />}
          {activeTab === 'attendees' && <AttendeesTab hackathonId={hackathon.id} hackathonName={hackathon.name} />}
          {activeTab === 'analytics' && <AnalyticsTab hackathonId={hackathon.id} />}
        </div>
      </main>

      {/* MOBILE BOTTOM NAVIGATION */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 bg-[#0a0a0a]/95 backdrop-blur-xl border-t border-white/10 z-40 grid grid-cols-3 pb-safe">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex flex-col items-center justify-center py-3 gap-1 transition-colors ${
              activeTab === tab.id ? 'text-[#00A8A8]' : 'text-gray-500'
            }`}
          >
            {tab.icon}
            <span className="text-[10px] font-bold uppercase tracking-wider">{tab.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// Icons
function IconScanner({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 011-1V5a1 1 0 01-1-1H5a1 1 0 01-1 1v2a1 1 0 011 1zm14 0h2a1 1 0 011-1V5a1 1 0 01-1-1h-2a1 1 0 01-1 1v2a1 1 0 011 1zM5 20h2a1 1 0 011-1v-2a1 1 0 01-1-1H5a1 1 0 01-1 1v2a1 1 0 011 1z" />
    </svg>
  );
}

function IconUsers({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
    </svg>
  );
}

function IconChart({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
    </svg>
  );
}
