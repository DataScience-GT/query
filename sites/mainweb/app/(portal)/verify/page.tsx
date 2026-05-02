'use client';

import React, { Suspense, useState, useRef, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { LiquidGlass } from '@/components/portal/LiquidGlass';

function VerifyContent() {
    const searchParams = useSearchParams();
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
        <div className="min-h-screen bg-[var(--bg-secondary)] flex flex-col items-center justify-center px-6 text-center">

            <LiquidGlass className="relative z-10 w-full max-w-lg p-10 md:p-14 flex flex-col items-center">
                <div className="w-24 h-24 rounded-full bg-accent/10 border border-accent/30 flex items-center justify-center mb-10 shadow-[0_0_40px_rgba(0,168,168,0.1)]">
                    <svg className="w-12 h-12 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                </div>

                <div className="space-y-4 mb-10 text-center flex flex-col items-center">
                    <h1 className="text-4xl font-black text-white uppercase tracking-tighter italic">
                        Enter<span className="text-accent"> Code</span>
                    </h1>
                    <p className="text-xs font-mono text-text-muted uppercase tracking-[0.4em] mb-4">
                        Code Verification
                    </p>
                    <div className="h-[1px] w-12 bg-accent/30 mx-auto" />
                    <p className="text-text-muted font-mono text-sm leading-relaxed mt-4">
                        We sent a 6-digit access code to your terminal.
                    </p>
                    {email && (
                        <p className="text-accent/70 font-mono text-xs">
                            {email}
                        </p>
                    )}
                </div>

                {/* 6-digit code input */}
                <div className="flex gap-2 sm:gap-3 mb-8" onPaste={handlePaste}>
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
                                w-12 h-14 sm:w-14 sm:h-18 text-center text-xl sm:text-2xl font-mono font-black
                                bg-black/40 border-[1.5px] rounded-xl
                                text-white focus:outline-none transition-all duration-300
                                ${error
                                    ? 'border-red-500/50 focus:border-red-500 focus:bg-red-500/5 text-red-500'
                                    : digit
                                      ? 'border-accent/50 text-accent shadow-[0_0_20px_rgba(0,168,168,0.15)] bg-accent/5'
                     : 'border-white/10 focus:border-accent/70 focus:bg-accent/5 focus:-translate-y-1 focus:shadow-[0_10px_20px_rgba(0,168,168,0.1)]'
                                }
                                ${verifying ? 'opacity-50 cursor-not-allowed' : ''}
                            `}
                            autoComplete="one-time-code"
                        />
                    ))}
                </div>

                {/* Error message */}
                {error && (
                    <div className="px-4 py-3 border border-red-500/20 bg-red-500/5 rounded-lg mb-6 w-full text-center">
                        <p className="text-red-500/90 font-mono text-xs font-bold tracking-widest uppercase animate-pulse">
                            {error}
                        </p>
                    </div>
                )}

                {/* Submit button */}
                <button
                    onClick={() => handleSubmit(code.join(''))}
                    disabled={verifying || code.some(d => d === '')}
                    className="w-full sm:w-auto px-12 py-5 bg-accent text-black font-black text-xs sm:text-sm uppercase tracking-[0.3em] hover:bg-white transition-all duration-300 rounded-xl shadow-[0_0_30px_rgba(0,168,168,0.2)] hover:shadow-[0_0_50px_rgba(0,168,168,0.4)] disabled:opacity-30 disabled:cursor-not-allowed active:scale-95"
                >
                    {verifying ? 'VERIFYING...' : 'VERIFY CODE'}
                </button>

                {!email && (
                    <p className="mt-8 p-3 w-full text-center border border-red-500/20 bg-red-500/5 text-text-disabled font-mono text-xs rounded-lg uppercase tracking-widest">
                        ERROR: EMAIL BINDING LOST.<br /> RETURN TO LOGIN.
                    </p>
                )}
            </LiquidGlass>

            <div className="fixed bottom-12 left-0 w-full text-center">
                <p className="text-[10px] text-gray-700 font-mono uppercase tracking-[0.5em]"> </p>
            </div>
        </div>
    );
}

export default function VerifyPage() {
    return (
        <Suspense fallback={
            <div className="min-h-screen bg-[var(--bg-secondary)] flex items-center justify-center font-mono text-emerald-500 uppercase tracking-widest">
                Loading
            </div>
        }>
            <VerifyContent />
        </Suspense>
    );
}
