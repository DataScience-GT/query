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

function statusLabel(s: string) {
    const map: Record<string, string> = { open: 'Registering', closed: 'Closed', in_progress: 'Live Now', completed: 'Completed', cancelled: 'Cancelled' };
    return map[s] ?? s;
}

function statusColor(s: string) {
    const map: Record<string, { dot: string; text: string; border: string }> = {
        open: { dot: 'bg-green-500', text: 'text-green-400', border: 'border-green-500/30' },
        in_progress: { dot: 'bg-[#00A8A8]', text: 'text-[#00A8A8]', border: 'border-[#00A8A8]/30' },
        completed: { dot: 'bg-gray-500', text: 'text-gray-400', border: 'border-gray-500/30' },
        closed: { dot: 'bg-yellow-500', text: 'text-yellow-400', border: 'border-yellow-500/30' },
        cancelled: { dot: 'bg-red-500', text: 'text-red-400', border: 'border-red-500/30' },
    };
    return map[s] ?? { dot: 'bg-gray-500', text: 'text-gray-400', border: 'border-gray-500/30' };
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
            <div className="relative min-h-screen bg-[#050505] text-gray-400 font-sans flex items-center justify-center p-6 bg-grid-white/[0.02]">
                <Background className="fixed inset-0 z-0 opacity-[0.03]" />
                <LiquidGlass className="relative z-10 max-w-lg w-full p-12 text-center flex flex-col items-center">
                    <svg className="w-16 h-16 text-gray-700 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>
                    <p className="text-sm font-mono text-gray-400 mb-8 leading-relaxed">
                        There are currently no active hackathons. Check back later!
                    </p>
                    <Link href="/dashboard" className="px-6 py-3 bg-white/5 border border-white/10 hover:bg-white/10 transition-colors rounded-xl text-white font-mono text-xs uppercase tracking-wider flex items-center gap-2">
                        <span>Return to Dashboard</span>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" /></svg>
                    </Link>
                </LiquidGlass>
            </div>
        );
    }

    const registeredIds = new Set(myRegs?.map((r) => r.hackathonId) ?? []);

    return (
        <div className="relative min-h-screen bg-[#050505] text-gray-400 font-sans selection:bg-[#00A8A8]/30 overflow-x-hidden">
            <Background className="fixed inset-0 z-0 opacity-[0.03]" />
            <main className="relative z-10 max-w-5xl mx-auto py-20 px-6">
                <Link href="/dashboard" className="mb-10 flex items-center gap-2 text-gray-500 hover:text-white transition-colors text-sm font-mono uppercase tracking-wider group">
                    <svg className="w-4 h-4 transform group-hover:-translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
                    Dashboard
                </Link>

                <div className="mb-12">
                    <h1 className="text-4xl md:text-5xl font-black text-white italic uppercase tracking-tighter mb-3">Hackathons</h1>
                    <p className="text-sm font-mono text-gray-500 uppercase tracking-wider">Browse and join upcoming events</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {hackathons.map((h) => {
                        const sc = statusColor(h.status);
                        const isRegistered = registeredIds.has(h.id);

                        return (
                            <Link key={h.id} href={`/hackathons/${h.id}`} className="group block">
                                <LiquidGlass className="p-6 md:p-8 h-full hover:border-[#00A8A8]/30 transition-all duration-300 relative overflow-hidden group-hover:shadow-[0_0_40px_rgba(0,168,168,0.08)]">
                                    <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-[#00A8A8]/0 group-hover:via-[#00A8A8]/30 to-transparent transition-all duration-500" />

                                    {/* Status + Registration badges */}
                                    <div className="flex flex-wrap items-center gap-2 mb-4">
                                        <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/[0.03] border ${sc.border}`}>
                                            <div className={`h-2 w-2 rounded-full ${sc.dot} ${h.status === 'open' || h.status === 'in_progress' ? 'animate-pulse' : ''}`} />
                                            <span className={`text-[10px] font-mono font-bold uppercase tracking-wider ${sc.text}`}>{statusLabel(h.status)}</span>
                                        </div>
                                        {isRegistered && (
                                            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-green-500/10 border border-green-500/20">
                                                <svg className="w-3 h-3 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                                                <span className="text-[9px] font-mono font-bold text-green-400 uppercase tracking-wider">Registered</span>
                                            </div>
                                        )}
                                        {h.theme && (
                                            <span className="text-[10px] font-mono text-gray-500 uppercase tracking-wider px-2.5 py-1 rounded-full bg-white/[0.03] border border-white/10">{h.theme}</span>
                                        )}
                                    </div>

                                    {/* Hackathon name */}
                                    <h2 className="text-2xl md:text-3xl font-black text-white italic uppercase tracking-tighter mb-3 group-hover:text-[#00A8A8] transition-colors duration-300">
                                        {h.name}
                                    </h2>

                                    {/* Description preview */}
                                    {h.description && (
                                        <p className="text-sm text-gray-400 mb-4 line-clamp-2 leading-relaxed">{h.description}</p>
                                    )}

                                    {/* Date, location, participants */}
                                    <div className="flex flex-wrap items-center gap-4 text-xs font-mono text-gray-500 mt-auto pt-4 border-t border-white/5">
                                        <span className="flex items-center gap-1.5">
                                            <svg className="w-3.5 h-3.5 text-[#00A8A8]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                                            {formatDateRange(h.startDate, h.endDate)}
                                        </span>
                                        {h.location && (
                                            <span className="flex items-center gap-1.5">
                                                <svg className="w-3.5 h-3.5 text-[#00A8A8]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /></svg>
                                                {h.location}
                                            </span>
                                        )}
                                        {h.maxParticipants && (
                                            <span className="flex items-center gap-1.5">
                                                <svg className="w-3.5 h-3.5 text-[#00A8A8]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
                                                {h.currentParticipants}/{h.maxParticipants}
                                            </span>
                                        )}
                                    </div>

                                    {/* Arrow indicator */}
                                    <div className="absolute bottom-6 right-6 md:bottom-8 md:right-8 opacity-0 group-hover:opacity-100 transition-all duration-300 transform translate-x-2 group-hover:translate-x-0">
                                        <svg className="w-5 h-5 text-[#00A8A8]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" /></svg>
                                    </div>
                                </LiquidGlass>
                            </Link>
                        );
                    })}
                </div>
            </main>
        </div>
    );
}
