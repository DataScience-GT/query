'use client';

import { useSession } from 'next-auth/react';
import { trpc } from '@/lib/trpc';
import { useRouter, useParams } from 'next/navigation';
import { useState } from 'react';
import Link from 'next/link';
import { LoadingScreen } from '@/components/portal/LoadingScreen';
import { ScannerTab } from '@/components/admin/hackathons/ScannerTab';
import { AttendeesTab } from '@/components/admin/hackathons/AttendeesTab';
import { AnalyticsTab } from '@/components/admin/hackathons/AnalyticsTab';
import { EventsTab } from '@/components/admin/hackathons/EventsTab';

type Tab = 'events' | 'scanner' | 'attendees' | 'analytics';

export default function AdminHackathonDashboard() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const params = useParams();
  const hackathonId = params?.id as string;
  const [activeTab, setActiveTab] = useState<Tab>('events');

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
    { id: 'events', label: 'Events', icon: <IconCalendar className="w-5 h-5" /> },
    { id: 'scanner', label: 'Scan', icon: <IconScanner className="w-5 h-5" /> },
    { id: 'attendees', label: 'Attendees', icon: <IconUsers className="w-5 h-5" /> },
    { id: 'analytics', label: 'Stats', icon: <IconChart className="w-5 h-5" /> },
  ];

  return (
    <div className="relative min-h-screen bg-[var(--bg-primary)] text-text-muted font-sans flex flex-col pb-20 md:pb-0">
      {/* Ambient Background */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-15%] left-[-10%] w-[800px] h-[800px] bg-gradient-to-r from-accent/6 via-cyan-900/12 to-purple-900/10 blur-[400px] rounded-full" />
        <div className="absolute bottom-[-12%] right-[-10%] w-[700px] h-[700px] bg-gradient-to-r from-emerald-900/12 via-cyan-900/10 to-indigo-900/10 blur-[350px] rounded-full" />
        <div className="absolute inset-0 bg-[linear-gradient(rgba(0,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(0,255,255,0.02)_1px,transparent_1px)] bg-[size:80px_80px] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_50%,#000_70%,transparent_100%)]" />
      </div>

      {/* HEADER - Enhanced */}
      <header className="relative sticky top-0 z-30 bg-[var(--bg-primary)]/80 backdrop-blur-xl border-b border-white/5">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <Link href="/admin/hackathons" className="flex items-center gap-2 text-text-muted hover:text-white transition-colors text-xs font-mono uppercase tracking-wider group w-fit" aria-label="Back to hackathons hub">
                <div className="p-1 rounded-lg bg-white/5 border border-white/10 group-hover:bg-accent/20 group-hover:border-accent/40 transition-colors">
                  <svg className="w-4 h-4 text-white group-hover:text-accent transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
                </div>
                <span className="hidden md:inline text-white/60 group-hover:text-white transition-colors">Hackathons</span>
              </Link>
              <h1 className="relative text-lg md:text-2xl font-black text-white uppercase tracking-tight italic truncate group-hover:text-transparent group-hover:bg-clip-text group-hover:bg-gradient-to-r group-hover:from-white group-hover:via-cyan-100 to-gray-400 transition-all duration-300">
                {hackathon.name}
                {/* Animated underline */}
                <div className="absolute -bottom-2 left-0 right-0 h-[2px] bg-gradient-to-r from-accent/50 via-cyan-500/30 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
              </h1>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {['scanner', 'attendees'].includes(activeTab) && (
                <Link
                  href={`/admin/hackathons/${hackathon.id}/scanner`}
                  className="group relative px-4 py-2 rounded-xl bg-gradient-to-r from-accent/15 to-cyan-500/10 border border-cyan-500/30 text-cyan-400 text-xs font-bold uppercase tracking-widest hover:bg-cyan-500/25 active:scale-95 transition-all overflow-hidden"
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/5 to-white/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700" />
                  <span className="relative flex items-center gap-2">
                    <svg className="w-4 h-4 shrink-0 group-hover:scale-110 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 011-1V5a1 1 0 01-1-1H5a1 1 0 01-1 1v2a1 1 0 011 1zm14 0h2a1 1 0 011-1V5a1 1 0 01-1-1h-2a1 1 0 01-1 1v2a1 1 0 011 1zM5 20h2a1 1 0 011-1v-2a1 1 0 01-1-1H5a1 1 0 01-1 1v2a1 1 0 011 1z" />
                    </svg>
                    Quick Scan
                  </span>
                </Link>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* DESKTOP TABS - Enhanced, Hidden on mobile */}
      <div className="hidden md:block border-b border-white/5 bg-[var(--bg-primary)]/30 relative overflow-hidden">
        {/* Tab background gradients */}
        <div className="absolute inset-0 bg-gradient-to-r from-accent/[0.01] via-transparent to-emerald-500/[0.01] pointer-events-none" />

        <div className="max-w-7xl mx-auto px-4 flex gap-2">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`group relative flex-1 min-h-[56px] flex items-center justify-center gap-3 px-4 py-4 text-sm font-bold uppercase tracking-widest transition-all border-b-2 ${
                activeTab === tab.id
                  ? 'border-accent text-white bg-white/[0.02]'
                  : 'border-transparent text-text-muted hover:text-gray-300 hover:bg-white/[0.02]'
              }`}
            >
              {tab.icon}
              <span>{tab.label}</span>
              {/* Active indicator */}
              {activeTab === tab.id && (
                <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-gradient-to-r from-accent to-cyan-500" />
              )}
              {/* Hover glow */}
              {!activeTab && (
                <div className="absolute inset-x-0 -bottom-px h-[1px] bg-gradient-to-r from-accent/0 via-accent/50 to-accent/0 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
              )}
            </button>
          ))}
        </div>
      </div>

      {/* MAIN CONTENT AREA */}
      <main className="flex-1 p-4 md:p-6 min-h-[calc(100vh-200px)]">
        <div className="max-w-4xl mx-auto">
          {activeTab === 'events' && <EventsTab hackathonId={hackathon.id} />}
          {activeTab === 'scanner' && <ScannerTab hackathonId={hackathon.id} />}
          {activeTab === 'attendees' && <AttendeesTab hackathonId={hackathon.id} hackathonName={hackathon.name} />}
          {activeTab === 'analytics' && <AnalyticsTab hackathonId={hackathon.id} />}
        </div>
      </main>

      {/* MOBILE BOTTOM NAVIGATION - Enhanced */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 bg-[var(--bg-primary)]/98 backdrop-blur-2xl border-t border-white/10 z-40 grid grid-cols-4 pb-safe">
        {/* Top gradient overlay */}
        <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-white/10 to-transparent" />

        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`group relative flex flex-col items-center justify-center py-3 gap-1 transition-colors ${
              activeTab === tab.id ? 'text-accent' : 'text-text-muted'
            }`}
          >
            {/* Active indicator bar */}
            {activeTab === tab.id && (
              <div className="absolute -top-6 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-accent shadow-[0_0_10px_#00A8A8]" />
            )}

            {/* Icon container with hover effects */}
            <div className={`p-2 rounded-xl transition-all duration-300 ${activeTab === tab.id ? 'bg-accent/10 scale-110' : 'group-hover:bg-white/5'}`}>
              {tab.icon}
            </div>
            <span className={`text-[10px] font-bold uppercase tracking-wider transition-colors ${activeTab === tab.id ? 'text-accent' : 'text-text-muted group-hover:text-gray-400'}`}>
              {tab.label}
            </span>

            {/* Ripple effect when active */}
            {activeTab === tab.id && (
              <div className="absolute inset-0 rounded-xl bg-accent/5 animate-pulse" />
            )}
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

function IconCalendar({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
    </svg>
  );
}
