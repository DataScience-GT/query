'use client';

import React from 'react';
import { ModalWrapper } from './ModalWrapper';
import { Scanner } from '@yudiel/react-qr-scanner';

interface QRScannerModalProps {
    onClose: () => void;
    onScan: (detectedCodes: { rawValue: string }[]) => void;
    onError?: (error: unknown) => void;
    isProcessing?: boolean;
    isPaused?: boolean;
}

export function QRScannerModal({
    onClose,
    onScan,
    onError,
    isProcessing = false,
    isPaused = false,
}: QRScannerModalProps) {
    const handleClose = () => {
        if (!isProcessing) {
            onClose();
        }
    };

    return (
        <ModalWrapper onClose={handleClose} maxWidth="md">
            {/* Header */}
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h3 className="text-xl font-black text-white italic uppercase tracking-tighter">
                        QR Scanner
                    </h3>
                    <p className="text-[9px] font-mono text-[#EAFF2B] uppercase tracking-widest">
                        Event Check-In System
                    </p>
                </div>
                <button
                    onClick={handleClose}
                    disabled={isProcessing}
                    className="text-gray-500 hover:text-white transition-colors text-[10px] uppercase tracking-widest disabled:opacity-50"
                >
                    [ Close ]
                </button>
            </div>

            {/* Camera Feed */}
            <div className="relative rounded-none overflow-hidden border-2 border-[#EAFF2B]/30">
                {isProcessing && (
                    <div className="absolute inset-0 bg-black/80 z-10 flex items-center justify-center">
                        <div className="text-center">
                            <div className="w-12 h-12 border-4 border-[#EAFF2B] border-t-transparent rounded-sm animate-spin mx-auto mb-3" />
                            <p className="text-[10px] text-[#EAFF2B] uppercase tracking-widest font-mono">
                                Verifying...
                            </p>
                        </div>
                    </div>
                )}
                <Scanner
                    onScan={onScan}
                    onError={onError}
                    paused={isPaused || isProcessing}
                    constraints={{
                        facingMode: 'environment',
                    }}
                    formats={['qr_code']}
                    components={{
                        torch: true,
                        finder: true,
                    }}
                    styles={{
                        container: {
                            width: '100%',
                            height: '350px',
                        },
                    }}
                    scanDelay={500}
                />
            </div>

            {/* Instructions */}
            <div className="mt-4 bg-[#EAFF2B]/10 border border-[#EAFF2B]/30 rounded-none p-4">
                <p className="text-[9px] text-[#EAFF2B] uppercase tracking-widest font-bold mb-2">
                    Instructions:
                </p>
                <ul className="text-[8px] text-gray-500 space-y-1 font-mono">
                    <li>• Hold phone steady over QR code</li>
                    <li>• Ensure good lighting conditions</li>
                    <li>• Scan happens automatically</li>
                </ul>
            </div>
        </ModalWrapper>
    );
}
