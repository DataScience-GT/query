'use client';

import { useSession, signOut } from 'next-auth/react';
import { trpc } from '@/lib/trpc';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import Image from 'next/image';
import Background from '@/components/Background';
import Link from 'next/link';
import LinkStripeAccount from '@/components/LinkStripeAccount';
import ProfileForm from '@/components/profile/ProfileForm';
import { GlassCard } from '@mawtech/glass-ui';

export default function Dashboard() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [mode, setMode] = useState<'DASHBOARD' | 'PROFILE'>('DASHBOARD');

  const { data: userData } = trpc.user.me.useQuery(undefined, { enabled: !!session });
  const { data: memberStatus } = trpc.member.checkStatus.useQuery(undefined, { enabled: !!session });
  const { data: adminStatus } = trpc.admin.isAdmin.useQuery(undefined, { enabled: !!session });

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/');
  }, [status, router]);

  if (status === 'loading') return (
    <div className="min-h-screen bg-[#050505] flex items-center justify-center font-mono text-[#00A8A8] animate-pulse uppercase tracking-[0.5em]">
      Syncing Identity...
    </div>
  );

  if (!session) return null;

  return (
    <div className="relative min-h-screen bg-[#050505] text-gray-400 font-sans selection:bg-[#00A8A8]/30 overflow-x-hidden">
      <Background className="fixed inset-0 z-0 opacity-[0.03]" />

      <main className="relative z-10 max-w-7xl mx-auto grid lg:grid-cols-12 gap-8 py-20 px-6">

        {/* SIDEBAR */}
        <div className="lg:col-span-4 space-y-4">
          <div className="bg-black/60 backdrop-blur-md border border-white/5 p-6 rounded-lg shadow-2xl relative overflow-hidden">

            {/* User Profile Header */}
            <div className="flex items-center gap-5 border-b border-white/5 pb-8 mb-8">
              <div className="relative group">
                <div className="absolute -inset-0.5 bg-gradient-to-r from-[#00A8A8] to-blue-600 rounded-full opacity-50 blur group-hover:opacity-75 transition duration-1000 group-hover:duration-200"></div>
                <Image
                  src={userData?.image || '/avatar-placeholder.png'}
                  alt="Avatar"
                  width={56}
                  height={56}
                  className="relative rounded-full border border-black bg-black object-cover h-14 w-14 transition-all duration-300"
                />
              </div>
              <div className="space-y-1">
                <p className="text-white font-bold uppercase tracking-tight text-base font-mono">{userData?.name || 'GUEST'}</p>
                <div className="flex items-center gap-2">
                  <div className={`h-2 w-2 rounded-full ${adminStatus?.isAdmin ? 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]' : 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]'}`}></div>
                  <p className="text-gray-500 text-xs uppercase tracking-widest font-bold">
                    {adminStatus?.isAdmin ? 'ADMIN' : memberStatus?.isMember ? 'MEMBER' : 'GUEST'}
                  </p>
                </div>
              </div>
            </div>

            {/* Navigation */}
            <nav className="space-y-1">
              <button
                onClick={() => setMode('DASHBOARD')}
                className={`w-full group flex items-center justify-between px-4 py-3 rounded-lg text-xs font-bold tracking-widest transition-all duration-200 border border-transparent
                  ${mode === 'DASHBOARD'
                    ? 'bg-white/[0.03] text-white border-white/5 shadow-[inset_0_0_20px_rgba(255,255,255,0.02)]'
                    : 'text-gray-500 hover:text-white hover:bg-white/[0.02]'
                  }`}
              >
                <span>OVERVIEW</span>
                <span className={`h-1.5 w-1.5 rounded-full transition-all ${mode === 'DASHBOARD' ? 'bg-[#00A8A8]' : 'bg-transparent group-hover:bg-white/20'}`}></span>
              </button>

              <button
                onClick={() => setMode('PROFILE')}
                className={`w-full group flex items-center justify-between px-4 py-3 rounded-lg text-xs font-bold tracking-widest transition-all duration-200 border border-transparent
                  ${mode === 'PROFILE'
                    ? 'bg-white/[0.03] text-white border-white/5 shadow-[inset_0_0_20px_rgba(255,255,255,0.02)]'
                    : 'text-gray-500 hover:text-white hover:bg-white/[0.02]'
                  }`}
              >
                <span>VIEW DOSSIER</span>
                <span className={`h-1.5 w-1.5 rounded-full transition-all ${mode === 'PROFILE' ? 'bg-[#00A8A8]' : 'bg-transparent group-hover:bg-white/20'}`}></span>
              </button>
            </nav>

            <div className="mt-8 pt-8 border-t border-white/5">
              <button
                onClick={() => signOut({ callbackUrl: '/' })}
                className="w-full py-3 px-4 rounded-lg bg-red-500/[0.05] border border-red-500/10 text-red-500/60 hover:bg-red-500/10 hover:text-red-400 hover:border-red-500/30 transition-all font-mono text-[10px] uppercase tracking-[0.2em] flex items-center justify-center gap-2 group"
              >
                <span className="w-1.5 h-1.5 bg-red-500/40 rounded-full group-hover:bg-red-500 transition-colors"></span>
                Terminate Session
              </button>
            </div>
          </div>
        </div>

        {/* MAIN CONTENT */}
        <div className="lg:col-span-8 flex flex-col">
          <div className="bg-black/60 backdrop-blur-md border border-white/5 p-8 rounded-lg shadow-2xl min-h-[600px] flex flex-col relative overflow-hidden">

            {/* Decorative Top Line */}
            <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-[#00A8A8]/20 to-transparent"></div>

            <div className="flex justify-between items-end mb-12 relative z-10">
              <div>
                <p className="text-xs text-gray-600 uppercase tracking-[0.4em] mb-2 font-mono">System View</p>
                <h2 className="text-3xl md:text-4xl font-black text-white italic uppercase tracking-tighter">
                  {mode === 'PROFILE' ? 'Identity Dossier' : 'Central Operations'}
                </h2>
              </div>
              <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-white/[0.03] border border-white/5">
                <div className={`h-1.5 w-1.5 rounded-full animate-pulse ${memberStatus?.isMember || adminStatus?.isAdmin ? 'bg-[#00A8A8]' : 'bg-yellow-500'}`} />
                <span className="text-[9px] font-mono text-gray-400 uppercase tracking-wider">
                  {mode === 'PROFILE' ? 'EDITING' : 'ACTIVE'}
                </span>
              </div>
            </div>

            <div className={`flex-1 flex flex-col relative z-10 ${mode === 'DASHBOARD' ? 'justify-center' : ''}`}>

              {mode === 'PROFILE' ? (
                /* PROFILE EDITOR VIEW */
                <div className="animate-in fade-in zoom-in-95 duration-300">
                  <ProfileForm user={{
                    id: userData?.id || '',
                    name: userData?.name,
                    email: userData?.email || '',
                    image: userData?.image,
                    bio: userData?.bio
                  }} />
                </div>
              ) : (
                /* DASHBOARD TILES VIEW */
                <div className="grid grid-cols-1 gap-6 animate-in fade-in slide-in-from-bottom-8 duration-500">

                  {adminStatus?.isAdmin ? (
                    /* ADMIN VIEW */
                    <Link href="/admin" className="block group">
                      <div className="relative p-8 bg-black/40 border border-white/5 hover:border-[#00A8A8]/30 transition-all duration-300 overflow-hidden group-hover:translate-y-[-2px] rounded-lg">
                        <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                          <svg className="w-24 h-24 text-white" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm0 14.2c-2.5 0-4.71-1.28-6-3.22.03-1.99 4-3.08 6-3.08 1.99 0 5.97 1.09 6 3.08-1.29 1.94-3.5 3.22-6 3.22z" /></svg>
                        </div>

                        <p className="text-xs uppercase tracking-[0.2em] font-bold mb-3 text-[#00A8A8]">
                          Node Access Level 5
                        </p>
                        <h3 className="text-3xl font-bold text-white uppercase tracking-tight mb-2 group-hover:text-[#00A8A8] transition-colors">
                          Admin Control Panel
                        </h3>
                        <p className="text-base text-gray-500 font-mono">
                          Manage hackathons, view judge queues, and configure system parameters.
                        </p>

                        <div className="mt-8 flex items-center gap-2 text-[10px] font-mono text-[#00A8A8] opacity-60 group-hover:opacity-100 transition-opacity">
                          <span>INITIATE SESSION</span>
                          <svg className="w-3 h-3 transform group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" /></svg>
                        </div>
                      </div>
                    </Link>
                  ) : (
                    /* MEMBER VIEW */
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {memberStatus?.isMember ? (
                        <Link href="/club" className="block group h-full">
                          <div className="relative h-full p-8 bg-black/40 border border-white/5 hover:border-green-500/50 transition-all duration-300 overflow-hidden group-hover:translate-y-[-2px] flex flex-col group-hover:shadow-[0_0_30px_rgba(34,197,94,0.15)] rounded-lg">

                            {/* Background Gradients */}
                            <div className="absolute inset-0 bg-gradient-to-br from-green-900/10 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                            <div className="absolute -right-10 -top-10 w-40 h-40 bg-green-500/10 rounded-full blur-3xl group-hover:bg-green-500/20 transition-all duration-500" />

                            <div className="absolute top-0 right-0 p-5 opacity-20 group-hover:opacity-40 transition-opacity duration-300 transform group-hover:scale-105 group-hover:rotate-3">
                              <svg className="w-24 h-24 text-green-500" viewBox="0 0 24 24" fill="currentColor"><path d="M4 6h18V4H4c-1.1 0-2 .9-2 2v11H0v3h14v-3H4V6zm19 2h-6c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h6c.55 0 1-.45 1-1V9c0-.55-.45-1-1-1zm-1 9h-4v-7h4v7z" /></svg>
                            </div>

                            <div className="relative z-10">
                              <div className="flex items-center gap-2 mb-3">
                                <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                                <p className="text-xs uppercase tracking-[0.2em] font-bold text-green-500">
                                  Access Granted
                                </p>
                              </div>

                              <h3 className="text-2xl font-bold text-white uppercase tracking-tight mb-2 group-hover:text-green-400 transition-colors">
                                Member Terminal
                              </h3>
                              <p className="text-sm text-gray-500 font-mono mb-8 group-hover:text-gray-400 transition-colors">
                                &gt; Initialize connection to club resources, voting protocols, and event registries.
                              </p>

                              <div className="inline-flex items-center gap-3 text-xs font-mono text-white bg-green-500/10 border border-green-500/20 px-4 py-2.5 rounded group-hover:bg-green-500/20 group-hover:border-green-500/40 transition-all">
                                <span className="group-hover:text-green-300 transition-colors">ENTER SYSTEM</span>
                                <svg className="w-3 h-3 transform group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>
                              </div>
                            </div>
                          </div>
                        </Link>
                      ) : (
                        <div className="h-full">
                          <LinkStripeAccount />
                        </div>
                      )}

                      <div className="relative h-full p-8 bg-black/40 border border-yellow-500/10 hover:border-yellow-500/20 transition-all duration-300 flex flex-col rounded-lg">
                        <div className="absolute top-0 right-0 p-4 opacity-5">
                          <svg className="w-20 h-20 text-yellow-500" viewBox="0 0 24 24" fill="currentColor"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z" /></svg>
                        </div>

                        <p className="text-xs uppercase tracking-[0.2em] font-bold mb-3 text-yellow-600">
                          Hacklytics Node
                        </p>
                        <h3 className="text-2xl font-bold text-white uppercase tracking-tight mb-2">
                          Hacklytics
                        </h3>
                        <p className="text-sm text-yellow-500/60 font-mono mb-6 flex-1">
                          System under construction. Integration pending.
                        </p>

                        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded bg-yellow-500/10 border border-yellow-500/20 self-start">
                          <div className="h-2 w-2 rounded-full bg-yellow-500 animate-pulse"></div>
                          <span className="text-[10px] font-mono text-yellow-500 font-bold uppercase tracking-wider">Work in Progress</span>
                        </div>
                      </div>
                    </div>
                  )}

                </div>
              )}

            </div>
          </div>
        </div>
      </main>
    </div>
  );
}