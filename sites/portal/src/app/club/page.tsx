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
  const { data: userData } = trpc.user.me.useQuery(undefined, { enabled: !!session });
  const { data: memberStatus } = trpc.member.checkStatus.useQuery(undefined, { enabled: !!session });

  const [showScanner, setShowScanner] = useState(false);
  const [scanResult, setScanResult] = useState<string | null>(null);
  const [isPaused, setIsPaused] = useState(false);

  // Auth & Member Guard
  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/');
    } else if (status === 'authenticated' && memberStatus && !memberStatus.isMember) {
      router.push('/dashboard');
    }
  }, [status, memberStatus, router]);

  const handleScan = async (detectedCodes: any[]) => {
    if (detectedCodes && detectedCodes.length > 0) {
      const scannedData = detectedCodes[0].rawValue;
      setIsPaused(true);

      try {
        // TODO: Replace with your actual API endpoint
        // const response = await fetch(`/api/verify-qr?code=${encodeURIComponent(scannedData)}`);
        // const result = await response.json();

        // For now, just show the scanned result
        setScanResult(scannedData);
        setShowScanner(false);

      } catch (error) {
        console.error('Error processing QR code:', error);
        alert('Failed to process QR code. Please try again.');
      } finally {
        setIsPaused(false);
      }
    }
  };

  const handleError = (error: any) => {
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
              setShowScanner(false);
              setIsPaused(false);
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
                  setShowScanner(false);
                  setIsPaused(false);
                }}
                className="text-gray-500 hover:text-white transition-colors text-[10px] uppercase tracking-widest"
              >
                [ Close ]
              </button>
            </div>

            {/* Camera Feed */}
            <div className="relative rounded-xl overflow-hidden border-2 border-[#00A8A8]/30">
              <Scanner
                onScan={handleScan}
                onError={handleError}
                paused={isPaused}
                constraints={{
                  facingMode: 'environment',
                }}
                formats={[
                  'qr_code',
                  'micro_qr_code',
                  'rm_qr_code',
                ]}
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
                scanDelay={2000}
              />
            </div>

            <div className="mt-4 bg-[#00A8A8]/10 border border-[#00A8A8]/30 rounded-lg p-4">
              <p className="text-[9px] text-[#00A8A8] uppercase tracking-widest font-bold mb-2">Instructions:</p>
              <ul className="text-[8px] text-gray-500 space-y-1 font-mono">
                <li>• Hold phone steady over QR code</li>
                <li>• Ensure good lighting conditions</li>
                <li>• Scan will happen automatically</li>
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
          <div className="relative w-full max-w-md bg-[#0a0a0a] border border-[#00A8A8]/30 rounded-2xl p-6 shadow-[0_0_50px_rgba(0,168,168,0.3)] animate-in zoom-in-95 duration-300">
            <div className="text-center space-y-6">
              <div className="inline-block p-4 bg-[#00A8A8]/10 rounded-full">
                <div className="text-5xl">✓</div>
              </div>

              <div>
                <h3 className="text-2xl font-black text-white uppercase tracking-tighter mb-2">Scan_Success</h3>
                <p className="text-[9px] font-mono text-[#00A8A8] uppercase tracking-widest">QR_Code_Detected</p>
              </div>

              <div className="bg-black/60 border border-white/5 rounded-lg p-4">
                <p className="text-[9px] text-gray-500 uppercase tracking-widest mb-2">Scanned_Data:</p>
                <p className="text-xs text-white font-mono break-all">{scanResult}</p>
              </div>

              <button
                onClick={() => setScanResult(null)}
                className="w-full px-8 py-3 bg-[#00A8A8] text-black font-bold uppercase text-[10px] tracking-widest hover:bg-[#00A8A8]/80 transition-all"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MAIN CONTENT */}
      <main className="relative z-10 max-w-4xl mx-auto px-6 py-20 min-h-screen flex flex-col items-center justify-center">
        <div className="w-full space-y-12 text-center">

          {/* Welcome Header */}
          <div className="space-y-4">
            <div className="inline-block px-4 py-2 border border-[#00A8A8]/20 rounded-full bg-[#00A8A8]/5 mb-4">
              <p className="text-[9px] font-mono text-[#00A8A8] uppercase tracking-widest">
                Member_Access_Granted
              </p>
            </div>

            <h1 className="text-6xl lg:text-8xl font-black text-white uppercase tracking-tighter leading-none">
              Welcome,<br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#00A8A8] to-[#00A8A8]/50 italic">
                {firstName}
              </span>
            </h1>

            <p className="text-sm text-gray-500 font-mono max-w-md mx-auto">
              You now have full access to DSGT club operations. Scan QR codes at events to check in and earn points.
            </p>
          </div>

          {/* Action Card */}
          <div className="max-w-md mx-auto bg-black/60 border border-white/5 rounded-2xl p-8 backdrop-blur-md">
            <div className="mb-6">
              <div className="w-20 h-20 mx-auto bg-[#00A8A8]/10 rounded-full flex items-center justify-center border border-[#00A8A8]/30 mb-4">
                <span className="text-4xl">📷</span>
              </div>
              <h2 className="text-xl font-black text-white uppercase tracking-tight mb-2">
                Event_Check_In
              </h2>
              <p className="text-[10px] text-gray-500 uppercase tracking-widest">
                Scan QR codes at club events
              </p>
            </div>

            <button
              onClick={() => setShowScanner(true)}
              disabled={showScanner}
              className="w-full px-8 py-5 bg-[#00A8A8] text-black font-black text-sm uppercase tracking-widest hover:bg-[#00A8A8]/80 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_0_30px_rgba(0,168,168,0.2)] relative group"
            >
              <span className="flex items-center justify-center gap-3">
                Scan_QR_Code
                <span className="text-xl group-hover:scale-110 transition-transform">→</span>
              </span>
            </button>

            <div className="mt-6 pt-6 border-t border-white/5 space-y-2">
              <div className="flex justify-between text-[9px] font-mono">
                <span className="text-gray-600">EVENTS_ATTENDED:</span>
                <span className="text-[#00A8A8]">0</span>
              </div>
              <div className="flex justify-between text-[9px] font-mono">
                <span className="text-gray-600">POINTS_EARNED:</span>
                <span className="text-[#00A8A8]">0</span>
              </div>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="grid grid-cols-2 gap-4 max-w-md mx-auto">
            <button
              onClick={() => router.push('/dashboard')}
              className="px-6 py-4 border border-white/10 text-white font-bold text-[10px] uppercase tracking-widest hover:bg-white/5 transition-all"
            >
              ← Dashboard
            </button>
            <button
              onClick={() => router.push('/club/events')}
              className="px-6 py-4 border border-white/10 text-white font-bold text-[10px] uppercase tracking-widest hover:bg-white/5 transition-all opacity-50 cursor-not-allowed"
            >
              View Events
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}