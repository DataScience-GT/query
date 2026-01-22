'use client';

import { useSession } from 'next-auth/react';
import { trpc } from '@/lib/trpc';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import Background from '@/components/Background';
import { Scanner } from '@yudiel/react-qr-scanner';

export default function ClubPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const utils = trpc.useUtils();

  const { data: userData } = trpc.user.me.useQuery(undefined, { enabled: !!session });
  const { data: memberStatus } = trpc.member.checkStatus.useQuery(undefined, { enabled: !!session });
  const { data: myStats } = trpc.events.myStats.useQuery(undefined, { enabled: !!session });
  const { data: myEvents } = trpc.events.myEvents.useQuery(undefined, { enabled: !!session });

  const [showScanner, setShowScanner] = useState(false);
  const [scanResult, setScanResult] = useState<{
    success: boolean;
    message: string;
    eventTitle?: string;
  } | null>(null);
  const [isPaused, setIsPaused] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [scannedCodes, setScannedCodes] = useState<Set<string>>(new Set());

  // Check-in mutation
  const checkInMutation = trpc.events.checkIn.useMutation({
    onSuccess: async (data) => {
      setScanResult({
        success: true,
        message: 'Check-in successful!',
        eventTitle: data.eventTitle,
      });
      setShowScanner(false);
      setIsProcessing(false);

      // Optimistically update stats before refetch
      utils.events.myStats.setData(undefined, (old) => {
        if (!old) return { totalEvents: 1 };
        return {
          totalEvents: old.totalEvents + 1,
        };
      });

      // Background refresh
      utils.events.myEvents.invalidate();
      utils.events.myStats.invalidate();
    },
    onError: (error) => {
      setScanResult({
        success: false,
        message: error.message || 'Check-in failed',
      });
      setShowScanner(false);
      setIsProcessing(false);
    },
  });

  // Auth & Member Guard
  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/');
    } else if (status === 'authenticated' && memberStatus && !memberStatus.isMember) {
      router.push('/dashboard');
    }
  }, [status, memberStatus, router]);

  // Reset scanned codes when scanner closes
  useEffect(() => {
    if (!showScanner) {
      setScannedCodes(new Set());
    }
  }, [showScanner]);

  const handleScan = async (detectedCodes: { rawValue: string }[]) => {
    if (isProcessing || !detectedCodes || detectedCodes.length === 0) return;

    const scannedData = detectedCodes[0].rawValue;

    // Prevent scanning the same code multiple times
    if (scannedCodes.has(scannedData)) return;

    setScannedCodes(prev => new Set(prev).add(scannedData));
    setIsPaused(true);
    setIsProcessing(true);

    try {
      await checkInMutation.mutateAsync({ qrCode: scannedData });
    } catch (error) {
      console.error('Check-in error:', error);
    }
  };

  const handleError = (error: unknown) => {
    console.error('Scanner error:', error);
  };

  if (status === 'loading' || !memberStatus) {
    return (
      <div className="min-h-screen bg-[#050505] flex items-center justify-center font-mono text-[#00A8A8] animate-pulse uppercase tracking-[0.5em]">
        Verifying_Access...
      </div>
    );
  }

  if (!session || !memberStatus.isMember) return null;

  const firstName = userData?.name?.split(' ')[0] || 'Member';

  return (
    <div className="relative min-h-screen bg-[#050505] text-gray-400 font-sans selection:bg-[#00A8A8]/30 overflow-x-hidden">
      <Background className="fixed inset-0 z-0 opacity-[0.03]" />

      {/* QR SCANNER MODAL */}
      {showScanner && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/95 backdrop-blur-md"
            onClick={() => {
              if (!isProcessing) {
                setShowScanner(false);
                setIsPaused(false);
              }
            }}
          />
          <div className="relative w-full max-w-md bg-[#0a0a0a] border border-[#00A8A8]/30 rounded-2xl p-6 shadow-[0_0_50px_rgba(0,168,168,0.3)] animate-in zoom-in-95 duration-300">
            <div className="flex justify-between items-center mb-6">
              <div>
                <h3 className="text-xl font-black text-white italic uppercase tracking-tighter">QR_Scanner</h3>
                <p className="text-[9px] font-mono text-[#00A8A8] uppercase tracking-widest">Event_Check_In_System</p>
              </div>
              <button
                onClick={() => {
                  if (!isProcessing) {
                    setShowScanner(false);
                    setIsPaused(false);
                  }
                }}
                disabled={isProcessing}
                className="text-gray-500 hover:text-white transition-colors text-[10px] uppercase tracking-widest disabled:opacity-50"
              >
                [ Close ]
              </button>
            </div>

            {/* Camera Feed */}
            <div className="relative rounded-xl overflow-hidden border-2 border-[#00A8A8]/30">
              {isProcessing && (
                <div className="absolute inset-0 bg-black/80 z-10 flex items-center justify-center">
                  <div className="text-center">
                    <div className="w-12 h-12 border-4 border-[#00A8A8] border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                    <p className="text-[10px] text-[#00A8A8] uppercase tracking-widest font-mono">
                      Verifying...
                    </p>
                  </div>
                </div>
              )}
              <Scanner
                onScan={handleScan}
                onError={handleError}
                paused={isPaused || isProcessing}
                constraints={{
                  facingMode: 'environment',
                }}
                formats={['qr_code']}
                components={{
                  torch: true,
                  finder: true,
                }}
                styles={{
                  container: {
                    width: '100%',
                    height: '350px',
                  },
                }}
                scanDelay={500}
              />
            </div>

            <div className="mt-4 bg-[#00A8A8]/10 border border-[#00A8A8]/30 rounded-lg p-4">
              <p className="text-[9px] text-[#00A8A8] uppercase tracking-widest font-bold mb-2">Instructions:</p>
              <ul className="text-[8px] text-gray-500 space-y-1 font-mono">
                <li>• Hold phone steady over QR code</li>
                <li>• Ensure good lighting conditions</li>
                <li>• Scan happens automatically</li>
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* SCAN RESULT MODAL */}
      {scanResult && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/95 backdrop-blur-md"
            onClick={() => setScanResult(null)}
          />
          <div className="relative w-full max-w-md bg-[#0a0a0a] border border-[#00A8A8]/30 rounded-2xl p-8 shadow-[0_0_50px_rgba(0,168,168,0.3)] animate-in zoom-in-95 duration-300">
            <div className="text-center space-y-8">
              <div className={`inline-block p-6 rounded-full ${scanResult.success
                ? 'bg-[#00A8A8]/10 border border-[#00A8A8]/20'
                : 'bg-red-500/10 border border-red-500/20'
                }`}>
                {scanResult.success ? (
                  <svg className="w-12 h-12 text-[#00A8A8]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  <svg className="w-12 h-12 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                )}
              </div>

              <div>
                <h3 className={`text-3xl font-black uppercase tracking-tighter mb-2 ${scanResult.success ? 'text-white' : 'text-red-400'
                  }`}>
                  {scanResult.success ? 'Check_In_Success' : 'Check_In_Failed'}
                </h3>
                <p className="text-[10px] font-mono text-[#00A8A8] uppercase tracking-[0.3em]">
                  {scanResult.success ? 'Identity_Verified' : 'Access_Denied'}
                </p>
              </div>

              {scanResult.success && scanResult.eventTitle && (
                <div className="space-y-3">
                  <div className="bg-white/[0.02] border border-white/5 rounded-xl p-6">
                    <p className="text-[9px] text-gray-600 uppercase tracking-[0.4em] mb-3 font-mono">Event_Payload:</p>
                    <p className="text-xl text-white font-black uppercase italic tracking-tight">{scanResult.eventTitle}</p>
                  </div>
                </div>
              )}

              {!scanResult.success && (
                <div className="bg-red-500/5 border border-red-500/20 rounded-xl p-6">
                  <p className="text-[9px] text-red-500 uppercase tracking-[0.4em] mb-3 font-mono">Error_Code:</p>
                  <p className="text-sm text-red-300 font-mono italic"> &gt; "{scanResult.message}"</p>
                </div>
              )}

              <button
                onClick={() => setScanResult(null)}
                className={`w-full px-8 py-5 font-black uppercase text-xs tracking-[0.4em] transition-all rounded-lg ${scanResult.success
                  ? 'bg-[#00A8A8] text-black hover:bg-[#00A8A8]/80 shadow-[0_0_20px_rgba(0,168,168,0.3)]'
                  : 'bg-red-500/10 border border-red-500/30 text-red-500 hover:bg-red-500/20'
                  }`}
              >
                TERMINATE_OVERLAY
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MAIN CONTENT */}
      <main className="relative z-10 max-w-5xl mx-auto px-6 py-24 min-h-screen flex flex-col items-center justify-center">
        <div className="w-full space-y-16 text-center">

          {/* Welcome Header */}
          <div className="space-y-6">
            <div className="inline-block px-5 py-2 border border-[#00A8A8]/20 rounded-full bg-[#00A8A8]/5 mb-6">
              <p className="text-[10px] font-mono text-[#00A8A8] uppercase tracking-[0.5em] font-black">
                System_Access_Granted
              </p>
            </div>

            <h1 className="text-7xl lg:text-9xl font-black text-white uppercase tracking-tighter leading-[0.85]">
              Welcome,<br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#00A8A8] via-[#00A8A8]/80 to-white/20 italic">
                {firstName}
              </span>
            </h1>

            <p className="text-sm text-gray-500 font-mono max-w-lg mx-auto uppercase tracking-widest leading-relaxed">
              Operational access to DSGT protocols is active. Aggregate attendance data and sync with the neural network.
            </p>
          </div>

          {/* Action Card */}
          <div className="max-w-md mx-auto bg-[#0A0A0A]/80 border border-white/5 rounded-3xl p-10 backdrop-blur-xl shadow-[0_20px_50px_rgba(0,0,0,0.5)] group hover:border-[#00A8A8]/20 transition-all duration-500">
            <div className="mb-8">
              <div className="w-24 h-24 mx-auto bg-[#00A8A8]/5 rounded-full flex items-center justify-center border border-[#00A8A8]/20 mb-6 group-hover:scale-110 group-hover:bg-[#00A8A8]/10 transition-all duration-500 shadow-[0_0_30px_rgba(0,168,168,0.05)]">
                <svg className="w-10 h-10 text-[#00A8A8]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h2M4 8h16M4 12h16M4 16h16" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                </svg>
              </div>
              <h2 className="text-2xl font-black text-white uppercase tracking-tighter mb-2 italic">
                Event_Sync
              </h2>
              <p className="text-[10px] text-gray-600 uppercase tracking-[0.5em] font-mono">
                Initiate_Visual_Check_In
              </p>
            </div>

            <button
              onClick={() => setShowScanner(true)}
              disabled={showScanner}
              className="w-full px-8 py-6 bg-[#00A8A8] text-black font-black text-xs uppercase tracking-[0.4em] hover:bg-white hover:text-black transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_10px_30px_rgba(0,168,168,0.2)] rounded-xl"
            >
              SCAN_DATA_NODE
            </button>

            <div className="mt-8 pt-8 border-t border-white/5 flex justify-between items-center">
              <span className="text-[9px] font-mono text-gray-700 uppercase tracking-[0.4em]">LOGGED_SESSIONS:</span>
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-[#00A8A8] animate-pulse" />
                <span className="text-xl font-black text-white tabular-nums">{myStats?.totalEvents ?? 0}</span>
              </div>
            </div>
          </div>

          {/* Recent Events */}
          {myEvents && myEvents.length > 0 && (
            <div className="max-w-md mx-auto space-y-6">
              <div className="flex items-center justify-between px-2">
                <h3 className="text-[10px] font-black text-gray-600 uppercase tracking-[0.5em] font-mono">
                  Activity_Log
                </h3>
                <div className="h-[1px] flex-1 mx-6 bg-white/5" />
              </div>

              <div className="space-y-3">
                {myEvents.slice(0, 3).map((checkIn) => (
                  <div
                    key={checkIn.id}
                    className="bg-white/[0.02] border border-white/5 rounded-2xl p-6 text-left hover:border-[#00A8A8]/30 hover:bg-white/[0.04] transition-all duration-300 group/item"
                  >
                    <div className="flex justify-between items-start mb-3">
                      <h4 className="text-lg font-black text-white uppercase italic tracking-tight group-hover/item:text-[#00A8A8] transition-colors">{checkIn.event.title}</h4>
                      <div className="p-2 rounded-lg bg-[#00A8A8]/10 text-[#00A8A8]">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                      </div>
                    </div>
                    <div className="flex justify-between items-center border-t border-white/5 pt-4">
                      <div className="flex items-center gap-2">
                        <svg className="w-3 h-3 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                        <p className="text-[9px] text-gray-600 font-mono uppercase tracking-widest font-black">
                          {new Date(checkIn.checkedInAt).toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric'
                          })}
                        </p>
                      </div>
                      {checkIn.event.location && (
                        <div className="flex items-center gap-2">
                          <svg className="w-3 h-3 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                          </svg>
                          <p className="text-[9px] text-gray-600 font-mono uppercase tracking-widest">{checkIn.event.location}</p>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Quick Actions */}
          <div className="flex flex-col md:flex-row gap-4 max-w-md mx-auto">
            <button
              onClick={() => router.push('/dashboard')}
              className="flex-1 px-8 py-4 border border-white/10 text-gray-500 font-black text-[10px] uppercase tracking-[0.4em] hover:bg-white/5 hover:text-white transition-all rounded-xl"
            >
              &lt; Return_To_Nexus
            </button>
            <button
              onClick={() => router.push('/club/events')}
              className="flex-1 px-8 py-4 border border-white/10 text-gray-700 font-black text-[10px] uppercase tracking-[0.4em] transition-all rounded-xl opacity-50 cursor-not-allowed"
            >
              Event_Directory
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}