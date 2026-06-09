'use client';

import React, { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { trpc } from '@/lib/trpc';
import { useRouter } from 'next/navigation';
import { LiquidGlass } from '@/components/portal/LiquidGlass';
import { LoadingScreen } from '@/components/portal/LoadingScreen';
import Link from 'next/link';
import {
  Calendar, FolderGit2, Globe, LayoutGrid,
  ArrowRight, FileCode2, ChevronLeft
} from 'lucide-react';

type HackathonStatus = 'open' | 'in_progress' | 'completed' | 'closed' | 'cancelled';
type Tab = 'browse' | 'registrations' | 'projects';

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

function statusConfig(s: HackathonStatus | 'draft' | 'cancelled') {
  const map: Record<string, { label: string; dot: string; text: string; bg: string; border: string; glow: string }> = {
    open: { label: 'Registering', dot: 'bg-emerald-400', text: 'text-accent', bg: 'bg-accent/10', border: 'border-accent/30', glow: 'shadow-[0_0_15px_rgba(52,211,153,0.6)]' },
    in_progress: { label: 'Live Now', dot: 'bg-emerald-400', text: 'text-accent', bg: 'bg-accent/10', border: 'border-accent/30', glow: 'shadow-[0_0_15px_rgba(52,211,153,0.6)]' },
    completed: { label: 'Completed', dot: 'bg-white/40', text: 'text-[var(--text-primary)]/60', bg: 'bg-white/5', border: 'border-[var(--border-subtle)]', glow: '' },
    closed: { label: 'Applications Closed', dot: 'bg-amber-400', text: 'text-amber-400', bg: 'bg-amber-400/10', border: 'border-amber-400/30', glow: '' },
    cancelled: { label: 'Cancelled', dot: 'bg-rose-500', text: 'text-rose-500', bg: 'bg-rose-500/10', border: 'border-rose-500/30', glow: '' },
    draft: { label: 'Draft', dot: 'bg-gray-500', text: 'text-text-muted', bg: 'bg-gray-500/10', border: 'border-gray-500/20', glow: '' },
  };
  return map[s] ?? { label: s, dot: 'bg-gray-500', text: 'text-text-muted', bg: 'bg-gray-500/10', border: 'border-gray-500/20', glow: '' };
}

export default function HackathonsPage() {
  const { data: session, status: authStatus } = useSession();
  const router = useRouter();

  const [activeTab, setActiveTab] = useState<Tab>('browse');
  const [statusFilter, setStatusFilter] = useState<'all' | 'open' | 'live' | 'completed'>('all');

  const { data: hackathons, isLoading } = trpc.hackathon.list.useQuery({});
  const { data: myRegs } = trpc.hackathon.myRegistrations.useQuery(undefined, { enabled: !!session });

  const projects = myRegs?.flatMap((reg) => reg.team?.projects || []) || [];

  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.replace('#', '') as Tab;
      if (['browse', 'registrations', 'projects'].includes(hash)) {
        setActiveTab(hash);
      }
    };
    handleHashChange();
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  useEffect(() => {
    if (authStatus === 'unauthenticated') router.push('/login');
  }, [authStatus, router]);

  if (authStatus === 'loading' || isLoading) return <LoadingScreen message="Loading Hackathon Hub..." />;
  if (!session) return null;

  const registeredIds = new Set(myRegs?.map((r) => r.hackathonId) ?? []);

  const tabs = [
    { id: 'browse', label: 'Browse Events', icon: LayoutGrid },
    { id: 'registrations', label: 'My Registrations', icon: Calendar },
    { id: 'projects', label: 'My Projects', icon: FolderGit2 },
  ];

  return (
    <div className="relative min-h-screen bg-[var(--bg-tertiary)] text-text-muted font-sans selection:bg-accent/30 overflow-hidden">
      {/* Ambient Background Glows */}
      <div className="fixed top-[-20%] left-[-10%] w-[50%] h-[50%] rounded-sm bg-emerald-600/10 blur-[120px] pointer-events-none" />
      <div className="fixed bottom-[-20%] right-[-10%] w-[50%] h-[50%] rounded-sm bg-indigo-600/10 blur-[120px] pointer-events-none" />

      <div className="relative z-10 max-w-6xl mx-auto py-24 px-6 md:px-12">

        {/* Back nav */}
        <Link href="/club" className="inline-flex items-center gap-2 text-[var(--text-primary)]/40 hover:text-[var(--text-primary)] transition-colors text-sm font-medium mb-10 group">
          <div className="p-1.5 rounded-sm bg-white/5 border border-[var(--border-subtle)] group-hover:bg-white/10 transition-colors">
            <ChevronLeft className="w-3.5 h-3.5 transform group-hover:-translate-x-0.5 transition-transform" />
          </div>
          Club Portal
        </Link>

        {/* Header */}
        <div className="mb-10">
          <h1 className="text-4xl md:text-6xl font-black text-[var(--text-primary)] tracking-tight mb-3">
            Hackathon Hub
          </h1>
          <p className="text-base text-[var(--text-primary)]/40 max-w-xl leading-relaxed">
            Browse upcoming competitions, manage your registrations, and showcase your project portfolio.
          </p>
        </div>

        {/* Tab Navigation */}
        <div className="flex flex-wrap items-center bg-[var(--bg-primary)]/40 border border-[var(--border-subtle)] p-2 rounded-none gap-2 mb-8">
          {tabs.map((tab) => (
            <Link
              key={tab.id}
              href={`#${tab.id}`}
              onClick={() => setActiveTab(tab.id as Tab)}
              className={`flex-1 min-w-[120px] flex items-center justify-center gap-2 px-4 py-3 rounded-none text-sm font-semibold transition-all ${activeTab === tab.id
                ? 'bg-accent/10 text-accent border border-accent/30'
                : 'text-text-muted hover:text-[var(--text-primary)] hover:bg-white/5'
                }`}
            >
              <tab.icon className="w-4 h-4 shrink-0" />
              {tab.label}
            </Link>
          ))}
        </div>

        {/* ── BROWSE TAB ── */}
        {activeTab === 'browse' && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* Status Filter */}
            <div className="flex flex-wrap items-center bg-[var(--bg-primary)]/40 border border-[var(--border-subtle)] p-2 rounded-none gap-2 mb-6 sm:mb-8">
              {[
                { key: 'all', label: 'All' },
                { key: 'open', label: 'Registering' },
                { key: 'live', label: 'Live Now' },
                { key: 'completed', label: 'Completed' },
              ].map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => setStatusFilter(key as typeof statusFilter)}
                  className={`flex-1 min-w-[100px] px-4 py-2.5 rounded-none text-sm font-semibold transition-all ${statusFilter === key
                    ? 'bg-accent/10 text-accent border border-accent/30'
                    : 'text-text-muted hover:text-[var(--text-primary)] hover:bg-white/5'
                    }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {!hackathons || hackathons.length === 0 ? (
              <LiquidGlass className="relative z-10 max-w-lg w-full mx-auto p-12 text-center flex flex-col items-center border border-[var(--border-subtle)]">
                <div className="w-20 h-20 bg-white/[0.02] border border-[var(--border-subtle)] rounded-none flex items-center justify-center mb-6">
                  <svg className="w-8 h-8 text-[var(--text-primary)]/40" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>
                </div>
                <h2 className="text-xl text-[var(--text-primary)] font-medium mb-2">No Active Hackathons</h2>
                <p className="text-sm text-[var(--text-primary)]/40 leading-relaxed">There are currently no hackathons available. Check back soon.</p>
              </LiquidGlass>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
                {hackathons
                  .filter((h) => {
                    if (statusFilter === 'all') return true;
                    if (statusFilter === 'open') return h.status === 'open';
                    if (statusFilter === 'live') return h.status === 'in_progress';
                    return h.status === 'completed';
                  })
                  .map((h) => {
                    const conf = statusConfig(h.status);
                    const isRegistered = registeredIds.has(h.id);
                    return (
                      <Link href={`/hackathons/${encodeURIComponent(h.name)}`} key={h.id} className="block group">
                        <LiquidGlass className="h-full flex flex-col p-1 transition-all duration-500 hover:-translate-y-1 hover:shadow-[0_20px_40px_-15px_rgba(0,0,0,0.5)] bg-white/[0.01] border-[var(--border-subtle)] hover:bg-white/[0.02] hover:border-white/20">
                          <div className="relative flex flex-col h-full bg-[var(--bg-tertiary)] rounded-none p-6 md:p-8 overflow-hidden z-10">
                            <div className="absolute inset-0 bg-gradient-to-br from-white/[0.02] to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />

                            <div className="flex flex-wrap justify-between items-start gap-3 mb-8 relative z-10">
                              <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-sm ${conf.bg} border ${conf.border} backdrop-blur-md`}>
                                <div className={`h-1.5 w-1.5 rounded-sm ${conf.dot} ${conf.glow} ${h.status === 'open' || h.status === 'in_progress' ? 'animate-pulse' : ''}`} />
                                <span className={`text-[11px] font-semibold uppercase tracking-widest ${conf.text}`}>{conf.label}</span>
                              </div>
                              {isRegistered && (
                                <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-sm bg-accent/10 border border-emerald-500/20 text-accent">
                                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                                  <span className="text-[11px] font-semibold uppercase tracking-widest">Registered</span>
                                </div>
                              )}
                            </div>

                            <div className="flex-1 relative z-10">
                              {h.theme && <p className="text-accent/80 text-xs font-mono mb-3 uppercase tracking-wider">{h.theme}</p>}
                              <h2 className="text-2xl font-bold text-[var(--text-primary)] mb-3 group-hover:text-emerald-300 transition-colors duration-300 leading-tight">{h.name}</h2>
                              {h.description && <p className="text-sm text-[var(--text-primary)]/50 line-clamp-3 leading-relaxed mb-6">{h.description}</p>}
                            </div>

                            <div className="mt-auto pt-6 border-t border-[var(--border-subtle)] flex flex-col gap-3 relative z-10">
                              <div className="flex items-center gap-2.5 text-sm text-[var(--text-primary)]/60">
                                <div className="p-1.5 rounded-md bg-white/5 border border-[var(--border-subtle)]">
                                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                                </div>
                                <span className="font-medium">{formatDateRange(h.startDate, h.endDate)}</span>
                              </div>
                              {h.location && (
                                <div className="flex items-center gap-2.5 text-sm text-[var(--text-primary)]/60">
                                  <div className="p-1.5 rounded-md bg-white/5 border border-[var(--border-subtle)]">
                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /></svg>
                                  </div>
                                  <span className="font-medium">{h.location}</span>
                                </div>
                              )}
                              {h.maxParticipants && (
                                <div className="flex items-center gap-2.5 text-sm text-[var(--text-primary)]/60">
                                  <div className="p-1.5 rounded-md bg-white/5 border border-[var(--border-subtle)]">
                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
                                  </div>
                                  <span className="font-medium">{h.currentParticipants} / {h.maxParticipants} Spots</span>
                                </div>
                              )}
                            </div>

                            <div className="absolute bottom-6 right-6 md:bottom-8 md:right-8 w-10 h-10 rounded-sm bg-accent/10 border border-emerald-500/20 flex items-center justify-center text-accent opacity-0 transform translate-x-4 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-300 z-10 shadow-[0_0_15px_rgba(16,185,129,0.3)]">
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>
                            </div>
                          </div>
                        </LiquidGlass>
                      </Link>
                    );
                  })}
              </div>
            )}
            
            {/* Judge Sign-Up CTA */}
            <div className="mt-12">
              <LiquidGlass className="relative overflow-hidden p-8 md:p-12 border border-accent/20 bg-accent/5 group">
                <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/10 rounded-sm blur-[80px] pointer-events-none group-hover:bg-emerald-500/20 transition-colors duration-700" />
                <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-8">
                  <div className="text-center md:text-left">
                    <h3 className="text-2xl md:text-3xl font-black text-[var(--text-primary)] mb-3">Want to be a Judge?</h3>
                    <p className="text-[var(--text-primary)]/60 max-w-xl leading-relaxed text-sm">
                      Help evaluate amazing projects, mentor emerging developers, and be a core part of our hackathon community. We're always looking for industry professionals and experienced students to join our judging panels.
                    </p>
                  </div>
                  <Link href="/judge/register" className="shrink-0 px-8 py-4 bg-emerald-500 text-[#020202] font-bold text-sm uppercase tracking-widest hover:bg-emerald-400 transition-all duration-300 hover:shadow-[0_0_30px_rgba(16,185,129,0.4)] hover:-translate-y-0.5 whitespace-nowrap">
                    Apply to Judge
                  </Link>
                </div>
              </LiquidGlass>
            </div>
          </div>
        )}

        {/* ── MY REGISTRATIONS TAB ── */}
        {activeTab === 'registrations' && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
            {myRegs && myRegs.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {myRegs.map((reg) => (
                  <Link
                    key={reg.id}
                    href={`/hackathons/${encodeURIComponent(reg.hackathon.name)}?tab=INFO`}
                    className="group flex flex-col rounded-none border border-[var(--border-subtle)] bg-gradient-to-b from-[#000000] to-black p-8 transition-all hover:border-accent/50 hover:shadow-[0_0_40px_rgba(16,185,129,0.15)] relative overflow-hidden"
                  >
                    <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-20 group-hover:scale-110 group-hover:rotate-12 transition-all duration-500">
                      <FileCode2 className="w-24 h-24 text-accent" />
                    </div>

                    <div className="flex justify-between items-start mb-6 relative z-10">
                      <span className={`px-3 py-1.5 rounded-none text-[10px] font-mono uppercase tracking-widest font-bold shadow-lg ${reg.registrationStatus === "approved" ? "bg-accent/20 text-accent border border-accent/30 shadow-[var(--accent)]/20" :
                        reg.registrationStatus === "rejected" ? "bg-red-500/20 text-red-500 border border-red-500/30 shadow-red-500/20" :
                          "bg-yellow-500/20 text-yellow-500 border border-yellow-500/30 shadow-yellow-500/20"
                        }`}>
                        {reg.registrationStatus}
                      </span>
                    </div>

                    <h4 className="text-2xl font-black text-[var(--text-primary)] italic group-hover:text-accent transition-colors mb-2 relative z-10">
                      {reg.hackathon.name}
                    </h4>
                    {reg.hackathon.theme && (
                      <p className="text-transparent bg-clip-text bg-gradient-to-r from-accent to-emerald-400 text-xs font-mono uppercase mb-4 tracking-wide relative z-10 font-bold">
                        Theme: {reg.hackathon.theme}
                      </p>
                    )}

                    <p className="text-[var(--text-muted)] text-sm line-clamp-3 mb-6 flex-1 relative z-10 leading-relaxed">{reg.hackathon.description}</p>

                    <div className="border-t border-[var(--border-subtle)] pt-5 mt-auto flex items-center justify-between text-xs text-[var(--text-subtle)] relative z-10">
                      <span className="flex items-center gap-2 bg-white/5 px-3 py-1.5 rounded-none border border-[var(--border-subtle)]">
                        <Calendar className="w-3.5 h-3.5 text-[var(--text-muted)]" />
                        {reg.hackathon.startDate ? new Date(reg.hackathon.startDate).toLocaleDateString() : 'TBA'}
                      </span>
                      <span className="flex items-center gap-1 font-bold group-hover:text-accent transition-colors px-3 py-1.5 rounded-none group-hover:bg-accent/10">
                        Enter Portal <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center p-16 md:p-24 text-center border border-[var(--border-subtle)] rounded-none bg-[var(--bg-primary)] shadow-2xl">
                <div className="w-20 h-20 rounded-sm bg-white/5 border border-[var(--border-subtle)] flex items-center justify-center mb-6">
                  <Calendar className="w-8 h-8 text-[var(--text-subtle)]" />
                </div>
                <h3 className="text-2xl font-black text-[var(--text-primary)] mb-3 italic">No active registrations</h3>
                <p className="text-[var(--text-muted)] mb-8 max-w-sm">You haven't registered for any upcoming hackathons yet. Browse events to get started.</p>
                <button
                  onClick={() => setActiveTab('browse')}
                  className="px-8 py-4 bg-gradient-to-r from-accent to-accent rounded-none text-[var(--text-primary)] font-bold text-sm hover:scale-105 active:scale-95 transition-all shadow-[0_0_20px_rgba(16,185,129,0.3)] flex items-center gap-2"
                >
                  Browse Hackathons <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        )}

        {/* ── MY PROJECTS TAB ── */}
        {activeTab === 'projects' && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
            {projects.length === 0 ? (
              <div className="flex flex-col items-center justify-center p-16 md:p-24 text-center border border-[var(--border-subtle)] rounded-none bg-[var(--bg-primary)] shadow-2xl">
                <div className="w-20 h-20 rounded-sm bg-white/5 border border-[var(--border-subtle)] flex items-center justify-center mb-6">
                  <FolderGit2 className="w-8 h-8 text-[var(--text-subtle)]" />
                </div>
                <h3 className="text-2xl font-black text-[var(--text-primary)] mb-3 italic">No projects submitted</h3>
                <p className="text-[var(--text-muted)] max-w-sm mb-8">Join a hackathon team and submit a project to see your portfolio grow here.</p>
                <button
                  onClick={() => setActiveTab('browse')}
                  className="px-8 py-4 bg-gradient-to-r from-accent to-accent rounded-none text-[var(--text-primary)] font-bold text-sm hover:scale-105 active:scale-95 transition-all shadow-[0_0_20px_rgba(16,185,129,0.3)] flex items-center gap-2"
                >
                  Find a Hackathon <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {projects.map((project) => (
                  <div key={project.id} className="group relative overflow-hidden rounded-none border border-[var(--border-subtle)] bg-[var(--bg-primary)] p-8 hover:border-accent/40 transition-all shadow-lg hover:shadow-[0_0_40px_rgba(16,185,129,0.1)]">
                    <div className="absolute inset-0 bg-gradient-to-br from-accent/5 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

                    <div className="relative z-10">
                      <div className="flex justify-between items-start mb-6">
                        <h4 className="text-3xl font-black text-[var(--text-primary)] italic group-hover:text-accent transition-colors">{project.name}</h4>
                        <span className={`px-3 py-1.5 rounded-none text-[10px] font-mono uppercase font-bold tracking-widest border shadow-lg ${project.status === "winner" ? "border-yellow-500/40 bg-yellow-500/20 text-yellow-500 shadow-yellow-500/20" :
                          project.status === "judging" ? "border-blue-500/40 bg-blue-500/20 text-blue-500 shadow-blue-500/20" :
                            "border-accent/40 bg-accent/20 text-accent shadow-[var(--accent)]/20"
                          }`}>
                          {project.status}
                        </span>
                      </div>
                      <p className="text-[var(--text-muted)] text-sm mb-8 line-clamp-3 leading-relaxed">{project.description}</p>

                      <div className="flex flex-wrap gap-4 border-t border-[var(--border-subtle)] pt-6">
                        {project.githubUrl && (
                          <Link href={project.githubUrl} target="_blank" className="px-5 py-2.5 rounded-none bg-white/5 hover:bg-white/10 border border-[var(--border-subtle)] text-xs font-bold text-[var(--text-primary)] transition-all flex items-center gap-2 hover:scale-105 active:scale-95">
                            <FolderGit2 className="w-4 h-4" /> Source Code
                          </Link>
                        )}
                        {project.demoUrl && (
                          <Link href={project.demoUrl} target="_blank" className="px-5 py-2.5 rounded-none bg-accent/10 hover:bg-accent/20 border border-accent/30 text-xs font-bold text-accent transition-all flex items-center gap-2 hover:scale-105 active:scale-95 shadow-[0_0_15px_rgba(16,185,129,0.2)]">
                            <Globe className="w-4 h-4" /> Live Demo
                          </Link>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
}
