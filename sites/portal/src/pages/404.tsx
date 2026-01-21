
import React from 'react';
import Link from 'next/link';

export default function Custom404() {
    return (
        <div className="relative min-h-screen flex items-center justify-center bg-[#050505] text-gray-400 font-sans">
            <div className="text-center p-12 max-w-2xl w-full rounded-2xl bg-[#0a0a0a] border border-white/5 shadow-2xl space-y-8 relative overflow-hidden">
                <div className="space-y-4">
                    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-red-500/10 border border-red-500/20 text-red-400 text-[10px] font-mono uppercase tracking-[0.2em] mb-4">
                        Error 404 // Lost in Space
                    </div>

                    <h1 className="text-white text-5xl md:text-7xl font-bold tracking-tighter italic leading-tight">
                        You fell <br />
                        <span className="text-transparent bg-clip-text bg-gradient-to-r from-gray-200 to-gray-500 not-italic">
                            out of place.
                        </span>
                    </h1>
                </div>

                <p className="text-gray-400 max-w-sm mx-auto leading-relaxed text-sm">
                    The path you followed doesn't exist in our current deployment. Let's get you back to familiar territory.
                </p>

                <div className="flex flex-col sm:flex-row justify-center gap-4 pt-6">
                    <Link
                        href="/"
                        className="px-10 py-4 bg-white text-black font-bold rounded-md transition-all duration-300 hover:bg-gray-200 active:scale-95 text-xs uppercase tracking-widest inline-block"
                    >
                        Back to Home
                    </Link>
                </div>
            </div>
        </div>
    );
}
