'use client';

import React, { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { trpc } from '@/lib/trpc';
import { useRouter, useParams, useSearchParams } from 'next/navigation';
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
type ShirtSize = 'XS' | 'S' | 'M' | 'L' | 'XL' | 'XXL';
const SIZES: ShirtSize[] = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];
const DIETARY = ['Vegetarian', 'Vegan', 'Gluten-Free', 'Halal', 'Kosher', 'Dairy-Free', 'Nut-Free', 'None'];

type TabType = 'INFO' | 'SCHEDULE' | 'PROJECTS' | 'TEAMS';


export default function HackathonDetailPage() {
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

                <div className="relative z-10">
                    {tab === 'INFO' ? (
                        <InfoTab hackathon={hackathon} isRegistered={isRegistered} myReg={myReg} />
                    ) : tab === 'SCHEDULE' ? (
                        <ScheduleTab hackathonId={hackathonId} isRegistered={isRegistered} />
                    ) : tab === 'PROJECTS' ? (
                        <ProjectsTab hackathonId={hackathonId} />
                    ) : (
                        <TeamsTab hackathonId={hackathonId} isRegistered={isRegistered} myTeamId={myReg?.teamId ?? null} />
                    )}
                </div>
            </main>
        </div>
    );
}


function ProjectsTab({ hackathonId }: { hackathonId: string }) {
    const { data: projects, isLoading } = trpc.hackathon.getPublicProjects.useQuery({ hackathonId });

    if (isLoading) return <div className="py-16 text-center text-xs font-semibold uppercase tracking-widest text-white/40 animate-pulse">Loading amazing projects...</div>;

    if (!projects || projects.length === 0) {
        return (
            <LiquidGlass className="p-16 text-center border-white/5 bg-white/[0.01]">
                <div className="w-16 h-16 bg-white/[0.02] border border-white/5 rounded-2xl flex items-center justify-center mx-auto mb-6">
                    <svg className="w-8 h-8 text-white/30" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>
                </div>
                <h3 className="text-lg font-medium text-white mb-2">No Projects Yet</h3>
                <p className="text-sm text-white/40">Projects will appear here once they are submitted.</p>
            </LiquidGlass>
        );
    }

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {projects.map((project) => (
                <LiquidGlass key={project.id} className="p-1 group flex flex-col h-full hover:-translate-y-1 transition-all duration-500 bg-white/[0.01] border-white/5 hover:border-white/20 hover:shadow-[0_20px_40px_-15px_rgba(34,211,238,0.15)]">
                    <div className="flex-1 relative flex flex-col bg-[#0a0a0a] rounded-xl p-6 md:p-8 overflow-hidden z-10">
                        {/* Hover Gradient Overlay */}
                        <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />

                        <div className="flex items-start justify-between mb-4 relative z-10">
                            <h3 className="text-xl font-bold text-white group-hover:text-cyan-300 transition-colors leading-tight">{project.name}</h3>
                            {project.status === 'winner' && (
                                <span className="bg-amber-400/10 text-amber-400 border border-amber-400/20 text-[10px] font-bold uppercase tracking-widest px-2.5 py-1 rounded-full shadow-[0_0_15px_rgba(251,191,36,0.3)] shrink-0 ml-3">Winner</span>
                            )}
                        </div>

                        <p className="text-sm text-white/50 mb-6 line-clamp-3 leading-relaxed relative z-10 flex-1">{project.description}</p>

                        <div className="relative z-10">
                            {project.technologies && project.technologies.length > 0 && (
                                <div className="flex flex-wrap gap-2 mb-4">
                                    {project.technologies.slice(0, 4).map(tech => (
                                        <span key={tech} className="text-[10px] font-semibold text-white/40 bg-white/5 border border-white/5 px-2.5 py-1 rounded-md uppercase tracking-wider">{tech}</span>
                                    ))}
                                    {project.technologies.length > 4 && <span className="text-[10px] font-semibold text-white/30 px-1 py-1">+{project.technologies.length - 4}</span>}
                                </div>
                            )}

                            {project.challenges && project.challenges.length > 0 && (
                                <div className="mb-5 space-y-1.5">
                                    {project.challenges.map(c => (
                                        <div key={c} className="text-xs font-medium text-cyan-400/80 flex items-center gap-2">
                                            <div className="w-1 h-1 rounded-full bg-cyan-400/50" />
                                            {c.replace('MLH_', '')}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        <div className="mt-auto pt-5 border-t border-white/5 flex items-center justify-between relative z-10">
                            <div className="text-xs text-white/40">
                                By <span className="text-white/80 font-medium">{project.team?.name || 'Unknown Team'}</span>
                            </div>
                            <div className="flex gap-2.5">
                                {project.githubUrl && (
                                    <a href={project.githubUrl} target="_blank" rel="noopener noreferrer" className="w-8 h-8 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-white/40 hover:text-white hover:bg-white/10 transition-all">
                                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path fillRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" clipRule="evenodd" /></svg>
                                    </a>
                                )}
                                {project.demoUrl && (
                                    <a href={project.demoUrl} target="_blank" rel="noopener noreferrer" className="w-8 h-8 rounded-full bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400 hover:bg-cyan-500/20 hover:text-cyan-300 transition-all shadow-[0_0_10px_rgba(6,182,212,0.2)]">
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                                    </a>
                                )}
                            </div>
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

    if (eventsLoading) return <div className="py-16 text-center text-xs font-semibold uppercase tracking-widest text-white/40 animate-pulse">Loading schedule...</div>;

    const qrData = myRecord ? JSON.stringify({ type: 'CHECK_IN', hackathonId, participantId: myRecord.id }) : null;

    return (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-1 space-y-6">
                <LiquidGlass className="p-8 text-center flex flex-col items-center justify-center relative overflow-hidden bg-white/[0.01] border-white/5">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />
                    <h3 className="text-xl font-bold text-white tracking-tight mb-2">My Event Pass</h3>
                    <p className="text-xs text-white/40 mb-8 leading-relaxed">Present this pass to check into workshops, meals, and other events.</p>

                    {isRegistered && qrData ? (
                        <div className="p-6 bg-white/5 backdrop-blur-md rounded-3xl border border-white/10 shadow-[0_0_40px_rgba(6,182,212,0.15)]">
                            <div className="p-4 bg-white rounded-2xl">
                                <QRCodeSVG
                                    value={qrData}
                                    size={180}
                                    level="H"
                                    fgColor="#050505"
                                    bgColor="#ffffff"
                                />
                            </div>
                        </div>
                    ) : (
                        <div className="w-[220px] h-[220px] bg-white/[0.02] border-2 border-dashed border-white/10 rounded-3xl flex flex-col items-center justify-center text-white/30">
                            <svg className="w-10 h-10 mb-4 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
                            <span className="text-xs font-semibold uppercase text-center px-6">Registration Required</span>
                        </div>
                    )}
                </LiquidGlass>

                {isRegistered && myRecord && (
                    <LiquidGlass className="p-6 bg-white/[0.01] border-white/5">
                        <h4 className="text-[11px] font-bold text-white/40 uppercase tracking-widest mb-5">Registration Details</h4>
                        <ul className="space-y-4 text-sm text-white/60">
                            <li className="flex justify-between items-center bg-white/[0.02] p-3 rounded-lg border border-white/5">
                                <span>Status</span>
                                <span className="text-emerald-400 font-semibold">{myRecord.registrationStatus}</span>
                            </li>
                            <li className="flex justify-between items-center bg-white/[0.02] p-3 rounded-lg border border-white/5">
                                <span>Shirt Size</span>
                                <span className="text-white font-medium">{myRecord.shirtSize || 'Pending'}</span>
                            </li>
                        </ul>
                    </LiquidGlass>
                )}
            </div>

            <div className="lg:col-span-2 space-y-4">
                <LiquidGlass className="p-8 md:p-10 bg-white/[0.01] border-white/5">
                    <div className="flex items-center justify-between mb-10 pb-6 border-b border-white/5">
                        <h3 className="text-2xl font-bold text-white tracking-tight">Schedule</h3>
                        <span className="text-[11px] font-semibold tracking-widest uppercase text-cyan-400 bg-cyan-400/10 border border-cyan-400/20 px-3.5 py-1.5 rounded-full">
                            {events?.length || 0} Events
                        </span>
                    </div>

                    {!events || events.length === 0 ? (
                        <div className="py-16 flex flex-col items-center justify-center text-center">
                            <div className="w-16 h-16 bg-white/[0.02] border border-white/5 rounded-2xl flex items-center justify-center mb-6">
                                <svg className="w-8 h-8 text-white/30" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                            </div>
                            <h3 className="text-lg font-medium text-white mb-2">No Events Scheduled</h3>
                            <p className="text-sm text-white/40">Check back later for updates to the event itinerary.</p>
                        </div>
                    ) : (
                        <div className="relative border-l border-white/10 ml-4 space-y-10 pb-4">
                            {events.map((event) => (
                                <div key={event.id} className="relative pl-8 group">
                                    <span className="absolute -left-[5px] top-2.5 w-2.5 h-2.5 rounded-full bg-[#020202] border-2 border-cyan-500 group-hover:bg-cyan-400 transition-colors shadow-[0_0_10px_rgba(6,182,212,0.5)]" />

                                    <div className="flex flex-col md:flex-row md:items-start justify-between gap-3 mb-3">
                                        <h4 className="text-xl font-semibold text-white group-hover:text-cyan-300 transition-colors">{event.name}</h4>
                                        <div className="flex items-center gap-2 bg-white/5 border border-white/5 px-3 py-1.5 rounded-lg text-sm font-medium text-cyan-400 shrink-0">
                                            <span>{new Date(event.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                            <span className="text-white/20">—</span>
                                            <span>{new Date(event.endTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                        </div>
                                    </div>

                                    <div className="flex flex-wrap items-center gap-2 mb-4">
                                        <span className="text-[10px] font-semibold text-white/50 uppercase tracking-widest px-2.5 py-1 rounded-md bg-white/[0.03] border border-white/5">
                                            {event.type.replace(/_/g, ' ')}
                                        </span>
                                        <span className="flex items-center gap-1.5 text-xs text-white/40 font-medium">
                                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /></svg>
                                            {event.location}
                                        </span>
                                        {event.points > 0 && (
                                            <span className="text-xs font-bold text-amber-400 flex items-center gap-1 ml-1">
                                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.898 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" /></svg>
                                                {event.points} pts
                                            </span>
                                        )}
                                    </div>

                                    {event.description && (
                                        <p className="text-sm text-white/50 leading-relaxed bg-white/[0.01] p-4 rounded-xl border border-white/5">
                                            {event.description}
                                        </p>
                                    )}
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
                <LiquidGlass className="p-8 bg-white/[0.01] border-white/5">
                    <h3 className="text-[11px] uppercase tracking-widest font-bold text-cyan-400 mb-4 inline-flex items-center gap-2">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                        About
                    </h3>
                    <p className="text-white/60 text-sm leading-relaxed whitespace-pre-wrap font-medium">{hackathon.description}</p>
                </LiquidGlass>
            )}

            {hackathon.prizes && hackathon.prizes.length > 0 && (
                <LiquidGlass className="p-8 bg-white/[0.01] border-white/5">
                    <h3 className="text-[11px] uppercase tracking-widest font-bold text-cyan-400 mb-6 inline-flex items-center gap-2">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v13m0-13V6a2 2 0 112 2h-2zm0 0V5.5A2.5 2.5 0 109.5 8H12zm-7 4h14M5 12a2 2 0 110-4h14a2 2 0 110 4M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7" /></svg>
                        Prizes
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                        {hackathon.prizes.map((p: { place: string; amount: number; description?: string }, i: number) => (
                            <div key={i} className="p-6 bg-[#0a0a0a]/50 border border-white/5 rounded-2xl hover:border-cyan-500/30 transition-colors group relative overflow-hidden">
                                <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
                                <p className="text-white font-bold text-lg mb-1 relative z-10">{p.place}</p>
                                <p className="text-white/80 font-semibold text-2xl mb-2 relative z-10">${p.amount.toLocaleString()}</p>
                                {p.description && <p className="text-white/40 text-xs relative z-10">{p.description}</p>}
                            </div>
                        ))}
                    </div>
                </LiquidGlass>
            )}

            {hackathon.rules && (
                <LiquidGlass className="p-8 bg-white/[0.01] border-white/5">
                    <h3 className="text-[11px] uppercase tracking-widest font-bold text-cyan-400 mb-4 inline-flex items-center gap-2">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                        Rules
                    </h3>
                    <p className="text-white/50 text-sm leading-relaxed whitespace-pre-wrap">{hackathon.rules}</p>
                </LiquidGlass>
            )}

            {(hackathon.registrationDeadline || hackathon.websiteUrl) && (
                <div className="flex flex-wrap gap-4 px-2">
                    {hackathon.registrationDeadline && (
                        <div className="flex items-center gap-2.5 text-sm font-semibold bg-white/5 border border-white/5 px-4 py-2 rounded-xl">
                            <svg className="w-4 h-4 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                            <span className={deadlinePassed ? 'text-rose-400' : 'text-amber-400'}>
                                Deadline: {formatDate(hackathon.registrationDeadline)}{deadlinePassed ? ' (Passed)' : ''}
                            </span>
                        </div>
                    )}
                    {hackathon.websiteUrl && (
                        <a href={hackathon.websiteUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2.5 text-sm font-semibold text-cyan-400 bg-cyan-500/10 border border-cyan-500/20 hover:bg-cyan-500/20 px-4 py-2 rounded-xl transition-colors">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                            Official Website
                        </a>
                    )}
                </div>
            )}

            <LiquidGlass className="p-8 md:p-10 bg-white/[0.01] border-white/5 mt-10 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-64 h-64 bg-cyan-500/5 rounded-full blur-[80px] pointer-events-none" />

                {success && (
                    <div className="mb-6 p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl flex items-center gap-3">
                        <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_10px_rgba(52,211,153,0.5)]" />
                        <p className="text-emerald-400 text-sm font-semibold">Registration confirmed! You're in.</p>
                    </div>
                )}

                {isRegistered || success ? (
                    <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                        <div className="flex items-center gap-3 px-6 py-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl w-fit">
                            <svg className="w-5 h-5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                            <span className="text-emerald-400 font-bold text-sm uppercase tracking-widest">Registered</span>
                        </div>
                        {myReg && <span className="text-white/40 text-xs font-semibold uppercase tracking-widest px-4 py-2 rounded-lg bg-white/5 border border-white/5">Status: {myReg.registrationStatus}</span>}
                    </div>
                ) : canRegister && !deadlinePassed && !showForm ? (
                    <div className="text-center sm:text-left">
                        <h4 className="text-xl font-bold text-white mb-2">Ready to Build?</h4>
                        <p className="text-sm text-white/50 mb-6">Secure your spot in this hackathon. Capacity is limited.</p>
                        <button onClick={() => setShowForm(true)} className="group px-8 py-4 rounded-xl bg-cyan-500 text-[#020202] font-bold text-sm uppercase tracking-widest hover:bg-cyan-400 transition-all duration-300 hover:shadow-[0_0_30px_rgba(6,182,212,0.4)] hover:-translate-y-0.5 w-full sm:w-auto">
                            Register Now
                        </button>
                    </div>
                ) : isFull ? (
                    <div className="px-6 py-4 bg-rose-500/10 border border-rose-500/20 rounded-xl inline-flex items-center gap-3">
                        <svg className="w-5 h-5 text-rose-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" /></svg>
                        <span className="text-rose-400 font-bold text-sm uppercase tracking-widest">Capacity Reached</span>
                    </div>
                ) : (
                    <div className="px-6 py-4 bg-white/5 border border-white/10 rounded-xl inline-flex items-center gap-3">
                        <svg className="w-5 h-5 text-white/40" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
                        <span className="text-white/40 font-bold text-sm uppercase tracking-widest">Registration Closed</span>
                    </div>
                )}

                {showForm && (
                    <div className="mt-8 space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 pt-8 border-t border-white/5 relative z-10">
                        <h4 className="text-lg font-bold text-white tracking-tight -mb-2">Registration Details</h4>

                        <div className="space-y-6">
                            <div>
                                <label className="block text-[11px] uppercase tracking-widest font-semibold text-white/50 mb-3">T-Shirt Size</label>
                                <div className="flex flex-wrap gap-2.5">
                                    {SIZES.map((s) => (
                                        <button key={s} onClick={() => setShirtSize(s)} className={`px-5 py-2.5 rounded-xl text-sm font-bold border transition-all ${shirtSize === s ? 'bg-cyan-500/20 border-cyan-500/50 text-cyan-400 shadow-[0_0_15px_rgba(6,182,212,0.2)]' : 'bg-[#0a0a0a] border-white/10 text-white/60 hover:bg-white/5'}`}>{s}</button>
                                    ))}
                                </div>
                            </div>

                            <div>
                                <label className="block text-[11px] uppercase tracking-widest font-semibold text-white/50 mb-3">Dietary Restrictions</label>
                                <div className="flex flex-wrap gap-2.5">
                                    {DIETARY.map((d) => (
                                        <button key={d} onClick={() => toggleDietary(d)} className={`px-4 py-2 rounded-xl text-sm font-medium border transition-all ${dietary.includes(d) ? 'bg-cyan-500/20 border-cyan-500/50 text-cyan-400 shadow-[0_0_15px_rgba(6,182,212,0.2)]' : 'bg-[#0a0a0a] border-white/10 text-white/60 hover:bg-white/5'}`}>{d}</button>
                                    ))}
                                </div>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                                <div>
                                    <label className="block text-[11px] uppercase tracking-widest font-semibold text-white/50 mb-2">Emergency Contact</label>
                                    <input type="text" value={emergencyContact} onChange={(e) => setEmergencyContact(e.target.value)} placeholder="Full Name" className="w-full px-4 py-3.5 bg-[#0a0a0a] border border-white/10 rounded-xl text-white text-sm font-medium placeholder:text-white/20 focus:border-cyan-500/50 focus:bg-white/[0.02] focus:outline-none focus:ring-1 focus:ring-cyan-500/50 transition-all" />
                                </div>
                                <div>
                                    <label className="block text-[11px] uppercase tracking-widest font-semibold text-white/50 mb-2">Emergency Phone</label>
                                    <input type="tel" value={emergencyPhone} onChange={(e) => setEmergencyPhone(e.target.value)} placeholder="(555) 123-4567" className="w-full px-4 py-3.5 bg-[#0a0a0a] border border-white/10 rounded-xl text-white text-sm font-medium placeholder:text-white/20 focus:border-cyan-500/50 focus:bg-white/[0.02] focus:outline-none focus:ring-1 focus:ring-cyan-500/50 transition-all" />
                                </div>
                            </div>
                        </div>

                        {error && <div className="p-4 bg-rose-500/10 border border-rose-500/20 rounded-xl flex items-center gap-3"><svg className="w-5 h-5 text-rose-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg><p className="text-rose-400 text-sm font-medium">{error}</p></div>}

                        <div className="flex flex-col sm:flex-row items-center gap-4 pt-4">
                            <button onClick={() => { setError(''); registerMutation.mutate({ hackathonId: hackathon.id, shirtSize: shirtSize || undefined, dietaryRestrictions: dietary.length ? dietary : undefined, emergencyContact: emergencyContact || undefined, emergencyPhone: emergencyPhone || undefined }); }} disabled={registerMutation.isPending} className="w-full sm:w-auto px-8 py-4 rounded-xl bg-cyan-500 text-[#020202] font-bold text-sm uppercase tracking-widest hover:bg-cyan-400 transition-all duration-300 disabled:opacity-50 hover:shadow-[0_0_20px_rgba(6,182,212,0.4)] hover:-translate-y-0.5">
                                {registerMutation.isPending ? 'Processing...' : 'Confirm Registration'}
                            </button>
                            <button onClick={() => { setShowForm(false); setError(''); }} className="w-full sm:w-auto px-6 py-4 text-white/40 hover:text-white text-sm font-bold uppercase tracking-widest transition-colors">
                                Cancel
                            </button>
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

    if (isLoading) return <div className="py-16 text-center text-xs font-semibold uppercase tracking-widest text-white/40 animate-pulse">Loading teams...</div>;

    const myTeam = teams?.find((t) => t.id === myTeamId);
    const otherTeams = teams?.filter((t) => t.id !== myTeamId) ?? [];

    return (
        <div className="space-y-6 animate-in fade-in duration-300">
            {!isRegistered && (
                <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl flex items-center gap-3">
                    <svg className="w-5 h-5 text-amber-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" /></svg>
                    <p className="text-amber-400 text-sm font-medium">Register for this hackathon first to create or join teams.</p>
                </div>
            )}

            {error && (
                <div className="p-4 bg-rose-500/10 border border-rose-500/20 rounded-xl flex items-center gap-3">
                    <svg className="w-5 h-5 text-rose-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                    <p className="text-rose-400 text-sm font-medium">{error}</p>
                </div>
            )}

            {myTeam && (
                <LiquidGlass className="p-8 relative overflow-hidden bg-white/[0.01] border-white/5">
                    <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/10 rounded-full blur-[80px] pointer-events-none" />
                    <div className="relative z-10">
                        <div className="flex items-center gap-2.5 mb-5">
                            <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_10px_rgba(52,211,153,0.5)]" />
                            <h3 className="text-[11px] uppercase tracking-widest font-bold text-emerald-400">Your Team</h3>
                        </div>
                        <h2 className="text-3xl font-bold text-white tracking-tight mb-3">{myTeam.name}</h2>
                        {myTeam.description && <p className="text-white/50 text-sm mb-6 max-w-2xl leading-relaxed">{myTeam.description}</p>}

                        <div className="flex flex-wrap gap-3 mb-6">
                            {(myTeam.participants || []).map((p: { id: string; userId: string; user: { name?: string | null; image?: string | null } }) => (
                                <div key={p.id} className="flex items-center gap-3 px-4 py-2 bg-white/5 border border-white/10 rounded-xl">
                                    {p.user.image ? (
                                        <Image src={p.user.image} alt="" width={24} height={24} className="rounded-full shadow-sm" />
                                    ) : (
                                        <div className="w-6 h-6 rounded-full bg-white/10 flex items-center justify-center text-[10px] font-bold text-white/40 shadow-sm">
                                            {(p.user.name?.[0] ?? '?').toUpperCase()}
                                        </div>
                                    )}
                                    <span className="text-sm text-white/80 font-medium">{p.user.name ?? 'Unknown'}</span>
                                    {p.userId === myTeam.captainId && (
                                        <span className="text-[9px] font-bold text-amber-400 uppercase tracking-widest bg-amber-400/10 px-2 py-0.5 rounded-md ml-1 border border-amber-400/20">Capt</span>
                                    )}
                                </div>
                            ))}
                        </div>

                        <div className="flex items-center gap-5 pt-4 border-t border-white/5">
                            <span className="text-sm font-medium text-white/40 flex items-center gap-2">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
                                {myTeam.currentMembers} / {myTeam.maxMembers} Members
                            </span>
                            <button
                                onClick={() => { setError(''); leaveTeam.mutate({ hackathonId }); }}
                                disabled={leaveTeam.isPending}
                                className="px-5 py-2.5 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 hover:bg-rose-500/20 transition-all text-xs font-bold uppercase tracking-widest disabled:opacity-50"
                            >
                                {leaveTeam.isPending ? 'Leaving...' : 'Leave Team'}
                            </button>
                        </div>
                    </div>
                </LiquidGlass>
            )}

            {isRegistered && !myTeamId && (
                <LiquidGlass className="p-8 bg-white/[0.01] border-white/5">
                    {!showCreate ? (
                        <button
                            onClick={() => setShowCreate(true)}
                            className="w-full group flex flex-col items-center justify-center gap-3 py-10 rounded-2xl bg-cyan-500/5 border border-dashed border-cyan-500/30 hover:bg-cyan-500/10 hover:border-cyan-500/50 transition-all"
                        >
                            <div className="w-12 h-12 rounded-full bg-cyan-500/10 flex items-center justify-center group-hover:bg-cyan-500/20 transition-colors">
                                <svg className="w-6 h-6 text-cyan-400 group-hover:scale-110 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                            </div>
                            <span className="text-cyan-400 font-bold text-sm uppercase tracking-widest group-hover:text-cyan-300 transition-colors">Create a New Team</span>
                        </button>
                    ) : (
                        <div className="space-y-5 animate-in fade-in slide-in-from-bottom-4 duration-300">
                            <h3 className="text-[11px] uppercase tracking-widest font-bold text-cyan-400">New Team Details</h3>

                            <input type="text" value={teamName} onChange={(e) => setTeamName(e.target.value)} placeholder="Team Name" maxLength={100} className="w-full px-5 py-4 bg-[#0a0a0a] border border-white/10 rounded-xl text-white text-sm font-medium placeholder:text-white/20 focus:border-cyan-500/50 focus:bg-white/[0.02] focus:outline-none focus:ring-1 focus:ring-cyan-500/50 transition-all" />

                            <textarea value={teamDesc} onChange={(e) => setTeamDesc(e.target.value)} placeholder="What are you building? What skills are you looking for?" maxLength={1000} rows={4} className="w-full px-5 py-4 bg-[#0a0a0a] border border-white/10 rounded-xl text-white text-sm font-medium placeholder:text-white/20 focus:border-cyan-500/50 focus:bg-white/[0.02] focus:outline-none focus:ring-1 focus:ring-cyan-500/50 transition-all resize-none" />

                            <div>
                                <label className="block text-[11px] uppercase tracking-widest font-semibold text-white/50 mb-3">Capacity</label>
                                <div className="flex gap-2">
                                    {[2, 3, 4, 5, 6].map((n) => (
                                        <button key={n} onClick={() => setMaxMembers(n)} className={`w-12 h-12 rounded-xl text-sm font-bold border transition-all ${maxMembers === n ? 'bg-cyan-500/20 border-cyan-500/50 text-cyan-400 shadow-[0_0_15px_rgba(6,182,212,0.2)]' : 'bg-[#0a0a0a] border-white/10 text-white/40 hover:bg-white/5'}`}>{n}</button>
                                    ))}
                                </div>
                            </div>

                            <div className="flex flex-col sm:flex-row items-center gap-4 pt-4 border-t border-white/5">
                                <button
                                    onClick={() => { setError(''); createTeam.mutate({ hackathonId, name: teamName, description: teamDesc || undefined, maxMembers }); }}
                                    disabled={!teamName.trim() || createTeam.isPending}
                                    className="w-full sm:w-auto px-8 py-4 rounded-xl bg-cyan-500 text-[#020202] font-bold text-sm uppercase tracking-widest hover:bg-cyan-400 transition-all disabled:opacity-50 hover:shadow-[0_0_20px_rgba(6,182,212,0.4)] hover:-translate-y-0.5"
                                >
                                    {createTeam.isPending ? 'Processing...' : 'Create Team'}
                                </button>
                                <button onClick={() => { setShowCreate(false); setError(''); }} className="w-full sm:w-auto px-6 py-4 text-white/40 hover:text-white text-sm font-bold uppercase tracking-widest transition-colors">
                                    Cancel
                                </button>
                            </div>
                        </div>
                    )}
                </LiquidGlass>
            )}

            <div>
                <h3 className="text-[11px] uppercase tracking-widest font-bold text-white/40 mb-5 ml-1 flex items-center gap-2">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
                    {otherTeams.length > 0 ? `${otherTeams.length} Team${otherTeams.length !== 1 ? 's' : ''} Looking for Members` : 'No Teams Yet'}
                </h3>

                {otherTeams.length === 0 && !myTeam && (
                    <LiquidGlass className="p-12 text-center bg-white/[0.01] border-white/5">
                        <div className="w-16 h-16 bg-white/[0.02] border border-white/5 rounded-2xl flex items-center justify-center mx-auto mb-5">
                            <svg className="w-8 h-8 text-white/30" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
                        </div>
                        <p className="text-white/40 text-sm font-medium">No teams created yet. Be the first!</p>
                    </LiquidGlass>
                )}

                <div className="space-y-4">
                    {otherTeams.map((team) => {
                        const isFull = team.currentMembers >= team.maxMembers;
                        const canJoin = isRegistered && !myTeamId && team.isOpen && !isFull;

                        return (
                            <LiquidGlass key={team.id} className="p-6 relative overflow-hidden bg-white/[0.01] border-white/5 hover:border-cyan-500/30 transition-all hover:bg-white/[0.02] group">
                                <div className="absolute inset-0 bg-gradient-to-r from-cyan-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />

                                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-5 relative z-10">
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-3 mb-2">
                                            <h3 className="text-xl font-bold text-white tracking-tight truncate group-hover:text-cyan-300 transition-colors">{team.name}</h3>
                                            {!team.isOpen && <span className="text-[9px] font-bold text-rose-400 uppercase tracking-widest bg-rose-500/10 border border-rose-500/20 px-2 py-0.5 rounded-md">Closed</span>}
                                            {isFull && <span className="text-[9px] font-bold text-amber-400 uppercase tracking-widest bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-md">Full</span>}
                                        </div>
                                        {team.description && <p className="text-white/50 text-sm mb-4 line-clamp-2 leading-relaxed">{team.description}</p>}

                                        <div className="flex items-center gap-3">
                                            <div className="flex -space-x-2">
                                                {(team.participants || []).slice(0, 5).map((p: { id: string; user: { name?: string | null; image?: string | null } }) => (
                                                    p.user.image ? (
                                                        <Image key={p.id} src={p.user.image} alt="" width={32} height={32} className="rounded-full border-2 border-[#0a0a0a] shadow-sm relative z-10 hover:z-20 transition-all hover:scale-110" />
                                                    ) : (
                                                        <div key={p.id} className="w-8 h-8 rounded-full bg-white/10 border-2 border-[#0a0a0a] flex items-center justify-center text-[10px] font-bold text-white/60 shadow-sm relative z-10 hover:z-20 transition-all hover:scale-110">
                                                            {(p.user.name?.[0] ?? '?').toUpperCase()}
                                                        </div>
                                                    )
                                                ))}
                                                {team.currentMembers > 5 && (
                                                    <div className="w-8 h-8 rounded-full bg-white/5 border-2 border-[#0a0a0a] flex items-center justify-center text-[10px] font-bold text-white/40 relative z-10">
                                                        +{team.currentMembers - 5}
                                                    </div>
                                                )}
                                            </div>
                                            <span className="text-xs font-semibold text-white/40 bg-white/5 border border-white/5 px-2.5 py-1 rounded-md">
                                                {team.currentMembers} / {team.maxMembers}
                                            </span>
                                        </div>
                                    </div>

                                    {canJoin && (
                                        <button
                                            onClick={() => { setError(''); joinTeam.mutate({ hackathonId, teamId: team.id }); }}
                                            disabled={joinTeam.isPending}
                                            className="flex-shrink-0 group/btn px-6 py-3 rounded-xl bg-cyan-500/10 border border-cyan-500/30 hover:bg-cyan-500/20 hover:border-cyan-500/50 transition-all disabled:opacity-50 hover:shadow-[0_0_15px_rgba(6,182,212,0.2)]"
                                        >
                                            <span className="text-cyan-400 font-bold text-xs uppercase tracking-widest group-hover/btn:text-cyan-300 transition-colors">
                                                {joinTeam.isPending ? 'Joining...' : 'Join Team'}
                                            </span>
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
