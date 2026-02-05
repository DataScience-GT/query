'use client';

import React from 'react';

interface ModalWrapperProps {
    children: React.ReactNode;
    onClose: () => void;
    maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | '2xl';
}

const maxWidthClasses = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-lg',
    xl: 'max-w-xl',
    '2xl': 'max-w-2xl',
};

export function ModalWrapper({
    children,
    onClose,
    maxWidth = 'md',
}: ModalWrapperProps) {
    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <div
                className="absolute inset-0 bg-black/95 backdrop-blur-md"
                onClick={onClose}
            />
            <div
                className={`relative w-full ${maxWidthClasses[maxWidth]} bg-[#0A0A0A] border border-[#00A8A8]/30 rounded-2xl p-8 shadow-[0_0_50px_rgba(0,168,168,0.2)] animate-in zoom-in-95 duration-300 max-h-[90vh] overflow-y-auto`}
            >
                {children}
            </div>
        </div>
    );
}
