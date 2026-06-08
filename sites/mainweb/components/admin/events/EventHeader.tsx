'use client';

import React from 'react';
import Link from 'next/link';

export function EventHeader() {
    return (
        <div className="flex items-center justify-between mb-8">
            <div>
                <h1 className="text-3xl font-black text-white uppercase tracking-tighter mb-1">
                    Check-in <span className="text-[#EAFF2B] italic">Events</span>
                </h1>
                <p className="text-sm font-mono text-gray-500 uppercase tracking-widest">
                    Manage Event Check-in Locations
                </p>
            </div>
            <Link
                href="/admin/hackathons"
                className="px-6 py-3 bg-white/5 border border-white/10 text-white text-sm font-bold uppercase tracking-widest rounded-none hover:bg-white/10 hover:border-white/30 transition-all flex items-center gap-2 font-mono"
            >
                <span className="w-2 h-2 rounded-sm bg-[#EAFF2B] animate-pulse" />
                Open QR Scanner
            </Link>
        </div>
    );
}
