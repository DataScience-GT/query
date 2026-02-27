'use client';

import { useSession } from 'next-auth/react';
import { trpc } from '@/lib/trpc';
import { useRouter, useParams } from 'next/navigation';
import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import Background from '@/components/portal/Background';
import { LiquidGlass } from '@/components/portal/LiquidGlass';
import { LoadingScreen } from '@/components/portal/LoadingScreen';
import { QRScannerModal } from '@/components/portal/QRScannerModal';
import { ScanResultModal } from '@/components/portal/ScanResultModal';

type Tab = 'scanner' | 'attendees' | 'analytics';

function statusColors(status: string) {
    switch (status) {
        case 'approved': return 'text-green-400 bg-green-500/10 border-green-500/20';
        case 'pending': return 'text-yellow-400 bg-yellow-500/10 border-yellow-500/20';
        case 'rejected': return 'text-red-400 bg-red-500/10 border-red-500/20';
        case 'waitlisted': return 'text-blue-400 bg-blue-500/10 border-blue-500/20';
        case 'checked_in': return 'text-purple-400 bg-purple-500/10 border-purple-500/20';
        default: return 'text-gray-400 bg-gray-500/10 border-gray-500/20';
    }
}

export default function AdminHackathonUnifiedDashboard() {
    const { data: session, status: authStatus } = useSession();
    const router = useRouter();
    const params = useParams();
    const hackathonId = params?.id as string;

    const [activeTab, setActiveTab] = useState<Tab>('scanner');

    // Authentication Checks
    const { data: adminStatus, isLoading: adminLoading } = trpc.admin.isAdmin.useQuery(undefined, { enabled: !!session });
    const { data: hackathon, isLoading: loadingHackathon } = trpc.hackathon.getById.useQuery({ id: hackathonId }, { enabled: !!hackathonId && !!adminStatus?.isAdmin });

    if (authStatus === 'loading' || adminLoading || loadingHackathon) {
        return <LoadingScreen message="Initializing Admin Dashboard..." />;
    }

    if (!session || !adminStatus?.isAdmin) {
        router.push('/dashboard');
        return null;
    }

    if (!hackathon) {
        return (
            <div className="min-h-screen bg-[#050505] flex items-center justify-center text-white font-mono">
                Hackathon not found.
            </div>
        );
    }

    return (
        <div className="relative min-h-screen bg-[#050505] text-gray-400 font-sans selection:bg-[#00A8A8]/30 overflow-x-hidden flex flex-col">
            <Background className="fixed inset-0 z-0 opacity-[0.03]" />

            {/* HEADER */}
            <header className="relative z-10 w-full pt-8 pb-4 px-4 md:px-6 bg-[#050505]/90 backdrop-blur-md border-b border-white/5 sticky top-0 md:static">
                <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-end justify-between gap-4">
                    <div>
                        <Link href="/admin-hackathons" className="mb-4 flex items-center gap-2 text-gray-500 hover:text-white transition-colors text-xs font-mono uppercase tracking-wider group w-fit">
                            <svg className="w-4 h-4 transform group-hover:-translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
                            Back to Hub
                        </Link>
                        <p className="text-[#00A8A8] font-mono text-xs tracking-[0.2em] uppercase mb-1 flex items-center gap-2">
                            <span className="w-1.5 h-1.5 rounded-full bg-[#00A8A8] animate-pulse" />
                            Operations Dashboard
                        </p>
                        <h1 className="text-3xl md:text-4xl font-black text-white uppercase tracking-tight italic">
                            {hackathon.name}
                        </h1>
                    </div>
                </div>
            </header>

            {/* DESKTOP TABS */}
            <div className="relative z-10 w-full bg-[#111] border-b border-white/5 hidden md:block">
                <div className="max-w-7xl mx-auto px-6 flex gap-8">
                    <button
                        onClick={() => setActiveTab('scanner')}
                        className={`py-4 px-2 text-sm font-bold uppercase tracking-widest border-b-2 transition-colors ${activeTab === 'scanner' ? 'border-[#00A8A8] text-white' : 'border-transparent text-gray-500 hover:text-gray-300'}`}
                    >
                        Scanner
                    </button>
                    <button
                        onClick={() => setActiveTab('attendees')}
                        className={`py-4 px-2 text-sm font-bold uppercase tracking-widest border-b-2 transition-colors ${activeTab === 'attendees' ? 'border-[#00A8A8] text-white' : 'border-transparent text-gray-500 hover:text-gray-300'}`}
                    >
                        Attendees
                    </button>
                    <button
                        onClick={() => setActiveTab('analytics')}
                        className={`py-4 px-2 text-sm font-bold uppercase tracking-widest border-b-2 transition-colors ${activeTab === 'analytics' ? 'border-[#00A8A8] text-white' : 'border-transparent text-gray-500 hover:text-gray-300'}`}
                    >
                        Analytics
                    </button>
                </div>
            </div>

            {/* MAIN CONTENT AREA */}
            <main className="relative z-10 flex-1 w-full max-w-7xl mx-auto p-4 md:p-6 pb-32 md:pb-6">
                {activeTab === 'scanner' && <ScannerTab hackathonId={hackathon.id} />}
                {activeTab === 'attendees' && <AttendeesTab hackathonId={hackathon.id} hackathonName={hackathon.name} />}
                {activeTab === 'analytics' && <AnalyticsTab hackathonId={hackathon.id} />}
            </main>

            {/* MOBILE BOTTOM NAVIGATION */}
            <div className="fixed bottom-0 left-0 w-full bg-[#111]/90 backdrop-blur-xl border-t border-white/10 z-40 md:hidden grid grid-cols-3 pb-safe">
                <button
                    onClick={() => setActiveTab('scanner')}
                    className={`flex flex-col items-center justify-center py-4 gap-1 transition-colors ${activeTab === 'scanner' ? 'text-[#00A8A8]' : 'text-gray-500'}`}
                >
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm14 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" /></svg>
                    <span className="text-[10px] font-bold uppercase tracking-wider">Scan</span>
                </button>
                <button
                    onClick={() => setActiveTab('attendees')}
                    className={`flex flex-col items-center justify-center py-4 gap-1 transition-colors ${activeTab === 'attendees' ? 'text-[#00A8A8]' : 'text-gray-500'}`}
                >
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
                    <span className="text-[10px] font-bold uppercase tracking-wider">Users</span>
                </button>
                <button
                    onClick={() => setActiveTab('analytics')}
                    className={`flex flex-col items-center justify-center py-4 gap-1 transition-colors ${activeTab === 'analytics' ? 'text-[#00A8A8]' : 'text-gray-500'}`}
                >
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
                    <span className="text-[10px] font-bold uppercase tracking-wider">Stats</span>
                </button>
            </div>
        </div>
    );
}

function ScannerTab({ hackathonId }: { hackathonId: string }) {
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

function AttendeesTab({ hackathonId, hackathonName }: { hackathonId: string, hackathonName: string }) {
    const { data: attendees, isLoading } = trpc.hackathon.adminGetAttendees.useQuery({ hackathonId });

    if (isLoading) return <div className="text-gray-500 font-mono text-center py-20 animate-pulse">Loading Registry...</div>;

    const exportToCSV = () => {
        if (!attendees || attendees.length === 0) return;
        const headers = ['Name', 'Email', 'Status', 'Team', 'Shirt Size', 'Dietary Restrictions', 'Emergency Contact', 'Emergency Phone', 'Registered At'];

        type Attendee = NonNullable<typeof attendees>[number];

        const rows = attendees.map((a: Attendee) => [
            `"${a.user?.name || 'Unknown'}"`, `"${a.user?.email || 'Unknown'}"`, `"${a.registrationStatus}"`, `"${a.team?.name || 'No Team'}"`,
            `"${a.shirtSize || 'None'}"`, `"${(a.dietaryRestrictions || []).join(', ') || 'None'}"`, `"${a.emergencyContact || ''}"`,
            `"${a.emergencyPhone || ''}"`, `"${new Date(a.registeredAt).toISOString()}"`
        ]);
        const csvContent = [headers.join(','), ...rows.map((r: string[]) => r.join(','))].join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', `${hackathonName.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_attendees.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    return (
        <div className="animate-in fade-in slide-in-from-bottom-4 duration-300">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
                <div>
                    <h2 className="text-xl font-bold text-white uppercase tracking-wider">Registered Users</h2>
                    <p className="text-sm font-mono text-gray-500">{attendees?.length || 0} Total Participants</p>
                </div>
                <button
                    onClick={exportToCSV}
                    className="w-full sm:w-auto px-4 py-2 bg-white/5 border border-white/10 hover:bg-white/10 transition-colors rounded-lg font-mono text-xs uppercase tracking-wider font-bold text-white flex items-center justify-center gap-2"
                >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                    Export CSV
                </button>
            </div>

            <LiquidGlass className="p-0 overflow-hidden overflow-x-auto border-white/5">
                <table className="w-full text-left text-sm whitespace-nowrap min-w-[800px]">
                    <thead className="bg-black/40 border-b border-white/10 text-gray-400 font-mono text-[10px] uppercase tracking-wider">
                        <tr>
                            <th className="px-6 py-4 font-semibold">Participant</th>
                            <th className="px-6 py-4 font-semibold">Status</th>
                            <th className="px-6 py-4 font-semibold">Team</th>
                            <th className="px-6 py-4 font-semibold">Logistics</th>
                            <th className="px-6 py-4 font-semibold">Registered</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                        {(!attendees || attendees.length === 0) ? (
                            <tr>
                                <td colSpan={5} className="px-6 py-12 text-center text-gray-500 font-mono italic">No registrations found.</td>
                            </tr>
                        ) : (
                            attendees.map((attendee: NonNullable<typeof attendees>[number]) => (
                                <tr key={attendee.id} className="hover:bg-white/[0.02] transition-colors">
                                    <td className="px-6 py-4">
                                        <div className="flex items-center gap-3">
                                            <Image src={attendee.user?.image || '/avatar-placeholder.png'} alt="Avatar" width={32} height={32} className="rounded-full bg-black shrink-0" />
                                            <div>
                                                <p className="text-white font-bold">{attendee.user?.name || 'Unknown User'}</p>
                                                <p className="text-gray-500 text-xs">{attendee.user?.email || 'No email'}</p>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <span className={`px-2 py-1 rounded border text-[10px] font-mono font-bold uppercase tracking-wider ${statusColors(attendee.registrationStatus)}`}>
                                            {attendee.registrationStatus}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 text-gray-300 font-medium">
                                        {attendee.team?.name || <span className="text-gray-600 italic font-normal text-xs">No Team</span>}
                                    </td>
                                    <td className="px-6 py-4 text-xs font-mono">
                                        <p className="text-gray-400"><span className="text-gray-500">Shirt:</span> {attendee.shirtSize}</p>
                                    </td>
                                    <td className="px-6 py-4 text-gray-500 font-mono text-xs">
                                        {new Date(attendee.registeredAt).toLocaleDateString()}
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </LiquidGlass>
        </div>
    );
}

function AnalyticsTab({ hackathonId }: { hackathonId: string }) {
    const { data: analytics, isLoading } = trpc.hackathon.analytics.useQuery({ hackathonId });

    if (isLoading) return <div className="text-gray-500 font-mono text-center py-20 animate-pulse">Calculating Stats...</div>;
    if (!analytics) return <div className="text-gray-500 font-mono text-center py-20">No analytics data available.</div>;

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
            <h2 className="text-xl font-bold text-white uppercase tracking-wider mb-2">Registration Overview</h2>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <LiquidGlass className="p-6 border-l-4 border-l-blue-500">
                    <p className="text-xs text-gray-500 uppercase font-mono tracking-widest mb-1">Total Registers</p>
                    <p className="text-4xl font-black text-white">{analytics.totalRegistrations}</p>
                </LiquidGlass>

                <LiquidGlass className="p-6 md:col-span-2">
                    <h3 className="text-xs text-gray-500 uppercase font-mono tracking-widest mb-4">Status Breakdown</h3>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                        {Object.entries(analytics.statusBreakdown).map(([status, count]: [string, number]) => (
                            <div key={status} className="bg-black/40 border border-white/5 p-3 rounded-xl">
                                <p className="text-[10px] uppercase font-mono text-gray-500 mb-1 truncate">{status.replace(/_/g, ' ')}</p>
                                <p className="text-xl font-bold text-white">{count}</p>
                            </div>
                        ))}
                    </div>
                </LiquidGlass>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <LiquidGlass className="p-6">
                    <h3 className="text-sm border-b border-white/10 pb-2 text-white uppercase font-bold tracking-widest mb-4">Shirt Sizes</h3>
                    <div className="space-y-2">
                        {Object.entries(analytics.shirtSizes).sort((a: [string, number], b: [string, number]) => b[1] - a[1]).map(([size, count]: [string, number]) => (
                            <div key={size} className="flex justify-between text-sm font-mono">
                                <span className="text-gray-400 font-bold">{size}</span>
                                <span className="text-white">{count}</span>
                            </div>
                        ))}
                    </div>
                </LiquidGlass>

                <LiquidGlass className="p-6">
                    <h3 className="text-sm border-b border-white/10 pb-2 text-white uppercase font-bold tracking-widest mb-4">Dietary Restrictions</h3>
                    <div className="space-y-2">
                        {Object.entries(analytics.dietaryRestrictions).sort((a: [string, number], b: [string, number]) => b[1] - a[1]).map(([res, count]: [string, number]) => (
                            <div key={res} className="flex justify-between text-sm font-mono">
                                <span className="text-gray-400 font-bold uppercase">{res.replace(/_/g, ' ')}</span>
                                <span className="text-white">{count}</span>
                            </div>
                        ))}
                    </div>
                </LiquidGlass>
            </div>
        </div>
    );
}
