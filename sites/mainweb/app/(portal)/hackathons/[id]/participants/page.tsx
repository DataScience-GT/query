'use client';

import React, { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { trpc } from '@/lib/trpc';
import { useRouter, useParams, useSearchParams } from 'next/navigation';
import Background from '@/components/portal/Background';
import { LiquidGlass } from '@/components/portal/LiquidGlass';
import { LoadingScreen } from '@/components/portal/LoadingScreen';
import Link from 'next/link';

// Extracted Tab Components
import { InfoTab } from '@/components/hackathon/InfoTab';
import { ScheduleTab } from '@/components/hackathon/ScheduleTab';
import { ProjectsTab } from '@/components/hackathon/ProjectsTab';
import { TeamsTab } from '@/components/hackathon/TeamsTab';

function formatDate(d: Date | string) {
    return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatDateRange(start: Date | string, end: Date | string) {
    const s = new Date(start);
    const e = new Date(end);
    if (s.getMonth() === e.getMonth() && s.getFullYear() === e.getFullYear()) {
        return `${s.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${e.getDate()}, ${e.getFullYear()}`;
    }
    if (s.getFullYear() === e.getFullYear()) {
        return `${s.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${e.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}, ${e.getFullYear()}`;
    }
    return `${formatDate(s)} - ${formatDate(e)}`;
}

function statusConfig(s: string) {
    const map: Record<string, { label: string; dot: string; text: string; bg: string; border: string; glow: string }> = {
        open: { label: 'Registering', dot: 'bg-emerald-400', text: 'text-emerald-400', bg: 'bg-emerald-400/10', border: 'border-emerald-400/30', glow: 'shadow-[0_0_15px_rgba(52,211,153,0.6)]' },
        in_progress: { label: 'Live Now', dot: 'bg-cyan-400', text: 'text-cyan-400', bg: 'bg-cyan-400/10', border: 'border-cyan-400/30', glow: 'shadow-[0_0_15px_rgba(34,211,238,0.6)]' },
        completed: { label: 'Completed', dot: 'bg-white/40', text: 'text-white/60', bg: 'bg-white/5', border: 'border-white/10', glow: '' },
        closed: { label: 'Applications Closed', dot: 'bg-amber-400', text: 'text-amber-400', bg: 'bg-amber-400/10', border: 'border-amber-400/30', glow: '' },
        cancelled: { label: 'Cancelled', dot: 'bg-rose-500', text: 'text-rose-500', bg: 'bg-rose-500/10', border: 'border-rose-500/30', glow: '' },
    };
    return map[s] ?? { label: s, dot: 'bg-gray-500', text: 'text-gray-400', bg: 'bg-gray-500/10', border: 'border-gray-500/20', glow: '' };
}

type TabType = 'INFO' | 'SCHEDULE' | 'PROJECTS' | 'TEAMS';

export default function ParticipantHackathonPage() {
    const { data: session, status: authStatus } = useSession();
    const router = useRouter();
    const params = useParams();
    const searchParams = useSearchParams();
    const hackathonId = params.id as string;

    const tabParam = searchParams.get('tab') as TabType | null;
    const [tab, setTab] = useState<TabType>(
        tabParam && ['INFO', 'SCHEDULE', 'PROJECTS', 'TEAMS'].includes(tabParam) ? tabParam : 'INFO'
    );

    const { data: hackathon, isLoading } = trpc.hackathon.getById.useQuery({ id: hackathonId });
    const { data: myRegs } = trpc.hackathon.myRegistrations.useQuery(undefined, { enabled: !!session });

    useEffect(() => {
        if (authStatus === 'unauthenticated') router.push('/login');
    }, [authStatus, router]);

    if (authStatus === 'loading' || isLoading || !hackathon) return <LoadingScreen message="Loading Hackathon..." />;
    if (!session) return null;

    const myReg = myRegs?.find((r) => r.hackathonId === hackathonId);
    const isRegistered = !!myReg;
    const conf = statusConfig(hackathon.status);
    const myTeamId = myReg?.team?.id ?? null;

    return (
        <div className="relative min-h-screen bg-[#020202] text-gray-400 font-sans selection:bg-cyan-500/30 overflow-hidden">
            {/* Ambient Background Glows */}
            <div className="fixed top-[-20%] left-[-10%] w-[50%] h-[50%] rounded-full bg-cyan-600/10 blur-[120px] pointer-events-none" />
            <div className="fixed bottom-[-20%] right-[-10%] w-[50%] h-[50%] rounded-full bg-indigo-600/10 blur-[120px] pointer-events-none" />

            <Background className="fixed inset-0 z-0 opacity-[0.02]" />

            <main className="relative z-10 max-w-5xl mx-auto py-24 px-6 md:px-12">
                <Link href="/hackathons" className="inline-flex items-center gap-2 text-white/40 hover:text-white transition-colors text-sm font-medium mb-12 group">
                    <div className="p-1.5 rounded-full bg-white/5 border border-white/10 group-hover:bg-white/10 transition-colors">
                        <svg className="w-3.5 h-3.5 transform group-hover:-translate-x-0.5 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                    </div>
                    All Events
                </Link>

                {/* Header Card */}
                <LiquidGlass className="p-8 md:p-12 mb-8 relative overflow-hidden bg-white/[0.01] border-white/5 shadow-[0_20px_40px_-15px_rgba(0,0,0,0.5)]">
                    {/* Header Background Gradient Overlay */}
                    <div className="absolute inset-0 bg-gradient-to-br from-white/[0.02] to-transparent pointer-events-none" />

                    <div className="flex flex-wrap items-center gap-3 mb-6 relative z-10">
                        {/* Status Badge */}
                        <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full ${conf.bg} border ${conf.border} backdrop-blur-md`}>
                            <div className={`h-1.5 w-1.5 rounded-full ${conf.dot} ${conf.glow} ${hackathon.status === 'open' || hackathon.status === 'in_progress' ? 'animate-pulse' : ''}`} />
                            <span className={`text-[11px] font-semibold uppercase tracking-widest ${conf.text}`}>
                                {conf.label}
                            </span>
                        </div>

                        {/* Registration Indicator */}
                        {isRegistered && (
                            <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                                <span className="text-[11px] font-semibold uppercase tracking-widest">Registered</span>
                            </div>
                        )}

                        {/* Theme */}
                        {hackathon.theme && (
                            <span className="text-[11px] font-semibold text-white/50 uppercase tracking-widest px-3 py-1.5 rounded-full bg-white/5 border border-white/10">
                                {hackathon.theme}
                            </span>
                        )}
                    </div>

                    <h1 className="text-4xl md:text-6xl font-black text-transparent bg-clip-text bg-gradient-to-br from-white via-white to-white/50 tracking-tight mb-8 relative z-10">
                        {hackathon.name}
                    </h1>

                    <div className="flex flex-wrap items-center gap-5 text-sm text-white/60 relative z-10">
                        <div className="flex items-center gap-2.5">
                            <div className="p-1.5 rounded-md bg-white/5 border border-white/5">
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                            </div>
                            <span className="font-medium">{formatDateRange(hackathon.startDate, hackathon.endDate)}</span>
                        </div>

                        {hackathon.location && (
                            <div className="flex items-center gap-2.5">
                                <div className="p-1.5 rounded-md bg-white/5 border border-white/5">
                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /></svg>
                                </div>
                                <span className="font-medium">{hackathon.location}</span>
                            </div>
                        )}

                        {hackathon.maxParticipants && (
                            <div className="flex items-center gap-2.5">
                                <div className="p-1.5 rounded-md bg-white/5 border border-white/5">
                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
                                </div>
                                <span className="font-medium">{hackathon.currentParticipants} / {hackathon.maxParticipants} Spots</span>
                            </div>
                        )}
                    </div>
                </LiquidGlass>

                {/* Tabs - Only for participants */}
                <div className="flex gap-2 mb-8 overflow-x-auto pb-2 scrollbar-none snap-x relative z-10 w-full">
                    {(['INFO', 'SCHEDULE', 'PROJECTS', 'TEAMS'] as const).map((t) => (
                        <button
                            key={t}
                            onClick={() => setTab(t)}
                            className={`px-6 py-3 rounded-xl text-xs font-semibold uppercase tracking-widest transition-all border whitespace-nowrap snap-start flex-1
                                ${tab === t
                                    ? 'bg-white/10 text-white border-white/20 shadow-[inset_0_0_20px_rgba(255,255,255,0.05)]'
                                    : 'text-white/40 border-transparent hover:text-white/80 hover:bg-white/5'
                                }`}
                        >
                            {t === 'INFO' ? 'Info & Register' : t === 'SCHEDULE' ? 'Schedule & QR' : t === 'PROJECTS' ? 'Project Gallery' : 'Find Teams'}
                        </button>
                    ))}
                </div>

                {/* Content - Participant-only */}
                <div className="relative z-10">
                    {tab === 'INFO' ? (
                        <InfoTab hackathon={hackathon} isRegistered={isRegistered} myReg={myReg} />
                    ) : tab === 'SCHEDULE' ? (
                        <ScheduleTab hackathonId={hackathonId} isRegistered={isRegistered} />
                    ) : tab === 'PROJECTS' ? (
                        <ProjectsTab hackathonId={hackathonId} />
                    ) : (
                        <TeamsTab hackathonId={hackathonId} isRegistered={isRegistered} myTeamId={myTeamId} />
                    )}
                </div>
            </main>
        </div>
    );
}
