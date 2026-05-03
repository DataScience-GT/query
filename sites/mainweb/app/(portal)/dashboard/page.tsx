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
  const [mode, setMode] = useState<'DASHBOARD' | 'PROFILE'>('DASHBOARD');

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
    <div className="relative min-h-screen bg-gradient-to-br from-[#000000] via-[#050505] to-[#0a0a0a] text-gray-400 font-sans selection:bg-[#00A8A8]/30 overflow-x-hidden">
      {/* Animated Background */}
      <div className="fixed inset-0 z-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-20%] left-[-10%] w-[800px] h-[800px] bg-[#00A8A8]/5 blur-[250px] rounded-full animate-[float_20s_ease-in-out_infinite]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[600px] h-[600px] bg-[#6366f1]/5 blur-[200px] rounded-full animate-[float_25s_ease-in-out_infinite_reverse]" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[1000px] h-[1000px] bg-[#00A8A8]/3 blur-[300px] rounded-full opacity-10" />

        {/* Grid pattern */}
        <div className="absolute inset-0 bg-[linear-gradient(rgba(0,255,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(0,255,255,0.03)_1px,transparent_1px)] bg-[size:80px_80px] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_50%,#000_70%,transparent_100%)]" />

        {/* Ambient glow */}
        <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-b from-[#00A8A8]/5 via-transparent to-[#00A8A8]/5" />
      </div>

      <main className="relative z-10 max-w-7xl mx-auto grid lg:grid-cols-12 gap-8 py-20 px-6">

        {/* SIDEBAR - Enhanced */}
        <div className="lg:col-span-4 space-y-4">
          <LiquidGlass className="p-6 relative overflow-visible">

            {/* Animated Top Line */}
            <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-[#00A8A8]/30 to-transparent" />

            {/* User Profile Header - Premium */}
            <div className="flex items-center gap-5 border-b border-white/5 pb-8 mb-8 group">
              <div className="relative">
                <div className="absolute -inset-0.5 bg-gradient-to-r from-[#00A8A8] via-[#14b8a6] to-[#0891b2] rounded-full opacity-50 blur transition-all duration-500 group-hover:opacity-75 group-hover:scale-110" />
                <Image
                  src={userData?.image || '/avatar-placeholder.png'}
                  alt="Avatar"
                  width={56}
                  height={56}
                  className="relative rounded-full border-2 border-black bg-black object-cover h-14 w-14 transition-all duration-300 group-hover:scale-105"
                />
                {/* Status ring */}
                <div className={`absolute -bottom-1 -right-1 w-4 h-4 rounded-full border-2 border-black ${adminStatus?.isAdmin ? 'bg-red-500' : memberStatus?.isMember ? 'bg-green-500' : 'bg-yellow-500'}`} />
              </div>
              <div className="space-y-1">
                <p className="text-white font-bold uppercase tracking-tight text-base font-mono group-hover:text-[#00A8A8] transition-colors">{userData?.name || 'GUEST'}</p>
                <div className="flex items-center gap-2">
                  <div className={`h-2 w-2 rounded-full ${adminStatus?.isAdmin ? 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]' : memberStatus?.isMember ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]' : 'bg-yellow-500'}`}></div>
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
            <nav className="space-y-2 border-t border-white/5 pt-8">
              <p className="px-6 text-[10px] font-mono text-gray-600 uppercase tracking-widest mb-2 flex items-center gap-2">
                <span className="w-1 h-4 bg-[#00A8A8] rounded-full" />
                Hackathons
              </p>
              <Link href="/hackathons" className={`flex-shrink-0 group flex items-center justify-between px-6 py-4 rounded-xl text-sm font-bold tracking-widest transition-all duration-300 border border-transparent cursor-pointer
                ${mode === 'DASHBOARD' ? 'bg-white/[0.05] text-white border-white/10 hover:bg-white/[0.1] hover:scale-105' : 'text-gray-500 hover:text-white hover:bg-white/[0.03] hover:scale-105'}
              `}>
                <span className="group-hover:translate-x-1 transition-transform">Browse</span>
                <span className={`h-2 w-2 rounded-full transition-all duration-300 ${mode === 'DASHBOARD' ? 'bg-[#00A8A8] shadow-[0_0_10px_#00A8A8]' : 'bg-transparent group-hover:bg-[#00A8A8]/50'}`}></span>
              </Link>
              {judgeStatus?.isJudge && (
                <Link href="/judge" className={`flex-shrink-0 group flex items-center justify-between px-6 py-4 rounded-xl text-sm font-bold tracking-widest transition-all duration-300 border border-transparent cursor-pointer
                  ${mode === 'DASHBOARD' ? 'bg-purple-500/15 text-purple-300 border-purple-500/20 hover:bg-purple-500/25 hover:scale-105' : 'text-gray-500 hover:text-purple-300 hover:bg-purple-500/10 hover:border-purple-500/20 hover:scale-105'}
                `}>
                  <span className="group-hover:translate-x-1 transition-transform">Judge Portal</span>
                  <span className="h-2 w-2 rounded-full bg-purple-500 group-hover:shadow-[0_0_10px_#a855f7]" />
                </Link>
              )}
            </nav>

            {/* Navigation - Club/Events Section - Enhanced */}
            <nav className="space-y-2 border-t border-white/5 pt-8">
              <p className="px-6 text-[10px] font-mono text-gray-600 uppercase tracking-widest mb-2 flex items-center gap-2">
                <span className="w-1 h-4 bg-green-500 rounded-full" />
                Club & Events
              </p>
              {memberStatus?.isMember && (
                <Link href="/club" className={`flex-shrink-0 group flex items-center justify-between px-6 py-4 rounded-xl text-sm font-bold tracking-widest transition-all duration-300 border border-transparent cursor-pointer
                  ${mode === 'PROFILE' ? 'bg-white/[0.05] text-white border-white/10 hover:bg-white/[0.1] hover:scale-105' : 'text-gray-500 hover:text-white hover:bg-white/[0.03] hover:scale-105'}
                `}>
                  <span className="group-hover:translate-x-1 transition-transform">Club Terminal</span>
                  <span className={`h-2 w-2 rounded-full transition-all duration-300 ${mode === 'PROFILE' ? 'bg-[#00A8A8] shadow-[0_0_10px_#00A8A8]' : 'bg-transparent group-hover:bg-[#00A8A8]/50'}`}></span>
                </Link>
              )}
            </nav>

            <div className="mt-8 pt-8 border-t border-white/5">
              <button
                onClick={() => signOut({ callbackUrl: '/login' })}
                className="w-full py-4 px-6 rounded-xl bg-red-500/5 border border-red-500/20 text-red-500/60 hover:bg-red-500/10 hover:text-red-400 hover:border-red-500/30 hover:scale-[0.98] transition-all font-mono text-xs uppercase tracking-[0.2em] flex items-center justify-center gap-3 group"
              >
                <span className="w-2 h-2 bg-red-500/40 rounded-full group-hover:bg-red-500 group-hover:shadow-[0_0_10px_#ef4444] transition-colors" />
                Terminate Session
              </button>
            </div>
          </LiquidGlass>
        </div>

        {/* MAIN CONTENT - Enhanced */}
        <div className="lg:col-span-8 flex flex-col">
          <LiquidGlass className="p-8 min-h-[600px] flex flex-col relative overflow-hidden">

            {/* Decorative elements */}
            <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-[#00A8A8]/20 to-transparent" />
            <div className="absolute -right-32 -top-32 w-64 h-64 bg-[#00A8A8]/5 blur-[100px] rounded-full" />
            <div className="absolute -left-32 -bottom-32 w-64 h-64 bg-[#6366f1]/5 blur-[100px] rounded-full" />

            <div className="flex justify-between items-end mb-12 relative z-10">
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-[0.4em] mb-2 font-mono flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#00A8A8] animate-pulse" />
                  System View
                </p>
                <h2 className="text-4xl md:text-5xl font-black text-white italic uppercase tracking-tighter">
                  {mode === 'PROFILE' ? 'Identity Dossier' : 'Central Operations'}
                </h2>
              </div>
              <div className="flex items-center gap-3 px-4 py-2 rounded-full bg-white/[0.05] border border-white/10">
                <div className={`h-2 w-2 rounded-full animate-pulse ${memberStatus?.isMember || adminStatus?.isAdmin ? 'bg-[#00A8A8] shadow-[0_0_10px_#00A8A8]' : 'bg-yellow-500'}`} />
                <span className="text-[10px] font-mono text-gray-500 uppercase tracking-wider">
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
                        <div className="relative p-8 rounded-2xl bg-gradient-to-br from-black/50 via-[#050505] to-black/50 border border-white/10 hover:border-[#00A8A8]/30 transition-all duration-500 overflow-hidden group-hover:translate-y-[-2px] group-hover:shadow-[0_0_40px_rgba(0,168,168,0.2)]">
                          {/* Background gradients */}
                          <div className="absolute inset-0 bg-gradient-to-br from-[#00A8A8]/5 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                          <div className="absolute -right-20 -top-20 w-60 h-60 bg-[#00A8A8]/10 rounded-full blur-[100px] opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

                          <div className="absolute top-0 right-0 p-6 opacity-10 group-hover:opacity-20 transition-opacity duration-500">
                            <svg className="w-32 h-32 text-[#00A8A8]" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm0 14.2c-2.5 0-4.71-1.28-6-3.22.03-1.99 4-3.08 6-3.08 1.99 0 5.97 1.09 6 3.08-1.29 1.94-3.5 3.22-6 3.22z" /></svg>
                          </div>

                          <div className="relative z-10">
                            <div className="flex items-center gap-2 mb-4">
                              <span className="w-2 h-2 rounded-full bg-[#00A8A8] animate-pulse shadow-[0_0_8px_#00A8A8]" />
                              <p className="text-xs uppercase tracking-[0.2em] font-bold text-[#00A8A8]">Node Access Level 5</p>
                            </div>
                            <h3 className="text-4xl font-bold text-white uppercase tracking-tight mb-3 group-hover:text-[#00A8A8] transition-colors">
                              Admin Control Panel
                            </h3>
                            <p className="text-base text-gray-400 font-mono leading-relaxed">
                              Manage hackathons, view judge queues, and configure system parameters.
                            </p>
                            <div className="mt-8 flex items-center gap-3 text-[10px] font-mono text-[#00A8A8]/70 uppercase tracking-[0.15em] group-hover:opacity-100 transition-opacity">
                              <span>INITIATE SESSION</span>
                              <svg className="w-4 h-4 transform group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" /></svg>
                            </div>
                          </div>
                        </div>
                      </Link>

                      <Link href="/admin/hackathons/analytics" className="block group">
                        <div className="relative p-8 rounded-2xl bg-gradient-to-br from-black/50 via-[#050505] to-black/50 border border-white/10 hover:border-blue-500/30 transition-all duration-500 overflow-hidden group-hover:translate-y-[-2px] group-hover:shadow-[0_0_40px_rgba(59,130,246,0.2)]">
                          <div className="absolute inset-0 bg-gradient-to-br from-blue-900/10 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                          <div className="absolute -right-20 -top-20 w-60 h-60 bg-blue-500/10 rounded-full blur-[100px] opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

                          <div className="absolute top-0 right-0 p-6 opacity-10 group-hover:opacity-20 transition-opacity duration-500">
                            <svg className="w-32 h-32 text-blue-500" viewBox="0 0 24 24" fill="currentColor"><path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z" /></svg>
                          </div>

                          <div className="relative z-10">
                            <div className="flex items-center gap-2 mb-4">
                              <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
                              <p className="text-xs uppercase tracking-[0.2em] font-bold text-blue-400">Node Access Level 4</p>
                            </div>
                            <h3 className="text-4xl font-bold text-white uppercase tracking-tight mb-3 group-hover:text-blue-400 transition-colors">
                              Admin Analytics Node
                            </h3>
                            <p className="text-base text-gray-400 font-mono leading-relaxed">
                              View real-time registration statistics, dietary restrictions, and t-shirt sizes.
                            </p>
                            <div className="mt-8 flex items-center gap-3 text-[10px] font-mono text-blue-400/70 uppercase tracking-[0.15em] group-hover:opacity-100 transition-opacity">
                              <span>INITIATE TELEMETRY</span>
                              <svg className="w-4 h-4 transform group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" /></svg>
                            </div>
                          </div>
                        </div>
                      </Link>

                      {judgeStatus?.isJudge && (
                        <Link href="/judge" className="block group">
                          <div className="relative p-8 rounded-2xl bg-gradient-to-br from-black/50 via-[#050505] to-black/50 border border-purple-500/20 hover:border-purple-500/40 transition-all duration-500 overflow-hidden group-hover:translate-y-[-2px] group-hover:shadow-[0_0_40px_rgba(168,85,247,0.2)]">
                            <div className="absolute inset-0 bg-gradient-to-br from-purple-900/15 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                            <div className="absolute -right-16 -top-16 w-56 h-56 bg-purple-500/10 rounded-full blur-[100px] opacity-0 group-hover:opacity-100 transition-all duration-500" />

                            <div className="relative z-10">
                              <div className="flex items-center gap-2 mb-4">
                                <span className="w-2 h-2 rounded-full bg-purple-500 animate-pulse shadow-[0_0_8px_#a855f7]" />
                                <p className="text-xs uppercase tracking-[0.2em] font-bold text-purple-300">Judge Access</p>
                              </div>
                              <h3 className="text-3xl font-bold text-white uppercase tracking-tight mb-3 group-hover:text-purple-400 transition-colors">
                                Judge Portal
                              </h3>
                              <p className="text-sm text-gray-400 font-mono leading-relaxed mb-6 group-hover:text-gray-300 transition-colors">
                                &gt; Access judging queue, score projects, and track your progress.
                              </p>

                              <div className="inline-flex items-center gap-3 text-sm font-mono text-white bg-purple-500/10 border border-purple-500/20 px-6 py-3 rounded-xl group-hover:bg-purple-500/20 group-hover:border-purple-500/40 transition-all cursor-pointer">
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
                          <div className="relative p-8 rounded-2xl bg-gradient-to-br from-black/50 via-[#050505] to-black/50 border border-purple-500/20 hover:border-purple-500/40 transition-all duration-500 overflow-hidden group-hover:translate-y-[-2px] group-hover:shadow-[0_0_40px_rgba(168,85,247,0.2)]">
                            <div className="absolute inset-0 bg-gradient-to-br from-purple-900/15 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                            <div className="absolute -right-16 -top-16 w-56 h-56 bg-purple-500/10 rounded-full blur-[100px] opacity-0 group-hover:opacity-100 transition-all duration-500" />

                            <div className="relative z-10">
                              <div className="flex items-center gap-2 mb-4">
                                <span className="w-2 h-2 rounded-full bg-purple-500 animate-pulse shadow-[0_0_8px_#a855f7]" />
                                <p className="text-xs uppercase tracking-[0.2em] font-bold text-purple-300">Judge Access</p>
                              </div>
                              <h3 className="text-3xl font-bold text-white uppercase tracking-tight mb-3 group-hover:text-purple-400 transition-colors">
                                Judge Portal
                              </h3>
                              <p className="text-sm text-gray-400 font-mono leading-relaxed mb-6 group-hover:text-gray-300 transition-colors">
                                &gt; Access judging queue, score projects, and track your progress.
                              </p>

                              <div className="inline-flex items-center gap-3 text-sm font-mono text-white bg-purple-500/10 border border-purple-500/20 px-6 py-3 rounded-xl group-hover:bg-purple-500/20 group-hover:border-purple-500/40 transition-all cursor-pointer">
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
                            <div className="relative h-full p-8 rounded-2xl bg-gradient-to-br from-black/50 via-[#050505] to-black/50 border border-green-500/20 hover:border-green-500/40 transition-all duration-500 overflow-hidden group-hover:translate-y-[-2px] flex flex-col group-hover:shadow-[0_0_40px_rgba(34,197,94,0.2)]">

                              {/* Background gradients */}
                              <div className="absolute inset-0 bg-gradient-to-br from-green-900/15 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                              <div className="absolute -right-16 -top-16 w-56 h-56 bg-green-500/10 rounded-full blur-[100px] opacity-0 group-hover:opacity-100 transition-all duration-500" />

                              <div className="absolute top-0 right-0 p-6 opacity-20 group-hover:opacity-40 transition-opacity duration-300 transform group-hover:scale-110 group-hover:rotate-3">
                                <svg className="w-32 h-32 text-green-500" viewBox="0 0 24 24" fill="currentColor"><path d="M4 6h18V4H4c-1.1 0-2 .9-2 2v11H0v3h14v-3H4V6zm19 2h-6c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h6c.55 0 1-.45 1-1V9c0-.55-.45-1-1-1zm-1 9h-4v-7h4v7z" /></svg>
                              </div>

                              <div className="relative z-10">
                                <div className="flex items-center gap-2 mb-4">
                                  <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse shadow-[0_0_8px_#22c55e]" />
                                  <p className="text-xs uppercase tracking-[0.2em] font-bold text-green-400">Access Granted</p>
                                </div>

                                <h3 className="text-2xl font-bold text-white uppercase tracking-tight mb-3 group-hover:text-green-400 transition-colors">
                                  Member Terminal
                                </h3>
                                <p className="text-sm text-gray-400 font-mono leading-relaxed mb-8 group-hover:text-gray-300 transition-colors">
                                  &gt; Initialize connection to club resources, voting protocols, and event registries.
                                </p>

                                <div className="inline-flex items-center gap-3 text-sm font-mono text-white bg-green-500/10 border border-green-500/20 px-6 py-3 rounded-xl group-hover:bg-green-500/20 group-hover:border-green-500/40 transition-all cursor-pointer">
                                  <span className="group-hover:text-green-300 transition-colors font-bold tracking-wider">ENTER SYSTEM</span>
                                  <svg className="w-4 h-4 transform group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>
                                </div>
                              </div>
                            </div>
                          </Link>
                        ) : (
                          <div className="h-full">
                            <LinkStripeAccount />
                          </div>
                        )}

                        {/* HACKATHON REGISTRATIONS */}
                        {loadingRegs ? (
                          <div className="relative p-8 rounded-2xl bg-black/40 border border-white/5 flex items-center justify-center animate-pulse">
                            <span className="text-gray-500 text-sm font-mono">Loading hackathons...</span>
                          </div>
                        ) : activeRegs.length > 0 ? (
                          activeRegs.map((reg) => (
                            <Link key={reg.id} href={`/hackathons?id=${reg.hackathonId}&tab=SCHEDULE`} className="block group h-full">
                              <div className="relative h-full p-8 rounded-2xl bg-black/40 border border-[#00A8A8]/20 hover:border-[#00A8A8]/40 transition-all duration-300 flex flex-col rounded-lg hover:-translate-y-1 hover:shadow-[0_0_30px_rgba(0,168,168,0.15)] overflow-hidden">
                                <div className="absolute inset-0 bg-gradient-to-br from-[#00A8A8]/8 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

                                <div className="absolute top-0 right-0 p-6 opacity-10 group-hover:opacity-20 transition-opacity">
                                  <svg className="w-24 h-24 text-[#00A8A8]" viewBox="0 0 24 24" fill="currentColor"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z" /></svg>
                                </div>

                                <div className="flex items-center justify-between mb-4">
                                  <div className="flex items-center gap-2">
                                    <div className="p-2 rounded-lg bg-[#00A8A8]/10 border border-[#00A8A8]/30 group-hover:bg-[#00A8A8]/20 group-hover:border-[#00A8A8]/50 transition-all">
                                      <svg className="w-4 h-4 text-[#00A8A8]" viewBox="0 0 24 24" fill="currentColor"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z" /></svg>
                                    </div>
                                    <p className="text-xs font-bold uppercase tracking-widest text-[#00A8A8]">Hackathon</p>
                                  </div>
                                  {reg.team?.projects && reg.team.projects.length > 0 && (
                                    <div className="px-3 py-1 rounded-full bg-yellow-500/10 border border-yellow-500/20">
                                      <span className="text-[10px] font-bold uppercase tracking-wider text-yellow-400">Project Submited</span>
                                    </div>
                                  )}
                                </div>

                                <div className="space-y-2 mb-6 flex-1 relative z-10 mt-2">
                                  <div className="flex items-center justify-between">
                                    <span className="text-xs text-gray-500 uppercase tracking-widest font-mono">Status</span>
                                    <span className={`text-xs font-bold uppercase tracking-widest ${reg.registrationStatus === 'approved' || reg.registrationStatus === 'checked_in' ? 'text-green-500' :
                                      reg.registrationStatus === 'waitlisted' ? 'text-yellow-500' :
                                      reg.registrationStatus === 'rejected' ? 'text-red-500' :
                                      'text-gray-500'
                                    }`}>
                                      {reg.registrationStatus.replace(/_/g, ' ')}
                                    </span>
                                  </div>

                                  {reg.team ? (
                                    <>
                                      <div className="flex items-center justify-between">
                                        <span className="text-xs text-gray-500 uppercase tracking-widest font-mono">Team</span>
                                        <span className="text-xs text-white tracking-widest truncate max-w-[120px]">
                                          {reg.team.name}
                                        </span>
                                      </div>

                                      <div className="flex items-center justify-between">
                                        <span className="text-xs text-gray-500 uppercase tracking-widest font-mono">Project</span>
                                        <span className={`text-xs uppercase tracking-widest ${reg.team.projects && reg.team.projects.length > 0 ? 'text-[#00A8A8] font-bold' : 'text-gray-500'
                                        }`}>
                                          {reg.team.projects && reg.team.projects.length > 0 ? reg.team.projects[0]?.status : 'No Project'}
                                        </span>
                                      </div>
                                    </>
                                  ) : (
                                    <div className="flex items-center justify-between border-t border-white/5 pt-2 mt-2">
                                      <span className="text-xs text-gray-500 uppercase tracking-widest font-mono">Team</span>
                                      <span className="text-xs text-gray-500 uppercase tracking-widest">
                                        Solo / Unassigned
                                      </span>
                                    </div>
                                  )}
                                </div>

                                <div className="inline-flex items-center gap-2 px-4 py-2 rounded bg-black border border-white/10 self-start group-hover:border-[#00A8A8]/40 transition-colors relative z-10 cursor-pointer">
                                  <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-gray-500 group-hover:text-white transition-colors">Enter Portal</span>
                                  <svg className="w-3 h-3 text-[#00A8A8] transform group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>
                                </div>
                              </div>
                            </Link>
                          ))
                        ) : (
                          <Link href="/hackathons" className="block group h-full">
                            <div className="relative h-full p-8 rounded-2xl bg-black/40 border border-white/5 hover:border-white/20 transition-all duration-300 flex flex-col rounded-lg">
                              <div className="absolute top-0 right-0 p-6 opacity-5 group-hover:opacity-10 transition-opacity">
                                <svg className="w-20 h-20 text-gray-600" viewBox="0 0 24 24" fill="currentColor"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z" /></svg>
                              </div>

                              <p className="text-xs uppercase tracking-[0.2em] font-bold mb-3 text-gray-500 group-hover:text-gray-400 transition-colors">
                                Discover More
                              </p>
                              <h3 className="text-2xl font-bold text-white uppercase tracking-tight mb-2">
                                Browse Events
                              </h3>
                              <p className="text-sm text-gray-500 font-mono leading-relaxed flex-1">
                                You are not currently registered for any active events. Discover and join upcoming hackathons from the global registry.
                              </p>

                              <div className="inline-flex items-center gap-2 px-3 py-2 rounded border border-white/10 self-start group-hover:bg-white/5 transition-colors cursor-pointer">
                                <span className="text-[10px] font-mono text-gray-500 font-bold uppercase tracking-wider group-hover:text-white transition-colors">Explore Directory</span>
                                <svg className="w-3 h-3 text-gray-500 transform group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" /></svg>
                              </div>
                            </div>
                          </Link>
                        )}
                      </div>

                      {/* PAST HACKATHONS */}
                      {!loadingRegs && pastRegs.length > 0 && (
                        <div className="mt-12 animate-in fade-in slide-in-from-bottom-4 duration-500 delay-150">
                          <h2 className="text-2xl font-bold text-white mb-6 uppercase tracking-wider flex items-center gap-3">
                            <span className="w-2 h-2 rounded-full bg-gray-500" />
                            Past Events
                          </h2>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {pastRegs.map((reg) => (
                              <Link key={reg.id} href={`/hackathons?id=${reg.hackathonId}&tab=OVERVIEW`} className="block group h-full">
                                <div className="relative h-full p-6 rounded-2xl bg-black/40 border border-white/5 hover:border-white/20 transition-all duration-300 flex flex-col rounded-lg opacity-70 hover:opacity-100">
                                  <div className="absolute top-0 right-0 p-6 opacity-5 group-hover:opacity-10 transition-opacity">
                                    <svg className="w-16 h-16 text-gray-600" viewBox="0 0 24 24" fill="currentColor"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z" /></svg>
                                  </div>

                                  <p className="text-[10px] uppercase tracking-[0.2em] font-bold mb-2 text-gray-600">
                                    Attended Event
                                  </p>
                                  <h3 className="text-xl font-bold text-gray-400 uppercase tracking-tight mb-2 group-hover:text-white transition-colors truncate relative z-10">
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

                                  <div className="inline-flex items-center gap-2 px-3 py-2 rounded border border-white/5 self-start group-hover:bg-white/5 transition-colors relative z-10 cursor-pointer">
                                    <span className="text-[9px] font-mono text-gray-600 group-hover:text-gray-400 font-bold uppercase tracking-wider">View Details</span>
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