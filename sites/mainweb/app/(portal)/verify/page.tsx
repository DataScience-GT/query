'use client';

import React, { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Background from '@/components/portal/Background';

function VerifyContent() {
    const searchParams = useSearchParams();
    const [verifying, setVerifying] = useState(false);

    // The full NextAuth callback URL is base64-encoded in the 'callback' param
    const encodedCallback = searchParams?.get('callback') || '';
    const email = searchParams?.get('email') || '';

    let callbackUrl = '';
    try {
        callbackUrl = atob(encodedCallback);
    } catch {
        // invalid base64
    }

    const handleVerify = () => {
        if (!callbackUrl) return;
        setVerifying(true);
        // Redirect to the exact original NextAuth callback URL
        window.location.href = callbackUrl;
    };

    return (
        <div className="min-h-screen bg-[#050505] flex flex-col items-center justify-center px-6 text-center">
            <Background className="fixed inset-0 z-0 opacity-[0.03]" />

            <div className="relative z-10 w-24 h-24 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center mb-10 shadow-[0_0_40px_rgba(16,185,129,0.1)]">
                <svg className="w-12 h-12 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
            </div>

            <div className="relative z-10 space-y-4 mb-12 max-w-lg">
                <h1 className="text-4xl font-black text-white uppercase tracking-tighter italic">
                    Verify<span className="text-emerald-500">_Identity</span>
                </h1>
                <p className="text-xs font-mono text-gray-500 uppercase tracking-[0.4em] mb-4">
                    Secure_Authentication // Email_Verification
                </p>
                <div className="h-[1px] w-12 bg-emerald-500/30 mx-auto" />
                <p className="text-gray-400 font-mono text-sm leading-relaxed">
                    Click the button below to complete your sign-in.
                </p>
                {email && (
                    <p className="text-emerald-500/70 font-mono text-xs">
                        {email}
                    </p>
                )}
            </div>

            <div className="relative z-10">
                <button
                    onClick={handleVerify}
                    disabled={verifying || !callbackUrl}
                    className="px-12 py-5 bg-gradient-to-r from-emerald-600 to-emerald-500 text-white font-black text-xs uppercase tracking-[0.3em] hover:from-emerald-500 hover:to-emerald-400 transition-all rounded-lg shadow-[0_0_30px_rgba(16,185,129,0.2)] disabled:opacity-30 active:scale-95"
                >
                    {verifying ? 'Verifying...' : 'Complete Sign In'}
                </button>
            </div>

            {!callbackUrl && (
                <p className="relative z-10 mt-8 text-red-500/70 font-mono text-xs">
                    Error: Invalid or missing verification link. Please request a new sign-in link.
                </p>
            )}

            <div className="fixed bottom-12 left-0 w-full text-center">
                <p className="text-[10px] text-gray-700 font-mono uppercase tracking-[0.5em]">
                    Query_Security_Protocols_Active
                </p>
            </div>
        </div>
    );
}

export default function VerifyPage() {
    return (
        <Suspense fallback={
            <div className="min-h-screen bg-[#050505] flex items-center justify-center font-mono text-emerald-500 uppercase tracking-widest">
                Loading_Verification...
            </div>
        }>
            <VerifyContent />
        </Suspense>
    );
}
