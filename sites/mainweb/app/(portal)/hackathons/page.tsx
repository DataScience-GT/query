'use client';

import React, { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { trpc } from '@/lib/trpc';
import { useRouter } from 'next/navigation';
import Background from '@/components/portal/Background';
import { LiquidGlass } from '@/components/portal/LiquidGlass';
import { LoadingScreen } from '@/components/portal/LoadingScreen';
import Image from 'next/image';
import Link from 'next/link';
import { QRCodeSVG } from 'qrcode.react';



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

type ShirtSize = 'XS' | 'S' | 'M' | 'L' | 'XL' | 'XXL';
const SIZES: ShirtSize[] = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];
const DIETARY = ['Vegetarian', 'Vegan', 'Gluten-Free', 'Halal', 'Kosher', 'Dairy-Free', 'Nut-Free', 'None'];



export default function HackathonsPage() {
    const { data: session, status: authStatus } = useSession();
    const router = useRouter();
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [tab, setTab] = useState<'INFO' | 'SCHEDULE' | 'PROJECTS' | 'TEAMS'>('INFO');

    // Lock the page: only admins can view for now
    const { data: adminStatus, isLoading: adminLoading } = trpc.admin.isAdmin.useQuery(undefined, { enabled: !!session });

    useEffect(() => {
        if (authStatus === 'unauthenticated') router.push('/login');
    }, [authStatus, router]);

    useEffect(() => {
        const urlParams = new URLSearchParams(window.location.search);
        const idParam = urlParams.get('id');
        const tabParam = urlParams.get('tab') as 'INFO' | 'SCHEDULE' | 'PROJECTS' | 'TEAMS' | null;

        if (idParam && !selectedId) {
            setSelectedId(idParam);
        }
        if (tabParam && ['INFO', 'SCHEDULE', 'PROJECTS', 'TEAMS'].includes(tabParam)) {
            setTab(tabParam);
        }
    }, [selectedId]);

    if (authStatus === 'loading' || adminLoading) return <LoadingScreen message="Loading..." />;
    if (!session) return null;

    if (!adminStatus?.isAdmin) {
        return (
            <div className="relative min-h-screen bg-[#050505] text-gray-400 font-sans flex items-center justify-center p-6 bg-grid-white/[0.02]">
                <Background className="fixed inset-0 z-0 opacity-[0.03]" />
                <LiquidGlass className="relative z-10 max-w-lg w-full p-12 text-center flex flex-col items-center">
                    <div className="w-20 h-20 mb-6 bg-yellow-500/10 border border-yellow-500/20 rounded-full flex items-center justify-center animate-pulse">
                        <svg className="w-10 h-10 text-yellow-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                    </div>
                    <p className="text-xs text-yellow-500 font-mono tracking-[0.2em] uppercase mb-2">Restricted Access</p>
                    <h1 className="text-3xl font-black text-white uppercase tracking-tight mb-4">Under Construction</h1>
                    <p className="text-sm font-mono text-gray-400 mb-8 leading-relaxed">
                        The Hackathon Event Registry is currently undergoing maintenance and upgrades. Please check back later for exciting new features and events.
                    </p>
                    <Link href="/dashboard" className="px-6 py-3 bg-white/5 border border-white/10 hover:bg-white/10 transition-colors rounded-xl text-white font-mono text-xs uppercase tracking-wider flex items-center gap-2">
                        <span>Return to Dashboard</span>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" /></svg>
                    </Link>
                </LiquidGlass>
            </div>
        );
    }

    return selectedId ? (
        <DetailView hackathonId={selectedId} tab={tab} setTab={setTab} onBack={() => { setSelectedId(null); setTab('INFO'); }} />
    ) : (
        <ListView onSelect={(id) => setSelectedId(id)} />
    );
}



function ListView({ onSelect }: { onSelect: (id: string) => void }) {
    const { data: session } = useSession();
    const { data: hackathons, isLoading } = trpc.hackathon.list.useQuery({});
    const { data: myRegs } = trpc.hackathon.myRegistrations.useQuery(undefined, { enabled: !!session });

    if (isLoading) return <LoadingScreen message="Loading Hackathons..." />;

    const isRegistered = (id: string) => myRegs?.some((r) => r.hackathonId === id) ?? false;

    return (
        <div className="relative min-h-screen bg-[#050505] text-gray-400 font-sans selection:bg-[#00A8A8]/30 overflow-x-hidden">
            <Background className="fixed inset-0 z-0 opacity-[0.03]" />
            <main className="relative z-10 max-w-5xl mx-auto py-20 px-6">
                <Link href="/dashboard" className="mb-8 flex items-center gap-2 text-gray-500 hover:text-white transition-colors text-sm font-mono uppercase tracking-wider group">
                    <svg className="w-4 h-4 transform group-hover:-translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
                    Dashboard
                </Link>

                <div className="mb-12">
                    <p className="text-xs text-gray-600 uppercase tracking-[0.4em] mb-2 font-mono">Event Registry</p>
                    <h1 className="text-4xl md:text-5xl font-black text-white italic uppercase tracking-tighter">Hackathons</h1>
                    <p className="text-gray-500 font-mono text-sm mt-3">Browse events, register, and find teammates.</p>
                </div>

                {!hackathons || hackathons.length === 0 ? (
                    <LiquidGlass className="p-12 text-center">
                        <svg className="w-16 h-16 text-gray-700 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>
                        <p className="text-gray-500 font-mono text-sm uppercase tracking-wider">No hackathons available</p>
                    </LiquidGlass>
                ) : (
                    <div className="space-y-4">
                        {hackathons.map((h) => {
                            const sc = statusColor(h.status);
                            const reg = isRegistered(h.id);
                            return (
                                <button key={h.id} onClick={() => onSelect(h.id)} className="w-full text-left group">
                                    <LiquidGlass className="p-6 md:p-8 relative overflow-hidden hover:border-[#00A8A8]/20 transition-all duration-300 group-hover:translate-y-[-2px]">
                                        <div className="absolute -right-10 -top-10 w-40 h-40 bg-[#00A8A8]/5 rounded-full blur-3xl opacity-0 group-hover:opacity-100 transition-all duration-500" />
                                        <div className="relative z-10 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                                            <div className="flex-1 min-w-0">
                                                <div className="flex flex-wrap items-center gap-2 mb-3">
                                                    <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/[0.03] border ${sc.border}`}>
                                                        <div className={`h-1.5 w-1.5 rounded-full ${sc.dot} ${h.status === 'open' || h.status === 'in_progress' ? 'animate-pulse' : ''}`} />
                                                        <span className={`text-[9px] font-mono font-bold uppercase tracking-wider ${sc.text}`}>{statusLabel(h.status)}</span>
                                                    </div>
                                                    {reg && (
                                                        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-green-500/10 border border-green-500/20">
                                                            <svg className="w-3 h-3 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                                                            <span className="text-[9px] font-mono font-bold text-green-400 uppercase tracking-wider">Registered</span>
                                                        </div>
                                                    )}
                                                </div>
                                                <h2 className="text-xl md:text-2xl font-bold text-white uppercase tracking-tight mb-2 group-hover:text-[#00A8A8] transition-colors truncate">{h.name}</h2>
                                                <div className="flex flex-wrap items-center gap-4 text-xs font-mono text-gray-500">
                                                    <span className="flex items-center gap-1.5">
                                                        <svg className="w-3.5 h-3.5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                                                        {formatDateRange(h.startDate, h.endDate)}
                                                    </span>
                                                    {h.location && <span className="flex items-center gap-1.5"><svg className="w-3.5 h-3.5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /></svg>{h.location}</span>}
                                                    {h.maxParticipants && <span className="flex items-center gap-1.5"><svg className="w-3.5 h-3.5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" /></svg>{h.currentParticipants}/{h.maxParticipants}</span>}
                                                </div>
                                            </div>
                                            <div className="flex-shrink-0">
                                                <div className="w-10 h-10 rounded-lg bg-white/[0.03] border border-white/5 flex items-center justify-center group-hover:border-[#00A8A8]/30 group-hover:bg-[#00A8A8]/10 transition-all">
                                                    <svg className="w-4 h-4 text-gray-600 group-hover:text-[#00A8A8] transform group-hover:translate-x-0.5 transition-all" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                                                </div>
                                            </div>
                                        </div>
                                    </LiquidGlass>
                                </button>
                            );
                        })}
                    </div>
                )}
            </main>
        </div>
    );
}



function DetailView({
    hackathonId,
    tab,
    setTab,
    onBack,
}: {
    hackathonId: string;
    tab: 'INFO' | 'SCHEDULE' | 'PROJECTS' | 'TEAMS';
    setTab: (t: 'INFO' | 'SCHEDULE' | 'PROJECTS' | 'TEAMS') => void;
    onBack: () => void;
}) {
    const { data: session } = useSession();
    const { data: hackathon, isLoading } = trpc.hackathon.getById.useQuery({ id: hackathonId });
    const { data: myRegs } = trpc.hackathon.myRegistrations.useQuery(undefined, { enabled: !!session });

    if (isLoading || !hackathon) return <LoadingScreen message="Loading..." />;

    const myReg = myRegs?.find((r) => r.hackathonId === hackathonId);
    const isRegistered = !!myReg;
    const sc = statusColor(hackathon.status);

    return (
        <div className="relative min-h-screen bg-[#050505] text-gray-400 font-sans selection:bg-[#00A8A8]/30 overflow-x-hidden">
            <Background className="fixed inset-0 z-0 opacity-[0.03]" />
            <main className="relative z-10 max-w-4xl mx-auto py-20 px-6">
                <button onClick={onBack} className="mb-8 flex items-center gap-2 text-gray-500 hover:text-white transition-colors text-sm font-mono uppercase tracking-wider group">
                    <svg className="w-4 h-4 transform group-hover:-translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
                    All Hackathons
                </button>


                <LiquidGlass className="p-8 md:p-10 mb-6 relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-[#00A8A8]/20 to-transparent" />
                    <div className="flex flex-wrap items-center gap-3 mb-4">
                        <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/[0.03] border ${sc.border}`}>
                            <div className={`h-2 w-2 rounded-full ${sc.dot} ${hackathon.status === 'open' || hackathon.status === 'in_progress' ? 'animate-pulse' : ''}`} />
                            <span className={`text-[10px] font-mono font-bold uppercase tracking-wider ${sc.text}`}>{statusLabel(hackathon.status)}</span>
                        </div>
                        {isRegistered && (
                            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-green-500/10 border border-green-500/20">
                                <svg className="w-3 h-3 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                                <span className="text-[9px] font-mono font-bold text-green-400 uppercase tracking-wider">Registered</span>
                            </div>
                        )}
                        {hackathon.theme && (
                            <span className="text-[10px] font-mono text-gray-500 uppercase tracking-wider px-2.5 py-1 rounded-full bg-white/[0.03] border border-white/10">{hackathon.theme}</span>
                        )}
                    </div>
                    <h1 className="text-3xl md:text-4xl font-black text-white italic uppercase tracking-tighter mb-3">{hackathon.name}</h1>
                    <div className="flex flex-wrap items-center gap-5 text-sm font-mono text-gray-500">
                        <span className="flex items-center gap-2"><svg className="w-4 h-4 text-[#00A8A8]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>{formatDateRange(hackathon.startDate, hackathon.endDate)}</span>
                        {hackathon.location && <span className="flex items-center gap-2"><svg className="w-4 h-4 text-[#00A8A8]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /></svg>{hackathon.location}</span>}
                        {hackathon.maxParticipants && <span className="flex items-center gap-2"><svg className="w-4 h-4 text-[#00A8A8]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /></svg>{hackathon.currentParticipants}/{hackathon.maxParticipants}</span>}
                    </div>
                </LiquidGlass>


                <div className="flex gap-2 mb-6 overflow-x-auto pb-2 scrollbar-none snap-x">
                    {(['INFO', 'SCHEDULE', 'PROJECTS', 'TEAMS'] as const).map((t) => (
                        <button
                            key={t}
                            onClick={() => setTab(t)}
                            className={`px-6 py-3 rounded-lg font-mono text-sm font-bold uppercase tracking-wider transition-all border whitespace-nowrap snap-start
                ${tab === t
                                    ? 'bg-white/[0.05] text-white border-white/10 shadow-[inset_0_0_20px_rgba(255,255,255,0.02)]'
                                    : 'text-gray-600 border-transparent hover:text-gray-400 hover:bg-white/[0.02]'
                                }`}
                        >
                            {t === 'INFO' ? '📋 Info & Register' : t === 'SCHEDULE' ? '📅 Schedule & QR Pass' : t === 'PROJECTS' ? '🏆 Project Gallery' : '👥 Find Teams'}
                        </button>
                    ))}
                </div>


                {tab === 'INFO' ? (
                    <InfoTab hackathon={hackathon} isRegistered={isRegistered} myReg={myReg} />
                ) : tab === 'SCHEDULE' ? (
                    <ScheduleTab hackathonId={hackathonId} isRegistered={isRegistered} />
                ) : tab === 'PROJECTS' ? (
                    <ProjectsTab hackathonId={hackathonId} />
                ) : (
                    <TeamsTab hackathonId={hackathonId} isRegistered={isRegistered} myTeamId={myReg?.teamId ?? null} />
                )}
            </main>
        </div>
    );
}

function ProjectsTab({ hackathonId }: { hackathonId: string }) {
    const { data: projects, isLoading } = trpc.hackathon.getPublicProjects.useQuery({ hackathonId });

    if (isLoading) return <div className="py-12 text-center text-sm font-mono text-gray-500 animate-pulse">Loading amazing projects...</div>;

    if (!projects || projects.length === 0) {
        return (
            <LiquidGlass className="p-12 text-center">
                <svg className="w-16 h-16 text-gray-700 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>
                <p className="text-gray-500 font-mono text-sm uppercase tracking-wider">No projects submitted yet.</p>
            </LiquidGlass>
        );
    }

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {projects.map((project) => (
                <LiquidGlass key={project.id} className="p-6 md:p-8 hover:border-[#00A8A8]/30 transition-colors group flex flex-col h-full relative overflow-hidden">
                    <div className="flex-1 relative z-10">
                        <div className="flex items-center justify-between mb-2">
                            <h3 className="text-xl font-bold text-white group-hover:text-[#00A8A8] transition-colors">{project.name}</h3>
                            {project.status === 'winner' && (
                                <span className="bg-yellow-500/10 text-yellow-500 border border-yellow-500/20 text-[10px] font-mono font-bold uppercase tracking-wider px-2 py-1 rounded-full animate-pulse">Winner</span>
                            )}
                        </div>
                        <p className="text-sm text-gray-400 mb-4 line-clamp-3">{project.description}</p>

                        {project.technologies && project.technologies.length > 0 && (
                            <div className="flex flex-wrap gap-2 mb-4">
                                {project.technologies.slice(0, 4).map(tech => (
                                    <span key={tech} className="text-[10px] font-mono text-gray-500 bg-white/[0.02] border border-white/5 px-2 py-0.5 rounded uppercase tracking-wider">{tech}</span>
                                ))}
                                {project.technologies.length > 4 && <span className="text-[10px] font-mono text-gray-600 px-1 border border-transparent">+{project.technologies.length - 4}</span>}
                            </div>
                        )}

                        {project.challenges && project.challenges.length > 0 && (
                            <div className="mb-4 space-y-1">
                                {project.challenges.map(c => (
                                    <div key={c} className="text-xs font-mono text-[#00A8A8] flex items-center gap-1.5"><svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg> {c.replace('MLH_', '')}</div>
                                ))}
                            </div>
                        )}
                    </div>

                    <div className="mt-4 pt-4 border-t border-white/5 flex items-center justify-between relative z-10">
                        <div className="text-xs font-mono text-gray-500">
                            By <span className="text-white font-medium">{project.team?.name || 'Unknown Team'}</span>
                        </div>
                        <div className="flex gap-3">
                            {project.githubUrl && (
                                <a href={project.githubUrl} target="_blank" rel="noopener noreferrer" className="text-gray-500 hover:text-white transition-colors">
                                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path fillRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" clipRule="evenodd" /></svg>
                                </a>
                            )}
                            {project.demoUrl && (
                                <a href={project.demoUrl} target="_blank" rel="noopener noreferrer" className="text-gray-500 hover:text-[#00A8A8] transition-colors">
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                                </a>
                            )}
                        </div>
                    </div>
                </LiquidGlass>
            ))}
        </div>
    );
}

function ScheduleTab({ hackathonId, isRegistered }: { hackathonId: string; isRegistered: boolean }) {
    const { data: events, isLoading: eventsLoading } = trpc.hackathon.getEvents.useQuery({ hackathonId });
    const { data: myRecord } = trpc.hackathon.myParticipantRecord.useQuery({ hackathonId }, { enabled: isRegistered });

    if (eventsLoading) return <div className="py-12 text-center text-sm font-mono text-gray-500 animate-pulse">Loading schedule...</div>;

    const qrData = myRecord ? JSON.stringify({ type: 'CHECK_IN', hackathonId, participantId: myRecord.id }) : null;

    return (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-1 space-y-6">
                <LiquidGlass className="p-8 text-center flex flex-col items-center justify-center relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-[#00A8A8]/10 rounded-full blur-3xl" />
                    <h3 className="text-xl font-black text-white uppercase tracking-tight mb-2">My Event Pass</h3>
                    <p className="text-xs font-mono text-gray-500 mb-6">Scan to check into workshops and meals.</p>

                    {isRegistered && qrData ? (
                        <div className="p-4 bg-white rounded-2xl shadow-[0_0_40px_rgba(0,168,168,0.2)]">
                            <QRCodeSVG
                                value={qrData}
                                size={200}
                                level="H"
                                fgColor="#050505"
                                bgColor="#ffffff"
                            />
                        </div>
                    ) : (
                        <div className="w-[232px] h-[232px] border-2 border-dashed border-white/10 rounded-2xl flex flex-col items-center justify-center text-gray-600">
                            <svg className="w-12 h-12 mb-3 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
                            <span className="text-xs font-mono uppercase text-center px-4">Register first to get your QR code</span>
                        </div>
                    )}
                </LiquidGlass>

                {isRegistered && myRecord && (
                    <LiquidGlass className="p-6">
                        <h4 className="text-sm font-bold text-white uppercase tracking-wider mb-4 border-b border-white/10 pb-2">Pass Details</h4>
                        <ul className="space-y-3 text-xs font-mono text-gray-400">
                            <li className="flex justify-between"><span>Status</span> <span className="text-green-400 uppercase font-semibold">{myRecord.registrationStatus}</span></li>
                            <li className="flex justify-between"><span>Shirt Size</span> <span className="text-white">{myRecord.shirtSize || 'N/A'}</span></li>
                        </ul>
                    </LiquidGlass>
                )}
            </div>

            <div className="lg:col-span-2 space-y-4">
                <LiquidGlass className="p-6 md:p-8">
                    <h3 className="text-xl font-black text-white uppercase tracking-tight mb-6 flex items-center justify-between">
                        <span>Event Schedule</span>
                        <span className="text-[10px] font-mono font-normal tracking-wider text-[#00A8A8] bg-[#00A8A8]/10 px-3 py-1 rounded-full">{events?.length || 0} Events</span>
                    </h3>

                    {!events || events.length === 0 ? (
                        <div className="py-12 text-center text-gray-500 font-mono italic text-sm">No events have been scheduled yet.</div>
                    ) : (
                        <div className="relative border-l border-white/10 ml-3 md:ml-4 space-y-8 pb-4">
                            {events.map((event) => (
                                <div key={event.id} className="relative pl-6 md:pl-8 group">
                                    <span className="absolute -left-[5px] top-1.5 w-2.5 h-2.5 rounded-full bg-black border-2 border-[#00A8A8] group-hover:bg-[#00A8A8] transition-colors shadow-[0_0_10px_rgba(0,168,168,0.5)]" />
                                    <div className="flex flex-col md:flex-row md:items-start justify-between gap-2 mb-1">
                                        <h4 className="text-lg font-bold text-white group-hover:text-[#00A8A8] transition-colors">{event.name}</h4>
                                        <span className="text-sm font-mono text-[#00A8A8] whitespace-nowrap">
                                            {new Date(event.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                            <span className="text-gray-600 mx-1">-</span>
                                            {new Date(event.endTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                        </span>
                                    </div>
                                    <div className="flex flex-wrap items-center gap-3 text-xs font-mono text-gray-500 mb-2">
                                        <span className="uppercase tracking-wider px-2 py-0.5 rounded bg-white/[0.03] border border-white/5">{event.type.replace(/_/g, ' ')}</span>
                                        <span className="flex items-center gap-1"><svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /></svg>{event.location}</span>
                                        {event.points > 0 && <span className="text-yellow-500 font-bold">+{event.points} pts</span>}
                                    </div>
                                    {event.description && <p className="text-sm text-gray-400 mt-2">{event.description}</p>}
                                </div>
                            ))}
                        </div>
                    )}
                </LiquidGlass>
            </div>
        </div>
    );
}

function InfoTab({
    hackathon,
    isRegistered,
    myReg,
}: {
    hackathon: {
        id: string;
        name: string;
        description?: string | null;
        prizes?: { place: string; amount: number; description?: string }[] | null;
        rules?: string | null;
        registrationDeadline?: string | Date | null;
        websiteUrl?: string | null;
        status: string;
        maxParticipants?: number | null;
        currentParticipants: number;
        theme?: string | null;
    };
    isRegistered: boolean;
    myReg?: { registrationStatus: string; teamId?: string | null } | null;
}) {
    const [showForm, setShowForm] = useState(false);
    const [shirtSize, setShirtSize] = useState<ShirtSize | ''>('');
    const [dietary, setDietary] = useState<string[]>([]);
    const [emergencyContact, setEmergencyContact] = useState('');
    const [emergencyPhone, setEmergencyPhone] = useState('');
    const [error, setError] = useState('');
    const [success, setSuccess] = useState(false);

    const utils = trpc.useUtils();
    const registerMutation = trpc.hackathon.register.useMutation({
        onSuccess: () => {
            setSuccess(true);
            setShowForm(false);
            utils.hackathon.myRegistrations.invalidate();
            utils.hackathon.list.invalidate();
            utils.hackathon.getById.invalidate({ id: hackathon.id });
        },
        onError: (e) => setError(e.message),
    });

    const isFull = !!(hackathon.maxParticipants && hackathon.currentParticipants >= hackathon.maxParticipants);
    const canRegister = hackathon.status === 'open' && !isRegistered && !isFull;
    const deadlinePassed = hackathon.registrationDeadline && new Date(hackathon.registrationDeadline) < new Date();

    function toggleDietary(opt: string) {
        if (opt === 'None') { setDietary([]); return; }
        setDietary((p) => p.includes(opt) ? p.filter((d) => d !== opt) : [...p, opt]);
    }

    return (
        <div className="space-y-6 animate-in fade-in duration-300">

            {hackathon.description && (
                <LiquidGlass className="p-6">
                    <h3 className="text-xs uppercase tracking-[0.2em] font-bold text-[#00A8A8] mb-3 font-mono">About</h3>
                    <p className="text-gray-300 text-sm leading-relaxed whitespace-pre-wrap">{hackathon.description}</p>
                </LiquidGlass>
            )}


            {hackathon.prizes && hackathon.prizes.length > 0 && (
                <LiquidGlass className="p-6">
                    <h3 className="text-xs uppercase tracking-[0.2em] font-bold text-[#00A8A8] mb-4 font-mono">Prizes</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                        {hackathon.prizes.map((p: { place: string; amount: number; description?: string }, i: number) => (
                            <div key={i} className="p-4 bg-black/30 border border-white/5 rounded-lg hover:border-[#00A8A8]/20 transition-colors">
                                <p className="text-white font-bold text-lg mb-1">{p.place}</p>
                                <p className="text-[#00A8A8] font-mono font-bold text-xl">${p.amount.toLocaleString()}</p>
                                {p.description && <p className="text-gray-500 text-xs mt-2">{p.description}</p>}
                            </div>
                        ))}
                    </div>
                </LiquidGlass>
            )}


            {hackathon.rules && (
                <LiquidGlass className="p-6">
                    <h3 className="text-xs uppercase tracking-[0.2em] font-bold text-[#00A8A8] mb-3 font-mono">Rules</h3>
                    <p className="text-gray-400 text-sm leading-relaxed whitespace-pre-wrap">{hackathon.rules}</p>
                </LiquidGlass>
            )}


            {(hackathon.registrationDeadline || hackathon.websiteUrl) && (
                <div className="flex flex-wrap gap-4">
                    {hackathon.registrationDeadline && (
                        <div className="flex items-center gap-2 text-sm font-mono">
                            <svg className="w-4 h-4 text-yellow-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                            <span className={deadlinePassed ? 'text-red-400' : 'text-yellow-400'}>
                                Deadline: {formatDate(hackathon.registrationDeadline)}{deadlinePassed ? ' (Passed)' : ''}
                            </span>
                        </div>
                    )}
                    {hackathon.websiteUrl && (
                        <a href={hackathon.websiteUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-sm font-mono text-[#00A8A8] hover:text-white transition-colors">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                            Official Website
                        </a>
                    )}
                </div>
            )}


            <LiquidGlass className="p-6">
                {success && (
                    <div className="mb-4 p-4 bg-green-500/10 border border-green-500/30 rounded-lg flex items-center gap-3">
                        <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                        <p className="text-green-400 text-sm font-mono">Registration confirmed! You&apos;re in.</p>
                    </div>
                )}

                {isRegistered || success ? (
                    <div className="flex items-center gap-4">
                        <div className="flex items-center gap-3 px-6 py-3 bg-green-500/10 border border-green-500/20 rounded-lg">
                            <svg className="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                            <span className="text-green-400 font-mono font-bold text-sm uppercase tracking-wider">Registered</span>
                        </div>
                        {myReg && <span className="text-gray-600 text-xs font-mono">Status: {myReg.registrationStatus.toUpperCase()}</span>}
                    </div>
                ) : canRegister && !deadlinePassed && !showForm ? (
                    <button onClick={() => setShowForm(true)} className="group px-8 py-4 rounded-lg bg-[#00A8A8]/10 border border-[#00A8A8]/30 hover:bg-[#00A8A8]/20 hover:border-[#00A8A8]/50 transition-all duration-300 hover:shadow-[0_0_30px_rgba(0,168,168,0.15)]">
                        <span className="text-[#00A8A8] font-mono font-bold text-sm uppercase tracking-wider group-hover:text-white transition-colors">Register Now</span>
                    </button>
                ) : isFull ? (
                    <div className="px-6 py-3 bg-red-500/10 border border-red-500/20 rounded-lg inline-block">
                        <span className="text-red-400 font-mono font-bold text-sm uppercase tracking-wider">Capacity Reached</span>
                    </div>
                ) : (
                    <div className="px-6 py-3 bg-white/[0.03] border border-white/10 rounded-lg inline-block">
                        <span className="text-gray-500 font-mono text-sm uppercase tracking-wider">Registration Closed</span>
                    </div>
                )}


                {showForm && (
                    <div className="mt-6 space-y-5 animate-in fade-in slide-in-from-bottom-4 duration-300 pt-6 border-t border-white/5">
                        <div>
                            <label className="block text-xs uppercase tracking-[0.15em] font-bold text-gray-500 mb-3 font-mono">T-Shirt Size</label>
                            <div className="flex flex-wrap gap-2">
                                {SIZES.map((s) => (
                                    <button key={s} onClick={() => setShirtSize(s)} className={`px-4 py-2 rounded-lg text-sm font-mono font-bold border transition-all ${shirtSize === s ? 'bg-[#00A8A8]/20 border-[#00A8A8]/50 text-[#00A8A8]' : 'bg-black/30 border-white/10 text-gray-500 hover:border-white/20'}`}>{s}</button>
                                ))}
                            </div>
                        </div>
                        <div>
                            <label className="block text-xs uppercase tracking-[0.15em] font-bold text-gray-500 mb-3 font-mono">Dietary Restrictions</label>
                            <div className="flex flex-wrap gap-2">
                                {DIETARY.map((d) => (
                                    <button key={d} onClick={() => toggleDietary(d)} className={`px-4 py-2 rounded-lg text-sm font-mono border transition-all ${dietary.includes(d) ? 'bg-[#00A8A8]/20 border-[#00A8A8]/50 text-[#00A8A8]' : 'bg-black/30 border-white/10 text-gray-500 hover:border-white/20'}`}>{d}</button>
                                ))}
                            </div>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs uppercase tracking-[0.15em] font-bold text-gray-500 mb-2 font-mono">Emergency Contact</label>
                                <input type="text" value={emergencyContact} onChange={(e) => setEmergencyContact(e.target.value)} placeholder="Contact name" className="w-full px-4 py-3 bg-black/40 border border-white/10 rounded-lg text-white text-sm font-mono placeholder:text-gray-600 focus:border-[#00A8A8]/50 focus:outline-none transition-colors" />
                            </div>
                            <div>
                                <label className="block text-xs uppercase tracking-[0.15em] font-bold text-gray-500 mb-2 font-mono">Emergency Phone</label>
                                <input type="tel" value={emergencyPhone} onChange={(e) => setEmergencyPhone(e.target.value)} placeholder="(555) 123-4567" className="w-full px-4 py-3 bg-black/40 border border-white/10 rounded-lg text-white text-sm font-mono placeholder:text-gray-600 focus:border-[#00A8A8]/50 focus:outline-none transition-colors" />
                            </div>
                        </div>
                        {error && <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg"><p className="text-red-400 text-sm font-mono">{error}</p></div>}
                        <div className="flex items-center gap-4">
                            <button onClick={() => { setError(''); registerMutation.mutate({ hackathonId: hackathon.id, shirtSize: shirtSize || undefined, dietaryRestrictions: dietary.length ? dietary : undefined, emergencyContact: emergencyContact || undefined, emergencyPhone: emergencyPhone || undefined }); }} disabled={registerMutation.isPending} className="group px-8 py-4 rounded-lg bg-[#00A8A8]/10 border border-[#00A8A8]/30 hover:bg-[#00A8A8]/20 hover:border-[#00A8A8]/50 transition-all disabled:opacity-50 hover:shadow-[0_0_30px_rgba(0,168,168,0.15)]">
                                <span className="text-[#00A8A8] font-mono font-bold text-sm uppercase tracking-wider group-hover:text-white transition-colors">{registerMutation.isPending ? 'Registering...' : 'Confirm Registration'}</span>
                            </button>
                            <button onClick={() => { setShowForm(false); setError(''); }} className="px-6 py-4 text-gray-500 hover:text-white text-sm font-mono uppercase tracking-wider transition-colors">Cancel</button>
                        </div>
                    </div>
                )}
            </LiquidGlass>
        </div>
    );
}



function TeamsTab({
    hackathonId,
    isRegistered,
    myTeamId,
}: {
    hackathonId: string;
    isRegistered: boolean;
    myTeamId: string | null;
}) {
    const { data: session } = useSession();
    const userId = session?.user?.id;
    const { data: teams, isLoading } = trpc.team.list.useQuery({ hackathonId });
    const [showCreate, setShowCreate] = useState(false);
    const [teamName, setTeamName] = useState('');
    const [teamDesc, setTeamDesc] = useState('');
    const [maxMembers, setMaxMembers] = useState(4);
    const [error, setError] = useState('');

    const utils = trpc.useUtils();

    const createTeam = trpc.team.createTeam.useMutation({
        onSuccess: () => {
            setShowCreate(false);
            setTeamName('');
            setTeamDesc('');
            setError('');
            utils.team.list.invalidate({ hackathonId });
            utils.hackathon.myRegistrations.invalidate();
        },
        onError: (e) => setError(e.message),
    });

    const joinTeam = trpc.team.joinTeam.useMutation({
        onSuccess: () => {
            utils.team.list.invalidate({ hackathonId });
            utils.hackathon.myRegistrations.invalidate();
        },
        onError: (e) => setError(e.message),
    });

    const leaveTeam = trpc.team.leaveTeam.useMutation({
        onSuccess: () => {
            utils.team.list.invalidate({ hackathonId });
            utils.hackathon.myRegistrations.invalidate();
        },
        onError: (e) => setError(e.message),
    });

    if (isLoading) return <div className="py-12 text-center"><p className="text-gray-600 font-mono text-sm uppercase tracking-wider animate-pulse">Loading teams...</p></div>;

    const myTeam = teams?.find((t) => t.id === myTeamId);
    const otherTeams = teams?.filter((t) => t.id !== myTeamId) ?? [];

    return (
        <div className="space-y-6 animate-in fade-in duration-300">
            {!isRegistered && (
                <div className="p-4 bg-yellow-500/10 border border-yellow-500/30 rounded-lg flex items-center gap-3">
                    <svg className="w-5 h-5 text-yellow-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" /></svg>
                    <p className="text-yellow-400 text-sm font-mono">Register for this hackathon first to create or join teams.</p>
                </div>
            )}

            {error && (
                <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
                    <p className="text-red-400 text-sm font-mono">{error}</p>
                </div>
            )}


            {myTeam && (
                <LiquidGlass className="p-6 relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-green-500/30 to-transparent" />
                    <div className="flex items-center gap-2 mb-4">
                        <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                        <h3 className="text-xs uppercase tracking-[0.2em] font-bold text-green-400 font-mono">Your Team</h3>
                    </div>
                    <h2 className="text-2xl font-bold text-white uppercase tracking-tight mb-2">{myTeam.name}</h2>
                    {myTeam.description && <p className="text-gray-400 text-sm mb-4">{myTeam.description}</p>}


                    <div className="flex flex-wrap gap-3 mb-4">
                        {myTeam.participants.map((p: { id: string; userId: string; user: { name?: string | null; image?: string | null } }) => (
                            <div key={p.id} className="flex items-center gap-2 px-3 py-2 bg-black/30 border border-white/5 rounded-lg">
                                {p.user.image ? (
                                    <Image src={p.user.image} alt="" width={24} height={24} className="rounded-full" />
                                ) : (
                                    <div className="w-6 h-6 rounded-full bg-white/10 flex items-center justify-center text-[10px] font-bold text-gray-400">{(p.user.name?.[0] ?? '?').toUpperCase()}</div>
                                )}
                                <span className="text-sm text-gray-300 font-mono">{p.user.name ?? 'Unknown'}</span>
                                {p.userId === myTeam.captainId && <span className="text-[8px] font-mono text-yellow-500 uppercase tracking-wider bg-yellow-500/10 px-1.5 py-0.5 rounded">Capt</span>}
                            </div>
                        ))}
                    </div>

                    <div className="flex items-center gap-4">
                        <span className="text-xs font-mono text-gray-500">{myTeam.currentMembers}/{myTeam.maxMembers} members</span>
                        <button
                            onClick={() => { setError(''); leaveTeam.mutate({ hackathonId }); }}
                            disabled={leaveTeam.isPending}
                            className="px-4 py-2 rounded-lg bg-red-500/5 border border-red-500/20 text-red-500/70 hover:bg-red-500/10 hover:text-red-400 transition-all text-xs font-mono uppercase tracking-wider disabled:opacity-50"
                        >
                            {leaveTeam.isPending ? 'Leaving...' : 'Leave Team'}
                        </button>
                    </div>
                </LiquidGlass>
            )}


            {isRegistered && !myTeamId && (
                <LiquidGlass className="p-6">
                    {!showCreate ? (
                        <button
                            onClick={() => setShowCreate(true)}
                            className="w-full group flex items-center justify-center gap-3 py-4 rounded-lg bg-[#00A8A8]/5 border border-dashed border-[#00A8A8]/30 hover:bg-[#00A8A8]/10 hover:border-[#00A8A8]/50 transition-all"
                        >
                            <svg className="w-5 h-5 text-[#00A8A8]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                            <span className="text-[#00A8A8] font-mono font-bold text-sm uppercase tracking-wider group-hover:text-white transition-colors">Create a Team</span>
                        </button>
                    ) : (
                        <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-300">
                            <h3 className="text-xs uppercase tracking-[0.2em] font-bold text-[#00A8A8] font-mono">New Team</h3>
                            <input type="text" value={teamName} onChange={(e) => setTeamName(e.target.value)} placeholder="Team name" maxLength={100} className="w-full px-4 py-3 bg-black/40 border border-white/10 rounded-lg text-white text-sm font-mono placeholder:text-gray-600 focus:border-[#00A8A8]/50 focus:outline-none transition-colors" />
                            <textarea value={teamDesc} onChange={(e) => setTeamDesc(e.target.value)} placeholder="What are you building? What skills are you looking for?" maxLength={1000} rows={3} className="w-full px-4 py-3 bg-black/40 border border-white/10 rounded-lg text-white text-sm font-mono placeholder:text-gray-600 focus:border-[#00A8A8]/50 focus:outline-none transition-colors resize-none" />
                            <div>
                                <label className="block text-xs uppercase tracking-[0.15em] font-bold text-gray-500 mb-2 font-mono">Max Members</label>
                                <div className="flex gap-2">
                                    {[2, 3, 4, 5, 6].map((n) => (
                                        <button key={n} onClick={() => setMaxMembers(n)} className={`w-10 h-10 rounded-lg text-sm font-mono font-bold border transition-all ${maxMembers === n ? 'bg-[#00A8A8]/20 border-[#00A8A8]/50 text-[#00A8A8]' : 'bg-black/30 border-white/10 text-gray-500 hover:border-white/20'}`}>{n}</button>
                                    ))}
                                </div>
                            </div>
                            <div className="flex items-center gap-4">
                                <button
                                    onClick={() => { setError(''); createTeam.mutate({ hackathonId, name: teamName, description: teamDesc || undefined, maxMembers }); }}
                                    disabled={!teamName.trim() || createTeam.isPending}
                                    className="group px-6 py-3 rounded-lg bg-[#00A8A8]/10 border border-[#00A8A8]/30 hover:bg-[#00A8A8]/20 transition-all disabled:opacity-50"
                                >
                                    <span className="text-[#00A8A8] font-mono font-bold text-sm uppercase tracking-wider group-hover:text-white transition-colors">{createTeam.isPending ? 'Creating...' : 'Create Team'}</span>
                                </button>
                                <button onClick={() => { setShowCreate(false); setError(''); }} className="px-4 py-3 text-gray-500 hover:text-white text-sm font-mono uppercase tracking-wider transition-colors">Cancel</button>
                            </div>
                        </div>
                    )}
                </LiquidGlass>
            )}


            <div>
                <h3 className="text-xs uppercase tracking-[0.2em] font-bold text-gray-500 mb-4 font-mono">
                    {otherTeams.length > 0 ? `${otherTeams.length} Team${otherTeams.length !== 1 ? 's' : ''} Looking for Members` : 'No Teams Yet'}
                </h3>

                {otherTeams.length === 0 && !myTeam && (
                    <LiquidGlass className="p-8 text-center">
                        <svg className="w-12 h-12 text-gray-700 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
                        <p className="text-gray-500 font-mono text-sm">No teams created yet. Be the first!</p>
                    </LiquidGlass>
                )}

                <div className="space-y-3">
                    {otherTeams.map((team) => {
                        const isFull = team.currentMembers >= team.maxMembers;
                        const canJoin = isRegistered && !myTeamId && team.isOpen && !isFull;

                        return (
                            <LiquidGlass key={team.id} className="p-5 relative overflow-hidden hover:border-white/10 transition-all">
                                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 mb-1">
                                            <h3 className="text-lg font-bold text-white uppercase tracking-tight truncate">{team.name}</h3>
                                            {!team.isOpen && <span className="text-[8px] font-mono text-red-400 uppercase tracking-wider bg-red-500/10 px-1.5 py-0.5 rounded">Closed</span>}
                                            {isFull && <span className="text-[8px] font-mono text-yellow-400 uppercase tracking-wider bg-yellow-500/10 px-1.5 py-0.5 rounded">Full</span>}
                                        </div>
                                        {team.description && <p className="text-gray-500 text-sm mb-3 line-clamp-2">{team.description}</p>}


                                        <div className="flex items-center gap-2">
                                            <div className="flex -space-x-2">
                                                {team.participants.slice(0, 5).map((p: { id: string; user: { name?: string | null; image?: string | null } }) => (
                                                    p.user.image ? (
                                                        <Image key={p.id} src={p.user.image} alt="" width={28} height={28} className="rounded-full border-2 border-[#0a0a0a]" />
                                                    ) : (
                                                        <div key={p.id} className="w-7 h-7 rounded-full bg-white/10 border-2 border-[#0a0a0a] flex items-center justify-center text-[10px] font-bold text-gray-400">{(p.user.name?.[0] ?? '?').toUpperCase()}</div>
                                                    )
                                                ))}
                                            </div>
                                            <span className="text-xs font-mono text-gray-500 ml-1">{team.currentMembers}/{team.maxMembers}</span>
                                        </div>
                                    </div>

                                    {canJoin && (
                                        <button
                                            onClick={() => { setError(''); joinTeam.mutate({ hackathonId, teamId: team.id }); }}
                                            disabled={joinTeam.isPending}
                                            className="flex-shrink-0 group px-5 py-2.5 rounded-lg bg-[#00A8A8]/10 border border-[#00A8A8]/30 hover:bg-[#00A8A8]/20 hover:border-[#00A8A8]/50 transition-all disabled:opacity-50"
                                        >
                                            <span className="text-[#00A8A8] font-mono font-bold text-xs uppercase tracking-wider group-hover:text-white transition-colors">{joinTeam.isPending ? 'Joining...' : 'Join'}</span>
                                        </button>
                                    )}
                                </div>
                            </LiquidGlass>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
