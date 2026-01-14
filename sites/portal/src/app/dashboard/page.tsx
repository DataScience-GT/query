'use client';

import { useSession, signOut } from 'next-auth/react';
import { trpc } from '@/lib/trpc';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import Image from 'next/image';
import Background from '@/components/Background';
import Link from 'next/link';

export default function Dashboard() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [mode, setMode] = useState<'PROFILE'>('PROFILE');

  // --- DATA QUERIES ---
  const { data: userData } = trpc.user.me.useQuery(undefined, { enabled: !!session });
  const { data: memberStatus } = trpc.member.checkStatus.useQuery(undefined, { enabled: !!session });
  const { data: adminStatus } = trpc.admin.isAdmin.useQuery(undefined, { enabled: !!session });

  // --- AUTH GUARD ---
  useEffect(() => {
    if (status === 'unauthenticated') router.push('/');
  }, [status, router]);

  if (status === 'loading') return (
    <div className="min-h-screen bg-[#050505] flex items-center justify-center font-mono text-[#00A8A8] animate-pulse uppercase tracking-[0.5em]">
      Syncing_Identity...
    </div>
  );

  if (!session) return null;

  return (
    <div className="relative min-h-screen bg-[#050505] text-gray-400 font-sans selection:bg-green-500/30 overflow-x-hidden">
      <Background className="fixed inset-0 z-0 opacity-[0.03]" />

      <main className="relative z-10 max-w-6xl mx-auto grid lg:grid-cols-12 gap-8 py-20 px-6">

        {/* --- SIDEBAR --- */}
        <div className="lg:col-span-4 space-y-6">
          <div className="bg-black/60 border border-white/5 rounded-xl p-6 font-mono text-[11px] space-y-6 backdrop-blur-md">
            <div className="flex items-center gap-4 border-b border-white/5 pb-6">
              <Image
                src={userData?.image || '/avatar-placeholder.png'}
                alt="P" width={48} height={48}
                className="rounded-full border border-white/10 grayscale object-cover h-12 w-12"
              />
              <div>
                <p className="text-white font-bold uppercase tracking-tight text-sm">{userData?.name || 'GUEST'}</p>
                <p className="text-gray-500 text-[9px] uppercase tracking-widest italic font-bold">
                   {adminStatus?.isAdmin ? 'ADMIN_NODE' : memberStatus?.isMember ? 'MEMBER_NODE' : 'GUEST_NODE'}
                </p>
              </div>
            </div>

            <nav className="space-y-2">
              <button
                onClick={() => setMode('PROFILE')}
                className="w-full px-4 py-3 border border-white/20 text-white bg-white/5 text-left text-[9px] font-bold tracking-widest hover:bg-white/10 transition-all"
              >
                {">"} VIEW_DOSSIER
              </button>

              {adminStatus?.isAdmin && (
                <button
                  onClick={() => router.push('/admin')}
                  className="w-full px-4 py-3 border border-red-500/20 bg-red-500/5 text-red-500 text-left transition-all text-[9px] font-bold tracking-widest hover:bg-red-500/10 hover:border-red-500"
                >
                  {">"} ADMIN_CONTROL_PANEL
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

        {/* --- MAIN DISPLAY --- */}
        <div className="lg:col-span-8 space-y-6">
          <div className="p-8 rounded-xl border border-white/10 bg-black/40 backdrop-blur-md">

            <div className="flex justify-between items-start mb-12">
              <h2 className="text-4xl font-black text-white italic uppercase tracking-tighter">DOSSIER</h2>
              <div className={`h-2 w-2 rounded-full animate-pulse shadow-[0_0_10px] ${memberStatus?.isMember || adminStatus?.isAdmin ? 'bg-green-500 shadow-green-500' : 'bg-gray-700 shadow-transparent'}`} />
            </div>

            <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4">

              {/* Identity Metadata Box */}
              <div className="bg-black/40 border border-white/5 p-8 rounded-xl space-y-6">
                <div>
                  <p className="text-[9px] text-gray-500 uppercase tracking-widest mb-2">Identity_Metadata</p>
                  <p className="text-2xl font-bold text-white tracking-tight">{userData?.name || 'UNKNOWN'}</p>
                  <p className="text-[10px] text-gray-600 font-mono mt-1">{userData?.email}</p>
                </div>

                <div className="border-t border-white/5 pt-6">
                  <p className="text-[9px] text-gray-500 uppercase tracking-widest mb-3">Public_Bio</p>
                  <p className="text-xs text-white leading-relaxed italic font-mono">
                    "{userData?.bio || "No public bio transmission found."}"
                  </p>
                </div>
              </div>

              {/* --- STATUS TILES --- */}
              <div className="grid grid-cols-1 gap-4">

                {adminStatus?.isAdmin ? (
                  /* ADMIN VIEW: ONLY SHOW ADMIN LINK */
                  <Link href="/admin" className="block group">
                    <div className="p-6 rounded-xl border border-green-500 bg-green-500/10 shadow-[0_0_15px_rgba(34,197,94,0.3)] animate-pulse transition-all hover:bg-green-500/20 hover:scale-[1.01] active:scale-[0.99]">
                      <p className="text-[10px] uppercase tracking-widest font-black mb-2 text-green-400">
                        Admin_Access
                      </p>
                      <p className="text-[11px] font-mono font-bold text-white uppercase tracking-wider">
                        ● ONLINE_PRIVILEGED_SESSION
                      </p>
                      <p className="text-[8px] text-green-500/60 mt-2 uppercase font-mono group-hover:text-green-400">
                        Click_to_Enter_Control_Panel
                      </p>
                    </div>
                  </Link>
                ) : (
                  /* MEMBER VIEW: SHOW MEMBER & HACKLYTICS */
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {memberStatus?.isMember ? (
                      <Link href="/club" className="block group">
                        <div className="p-6 rounded-xl border border-green-500 bg-green-500/10 shadow-[0_0_15px_rgba(34,197,94,0.3)] animate-pulse transition-all hover:bg-green-500/20 hover:scale-[1.02]">
                          <p className="text-[10px] uppercase tracking-widest font-black mb-2 text-green-400">
                            Member_Access
                          </p>
                          <p className="text-[11px] font-mono font-bold text-white">
                            ● ONLINE
                          </p>
                          <p className="text-[8px] text-green-500/60 mt-2 uppercase font-mono group-hover:text-green-400">
                            Click_to_Enter_Terminal
                          </p>
                        </div>
                      </Link>
                    ) : (
                      <div className="p-6 rounded-xl border border-white/5 bg-white/[0.02] opacity-40">
                        <p className="text-[10px] text-gray-600 uppercase tracking-widest font-black mb-2">Member_Access</p>
                        <p className="text-[11px] font-mono text-gray-800 font-bold uppercase">○ Offline</p>
                      </div>
                    )}

                    <div className="p-6 rounded-xl border border-white/5 bg-white/[0.02] opacity-40">
                      <p className="text-[10px] text-gray-600 uppercase tracking-widest font-black mb-2">Hacklytics</p>
                      <p className="text-[11px] font-mono text-gray-800 font-bold uppercase">○ Restricted</p>
                    </div>
                  </div>
                )}

              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}