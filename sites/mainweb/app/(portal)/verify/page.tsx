'use client';

import React, { Suspense, useState, useRef, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Background from '@/components/portal/Background';

function VerifyContent() {
    const searchParams = useSearchParams();
    const router = useRouter();
    const [code, setCode] = useState(['', '', '', '', '', '']);
    const [verifying, setVerifying] = useState(false);
    const [error, setError] = useState('');
    const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

    const email = searchParams?.get('email') || '';

    // Auto-focus first input on mount
    useEffect(() => {
        inputRefs.current[0]?.focus();
    }, []);

    const handleChange = (index: number, value: string) => {
        // Only allow digits
        if (value && !/^\d$/.test(value)) return;

        const newCode = [...code];
        newCode[index] = value;
        setCode(newCode);
        setError('');

        // Auto-advance to next input
        if (value && index < 5) {
            inputRefs.current[index + 1]?.focus();
        }

        // Auto-submit when all 6 digits are entered
        if (value && index === 5 && newCode.every(d => d !== '')) {
            handleSubmit(newCode.join(''));
        }
    };

    const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
        if (e.key === 'Backspace' && !code[index] && index > 0) {
            inputRefs.current[index - 1]?.focus();
        }
        if (e.key === 'Enter') {
            const fullCode = code.join('');
            if (fullCode.length === 6) {
                handleSubmit(fullCode);
            }
        }
    };

    const handlePaste = (e: React.ClipboardEvent) => {
        e.preventDefault();
        const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
        if (pasted.length === 0) return;

        const newCode = [...code];
        for (let i = 0; i < 6; i++) {
            newCode[i] = pasted[i] || '';
        }
        setCode(newCode);

        // Focus the next empty input or the last one
        const nextEmpty = newCode.findIndex(d => d === '');
        inputRefs.current[nextEmpty === -1 ? 5 : nextEmpty]?.focus();

        // Auto-submit if all 6 digits pasted
        if (pasted.length === 6) {
            handleSubmit(pasted);
        }
    };

    const handleSubmit = async (fullCode: string) => {
        if (verifying) return;
        setVerifying(true);
        setError('');

        try {
            const res = await fetch('/api/auth/verify-email', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ code: fullCode, email }),
            });

            const data = await res.json();

            if (data.success) {
                // Redirect — session cookie is set by the API
                window.location.href = data.redirectUrl || '/dashboard';
            } else {
                setError(data.error || 'Invalid code. Please try again.');
                setVerifying(false);
                // Clear code and refocus
                setCode(['', '', '', '', '', '']);
                inputRefs.current[0]?.focus();
            }
        } catch {
            setError('Something went wrong. Please try again.');
            setVerifying(false);
        }
    };

    return (
        <div className="min-h-screen bg-[#050505] flex flex-col items-center justify-center px-6 text-center">
            <Background className="fixed inset-0 z-0 opacity-[0.03]" />

            <div className="relative z-10 w-24 h-24 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center mb-10 shadow-[0_0_40px_rgba(16,185,129,0.1)]">
                <svg className="w-12 h-12 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
            </div>

            <div className="relative z-10 space-y-4 mb-10 max-w-lg">
                <h1 className="text-4xl font-black text-white uppercase tracking-tighter italic">
                    Enter<span className="text-emerald-500">_Code</span>
                </h1>
                <p className="text-xs font-mono text-gray-500 uppercase tracking-[0.4em] mb-4">
                    Secure_Authentication // Code_Verification
                </p>
                <div className="h-[1px] w-12 bg-emerald-500/30 mx-auto" />
                <p className="text-gray-400 font-mono text-sm leading-relaxed">
                    We sent a 6-digit code to your email.
                </p>
                {email && (
                    <p className="text-emerald-500/70 font-mono text-xs">
                        {email}
                    </p>
                )}
            </div>

            {/* 6-digit code input */}
            <div className="relative z-10 flex gap-3 mb-8" onPaste={handlePaste}>
                {code.map((digit, i) => (
                    <input
                        key={i}
                        ref={(el) => { inputRefs.current[i] = el; }}
                        type="text"
                        inputMode="numeric"
                        maxLength={1}
                        value={digit}
                        onChange={(e) => handleChange(i, e.target.value)}
                        onKeyDown={(e) => handleKeyDown(i, e)}
                        disabled={verifying}
                        className={`
                            w-12 h-16 sm:w-14 sm:h-18 text-center text-2xl font-mono font-bold
                            bg-black/60 border-2 rounded-lg
                            text-white focus:outline-none transition-all
                            ${error
                                ? 'border-red-500/50 focus:border-red-500'
                                : digit
                                    ? 'border-emerald-500/50'
                                    : 'border-white/10 focus:border-emerald-500/70'
                            }
                            ${verifying ? 'opacity-50' : ''}
                            shadow-[0_0_15px_rgba(16,185,129,0.05)]
                        `}
                        autoComplete="one-time-code"
                    />
                ))}
            </div>

            {/* Error message */}
            {error && (
                <p className="relative z-10 text-red-500/70 font-mono text-xs mb-4 animate-pulse">
                    {error}
                </p>
            )}

            {/* Submit button */}
            <div className="relative z-10">
                <button
                    onClick={() => handleSubmit(code.join(''))}
                    disabled={verifying || code.some(d => d === '')}
                    className="px-12 py-5 bg-gradient-to-r from-emerald-600 to-emerald-500 text-white font-black text-xs uppercase tracking-[0.3em] hover:from-emerald-500 hover:to-emerald-400 transition-all rounded-lg shadow-[0_0_30px_rgba(16,185,129,0.2)] disabled:opacity-30 active:scale-95"
                >
                    {verifying ? 'Verifying...' : 'Verify Code'}
                </button>
            </div>

            {!email && (
                <p className="relative z-10 mt-8 text-red-500/70 font-mono text-xs">
                    Error: Missing email. Please go back to the login page.
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
