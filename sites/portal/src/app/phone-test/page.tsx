'use client';

import { useState } from 'react';
import Background from '@/components/Background';
import { Scanner } from '@yudiel/react-qr-scanner';

export default function PhoneTestPage() {
  const [showScanner, setShowScanner] = useState(false);
  const [scanResult, setScanResult] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [scannedCodes, setScannedCodes] = useState<Set<string>>(new Set());

  const handleScan = async (detectedCodes: any[]) => {
    if (!detectedCodes || detectedCodes.length === 0 || isProcessing) return;

    const value = detectedCodes[0].rawValue;
    if (scannedCodes.has(value)) return;

    setScannedCodes(prev => new Set(prev).add(value));
    setIsProcessing(true);

    // Fake delay to simulate server work
    setTimeout(() => {
      setScanResult(value);
      setIsProcessing(false);
      setShowScanner(false);
    }, 800);
  };

  return (
    <div className="relative min-h-screen bg-[#050505] text-gray-400 overflow-hidden">
      <Background className="fixed inset-0 z-0 opacity-[0.03]" />

      {/* Scanner Modal */}
      {showScanner && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/95"
            onClick={() => !isProcessing && setShowScanner(false)}
          />
          <div className="relative w-full max-w-md bg-[#0a0a0a] border border-[#00A8A8]/30 rounded-2xl p-6">
            <h3 className="text-xl text-white font-black uppercase mb-4">
              QR Scanner (Phone Test)
            </h3>

            <div className="relative rounded-xl overflow-hidden border-2 border-[#00A8A8]/30">
              {isProcessing && (
                <div className="absolute inset-0 bg-black/80 z-10 flex items-center justify-center">
                  <div className="w-12 h-12 border-4 border-[#00A8A8] border-t-transparent rounded-full animate-spin" />
                </div>
              )}

              <Scanner
                onScan={handleScan}
                paused={isProcessing}
                constraints={{ facingMode: 'environment' }}
                formats={['qr_code']}
                styles={{ container: { width: '100%', height: '350px' } }}
                scanDelay={500}
              />
            </div>

            <p className="text-[10px] text-[#00A8A8] uppercase mt-4 font-mono">
              Camera should open on phone
            </p>
          </div>
        </div>
      )}

      {/* Result Modal */}
      {scanResult && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/95"
            onClick={() => setScanResult(null)}
          />
          <div className="relative w-full max-w-md bg-[#0a0a0a] border border-[#00A8A8]/30 rounded-2xl p-6 text-center">
            <h3 className="text-2xl font-black text-white uppercase mb-4">
              Scan Success
            </h3>
            <p className="text-[10px] font-mono text-gray-400 break-all">
              {scanResult}
            </p>

            <button
              onClick={() => setScanResult(null)}
              className="mt-6 w-full px-6 py-3 bg-[#00A8A8] text-black font-bold uppercase text-[10px]"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* Main */}
      <main className="relative z-10 min-h-screen flex items-center justify-center px-6">
        <div className="text-center space-y-8">
          <h1 className="text-5xl font-black text-white uppercase tracking-tight">
            Phone Scanner Test
          </h1>

          <p className="text-sm text-gray-500 font-mono max-w-sm mx-auto">
            This page removes auth, DB, and tRPC.
            Only camera + UI behavior is tested.
          </p>

          <button
            onClick={() => setShowScanner(true)}
            className="px-10 py-5 bg-[#00A8A8] text-black font-black uppercase tracking-widest shadow-lg"
          >
            Open Scanner
          </button>
        </div>
      </main>
    </div>
  );
}
