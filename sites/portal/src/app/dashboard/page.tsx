'use client';

import { useSession, signOut } from 'next-auth/react';
import { trpc } from '@/lib/trpc';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useMemo } from 'react';
import Image from 'next/image';
import Background from '@/components/Background';

type DashboardMode = 'CLUB' | 'HACKLYTICS' | 'PROFILE';

export default function Dashboard() {
  const { data: session, status } = useSession();
  const router = useRouter();

  // --- STATE ---
  const [mode, setMode] = useState<DashboardMode>('CLUB');

  // --- DATA ---
  const { data: userData } = trpc.user.me.useQuery(undefined, { enabled: !!session });
  const { data: memberStatus } = trpc.member.checkStatus.useQuery(undefined, { enabled: !!session });
  const { data: adminStatus } = trpc.admin.isAdmin.useQuery(undefined, { enabled: !!session });

  // --- EFFECTS ---

  // Auth Guard
  useEffect(() => {
    if (status === 'unauthenticated') router.push('/');
  }, [status, router]);

  const accessLevel = useMemo(() => {
    if (adminStatus?.isAdmin) return `ADMIN_${adminStatus.role?.toUpperCase()}`;
    if (memberStatus?.isMember) return 'MEMBER_ACTIVE';
    return 'GUEST_NODE';
  }, [adminStatus, memberStatus]);

  if (status === 'loading') return (
    <div className="min-h-screen bg-[#050505] flex items-center justify-center font-mono text-[#00A8A8] animate-pulse uppercase tracking-[0.5em]">
      Syncing_Identity...
    </div>
  );

  if (!session) return null;

  return (
    <div className="relative min-h-screen bg-[#050505] text-gray-400 font-sans selection:bg-[#00A8A8]/30 overflow-x-hidden">
      <Background className="fixed inset-0 z-0 opacity-[0.03]" />

      {/* --- MAIN DASHBOARD UI --- */}
      <main className="relative z-10 max-w-6xl mx-auto grid lg:grid-cols-12 gap-8 py-20 px-6">

        {/* SIDEBAR NAVIGATION */}
        <div className="lg:col-span-4 space-y-6">
          <div className="bg-black/60 border border-white/5 rounded-xl p-6 font-mono text-[11px] space-y-6 backdrop-blur-md border-b-2 border-b-[#00A8A8]/20">
            <div className="flex items-center gap-4 border-b border-white/5 pb-6">
              <Image
                src={userData?.image || '/avatar-placeholder.png'}
                alt="P" width={48} height={48}
                className="rounded-full border border-[#00A8A8]/30 grayscale object-cover h-12 w-12"
              />
              <div>
                <p className="text-white font-bold uppercase tracking-tight text-sm">{userData?.name || 'GUEST'}</p>
                <p className="text-[#00A8A8] text-[9px] uppercase tracking-widest italic">{accessLevel}</p>
              </div>
            </div>

            <nav className="space-y-2">
              <button
                onClick={() => setMode('CLUB')}
                className={`w-full px-4 py-3 border text-left transition-all text-[9px] font-bold tracking-widest ${mode === 'CLUB' ? 'bg-[#00A8A8]/10 border-[#00A8A8] text-[#00A8A8]' : 'border-white/5 hover:bg-white/5'}`}
              >
                {">"} CLUB_OPERATIONS
              </button>

              <button
                onClick={() => setMode('PROFILE')}
                className={`w-full px-4 py-3 border text-left transition-all text-[9px] font-bold tracking-widest ${mode === 'PROFILE' ? 'bg-white/10 border-white text-white' : 'border-white/5 hover:bg-white/5'}`}
              >
                {">"} VIEW_DOSSIER
              </button>

              <button
                onClick={() => setMode('HACKLYTICS')}
                className={`w-full px-4 py-3 border text-left transition-all text-[9px] font-bold tracking-widest ${mode === 'HACKLYTICS' ? 'bg-amber-500/10 border-amber-500 text-amber-500' : 'border-white/5 hover:bg-white/5'}`}
              >
                {">"} LAB_RESEARCH
              </button>

              {/* ADMIN ACCESS - Only visible to admins */}
              {adminStatus?.isAdmin && (
                <button
                  onClick={() => router.push('/admin')}
                  className="w-full px-4 py-3 border border-red-500/20 bg-red-500/5 text-red-500 text-left transition-all text-[9px] font-bold tracking-widest hover:bg-red-500/10 hover:border-red-500 relative group"
                >
                  <span className="flex items-center justify-between">
                    {">"} ADMIN_CONTROL_PANEL
                    <span className="text-[7px] opacity-50 group-hover:opacity-100 transition-opacity">
                      {adminStatus.role?.toUpperCase()}
                    </span>
                  </span>
                  <div className="absolute inset-0 border border-red-500/0 group-hover:border-red-500/30 rounded transition-all" />
                </button>
              )}
            </nav>
          </div>

          <button
            onClick={() => signOut({ callbackUrl: '/' })}
            className="w-full py-4 border border-red-500/10 text-red-500/40 hover:bg-red-900/20 hover:text-red-500 transition-all font-mono text-[9px] uppercase tracking-[0.3em]"
          >
            Terminate_Session
          </button>
        </div>

        {/* DATA DISPLAY AREA */}
        <div className="lg:col-span-8 space-y-6">
          <div className={`p-8 rounded-xl border backdrop-blur-md relative transition-all duration-500 ${mode === 'CLUB' ? 'border-[#00A8A8]/20 bg-[#00A8A8]/[0.02]' : mode === 'PROFILE' ? 'border-white/10 bg-white/[0.01]' : 'border-amber-500/20 bg-amber-500/[0.02]'}`}>

            <div className="flex justify-between items-start mb-12">
              <h2 className="text-4xl font-black text-white italic uppercase tracking-tighter">{mode}</h2>
              <div className={`h-2 w-2 rounded-full animate-pulse ${mode === 'CLUB' ? 'bg-[#00A8A8]' : mode === 'PROFILE' ? 'bg-white' : 'bg-amber-500'}`} />
            </div>

            {/* --- PROFILE MODE --- */}
            {mode === 'PROFILE' && (
              <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4">
                <div className="bg-black/40 border border-white/5 p-8 rounded-xl space-y-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-[9px] text-gray-500 uppercase tracking-widest mb-2">Identity_Status</p>
                      <p className="text-2xl font-bold text-white">{userData?.name || 'UNKNOWN'}</p>
                      <p className="text-[10px] text-gray-600 font-mono mt-1">{userData?.email}</p>
                    </div>
                    <div className={`px-4 py-2 border rounded-lg ${
                      adminStatus?.isAdmin
                        ? 'border-red-500/30 bg-red-500/10 text-red-500'
                        : memberStatus?.isMember
                        ? 'border-[#00A8A8]/30 bg-[#00A8A8]/10 text-[#00A8A8]'
                        : 'border-gray-700/30 bg-gray-700/10 text-gray-500'
                    }`}>
                      <p className="text-[9px] uppercase tracking-widest font-bold">
                        {adminStatus?.isAdmin ? 'ADMIN' : memberStatus?.isMember ? 'MEMBER' : 'GUEST'}
                      </p>
                    </div>
                  </div>

                  <div className="border-t border-white/5 pt-6">
                    <p className="text-[9px] text-gray-500 uppercase tracking-widest mb-3">Public_Bio</p>
                    <p className="text-xs text-white leading-relaxed italic font-mono">
                      "{userData?.bio || "No public bio transmission found."}"
                    </p>
                  </div>
                </div>

                {/* Access Summary */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="bg-black/40 border border-white/5 p-4 rounded-xl text-center">
                    <p className="text-[9px] text-gray-600 uppercase tracking-widest mb-2">Club_Access</p>
                    <p className={`text-2xl font-black ${memberStatus?.isMember ? 'text-[#00A8A8]' : 'text-gray-700'}`}>
                      {memberStatus?.isMember ? '✓' : '✗'}
                    </p>
                  </div>
                  <div className="bg-black/40 border border-white/5 p-4 rounded-xl text-center">
                    <p className="text-[9px] text-gray-600 uppercase tracking-widest mb-2">Admin_Access</p>
                    <p className={`text-2xl font-black ${adminStatus?.isAdmin ? 'text-red-500' : 'text-gray-700'}`}>
                      {adminStatus?.isAdmin ? '✓' : '✗'}
                    </p>
                  </div>
                  <div className="bg-black/40 border border-white/5 p-4 rounded-xl text-center">
                    <p className="text-[9px] text-gray-600 uppercase tracking-widest mb-2">Hacklytics_Access</p>
                    <p className="text-2xl font-black text-gray-700">✗</p>
                  </div>
                </div>
              </div>
            )}

            {/* --- CLUB MODE --- */}
            {mode === 'CLUB' && (
              <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4">
                {memberStatus?.isMember ? (
                  <div className="py-20 text-center space-y-8">
                    <div>
                      <div className="inline-block mb-4">
                        <div className="h-16 w-16 border-2 border-[#00A8A8] border-t-transparent rounded-full animate-spin mx-auto" />
                      </div>
                      <p className="text-[#00A8A8] font-mono text-[10px] tracking-widest">ACCESS_GRANTED</p>
                      <p className="text-gray-600 text-[9px] mt-2 uppercase">Club Membership Verified</p>
                    </div>
                    <button
                      onClick={() => router.push('/club')}
                      className="px-12 py-4 bg-[#00A8A8] text-black font-bold uppercase text-[11px] tracking-widest hover:bg-[#00A8A8]/80 transition-all inline-flex items-center gap-3 group"
                    >
                      Enter_Club_Terminal
                      <span className="group-hover:translate-x-1 transition-transform">→</span>
                    </button>
                  </div>
                ) : (
                  <div className="py-20 text-center space-y-8">
                    <div className="inline-block p-8 border border-white/5 rounded-xl bg-black/40">
                      <div className="h-16 w-16 border-2 border-gray-700/30 rounded-full flex items-center justify-center mx-auto mb-4">
                        <span className="text-3xl text-gray-700">🔒</span>
                      </div>
                      <p className="text-gray-600 font-mono text-[10px] tracking-widest uppercase mb-2">Access_Denied</p>
                      <p className="text-[9px] text-gray-700 max-w-xs mx-auto">
                        Club membership required. Contact admins to request access.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* --- HACKLYTICS MODE --- */}
            {mode === 'HACKLYTICS' && (
              <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4">
                <div className="text-center py-20">
                  <p className="text-amber-500 font-mono text-sm uppercase tracking-widest mb-4">Hackathon_System_Coming_Soon</p>
                  <p className="text-gray-600 text-xs">Browse hackathons, register, form teams, and submit projects.</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}