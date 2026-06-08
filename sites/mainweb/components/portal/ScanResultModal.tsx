'use client';

import React from 'react';
import { ModalWrapper } from './ModalWrapper';

interface ScanResultModalProps {
    success: boolean;
    message: string;
    eventTitle?: string;
    onClose: () => void;
}

export function ScanResultModal({
    success,
    message,
    eventTitle,
    onClose,
}: ScanResultModalProps) {
    return (
        <ModalWrapper onClose={onClose} maxWidth="md">
            <div className="text-center space-y-8">
                {/* Status Icon */}
                <div
                    className={`inline-block p-6 rounded-sm ${success
                            ? 'bg-accent/10 border border-accent/20'
                            : 'bg-red-500/10 border border-red-500/20'
                        }`}
                >
                    {success ? (
                        <svg className="w-12 h-12 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                    ) : (
                        <svg className="w-12 h-12 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    )}
                </div>

                {/* Title */}
                <div>
                    <h3
                        className={`text-3xl font-black uppercase tracking-tighter mb-2 ${success ? 'text-[var(--text-primary)]' : 'text-red-400'
                            }`}
                    >
                        {success ? 'Check-In Success' : 'Check-In Failed'}
                    </h3>
                    <p className="text-[10px] font-mono text-accent uppercase tracking-[0.3em]">
                        {success ? 'Identity Verified' : 'Access Denied'}
                    </p>
                </div>

                {/* Success Event Details */}
                {success && eventTitle && (
                    <div className="space-y-3">
                        <div className="bg-white/[0.02] border border-[var(--border-subtle)] rounded-none p-6">
                            <p className="text-[9px] text-gray-600 uppercase tracking-[0.4em] mb-3 font-mono">
                                Event Payload:
                            </p>
                            <p className="text-xl text-[var(--text-primary)] font-black uppercase italic tracking-tight">
                                {eventTitle}
                            </p>
                        </div>
                    </div>
                )}

                {/* Error Message */}
                {!success && (
                    <div className="bg-red-500/5 border border-red-500/20 rounded-none p-6">
                        <p className="text-[9px] text-red-500 uppercase tracking-[0.4em] mb-3 font-mono">
                            Error Code:
                        </p>
                        <p className="text-sm text-red-300 font-mono italic">&gt; "{message}"</p>
                    </div>
                )}

                {/* Close Button */}
                <button
                    onClick={onClose}
                    className={`w-full px-8 py-5 font-black uppercase text-xs tracking-[0.4em] transition-all rounded-none ${success
                            ? 'bg-accent text-black hover:bg-accent/80 shadow-[0_0_20px_rgba(16,185,129,0.3)]'
                            : 'bg-red-500/10 border border-red-500/30 text-red-500 hover:bg-red-500/20'
                        }`}
                >
                    TERMINATE OVERLAY
                </button>
            </div>
        </ModalWrapper>
    );
}
