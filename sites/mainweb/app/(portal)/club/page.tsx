'use client';

import { useSession } from 'next-auth/react';
import { trpc } from '@/lib/trpc';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import Background from '@/components/portal/Background';
import { LiquidGlass } from '@/components/portal/LiquidGlass';
import { LoadingScreen } from '@/components/portal/LoadingScreen';
import { QRScannerModal } from '@/components/portal/QRScannerModal';
import { ScanResultModal } from '@/components/portal/ScanResultModal';
import { QRCodeSVG } from 'qrcode.react';

export default function ClubPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const utils = trpc.useUtils();

  const { data: userData } = trpc.user.me.useQuery(undefined, { enabled: !!session });
  const { data: memberStatus } = trpc.member.checkStatus.useQuery(undefined, { enabled: !!session });
  const { data: myStats } = trpc.events.myStats.useQuery(undefined, { enabled: !!session });
  const { data: myEvents } = trpc.events.myEvents.useQuery(undefined, { enabled: !!session });

  // Fetch active hackathon registration for QR code generation
  const { data: myRegs } = trpc.hackathon.myRegistrations.useQuery(undefined, { enabled: !!session });
  const activeReg = myRegs?.[0]; // Assuming the first one is the active one for the club portal view

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
      router.push('/login');
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

    const scannedData = detectedCodes[0]?.rawValue;
    if (!scannedData) return;

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
    return <LoadingScreen message="Verifying Access..." />;
  }

  if (!session || !memberStatus.isMember) return null;

  const firstName = userData?.name?.split(' ')[0] || 'Member';

  return (
    <div className="relative min-h-screen bg-[#050505] text-gray-400 font-sans selection:bg-[#00A8A8]/30 overflow-x-hidden">
      <Background className="fixed inset-0 z-0 opacity-[0.03]" />

      {/* QR SCANNER MODAL */}
      {showScanner && (
        <QRScannerModal
          onClose={() => {
            setShowScanner(false);
            setIsPaused(false);
          }}
          onScan={handleScan}
          onError={handleError}
          isProcessing={isProcessing}
          isPaused={isPaused}
        />
      )}

      {/* SCAN RESULT MODAL */}
      {scanResult && (
        <ScanResultModal
          success={scanResult.success}
          message={scanResult.message}
          eventTitle={scanResult.eventTitle}
          onClose={() => setScanResult(null)}
        />
      )}

      {/* MAIN CONTENT */}
      <main className="relative z-10 max-w-5xl mx-auto px-6 py-24 min-h-screen flex flex-col items-center justify-center">
        <div className="w-full space-y-16 text-center">

          {/* Welcome Header */}
          <div className="space-y-6">
            <div className="inline-block px-5 py-2 border border-[#00A8A8]/20 rounded-full bg-[#00A8A8]/5 mb-6">
              <p className="text-[10px] font-mono text-[#00A8A8] uppercase tracking-[0.5em] font-black">
                System Access Granted
              </p>
            </div>

            <h1 className="text-7xl lg:text-9xl font-black text-white uppercase tracking-tighter leading-[0.85]">
              Welcome,<br />
              <span className="text-[#00A8A8] italic">
                {firstName}
              </span>
            </h1>

            <p className="text-sm text-gray-500 font-mono max-w-lg mx-auto uppercase tracking-widest leading-relaxed">
              Operational access to DSGT protocols is active. Aggregate attendance data and sync with the neural network.
            </p>
          </div>

          {/* Action Card */}
          <LiquidGlass className="p-10 rounded-3xl shadow-[0_20px_50px_rgba(0,0,0,0.5)] group hover:border-[#00A8A8]/20 transition-all duration-500 max-w-md mx-auto">
            <button
              onClick={() => setShowScanner(true)}
              disabled={showScanner}
              className="w-full px-8 py-4 mb-8 border border-[#00A8A8]/30 text-[#00A8A8] font-black text-sm uppercase tracking-[0.2em] hover:bg-[#00A8A8]/10 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl"
            >
              SCAN ROOM CODE (CAMERA)
            </button>

            <div className="mb-6 relative">
              <div className="absolute inset-0 bg-white blur-xl opacity-20 rounded-3xl" />
              {activeReg ? (
                <div className="relative p-6 bg-white rounded-3xl shadow-[0_0_40px_rgba(0,168,168,0.3)] flex flex-col items-center">
                  <QRCodeSVG
                    value={JSON.stringify({ type: 'CHECK_IN', hackathonId: activeReg.hackathonId, participantId: activeReg.id })}
                    size={220}
                    level="H"
                    fgColor="#050505"
                    bgColor="#ffffff"
                  />
                </div>
              ) : (
                <div className="relative p-6 bg-white/5 border border-white/10 rounded-3xl h-[268px] flex flex-col items-center justify-center">
                  <p className="text-xs font-mono text-gray-500 uppercase text-center px-4">Register for an event to generate your check-in pass.</p>
                </div>
              )}
            </div>

            <div className="text-center mb-8">
              <h2 className="text-2xl font-black text-white uppercase tracking-tighter mb-1 italic">
                Event Pass
              </h2>
              <p className="text-[10px] text-[#00A8A8] uppercase tracking-[0.5em] font-mono">
                Present to Admin
              </p>
            </div>



            <div className="mt-8 pt-8 border-t border-white/5 flex justify-between items-center">
              <span className="text-[9px] font-mono text-gray-700 uppercase tracking-[0.4em]">LOGGED SESSIONS:</span>
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-[#00A8A8] animate-pulse" />
                <span className="text-xl font-black text-white tabular-nums">{myStats?.totalEvents ?? 0}</span>
              </div>
            </div>
          </LiquidGlass>

          {/* Recent Events */}
          {myEvents && myEvents.length > 0 && (
            <div className="max-w-md mx-auto space-y-6">
              <div className="flex items-center justify-between px-2">
                <h3 className="text-[10px] font-black text-gray-600 uppercase tracking-[0.5em] font-mono">
                  Activity Log
                </h3>
                <div className="h-[1px] flex-1 mx-6 bg-white/5" />
              </div>

              <div className="space-y-3">
                {myEvents.slice(0, 3).map((checkIn) => (
                  <LiquidGlass
                    key={checkIn.id}
                    className="p-6 text-left rounded-2xl hover:border-[#00A8A8]/30 transition-all duration-300 group/item"
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
                  </LiquidGlass>
                ))}
              </div>
            </div>
          )}

          {/* Quick Actions */}
          <div className="flex flex-col md:flex-row gap-6 max-w-lg mx-auto">
            <button
              onClick={() => router.push('/dashboard')}
              className="flex-1 px-8 py-5 border border-white/10 text-gray-400 font-bold text-sm uppercase tracking-widest hover:bg-white/5 hover:text-white transition-all rounded-xl font-mono"
            >
              &lt; Return To Nexus
            </button>
            <button
              onClick={() => router.push('/club/events')}
              className="flex-1 px-8 py-5 border border-white/10 text-gray-600 font-bold text-sm uppercase tracking-widest transition-all rounded-xl opacity-50 cursor-not-allowed font-mono"
            >
              Event Directory
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}