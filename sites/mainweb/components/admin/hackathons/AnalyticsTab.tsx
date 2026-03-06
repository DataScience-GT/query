'use client';

import React from 'react';
import { trpc } from '@/lib/trpc';
import { LiquidGlass } from '@/components/portal/LiquidGlass';

export function AnalyticsTab({ hackathonId }: { hackathonId: string }) {
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
