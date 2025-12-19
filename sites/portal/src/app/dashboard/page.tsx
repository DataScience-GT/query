'use client';

import { useSession, signOut } from 'next-auth/react';
import { trpc } from '@/lib/trpc';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useMemo } from 'react';

type DashboardMode = 'CLUB' | 'HACKLYTICS';

export default function Dashboard() {
  const { data: session, status } = useSession();
  const router = useRouter();

  // UI States
  const [hasEntered, setHasEntered] = useState(false);
  const [mode, setMode] = useState<DashboardMode>('CLUB');
  const [isCheckingIn, setIsCheckingIn] = useState(false);
  const [checkInStatus, setCheckInStatus] = useState<'IDLE' | 'SCANNING' | 'SUCCESS'>('IDLE');

  // Extract Last Name from Google Session
  const userIdentifier = useMemo(() => {
    if (!session?.user?.name) return "GUEST";
    const names = session.user.name.trim().split(' ');
    return names.length > 1 ? names[names.length - 1].toUpperCase() : names[0].toUpperCase();
  }, [session]);

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/');
  }, [status, router]);

  // Simulated Check-in Logic
  const handleCheckIn = () => {
    setCheckInStatus('SCANNING');
    setTimeout(() => {
      setCheckInStatus('SUCCESS');
      setTimeout(() => {
        setCheckInStatus('IDLE');
        setIsCheckingIn(false);
      }, 3000);
    }, 1500);
  };

  if (status === 'loading') {
    return (
      <div className="min-h-screen bg-[#050505] flex items-center justify-center font-mono">
        <div className="text-indigo-500 animate-pulse uppercase tracking-[0.5em]">Syncing Identity...</div>
      </div>
    );
  }

  if (!session) return null;

  // --- WELCOME SCREEN VIEW ---
  if (!hasEntered) {
    return (
      <div className="relative min-h-screen bg-[#050505] text-gray-400 flex items-center justify-center overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(79,70,229,0.08)_0%,transparent_70%)]" />
        <div className="relative z-10 text-center space-y-8 animate-in fade-in zoom-in duration-1000">
          <div className="space-y-2">
            <p className="text-indigo-500 font-mono text-[10px] uppercase tracking-[0.5em]">Identity Verified</p>
            <h1 className="text-6xl md:text-8xl font-black text-white tracking-tighter uppercase italic leading-tight">
              Welcome, <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-indigo-800 not-italic">
                {session.user?.name?.split(' ')[0] || 'User'}.
              </span>
            </h1>
          </div>
          <button
            onClick={() => setHasEntered(true)}
            className="px-12 py-4 bg-white text-black font-black text-[11px] uppercase tracking-[0.3em] rounded-sm hover:bg-indigo-400 transition-all hover:scale-105 active:scale-95 shadow-[0_0_30px_rgba(255,255,255,0.1)]"
          >
            Initialize Dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen bg-[#050505] text-gray-400 font-sans selection:bg-indigo-500/30 overflow-x-hidden flex items-center justify-center">

      <div className="absolute inset-0 z-0 opacity-30">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:40px_40px]" />
      </div>

      <main className="relative z-10 max-w-6xl mx-auto px-6 w-full grid grid-cols-1 lg:grid-cols-12 gap-8 items-start py-20">

        <div className="lg:col-span-4 space-y-6">
          <div className="bg-black/60 border border-white/5 rounded-lg p-6 font-mono text-[11px] space-y-4 shadow-2xl backdrop-blur-sm">
            <div className="flex items-center gap-3 border-b border-white/5 pb-4">
              <img src={session.user?.image || ""} className="w-10 h-10 rounded-full border border-indigo-500/30 grayscale" alt="" />
              <div>
                <p className="text-white uppercase font-bold tracking-tight">{session.user?.name}</p>
                <p className="text-gray-600 text-[9px] uppercase tracking-widest">Access_Level: Member</p>
              </div>
            </div>

            <div className="space-y-2 pt-2">
              <p className="text-[9px] text-gray-600 uppercase tracking-widest mb-3">Switch Module</p>
              <button
                onClick={() => { setMode('CLUB'); setIsCheckingIn(false); }}
                className={`w-full text-left px-4 py-3 rounded border transition-all ${mode === 'CLUB' ? 'bg-indigo-500/10 border-indigo-500/50 text-indigo-400' : 'border-white/5 hover:bg-white/5 text-gray-500'}`}
              >
                01. DSGT_CLUB_NODE
              </button>
              <button
                onClick={() => { setMode('HACKLYTICS'); setIsCheckingIn(false); }}
                className={`w-full text-left px-4 py-3 rounded border transition-all ${mode === 'HACKLYTICS' ? 'bg-amber-500/10 border-amber-500/50 text-amber-500' : 'border-white/5 hover:bg-white/5 text-gray-500'}`}
              >
                02. HACKLYTICS_2026
              </button>
            </div>
          </div>

          <button
            onClick={() => signOut({ callbackUrl: '/' })}
            className="w-full py-3 border border-red-500/20 text-red-500/50 font-mono text-[10px] uppercase tracking-[0.2em] rounded-sm hover:bg-red-500 hover:text-white transition-all"
          >
            Terminate_Session
          </button>
        </div>

        <div className="lg:col-span-8 space-y-6 animate-in fade-in slide-in-from-right-4 duration-500">

          <div className={`p-8 rounded-xl border ${mode === 'CLUB' ? 'border-indigo-500/20 bg-indigo-500/[0.02]' : 'border-amber-500/20 bg-amber-500/[0.02]'} backdrop-blur-md relative overflow-hidden`}>

            <div className="flex justify-between items-start mb-8">
              <div>
                <h2 className="text-3xl font-black text-white uppercase tracking-tighter italic leading-none">
                  {mode === 'CLUB' ? 'Club Ecosystem' : 'Hacklytics Core'}
                </h2>
                <p className="text-[10px] font-mono text-gray-500 uppercase tracking-[0.3em] mt-1">
                  Status // {isCheckingIn ? 'CHECK_IN_MODE' : `System_Node_${mode}`}
                </p>
              </div>
              <div className={`h-2 w-2 rounded-full animate-ping ${mode === 'CLUB' ? 'bg-indigo-500' : 'bg-amber-500'}`} />
            </div>

            {mode === 'CLUB' && (
              <div className="space-y-6">
                {!isCheckingIn ? (
                  <>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="p-4 bg-black/40 border border-white/5 rounded">
                        <p className="text-gray-600 text-[9px] uppercase font-mono tracking-widest">Global Rank</p>
                        <p className="text-2xl text-white font-bold italic">#14</p>
                      </div>
                      <div className="p-4 bg-black/40 border border-white/5 rounded">
                        <p className="text-gray-600 text-[9px] uppercase font-mono tracking-widest">Active Credits</p>
                        <p className="text-2xl text-white font-bold italic">450XP</p>
                      </div>
                    </div>

                    <div className="p-6 border border-indigo-500/30 bg-indigo-500/5 rounded-lg flex flex-col items-center text-center space-y-4">
                      <p className="text-xs text-indigo-300 font-mono italic tracking-tighter">Present at a general body meeting?</p>
                      <button
                        onClick={() => setIsCheckingIn(true)}
                        className="w-full py-4 bg-indigo-600 text-white font-black text-[11px] uppercase tracking-[0.3em] rounded-sm hover:bg-indigo-500 transition-all shadow-[0_0_20px_rgba(79,70,229,0.2)]"
                      >
                        Launch Check-In Protocol
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="space-y-4 animate-in fade-in zoom-in-95 duration-300">
                    <div className="bg-black/60 border border-indigo-500/50 p-8 rounded-lg flex flex-col items-center justify-center min-h-[200px] text-center">
                      {checkInStatus === 'IDLE' && (
                        <>
                          <p className="text-indigo-400 font-mono text-sm mb-6 uppercase tracking-widest">Awaiting Proximity Confirmation</p>
                          <button
                            onClick={handleCheckIn}
                            className="px-8 py-3 border border-white text-white font-bold text-[10px] uppercase tracking-widest hover:bg-white hover:text-black transition-all"
                          >
                            Confirm Presence
                          </button>
                        </>
                      )}
                      {checkInStatus === 'SCANNING' && (
                        <div className="space-y-4">
                          <div className="w-12 h-12 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto" />
                          <p className="text-indigo-500 font-mono text-[10px] animate-pulse uppercase tracking-[0.4em]">Verifying Node Location...</p>
                        </div>
                      )}
                      {checkInStatus === 'SUCCESS' && (
                        <div className="space-y-2">
                          <div className="text-emerald-500 text-4xl mb-2">✓</div>
                          <p className="text-emerald-500 font-mono text-xs uppercase tracking-widest font-bold">Attendance Logged</p>
                          <p className="text-gray-600 text-[10px] font-mono">NODE: GT_MEETING_RM_04</p>
                        </div>
                      )}
                    </div>
                    <button onClick={() => setIsCheckingIn(false)} className="text-[9px] font-mono text-gray-600 hover:text-white uppercase tracking-widest mx-auto block">{"<"} Return to Dashboard</button>
                  </div>
                )}
              </div>
            )}

            {mode === 'HACKLYTICS' && (
              <div className="space-y-6">
                <div className="p-6 bg-amber-500/5 border border-amber-500/20 rounded-lg">
                  <p className="text-amber-500 font-mono text-xs uppercase tracking-widest mb-4 italic">Handshake Pending</p>
                  <p className="text-sm text-gray-400 leading-relaxed">
                    Your registration for Hacklytics 2026 is currently in the <span className="text-white">validation queue</span>.
                    Node verification in progress.
                  </p>
                </div>
                <button className="w-full py-4 border border-amber-500/30 text-amber-500 uppercase font-black text-[10px] tracking-widest hover:bg-amber-500 hover:text-black transition-all">
                  Sync Registration Status
                </button>
              </div>
            )}
          </div>

          <div className="bg-black/80 border border-white/5 p-4 rounded-lg font-mono text-[10px] text-gray-600">
            <span className="text-indigo-500">TERMINAL:</span> {isCheckingIn ? 'INITIALIZING_LOC_CHECK' : `MODE_ACTIVE: ${mode}`} // TIME: {new Date().toLocaleTimeString()}
          </div>
        </div>
      </main>

      {/* FOOTER REFLECTS LAST NAME ARCHIVE */}
      <footer className="fixed bottom-6 left-12 right-12 flex justify-between items-center opacity-20 pointer-events-none text-[8px] font-mono uppercase tracking-[0.5em]">
        <div>{userIdentifier}_ARCHIVE // V4.0</div>
        <div>GT_PORTAL_ENCRYPTED</div>
      </footer>
    </div>
  );
}