'use client';

import React, { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { LiquidGlass } from '@/components/portal/LiquidGlass';
import { QRScannerModal } from '@/components/portal/QRScannerModal';
import { ScanResultModal } from '@/components/portal/ScanResultModal';

export function ScannerTab({ hackathonId }: { hackathonId: string }) {
    const [selectedEventId, setSelectedEventId] = useState<string>('');
    const [showScanner, setShowScanner] = useState(false);
    const [scanResult, setScanResult] = useState<{ success: boolean; message: string; eventTitle?: string } | null>(null);
    const [isPaused, setIsPaused] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);

    const { data: events, isLoading } = trpc.hackathon.getEvents.useQuery({ hackathonId });
    const scanPassMutation = trpc.hackathon.scanParticipantPass.useMutation();

    const handleScan = async (detectedCodes: { rawValue: string }[]) => {
        if (isProcessing || !detectedCodes || detectedCodes.length === 0) return;

        const scannedData = detectedCodes[0]?.rawValue;
        if (!scannedData) return;

        setIsPaused(true);
        setIsProcessing(true);

        try {
            const payload = JSON.parse(scannedData) as { type?: string; participantId?: string; hackathonId?: string };
            if (payload.type !== 'CHECK_IN' || !payload.participantId || !payload.hackathonId) {
                throw new Error("Invalid format. Expected a Hackathon Event Pass.");
            }

            const res = await scanPassMutation.mutateAsync({
                hackathonId: payload.hackathonId,
                eventId: selectedEventId,
                participantId: payload.participantId
            });

            setScanResult({
                success: true,
                message: res.message,
                eventTitle: events?.find((e: NonNullable<typeof events>[number]) => e.id === selectedEventId)?.name || 'Hackathon Event',
            });
            setShowScanner(false);

        } catch (error: unknown) {
            console.error('Check-in error:', error);
            setScanResult({
                success: false,
                message: error instanceof Error ? error.message : 'Check-in failed',
            });
            setShowScanner(false);
        } finally {
            setIsProcessing(false);
        }
    };

    return (
        <div className="flex flex-col items-center animate-in fade-in zoom-in-95 duration-300 h-full">
            {showScanner && (
                <QRScannerModal
                    onClose={() => { setShowScanner(false); setIsPaused(false); }}
                    onScan={handleScan}
                    onError={(e: unknown) => console.error(e)}
                    isProcessing={isProcessing}
                    isPaused={isPaused}
                />
            )}

            {scanResult && (
                <ScanResultModal
                    success={scanResult.success}
                    message={scanResult.message}
                    eventTitle={scanResult.eventTitle}
                    onClose={() => setScanResult(null)}
                />
            )}

            <LiquidGlass className="p-8 w-full max-w-md mt-4 md:mt-12 rounded-3xl border-t-4 border-t-[#00A8A8]/50 shadow-[0_20px_50px_rgba(0,168,168,0.1)]">
                <div className="mb-8 text-center">
                    <h2 className="text-2xl font-black text-white uppercase tracking-tight">Access Control</h2>
                    <p className="text-xs text-gray-500 font-mono mt-2">Select an event and scan badges.</p>
                </div>

                <div className="space-y-4 mb-8">
                    <label className="text-[10px] font-mono text-[#00A8A8] uppercase tracking-widest font-bold">Target Event</label>
                    {isLoading ? (
                        <div className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-gray-500 text-sm font-mono animate-pulse">Loading Events...</div>
                    ) : (
                        <select
                            className="w-full bg-[#00A8A8]/5 border border-[#00A8A8]/30 rounded-xl px-4 py-4 text-white focus:outline-none focus:border-[#00A8A8] transition-colors font-medium text-lg shadow-[inset_0_0_20px_rgba(0,168,168,0.05)]"
                            value={selectedEventId}
                            onChange={(e) => setSelectedEventId(e.target.value)}
                        >
                            <option value="" disabled>Select active event...</option>
                            {events?.map((e: NonNullable<typeof events>[number]) => (
                                <option key={e.id} value={e.id}>{e.name}</option>
                            ))}
                        </select>
                    )}
                </div>

                <button
                    onClick={() => setShowScanner(true)}
                    disabled={!selectedEventId || showScanner}
                    className="w-full h-32 md:h-40 bg-[#00A8A8] text-black font-black text-xl uppercase tracking-[0.2em] rounded-2xl hover:bg-white transition-all active:scale-95 disabled:opacity-30 disabled:scale-100 shadow-[0_0_50px_rgba(0,168,168,0.3)] flex flex-col items-center justify-center gap-2 group"
                >
                    <svg className="w-10 h-10 mb-2 group-hover:scale-110 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm14 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" /></svg>
                    <span>Scan User</span>
                </button>
            </LiquidGlass>
        </div>
    );
}
