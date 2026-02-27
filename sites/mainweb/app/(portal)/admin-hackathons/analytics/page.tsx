'use client';

import { useSession } from 'next-auth/react';
import { trpc } from '@/lib/trpc';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import Background from '@/components/portal/Background';
import { LiquidGlass } from '@/components/portal/LiquidGlass';
import { LoadingScreen } from '@/components/portal/LoadingScreen';
import Link from 'next/link';

export default function AdminHackathonAnalyticsPage() {
    const { data: session, status } = useSession();
    const router = useRouter();

    const { data: adminStatus, isLoading: adminLoading } = trpc.admin.isAdmin.useQuery(undefined, { enabled: !!session });
    const { data: myHackathons } = trpc.hackathon.listAll.useQuery(undefined, { enabled: !!session && adminStatus?.isAdmin });

    const [selectedHackathonId, setSelectedHackathonId] = useState<string>('');

    // Fetch analytics for the selected hackathon
    const { data: analytics, isLoading: analyticsLoading } = trpc.hackathon.analytics.useQuery(
        { hackathonId: selectedHackathonId },
        { enabled: !!selectedHackathonId && adminStatus?.isAdmin }
    );

    useEffect(() => {
        const firstHackathon = myHackathons?.[0];
        if (firstHackathon && !selectedHackathonId) {
            setSelectedHackathonId(firstHackathon.id);
        }
    }, [myHackathons, selectedHackathonId]);

    if (status === 'loading' || adminLoading) {
        return <LoadingScreen message="Verifying Admin Access..." />;
    }

    if (!session || !adminStatus?.isAdmin) {
        router.push('/dashboard');
        return null;
    }

    return (
        <div className="relative min-h-screen bg-[#050505] text-gray-400 font-sans selection:bg-[#00A8A8]/30 overflow-x-hidden">
            <Background className="fixed inset-0 z-0 opacity-[0.03]" />

            <main className="relative z-10 max-w-6xl mx-auto px-6 py-24 min-h-screen">

                {/* Header Link */}
                <div className="w-full flex justify-between items-center mb-12">
                    <Link href="/dashboard" className="text-gray-500 hover:text-white transition-colors font-mono text-xs tracking-widest uppercase flex items-center gap-2">
                        <span className="text-lg">←</span> Back to Central Operations
                    </Link>
                </div>

                <div className="w-full space-y-12">

                    {/* Welcome Header */}
                    <div className="space-y-6">
                        <div className="inline-block px-5 py-2 border border-blue-500/20 rounded-full bg-blue-500/5 mb-2">
                            <p className="text-[10px] font-mono text-blue-500 uppercase tracking-[0.5em] font-black flex items-center gap-2">
                                <span className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-pulse" />
                                Admin Analytics Node
                            </p>
                        </div>

                        <h1 className="text-5xl lg:text-7xl font-black text-white uppercase tracking-tighter leading-[0.85]">
                            Hackathon<br />
                            <span className="text-blue-500 className italic">
                                Analytics
                            </span>
                        </h1>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                        {/* LEFT COLUMN - Selection */}
                        <div className="lg:col-span-1 border-t-2 border-t-blue-500/30 pt-4">
                            <div className="space-y-2 mb-8 sticky top-10">
                                <label className="text-[10px] font-mono text-gray-500 uppercase tracking-widest font-bold ml-1">Context: Hackathon</label>
                                <select
                                    className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-blue-500/50 transition-colors"
                                    value={selectedHackathonId}
                                    onChange={(e) => setSelectedHackathonId(e.target.value)}
                                >
                                    <option value="" disabled>Select Hackathon...</option>
                                    {myHackathons?.map(h => (
                                        <option key={h.id} value={h.id}>{h.name}</option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        {/* RIGHT COLUMN - Stats */}
                        <div className="lg:col-span-2">
                            {analyticsLoading && selectedHackathonId ? (
                                <div className="h-64 flex items-center justify-center border border-white/5 rounded-2xl bg-black/40">
                                    <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                                </div>
                            ) : analytics ? (
                                <div className="space-y-8 animate-in fade-in slide-in-from-bottom-8 duration-500">

                                    {/* Top Level Stat */}
                                    <LiquidGlass className="p-8 border-l-4 border-l-blue-500 relative overflow-hidden group">
                                        <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-20 transition-opacity">
                                            <svg className="w-24 h-24 text-blue-500" viewBox="0 0 24 24" fill="currentColor"><path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z" /></svg>
                                        </div>
                                        <p className="text-xs text-gray-500 uppercase font-mono tracking-widest mb-1">Total Registrations</p>
                                        <p className="text-6xl font-black text-white">{analytics.totalRegistrations}</p>
                                    </LiquidGlass>

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

                                        {/* Status Breakdown */}
                                        <LiquidGlass className="p-6">
                                            <h3 className="text-sm text-white uppercase font-bold tracking-widest mb-6">Status Breakdown</h3>
                                            <div className="space-y-4">
                                                {Object.entries(analytics.statusBreakdown).map(([status, count]) => (
                                                    <div key={status} className="flex flex-col gap-1">
                                                        <div className="flex justify-between items-end">
                                                            <span className="text-xs uppercase font-mono text-gray-500">{status.replace(/_/g, ' ')}</span>
                                                            <span className="text-sm font-bold text-white">{count}</span>
                                                        </div>
                                                        <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
                                                            <div
                                                                className={`h-full bg-blue-500 transition-all duration-1000`}
                                                                style={{ width: analytics.totalRegistrations ? `${(count / analytics.totalRegistrations) * 100}%` : '0%' }}
                                                            />
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </LiquidGlass>

                                        <div className="space-y-6">
                                            {/* Shirt Sizes */}
                                            <LiquidGlass className="p-6">
                                                <h3 className="text-sm text-white uppercase font-bold tracking-widest mb-6">Shirt Sizes</h3>
                                                {Object.keys(analytics.shirtSizes).length > 0 ? (
                                                    <div className="flex flex-wrap gap-2 text-xs font-mono">
                                                        {Object.entries(analytics.shirtSizes)
                                                            .sort(([, a], [, b]) => b - a)
                                                            .map(([size, count]) => (
                                                                <div key={size} className="flex gap-2 items-center bg-black/40 border border-white/10 px-3 py-1.5 rounded text-gray-400">
                                                                    <span className="text-white font-bold">{size}</span>
                                                                    <span>{count}</span>
                                                                </div>
                                                            ))}
                                                    </div>
                                                ) : (
                                                    <p className="text-xs text-gray-600 font-mono italic">No data available.</p>
                                                )}
                                            </LiquidGlass>

                                            {/* Dietary Restrictions */}
                                            <LiquidGlass className="p-6">
                                                <h3 className="text-sm text-white uppercase font-bold tracking-widest mb-6">Dietary Restrictions</h3>
                                                {Object.keys(analytics.dietaryRestrictions).length > 0 ? (
                                                    <div className="flex flex-wrap gap-2 text-xs font-mono">
                                                        {Object.entries(analytics.dietaryRestrictions)
                                                            .sort(([, a], [, b]) => b - a)
                                                            .map(([restriction, count]) => (
                                                                <div key={restriction} className="flex gap-2 items-center bg-black/40 border border-white/10 px-3 py-1.5 rounded text-gray-400">
                                                                    <span className="text-white font-bold uppercase">{restriction.replace(/_/g, ' ')}</span>
                                                                    <span>{count}</span>
                                                                </div>
                                                            ))}
                                                    </div>
                                                ) : (
                                                    <p className="text-xs text-gray-600 font-mono italic">No data available.</p>
                                                )}
                                            </LiquidGlass>
                                        </div>

                                    </div>

                                </div>
                            ) : null}
                        </div>
                    </div>
                </div>
            </main>
        </div>
    );
}
