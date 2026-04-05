'use client';

import React, { useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { trpc } from '@/lib/trpc';
import { useRouter } from 'next/navigation';
import Background from '@/components/portal/Background';
import { LiquidGlass } from '@/components/portal/LiquidGlass';
import { LoadingScreen } from '@/components/portal/LoadingScreen';
import Link from 'next/link';

function formatDate(d: Date | string) {
    return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatDateRange(start: Date | string, end: Date | string) {
    const s = new Date(start);
    const e = new Date(end);
    if (s.getMonth() === e.getMonth() && s.getFullYear() === e.getFullYear()) {
        return `${s.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${e.getDate()}, ${e.getFullYear()}`;
    }
    if (s.getFullYear() === e.getFullYear()) {
        return `${s.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${e.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}, ${e.getFullYear()}`;
    }
    return `${formatDate(s)} – ${formatDate(e)}`;
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

export default function HackathonsPage() {
    const { data: session, status: authStatus } = useSession();
    const router = useRouter();

    const { data: hackathons, isLoading } = trpc.hackathon.list.useQuery({});
    const { data: myRegs } = trpc.hackathon.myRegistrations.useQuery(undefined, { enabled: !!session });

    useEffect(() => {
        if (authStatus === 'unauthenticated') router.push('/login');
    }, [authStatus, router]);

    if (authStatus === 'loading' || isLoading) return <LoadingScreen message="Loading Hackathons..." />;
    if (!session) return null;

    if (!hackathons || hackathons.length === 0) {
        return (
            <div className="relative min-h-screen bg-[#050505] text-gray-400 font-sans flex items-center justify-center p-6 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-white/[0.03] to-transparent">
                <Background className="fixed inset-0 z-0 opacity-[0.03]" />
                <LiquidGlass className="relative z-10 max-w-lg w-full p-12 text-center flex flex-col items-center border border-white/5">
                    <div className="w-20 h-20 bg-white/[0.02] border border-white/5 rounded-2xl flex items-center justify-center mb-6 shadow-[0_0_30px_rgba(255,255,255,0.02)]">
                        <svg className="w-8 h-8 text-white/40" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>
                    </div>
                    <h2 className="text-xl text-white font-medium mb-2">No Active Events</h2>
                    <p className="text-sm text-white/40 mb-8 leading-relaxed">
                        There are currently no hackathons available. Please check back later for upcoming events.
                    </p>
                    <Link href="/dashboard" className="px-6 py-3 bg-white/5 border border-white/10 hover:bg-white/10 hover:text-white transition-all duration-300 rounded-xl text-white/70 font-medium text-sm flex items-center gap-2 group">
                        <svg className="w-4 h-4 transform group-hover:-translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
                        Return to Dashboard
                    </Link>
                </LiquidGlass>
            </div>
        );
    }

    const registeredIds = new Set(myRegs?.map((r) => r.hackathonId) ?? []);

    return (
        <div className="relative min-h-screen bg-[#020202] text-gray-400 font-sans selection:bg-cyan-500/30 overflow-hidden">
            {/* Ambient Background Glows */}
            <div className="fixed top-[-20%] left-[-10%] w-[50%] h-[50%] rounded-full bg-cyan-600/10 blur-[120px] pointer-events-none" />
            <div className="fixed bottom-[-20%] right-[-10%] w-[50%] h-[50%] rounded-full bg-indigo-600/10 blur-[120px] pointer-events-none" />

            <Background className="fixed inset-0 z-0 opacity-[0.02]" />

            <div className="relative z-10 max-w-6xl mx-auto py-24 px-6 md:px-12">
                {/* Header Section */}
                <div className="flex flex-col md:flex-row md:items-end justify-between mb-16 gap-6">
                    <div>
                        <Link href="/dashboard" className="inline-flex items-center gap-2 text-white/40 hover:text-white transition-colors text-sm font-medium mb-8 group">
                            <div className="p-1.5 rounded-full bg-white/5 border border-white/10 group-hover:bg-white/10 transition-colors">
                                <svg className="w-3.5 h-3.5 transform group-hover:-translate-x-0.5 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                            </div>
                            Dashboard
                        </Link>

                        <h1 className="text-4xl md:text-6xl font-black text-transparent bg-clip-text bg-gradient-to-br from-white via-white to-white/40 tracking-tight mb-4">
                            Events & Hackathons
                        </h1>
                        <p className="text-base md:text-lg text-white/40 max-w-xl leading-relaxed">
                            Discover and register for upcoming hackathons. Join teams, build projects, and compete for prizes.
                        </p>
                    </div>
                </div>

                {/* Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {hackathons.map((h) => {
                        const conf = statusConfig(h.status);
                        const isRegistered = registeredIds.has(h.id);

                        return (
                            <Link key={h.id} href={`/hackathons/${h.id}/participants`} className="group block h-full">
                                <LiquidGlass className="h-full flex flex-col p-1 transition-all duration-500 hover:-translate-y-1 hover:shadow-[0_20px_40px_-15px_rgba(0,0,0,0.5)] bg-white/[0.01] border-white/5 hover:bg-white/[0.02] hover:border-white/20">
                                    <div className="relative flex flex-col h-full bg-[#0a0a0a] rounded-2xl p-6 md:p-8 overflow-hidden z-10">

                                        {/* Hover Gradient Overlay */}
                                        <div className="absolute inset-0 bg-gradient-to-br from-white/[0.02] to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />

                                        {/* Top Meta Area */}
                                        <div className="flex flex-wrap justify-between items-start gap-3 mb-8 relative z-10">
                                            {/* Status Badge */}
                                            <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full ${conf.bg} border ${conf.border} backdrop-blur-md`}>
                                                <div className={`h-1.5 w-1.5 rounded-full ${conf.dot} ${conf.glow} ${h.status === 'open' || h.status === 'in_progress' ? 'animate-pulse' : ''}`} />
                                                <span className={`text-[11px] font-semibold uppercase tracking-widest ${conf.text}`}>
                                                    {conf.label}
                                                </span>
                                            </div>

                                            {/* Registration Indicator */}
                                            {isRegistered && (
                                                <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-cyan-400">
                                                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                                                    <span className="text-[11px] font-semibold uppercase tracking-widest">Registered</span>
                                                </div>
                                            )}
                                        </div>

                                        {/* Content Area */}
                                        <div className="flex-1 relative z-10">
                                            {h.theme && (
                                                <p className="text-cyan-400/80 text-xs font-mono mb-3 uppercase tracking-wider">{h.theme}</p>
                                            )}
                                            <h2 className="text-2xl font-bold text-white mb-3 group-hover:text-cyan-300 transition-colors duration-300 leading-tight">
                                                {h.name}
                                            </h2>
                                            {h.description && (
                                                <p className="text-sm text-white/50 line-clamp-3 leading-relaxed mb-6">
                                                    {h.description}
                                                </p>
                                            )}
                                        </div>

                                        {/* Bottom Meta Area */}
                                        <div className="mt-auto pt-6 border-t border-white/5 flex flex-col gap-3 relative z-10">
                                            <div className="flex items-center gap-2.5 text-sm text-white/60">
                                                <div className="p-1.5 rounded-md bg-white/5 border border-white/5">
                                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                                                </div>
                                                <span className="font-medium">{formatDateRange(h.startDate, h.endDate)}</span>
                                            </div>

                                            {h.location && (
                                                <div className="flex items-center gap-2.5 text-sm text-white/60">
                                                    <div className="p-1.5 rounded-md bg-white/5 border border-white/5">
                                                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /></svg>
                                                    </div>
                                                    <span className="font-medium">{h.location}</span>
                                                </div>
                                            )}

                                            {h.maxParticipants && (
                                                <div className="flex items-center gap-2.5 text-sm text-white/60">
                                                    <div className="p-1.5 rounded-md bg-white/5 border border-white/5">
                                                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
                                                    </div>
                                                    <span className="font-medium">{h.currentParticipants} / {h.maxParticipants} Spots</span>
                                                </div>
                                            )}
                                        </div>

                                        {/* View Details Action */}
                                        <div className="absolute bottom-6 right-6 md:bottom-8 md:right-8 w-10 h-10 rounded-full bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400 opacity-0 transform translate-x-4 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-300 z-10 shadow-[0_0_15px_rgba(6,182,212,0.3)]">
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>
                                        </div>
                                    </div>
                                </LiquidGlass>
                            </Link>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
