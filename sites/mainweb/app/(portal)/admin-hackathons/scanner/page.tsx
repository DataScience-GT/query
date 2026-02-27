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
import Link from 'next/link';

export default function AdminHackathonScannerPage() {
    const { data: session, status } = useSession();
    const router = useRouter();

    const { data: adminStatus, isLoading: adminLoading } = trpc.admin.isAdmin.useQuery(undefined, { enabled: !!session });
    const { data: myHackathons } = trpc.hackathon.listAll.useQuery(undefined, { enabled: !!session && adminStatus?.isAdmin });

    const [selectedHackathonId, setSelectedHackathonId] = useState<string>('');
    const [selectedEventId, setSelectedEventId] = useState<string>('');
    const [showScanner, setShowScanner] = useState(false);
    const [scanResult, setScanResult] = useState<{
        success: boolean;
        message: string;
        eventTitle?: string;
    } | null>(null);
    const [isPaused, setIsPaused] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);

    // Fetch events for the selected hackathon
    const { data: hackathonEvents } = trpc.hackathon.getEvents.useQuery(
        { hackathonId: selectedHackathonId },
        { enabled: !!selectedHackathonId && adminStatus?.isAdmin }
    );

    useEffect(() => {
        const firstHackathon = myHackathons?.[0];
        if (firstHackathon && !selectedHackathonId) {
            setSelectedHackathonId(firstHackathon.id);
        }
    }, [myHackathons, selectedHackathonId]);

    const scanPassMutation = trpc.hackathon.scanParticipantPass.useMutation();

    const handleScan = async (detectedCodes: { rawValue: string }[]) => {
        if (isProcessing || !detectedCodes || detectedCodes.length === 0) return;

        const scannedData = detectedCodes[0]?.rawValue;
        if (!scannedData) return;

        setIsPaused(true);
        setIsProcessing(true);

        try {
            // Parse the QR code payload
            const payload = JSON.parse(scannedData);

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
                eventTitle: hackathonEvents?.find(e => e.id === selectedEventId)?.name || 'Hackathon Event',
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

    const handleError = (error: unknown) => {
        console.error('Scanner error:', error);
    };

    if (status === 'loading' || adminLoading) {
        return <LoadingScreen message="Verifying Admin Access..." />;
    }

    if (!session || !adminStatus?.isAdmin) {
        router.push('/dashboard');
        return null;
    }

    const selectedHackathon = myHackathons?.find(h => h.id === selectedHackathonId);
    const selectedEvent = hackathonEvents?.find(e => e.id === selectedEventId);

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
                    onClose={() => {
                        setScanResult(null);
                        // Optional: automatically reopen scanner after closing success message
                        // setTimeout(() => setShowScanner(true), 100);
                    }}
                />
            )}

            <main className="relative z-10 max-w-4xl mx-auto px-6 py-24 min-h-screen flex flex-col items-center">

                {/* Header Link */}
                <div className="w-full flex justify-between items-center mb-12">
                    <Link href="/admin-hackathons" className="text-gray-500 hover:text-white transition-colors font-mono text-xs tracking-widest uppercase flex items-center gap-2">
                        <span className="text-lg">←</span> Back to Admin Portal
                    </Link>
                </div>

                <div className="w-full space-y-12 text-center">

                    {/* Welcome Header */}
                    <div className="space-y-6">
                        <div className="inline-block px-5 py-2 border border-red-500/20 rounded-full bg-red-500/5 mb-2">
                            <p className="text-[10px] font-mono text-red-500 uppercase tracking-[0.5em] font-black flex items-center gap-2">
                                <span className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse" />
                                Admin Scanner Node
                            </p>
                        </div>

                        <h1 className="text-5xl lg:text-7xl font-black text-white uppercase tracking-tighter leading-[0.85]">
                            Hackathon<br />
                            <span className="text-[#00A8A8] italic">
                                Scanner
                            </span>
                        </h1>
                        <p className="text-sm text-gray-500 font-mono max-w-lg mx-auto uppercase tracking-widest leading-relaxed">
                            Select an event context below and activate the camera terminal to process mobile Event Passes.
                        </p>
                    </div>

                    <LiquidGlass className="p-10 rounded-3xl shadow-[0_20px_50px_rgba(0,0,0,0.5)] max-w-lg mx-auto border-t-2 border-t-[#00A8A8]/30">
                        {/* Context Selectors */}
                        <div className="space-y-6 mb-10 text-left">

                            {/* Hackathon Selection */}
                            <div className="space-y-2">
                                <label className="text-[10px] font-mono text-gray-500 uppercase tracking-widest font-bold ml-1">Context: Hackathon</label>
                                <select
                                    className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-[#00A8A8]/50 transition-colors"
                                    value={selectedHackathonId}
                                    onChange={(e) => setSelectedHackathonId(e.target.value)}
                                >
                                    <option value="" disabled>Select Hackathon...</option>
                                    {myHackathons?.map(h => (
                                        <option key={h.id} value={h.id}>{h.name}</option>
                                    ))}
                                </select>
                            </div>

                            {/* Event Selection */}
                            <div className="space-y-2">
                                <label className="text-[10px] font-mono text-[#00A8A8] uppercase tracking-widest font-bold ml-1">Target: Active Event</label>
                                <select
                                    className="w-full bg-[#00A8A8]/5 border border-[#00A8A8]/30 rounded-xl px-4 py-3 text-[#00A8A8] focus:outline-none focus:border-[#00A8A8] transition-colors font-medium shadow-[inset_0_0_20px_rgba(0,168,168,0.05)]"
                                    value={selectedEventId}
                                    onChange={(e) => setSelectedEventId(e.target.value)}
                                    disabled={!hackathonEvents || hackathonEvents.length === 0}
                                >
                                    <option value="" disabled>Select Event...</option>
                                    {hackathonEvents?.map(e => (
                                        <option key={e.id} value={e.id}>{e.name} ({new Date(e.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})</option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        <button
                            onClick={() => setShowScanner(true)}
                            disabled={!selectedHackathonId || !selectedEventId || showScanner}
                            className="w-full px-8 py-8 bg-[#00A8A8] text-black font-black text-xl uppercase tracking-[0.2em] hover:bg-white hover:text-black transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_0_50px_rgba(0,168,168,0.4)] hover:shadow-[0_0_80px_rgba(0,168,168,0.6)] rounded-2xl animate-pulse hover:animate-none flex flex-col items-center gap-2"
                        >
                            <span>ACTIVATE SCANNER</span>
                            {selectedEvent && <span className="text-[10px] bg-black/10 px-3 py-1 rounded-full font-mono tracking-widest normal-case">Target: {selectedEvent.name}</span>}
                        </button>
                    </LiquidGlass>

                </div>
            </main>
        </div>
    );
}
