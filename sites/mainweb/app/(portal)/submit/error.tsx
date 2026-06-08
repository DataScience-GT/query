'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { LiquidGlass } from '@/components/portal/LiquidGlass';

export default function SubmitError({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    useEffect(() => {
        console.error("Submission Portal Error:", error);
    }, [error]);

    return (
        <div className="relative min-h-screen bg-[var(--bg-primary)] text-text-muted font-sans selection:bg-accent/30 overflow-x-hidden flex items-center justify-center">

            <main className="relative z-10 w-full max-w-xl px-6">
                <LiquidGlass className="p-12 text-center border-red-500/20">
                    <div className="w-16 h-16 rounded-none bg-red-500/10 border border-red-500/20 flex items-center justify-center mx-auto mb-6">
                        <svg className="w-8 h-8 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                    </div>

                    <h2 className="text-3xl font-black text-white uppercase tracking-tight mb-4">
                        Deployment Failure
                    </h2>

                    <p className="text-sm font-mono text-text-muted mb-8">
                        The submission terminal encountered a fatal error during the deployment sequence.
                        No data was lost.
                        <br /><br />
                        <span className="text-red-400/80 text-xs bg-red-500/10 px-3 py-1 rounded border border-red-500/10">
                            {error.message || "Unknown deployment exception"}
                        </span>
                    </p>

                    <div className="flex flex-col sm:flex-row gap-4 justify-center">
                        <button
                            onClick={() => reset()}
                            className="px-6 py-3 bg-accent text-black font-black uppercase tracking-widest text-sm rounded-none hover:bg-white transition-colors"
                        >
                            Restart Sequence
                        </button>
                        <Link
                            href="/dashboard"
                            className="px-6 py-3 bg-white/5 border border-white/10 text-white font-bold uppercase tracking-widest text-sm rounded-none hover:bg-white/10 transition-colors"
                        >
                            Abort Deployment
                        </Link>
                    </div>
                </LiquidGlass>
            </main>
        </div>
    );
}
