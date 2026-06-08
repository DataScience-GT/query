'use client';

import { useSession, signOut } from 'next-auth/react';
import { trpc } from '@/lib/trpc';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import LinkStripeAccount from '@/components/portal/LinkStripeAccount';
import ProfileForm from '@/components/portal/profile/ProfileForm';
import { LiquidGlass } from '@/components/portal/LiquidGlass';
import { LoadingScreen } from '@/components/portal/LoadingScreen';

// DSGT Query - Premium Dashboard
// Ultra-modern, standout UI/UX with enhanced visual hierarchy

export default function Dashboard() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [mode] = useState<'DASHBOARD' | 'PROFILE'>('DASHBOARD');

  const { data: userData } = trpc.user.me.useQuery(undefined, { enabled: !!session });
  const { data: memberStatus } = trpc.member.checkStatus.useQuery(undefined, { enabled: !!session });
  const { data: adminStatus } = trpc.admin.isAdmin.useQuery(undefined, { enabled: !!session });
  const { data: judgeStatus } = trpc.judge.isJudge.useQuery(undefined, { enabled: !!session });

  const { data: myRegs, isLoading: loadingRegs } = trpc.hackathon.myRegistrations.useQuery(undefined, { enabled: !!session });

  const now = new Date();
  const activeRegs = myRegs?.filter(reg => reg.hackathon.endDate ? new Date(reg.hackathon.endDate) >= now : true) || [];
  const pastRegs = myRegs?.filter(reg => reg.hackathon.endDate ? new Date(reg.hackathon.endDate) < now : false) || [];

  const { mutate: attemptAutoLink } = trpc.stripe.attemptAutoLink.useMutation();
  useEffect(() => {
    if (session) attemptAutoLink();
  }, [session, attemptAutoLink]);

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/login');
  }, [status, router]);

  if (status === 'loading') return <LoadingScreen message="Syncing Identity..." />;

  if (!session) return null;

  return (
    <div className="relative min-h-screen bg-gradient-to-br from-[#000000] via-[#000000] to-[#0a0a0a] text-[var(--text-muted)] font-sans selection:bg-accent/30 overflow-x-hidden">
      {/* Animated Background */}
      <div className="fixed inset-0 z-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-20%] left-[-10%] w-[800px] h-[800px] bg-accent/5 blur-[250px] rounded-sm animate-[float_20s_ease-in-out_infinite]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[600px] h-[600px] bg-[#6366f1]/5 blur-[200px] rounded-sm animate-[float_25s_ease-in-out_infinite_reverse]" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[1000px] h-[1000px] bg-accent/3 blur-[300px] rounded-sm opacity-10" />

        {/* Grid pattern */}
        <div className="absolute inset-0 bg-[linear-gradient(rgba(0,255,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(0,255,255,0.03)_1px,transparent_1px)] bg-[size:80px_80px] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_50%,#000_70%,transparent_100%)]" />

        {/* Ambient glow */}
        <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-b from-accent/5 via-transparent to-accent/5" />
      </div>

      <main className="relative z-10 max-w-7xl mx-auto grid lg:grid-cols-12 gap-8 py-20 px-6">

        {/* SIDEBAR - Enhanced */}
        <div className="lg:col-span-4 space-y-4">
          <LiquidGlass className="p-6 relative overflow-visible">

            {/* Animated Top Line */}
            <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-accent/30 to-transparent" />

            {/* User Profile Header - Premium */}
            <div className="flex items-center gap-5 border-b border-[var(--border-subtle)] pb-8 mb-8 group">
              <div className="relative">
                <div className="absolute -inset-0.5 bg-gradient-to-r from-accent via-[#14b8a6] to-[#0891b2] rounded-sm opacity-50 blur transition-all duration-500 group-hover:opacity-75 group-hover:scale-110" />
                <Image
                  src={userData?.image || '/avatar-placeholder.png'}
                  alt="Avatar"
                  width={56}
                  height={56}
                  className="relative rounded-sm border-2 border-black bg-[var(--bg-primary)] object-cover h-14 w-14 transition-all duration-300 group-hover:scale-105"
                />
                {/* Status ring */}
                <div className={`absolute -bottom-1 -right-1 w-4 h-4 rounded-sm border-2 border-black ${adminStatus?.isAdmin ? 'bg-red-500' : memberStatus?.isMember ? 'bg-green-500' : 'bg-yellow-500'}`} />
              </div>
              <div className="space-y-1">
                <p className="text-[var(--text-primary)] font-bold uppercase tracking-tight text-base font-mono group-hover:text-accent transition-colors">{userData?.name || 'GUEST'}</p>
                <div className="flex items-center gap-2">
                  <div className={`h-2 w-2 rounded-sm ${adminStatus?.isAdmin ? 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]' : memberStatus?.isMember ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]' : 'bg-yellow-500'}`}></div>
                  <p className="text-text-secondary text-xs uppercase tracking-widest font-bold">
                    {adminStatus?.isAdmin ? 'ADMIN' : memberStatus?.isMember ? 'MEMBER' : 'GUEST'}
                  </p>
                </div>
                {userData?.bio && (
                  <p className="text-xs text-gray-600 italic line-clamp-2">{userData.bio}</p>
                )}
              </div>
            </div>

            {/* Navigation - Hackathons Section - Enhanced */}
            <nav className="space-y-2 border-t border-[var(--border-subtle)] pt-8">
              <p className="px-6 text-[10px] font-mono text-gray-600 uppercase tracking-widest mb-2 flex items-center gap-2">
                <span className="w-1 h-4 bg-accent rounded-sm" />
                Hackathons
              </p>
              <Link href="/hackathons" className={`flex-shrink-0 group flex items-center justify-between px-6 py-4 rounded-none text-sm font-bold tracking-widest transition-all duration-300 border border-transparent cursor-pointer
                ${mode === 'DASHBOARD' ? 'bg-white/[0.05] text-[var(--text-primary)] border-[var(--border-subtle)] hover:bg-white/[0.1] hover:scale-105' : 'text-[var(--text-subtle)] hover:text-[var(--text-primary)] hover:bg-white/[0.03] hover:scale-105'}
              `}>
                <span className="group-hover:translate-x-1 transition-transform">Browse</span>
                <span className={`h-2 w-2 rounded-sm transition-all duration-300 ${mode === 'DASHBOARD' ? 'bg-accent shadow-[0_0_10px_var(--accent)]' : 'bg-transparent group-hover:bg-accent/50'}`}></span>
              </Link>
              {judgeStatus?.isJudge && (
                <Link href="/judge" className={`flex-shrink-0 group flex items-center justify-between px-6 py-4 rounded-none text-sm font-bold tracking-widest transition-all duration-300 border border-transparent cursor-pointer
                  ${mode === 'DASHBOARD' ? 'bg-purple-500/15 text-purple-300 border-purple-500/20 hover:bg-purple-500/25 hover:scale-105' : 'text-[var(--text-subtle)] hover:text-purple-300 hover:bg-purple-500/10 hover:border-purple-500/20 hover:scale-105'}
                `}>
                  <span className="group-hover:translate-x-1 transition-transform">Judge Portal</span>
                  <span className="h-2 w-2 rounded-sm bg-purple-500 group-hover:shadow-[0_0_10px_#a855f7]" />
                </Link>
              )}
            </nav>

            {/* Navigation - Club/Events Section - Enhanced */}
            <nav className="space-y-2 border-t border-[var(--border-subtle)] pt-8">
              <p className="px-6 text-[10px] font-mono text-gray-600 uppercase tracking-widest mb-2 flex items-center gap-2">
                <span className="w-1 h-4 bg-green-500 rounded-sm" />
                Club & Events
              </p>
              {memberStatus?.isMember && (
                <Link href="/club" className={`flex-shrink-0 group flex items-center justify-between px-6 py-4 rounded-none text-sm font-bold tracking-widest transition-all duration-300 border border-transparent cursor-pointer
                  ${mode === 'PROFILE' ? 'bg-white/[0.05] text-[var(--text-primary)] border-[var(--border-subtle)] hover:bg-white/[0.1] hover:scale-105' : 'text-[var(--text-subtle)] hover:text-[var(--text-primary)] hover:bg-white/[0.03] hover:scale-105'}
                `}>
                  <span className="group-hover:translate-x-1 transition-transform">Club Terminal</span>
                  <span className={`h-2 w-2 rounded-sm transition-all duration-300 ${mode === 'PROFILE' ? 'bg-accent shadow-[0_0_10px_var(--accent)]' : 'bg-transparent group-hover:bg-accent/50'}`}></span>
                </Link>
              )}
            </nav>

            <div className="mt-8 pt-8 border-t border-[var(--border-subtle)]">
              <button
                onClick={() => signOut({ callbackUrl: '/login' })}
                className="w-full py-4 px-6 rounded-none bg-red-500/5 border border-red-500/20 text-red-500/60 hover:bg-red-500/10 hover:text-red-400 hover:border-red-500/30 hover:scale-[0.98] transition-all font-mono text-xs uppercase tracking-[0.2em] flex items-center justify-center gap-3 group"
              >
                <span className="w-2 h-2 bg-red-500/40 rounded-sm group-hover:bg-red-500 group-hover:shadow-[0_0_10px_#ef4444] transition-colors" />
                Terminate Session
              </button>
            </div>
          </LiquidGlass>
        </div>

        {/* MAIN CONTENT - Enhanced */}
        <div className="lg:col-span-8 flex flex-col">
          <LiquidGlass className="p-8 min-h-[600px] flex flex-col relative overflow-hidden">

            {/* Decorative elements */}
            <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-accent/20 to-transparent" />
            <div className="absolute -right-32 -top-32 w-64 h-64 bg-accent/5 blur-[100px] rounded-sm" />
            <div className="absolute -left-32 -bottom-32 w-64 h-64 bg-[#6366f1]/5 blur-[100px] rounded-sm" />

            <div className="flex justify-between items-end mb-12 relative z-10">
              <div>
                <p className="text-xs text-[var(--text-subtle)] uppercase tracking-[0.4em] mb-2 font-mono flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-sm bg-accent animate-pulse" />
                  System View
                </p>
                <h2 className="text-4xl md:text-5xl font-black text-[var(--text-primary)] italic uppercase tracking-tighter">
                  {mode === 'PROFILE' ? 'Identity Dossier' : 'Central Operations'}
                </h2>
              </div>
              <div className="flex items-center gap-3 px-4 py-2 rounded-sm bg-white/[0.05] border border-[var(--border-subtle)]">
                <div className={`h-2 w-2 rounded-sm animate-pulse ${memberStatus?.isMember || adminStatus?.isAdmin ? 'bg-accent shadow-[0_0_10px_var(--accent)]' : 'bg-yellow-500'}`} />
                <span className="text-[10px] font-mono text-[var(--text-subtle)] uppercase tracking-wider">
                  {mode === 'PROFILE' ? 'EDITING' : 'ACTIVE'}
                </span>
              </div>
            </div>

            <div className={`flex-1 flex flex-col relative z-10 ${mode === 'DASHBOARD' ? 'justify-center' : ''}`}>

              {mode === 'PROFILE' ? (
                /* PROFILE EDITOR VIEW - Enhanced */
                <div className="animate-in fade-in zoom-in-95 duration-300">
                  <ProfileForm user={{
                    id: userData?.id || '',
                    name: userData?.name,
                    email: userData?.email || '',
                    image: userData?.image,
                    bio: userData?.bio,
                    website: userData?.website,
                    location: userData?.location,
                  }} />
                </div>
              ) : (
                /* DASHBOARD TILES VIEW - Enhanced */
                <div className="grid grid-cols-1 gap-6 animate-in fade-in slide-in-from-bottom-8 duration-500">

                  {adminStatus?.isAdmin ? (
                    /* ADMIN VIEW - Enhanced */
                    <div className="space-y-6">
                      <Link href="/admin" className="block group">
                        <div className="relative p-8 rounded-none bg-gradient-to-br from-black/50 via-[#000000] to-black/50 border border-[var(--border-subtle)] hover:border-accent/30 transition-all duration-500 overflow-hidden group-hover:translate-y-[-2px] group-hover:shadow-[0_0_40px_rgba(16,185,129,0.2)]">
                          {/* Background gradients */}
                          <div className="absolute inset-0 bg-gradient-to-br from-accent/5 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                          <div className="absolute -right-20 -top-20 w-60 h-60 bg-accent/10 rounded-sm blur-[100px] opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

                          <div className="absolute top-0 right-0 p-6 opacity-10 group-hover:opacity-20 transition-opacity duration-500">
                            <svg className="w-32 h-32 text-accent" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm0 14.2c-2.5 0-4.71-1.28-6-3.22.03-1.99 4-3.08 6-3.08 1.99 0 5.97 1.09 6 3.08-1.29 1.94-3.5 3.22-6 3.22z" /></svg>
                          </div>

                          <div className="relative z-10">
                            <div className="flex items-center gap-2 mb-4">
                              <span className="w-2 h-2 rounded-sm bg-accent animate-pulse shadow-[0_0_8px_var(--accent)]" />
                              <p className="text-xs uppercase tracking-[0.2em] font-bold text-accent">Node Access Level 5</p>
                            </div>
                            <h3 className="text-4xl font-bold text-[var(--text-primary)] uppercase tracking-tight mb-3 group-hover:text-accent transition-colors">
                              Admin Control Panel
                            </h3>
                            <p className="text-base text-[var(--text-muted)] font-mono leading-relaxed">
                              Manage hackathons, view judge queues, and configure system parameters.
                            </p>
                            <div className="mt-8 flex items-center gap-3 text-[10px] font-mono text-accent/70 uppercase tracking-[0.15em] group-hover:opacity-100 transition-opacity">
                              <span>INITIATE SESSION</span>
                              <svg className="w-4 h-4 transform group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" /></svg>
                            </div>
                          </div>
                        </div>
                      </Link>

                      <Link href="/club" className="block group">
                        <div className="relative p-8 rounded-none bg-gradient-to-br from-black/50 via-[#000000] to-black/50 border border-[var(--border-subtle)] hover:border-accent/30 transition-all duration-500 overflow-hidden group-hover:translate-y-[-2px] group-hover:shadow-[0_0_40px_rgba(16,185,129,0.15)]">
                          <div className="absolute inset-0 bg-gradient-to-br from-accent/5 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                          <div className="absolute -right-20 -top-20 w-60 h-60 bg-accent/10 rounded-sm blur-[100px] opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

                          <div className="absolute top-0 right-0 p-6 opacity-10 group-hover:opacity-20 transition-opacity duration-500">
                            <svg className="w-32 h-32 text-accent" viewBox="0 0 24 24" fill="currentColor"><path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/></svg>
                          </div>

                          <div className="relative z-10">
                            <div className="flex items-center gap-2 mb-4">
                              <span className="w-2 h-2 rounded-sm bg-accent animate-pulse shadow-[0_0_8px_var(--accent)]" />
                              <p className="text-xs uppercase tracking-[0.2em] font-bold text-accent">Member Preview</p>
                            </div>
                            <h3 className="text-4xl font-bold text-[var(--text-primary)] uppercase tracking-tight mb-3 group-hover:text-accent transition-colors">
                              Test Member View
                            </h3>
                            <p className="text-base text-[var(--text-muted)] font-mono leading-relaxed">
                              Preview exactly what members see — Club Portal, Hackathon Hub, and event check-in flows.
                            </p>
                            <div className="mt-8 flex flex-wrap items-center gap-4">
                              <div className="flex items-center gap-3 text-[10px] font-mono text-accent/70 uppercase tracking-[0.15em] group-hover:opacity-100 transition-opacity">
                                <span>Club Portal</span>
                                <svg className="w-4 h-4 transform group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" /></svg>
                              </div>
                              <Link href="/hackathons" onClick={e => e.stopPropagation()} className="flex items-center gap-3 text-[10px] font-mono text-accent/70 hover:text-accent uppercase tracking-[0.15em] transition-all border-l border-[var(--border-subtle)] pl-4">
                                <span>Hackathon Hub</span>
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" /></svg>
                              </Link>
                            </div>
                          </div>
                        </div>
                      </Link>

                      {judgeStatus?.isJudge && (
                        <Link href="/judge" className="block group">
                          <div className="relative p-8 rounded-none bg-gradient-to-br from-black/50 via-[#000000] to-black/50 border border-purple-500/20 hover:border-purple-500/40 transition-all duration-500 overflow-hidden group-hover:translate-y-[-2px] group-hover:shadow-[0_0_40px_rgba(168,85,247,0.2)]">
                            <div className="absolute inset-0 bg-gradient-to-br from-purple-900/15 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                            <div className="absolute -right-16 -top-16 w-56 h-56 bg-purple-500/10 rounded-sm blur-[100px] opacity-0 group-hover:opacity-100 transition-all duration-500" />

                            <div className="relative z-10">
                              <div className="flex items-center gap-2 mb-4">
                                <span className="w-2 h-2 rounded-sm bg-purple-500 animate-pulse shadow-[0_0_8px_#a855f7]" />
                                <p className="text-xs uppercase tracking-[0.2em] font-bold text-purple-300">Judge Access</p>
                              </div>
                              <h3 className="text-3xl font-bold text-[var(--text-primary)] uppercase tracking-tight mb-3 group-hover:text-purple-400 transition-colors">
                                Judge Portal
                              </h3>
                              <p className="text-sm text-[var(--text-muted)] font-mono leading-relaxed mb-6 group-hover:text-gray-300 transition-colors">
                                &gt; Access judging queue, score projects, and track your progress.
                              </p>

                              <div className="inline-flex items-center gap-3 text-sm font-mono text-[var(--text-primary)] bg-purple-500/10 border border-purple-500/20 px-6 py-3 rounded-none group-hover:bg-purple-500/20 group-hover:border-purple-500/40 transition-all cursor-pointer">
                                <span className="group-hover:text-purple-300 transition-colors font-bold tracking-wider">OPEN JUDGE VIEW</span>
                                <svg className="w-4 h-4 transform group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>
                              </div>
                            </div>
                          </div>
                        </Link>
                      )}
                    </div>
                  ) : (
                    /* MEMBER VIEW - Enhanced */
                    <div className="space-y-6">
                      {judgeStatus?.isJudge && (
                        <Link href="/judge" className="block group">
                          <div className="relative p-8 rounded-none bg-gradient-to-br from-black/50 via-[#000000] to-black/50 border border-purple-500/20 hover:border-purple-500/40 transition-all duration-500 overflow-hidden group-hover:translate-y-[-2px] group-hover:shadow-[0_0_40px_rgba(168,85,247,0.2)]">
                            <div className="absolute inset-0 bg-gradient-to-br from-purple-900/15 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                            <div className="absolute -right-16 -top-16 w-56 h-56 bg-purple-500/10 rounded-sm blur-[100px] opacity-0 group-hover:opacity-100 transition-all duration-500" />

                            <div className="relative z-10">
                              <div className="flex items-center gap-2 mb-4">
                                <span className="w-2 h-2 rounded-sm bg-purple-500 animate-pulse shadow-[0_0_8px_#a855f7]" />
                                <p className="text-xs uppercase tracking-[0.2em] font-bold text-purple-300">Judge Access</p>
                              </div>
                              <h3 className="text-3xl font-bold text-[var(--text-primary)] uppercase tracking-tight mb-3 group-hover:text-purple-400 transition-colors">
                                Judge Portal
                              </h3>
                              <p className="text-sm text-[var(--text-muted)] font-mono leading-relaxed mb-6 group-hover:text-gray-300 transition-colors">
                                &gt; Access judging queue, score projects, and track your progress.
                              </p>

                              <div className="inline-flex items-center gap-3 text-sm font-mono text-[var(--text-primary)] bg-purple-500/10 border border-purple-500/20 px-6 py-3 rounded-none group-hover:bg-purple-500/20 group-hover:border-purple-500/40 transition-all cursor-pointer">
                                <span className="group-hover:text-purple-300 transition-colors font-bold tracking-wider">OPEN JUDGE VIEW</span>
                                <svg className="w-4 h-4 transform group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>
                              </div>
                            </div>
                          </div>
                        </Link>
                      )}

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {memberStatus?.isMember ? (
                          <Link href="/club" className="block group h-full">
                            <div className="relative h-full p-8 rounded-none bg-gradient-to-br from-black/50 via-[#000000] to-black/50 border border-green-500/20 hover:border-green-500/40 transition-all duration-500 overflow-hidden group-hover:translate-y-[-2px] flex flex-col group-hover:shadow-[0_0_40px_rgba(34,197,94,0.2)]">

                              {/* Background gradients */}
                              <div className="absolute inset-0 bg-gradient-to-br from-green-900/15 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                              <div className="absolute -right-16 -top-16 w-56 h-56 bg-green-500/10 rounded-sm blur-[100px] opacity-0 group-hover:opacity-100 transition-all duration-500" />

                              <div className="absolute top-0 right-0 p-6 opacity-20 group-hover:opacity-40 transition-opacity duration-300 transform group-hover:scale-110 group-hover:rotate-3">
                                <svg className="w-32 h-32 text-green-500" viewBox="0 0 24 24" fill="currentColor"><path d="M4 6h18V4H4c-1.1 0-2 .9-2 2v11H0v3h14v-3H4V6zm19 2h-6c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h6c.55 0 1-.45 1-1V9c0-.55-.45-1-1-1zm-1 9h-4v-7h4v7z" /></svg>
                              </div>

                              <div className="relative z-10">
                                <div className="flex items-center gap-2 mb-4">
                                  <span className="w-2 h-2 rounded-sm bg-green-500 animate-pulse shadow-[0_0_8px_#22c55e]" />
                                  <p className="text-xs uppercase tracking-[0.2em] font-bold text-green-400">Access Granted</p>
                                </div>

                                <h3 className="text-2xl font-bold text-[var(--text-primary)] uppercase tracking-tight mb-3 group-hover:text-green-400 transition-colors">
                                  Member Terminal
                                </h3>
                                <p className="text-sm text-[var(--text-muted)] font-mono leading-relaxed mb-8 group-hover:text-gray-300 transition-colors">
                                  &gt; Initialize connection to club resources, voting protocols, and event registries.
                                </p>

                                <div className="inline-flex items-center gap-3 text-sm font-mono text-[var(--text-primary)] bg-green-500/10 border border-green-500/20 px-6 py-3 rounded-none group-hover:bg-green-500/20 group-hover:border-green-500/40 transition-all cursor-pointer">
                                  <span className="group-hover:text-green-300 transition-colors font-bold tracking-wider">ENTER SYSTEM</span>
                                  <svg className="w-4 h-4 transform group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>
                                </div>
                              </div>
                            </div>
                          </Link>
                        ) : (
                          <div className="h-full space-y-6">
                            <LinkStripeAccount />
                            
                            {/* NON-MEMBER HACKATHON GUEST SIGNUP TILE */}
                            <Link href="/hackathons" className="block group">
                              <div className="relative p-8 rounded-none bg-gradient-to-br from-black/50 via-[#000000] to-black/50 border border-[var(--border-subtle)] hover:border-accent/30 transition-all duration-500 overflow-hidden group-hover:translate-y-[-2px] group-hover:shadow-[0_0_40px_rgba(16,185,129,0.2)]">
                                <div className="absolute inset-0 bg-gradient-to-br from-accent/5 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />
                                <div className="absolute -right-20 -top-20 w-60 h-60 bg-accent/10 rounded-sm blur-[100px] opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />
                                
                                <div className="relative z-10">
                                  <div className="flex items-center gap-2 mb-4">
                                    <span className="w-2 h-2 bg-accent rounded-sm animate-pulse shadow-[0_0_8px_var(--accent)]" />
                                    <p className="text-xs uppercase tracking-[0.2em] font-bold text-accent">Guest Pass Registry</p>
                                  </div>
                                  <h3 className="text-3xl font-bold text-[var(--text-primary)] uppercase tracking-tight mb-3 group-hover:text-accent transition-colors">
                                    Guest Registration
                                  </h3>
                                  <p className="text-base text-[var(--text-muted)] font-mono leading-relaxed">
                                    Not a club member? No problem! You can still register for and attend our hackathons as a guest participant.
                                  </p>
                                  <div className="mt-8 flex items-center gap-3 text-[10px] font-mono text-accent/70 uppercase tracking-[0.15em]">
                                    <span>REGISTER AS GUEST</span>
                                    <svg className="w-4 h-4 transform group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" /></svg>
                                  </div>
                                </div>
                              </div>
                            </Link>
                          </div>
                        )}

                        {/* HACKATHON REGISTRATIONS */}
                        {loadingRegs ? (
                          <div className="relative p-8 rounded-none bg-[var(--bg-primary)]/40 border border-[var(--border-subtle)] flex items-center justify-center animate-pulse">
                            <span className="text-[var(--text-subtle)] text-sm font-mono">Loading hackathons...</span>
                          </div>
                        ) : activeRegs.length > 0 ? (
                          activeRegs.map((reg) => (
                            <Link key={reg.id} href={`/hackathons/${encodeURIComponent(reg.hackathon.name)}?tab=SCHEDULE`} className="block group h-full">
                              <div className="relative h-full p-8 rounded-none bg-[var(--bg-primary)]/40 border border-accent/20 hover:border-accent/40 transition-all duration-300 flex flex-col rounded-none hover:-translate-y-1 hover:shadow-[0_0_30px_rgba(16,185,129,0.15)] overflow-hidden">
                                <div className="absolute inset-0 bg-gradient-to-br from-accent/8 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

                                <div className="absolute top-0 right-0 p-6 opacity-10 group-hover:opacity-20 transition-opacity">
                                  <svg className="w-24 h-24 text-accent" viewBox="0 0 24 24" fill="currentColor"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z" /></svg>
                                </div>

                                <div className="flex items-center justify-between mb-4">
                                  <div className="flex items-center gap-2">
                                    <div className="p-2 rounded-none bg-accent/10 border border-accent/30 group-hover:bg-accent/20 group-hover:border-accent/50 transition-all">
                                      <svg className="w-4 h-4 text-accent" viewBox="0 0 24 24" fill="currentColor"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z" /></svg>
                                    </div>
                                    <p className="text-xs font-bold uppercase tracking-widest text-accent">Hackathon</p>
                                  </div>
                                  {reg.team?.projects && reg.team.projects.length > 0 && (
                                    <div className="px-3 py-1 rounded-sm bg-yellow-500/10 border border-yellow-500/20">
                                      <span className="text-[10px] font-bold uppercase tracking-wider text-yellow-400">Project Submitted</span>
                                    </div>
                                  )}
                                </div>

                                <h3 className="text-2xl font-black text-[var(--text-primary)] uppercase tracking-tight mb-3 group-hover:text-accent transition-colors relative z-10">
                                  {reg.hackathon.name}
                                </h3>

                                <div className="space-y-2 mb-6 flex-1 relative z-10 mt-2">
                                  <div className="flex items-center justify-between">
                                    <span className="text-xs text-[var(--text-subtle)] uppercase tracking-widest font-mono">Status</span>
                                    <span className={`text-xs font-bold uppercase tracking-widest ${reg.registrationStatus === 'approved' || reg.registrationStatus === 'checked_in' ? 'text-green-500' :
                                      reg.registrationStatus === 'waitlisted' ? 'text-yellow-500' :
                                      reg.registrationStatus === 'rejected' ? 'text-red-500' :
                                      'text-[var(--text-subtle)]'
                                    }`}>
                                      {reg.registrationStatus.replace(/_/g, ' ')}
                                    </span>
                                  </div>

                                  {reg.team ? (
                                    <>
                                      <div className="flex items-center justify-between">
                                        <span className="text-xs text-[var(--text-subtle)] uppercase tracking-widest font-mono">Team</span>
                                        <span className="text-xs text-[var(--text-primary)] tracking-widest truncate max-w-[120px]">
                                          {reg.team.name}
                                        </span>
                                      </div>

                                      <div className="flex items-center justify-between">
                                        <span className="text-xs text-[var(--text-subtle)] uppercase tracking-widest font-mono">Project</span>
                                        <span className={`text-xs uppercase tracking-widest ${reg.team.projects && reg.team.projects.length > 0 ? 'text-accent font-bold' : 'text-[var(--text-subtle)]'
                                        }`}>
                                          {reg.team.projects && reg.team.projects.length > 0 ? reg.team.projects[0]?.status : 'No Project'}
                                        </span>
                                      </div>
                                    </>
                                  ) : (
                                    <div className="flex items-center justify-between border-t border-[var(--border-subtle)] pt-2 mt-2">
                                      <span className="text-xs text-[var(--text-subtle)] uppercase tracking-widest font-mono">Team</span>
                                      <span className="text-xs text-[var(--text-subtle)] uppercase tracking-widest">
                                        Solo / Unassigned
                                      </span>
                                    </div>
                                  )}
                                </div>

                                <div className="inline-flex items-center gap-2 px-4 py-2 rounded bg-[var(--bg-primary)] border border-[var(--border-subtle)] self-start group-hover:border-accent/40 transition-colors relative z-10 cursor-pointer">
                                  <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-[var(--text-subtle)] group-hover:text-[var(--text-primary)] transition-colors">Enter Portal</span>
                                  <svg className="w-3 h-3 text-accent transform group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>
                                </div>
                              </div>
                            </Link>
                          ))
                        ) : (
                          <Link href="/hackathons" className="block group h-full">
                            <div className="relative h-full p-8 rounded-none bg-[var(--bg-primary)]/40 border border-[var(--border-subtle)] hover:border-white/20 transition-all duration-300 flex flex-col rounded-none">
                              <div className="absolute top-0 right-0 p-6 opacity-5 group-hover:opacity-10 transition-opacity">
                                <svg className="w-20 h-20 text-gray-600" viewBox="0 0 24 24" fill="currentColor"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z" /></svg>
                              </div>

                              <p className="text-xs uppercase tracking-[0.2em] font-bold mb-3 text-[var(--text-subtle)] group-hover:text-[var(--text-muted)] transition-colors">
                                Discover More
                              </p>
                              <h3 className="text-2xl font-bold text-[var(--text-primary)] uppercase tracking-tight mb-2">
                                Browse Events
                              </h3>
                              <p className="text-sm text-[var(--text-subtle)] font-mono leading-relaxed flex-1">
                                You are not currently registered for any active events. Discover and join upcoming hackathons from the global registry.
                              </p>

                              <div className="inline-flex items-center gap-2 px-3 py-2 rounded border border-[var(--border-subtle)] self-start group-hover:bg-white/5 transition-colors cursor-pointer">
                                <span className="text-[10px] font-mono text-[var(--text-subtle)] font-bold uppercase tracking-wider group-hover:text-[var(--text-primary)] transition-colors">Explore Directory</span>
                                <svg className="w-3 h-3 text-[var(--text-subtle)] transform group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" /></svg>
                              </div>
                            </div>
                          </Link>
                        )}
                      </div>

                      {/* PAST HACKATHONS */}
                      {!loadingRegs && pastRegs.length > 0 && (
                        <div className="mt-12 animate-in fade-in slide-in-from-bottom-4 duration-500 delay-150">
                          <h2 className="text-2xl font-bold text-[var(--text-primary)] mb-6 uppercase tracking-wider flex items-center gap-3">
                            <span className="w-2 h-2 rounded-sm bg-gray-500" />
                            Past Events
                          </h2>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {pastRegs.map((reg) => (
                              <Link key={reg.id} href={`/hackathons/${encodeURIComponent(reg.hackathon.name)}?tab=INFO`} className="block group h-full">
                                <div className="relative h-full p-6 rounded-none bg-[var(--bg-primary)]/40 border border-[var(--border-subtle)] hover:border-white/20 transition-all duration-300 flex flex-col rounded-none opacity-70 hover:opacity-100">
                                  <div className="absolute top-0 right-0 p-6 opacity-5 group-hover:opacity-10 transition-opacity">
                                    <svg className="w-16 h-16 text-gray-600" viewBox="0 0 24 24" fill="currentColor"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z" /></svg>
                                  </div>

                                  <p className="text-[10px] uppercase tracking-[0.2em] font-bold mb-2 text-gray-600">
                                    Attended Event
                                  </p>
                                  <h3 className="text-xl font-bold text-[var(--text-muted)] uppercase tracking-tight mb-2 group-hover:text-[var(--text-primary)] transition-colors truncate relative z-10">
                                    {reg.hackathon.name}
                                  </h3>

                                  <div className="space-y-2 mb-4 flex-1 relative z-10 mt-2">
                                    <div className="flex items-center justify-between">
                                      <span className="text-[10px] text-gray-600 uppercase tracking-widest font-mono">Status</span>
                                      <span className="text-[10px] font-bold uppercase tracking-widest text-gray-600">
                                        {reg.registrationStatus.replace(/_/g, ' ')}
                                      </span>
                                    </div>

                                    {reg.team ? (
                                      <div className="flex items-center justify-between mt-1">
                                        <span className="text-[10px] text-gray-600 uppercase tracking-widest font-mono">Team</span>
                                        <span className="text-[10px] text-gray-600 tracking-widest truncate max-w-[120px]">
                                          {reg.team.name}
                                        </span>
                                      </div>
                                    ) : null}
                                  </div>

                                  <div className="inline-flex items-center gap-2 px-3 py-2 rounded border border-[var(--border-subtle)] self-start group-hover:bg-white/5 transition-colors relative z-10 cursor-pointer">
                                    <span className="text-[9px] font-mono text-gray-600 group-hover:text-[var(--text-muted)] font-bold uppercase tracking-wider">View Details</span>
                                    <svg className="w-3 h-3 text-gray-600 transform group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>
                                  </div>
                                </div>
                              </Link>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </LiquidGlass>
        </div>
      </main>
    </div>
  );
}