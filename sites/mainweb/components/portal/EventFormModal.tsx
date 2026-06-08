'use client';

import React, { useEffect, useState } from 'react';
import { ModalWrapper } from './ModalWrapper';

interface EventFormData {
    title: string;
    description: string;
    location: string;
    eventDate: string;
}

interface EventFormModalProps {
    onClose: () => void;
    onSubmit: (data: EventFormData) => void;
    isSubmitting?: boolean;
}

function getCurrentDateTimeLocal(): string {
    const now = new Date();
    const offset = now.getTimezoneOffset();
    const localDate = new Date(now.getTime() - offset * 60 * 1000);
    return localDate.toISOString().slice(0, 16);
}

export function EventFormModal({
    onClose,
    onSubmit,
    isSubmitting = false,
}: EventFormModalProps) {
    const [form, setForm] = useState<EventFormData>({
        title: '',
        description: '',
        location: '',
        eventDate: '',
    });

    // Auto-fill date/time when modal opens
    useEffect(() => {
        setForm((prev) => ({
            ...prev,
            eventDate: getCurrentDateTimeLocal(),
        }));
    }, []);

    const handleSubmit = () => {
        onSubmit(form);
    };

    const isValid = form.title.trim() && form.eventDate;

    return (
        <ModalWrapper onClose={onClose} maxWidth="2xl">
            {/* Header */}
            <div className="flex justify-between items-center mb-8 pb-4 border-b border-white/5">
                <div>
                    <h3 className="text-3xl font-black text-white italic uppercase tracking-tighter">
                        Create Event
                    </h3>
                    <p className="text-xs font-mono text-[#00E5FF] uppercase tracking-widest">
                        Configure QR Protocols
                    </p>
                </div>
                <button
                    onClick={onClose}
                    className="text-gray-500 hover:text-white transition-colors text-sm uppercase tracking-widest font-mono p-2 hover:bg-white/5 rounded"
                >
                    [ Close Panel ]
                </button>
            </div>

            <div className="space-y-6">
                {/* Title */}
                <div className="space-y-2">
                    <label className="text-sm text-gray-500 uppercase tracking-widest font-mono block font-bold mb-2">
                        Event Title Identifier
                    </label>
                    <input
                        type="text"
                        value={form.title}
                        onChange={(e) => setForm({ ...form, title: e.target.value })}
                        className="w-full bg-black/40 border border-white/10 rounded-none px-6 py-4 text-white text-base focus:border-[#00E5FF] focus:outline-none transition-all font-mono"
                        placeholder="e.g., Weekly Workshop 01"
                    />
                </div>

                {/* Description */}
                <div className="space-y-2">
                    <label className="text-xs text-gray-500 uppercase tracking-widest font-mono block">
                        Data Description
                    </label>
                    <textarea
                        value={form.description}
                        onChange={(e) => setForm({ ...form, description: e.target.value })}
                        className="w-full bg-black/40 border border-white/10 rounded-none px-4 py-3 text-white text-sm focus:border-[#00E5FF] focus:outline-none transition-all resize-none font-mono"
                        rows={3}
                        placeholder="System details..."
                    />
                </div>

                {/* Location and Date */}
                <div className="grid grid-cols-2 gap-6">
                    <div className="space-y-2">
                        <label className="text-xs text-gray-500 uppercase tracking-widest font-mono block">
                            Location Node
                        </label>
                        <input
                            type="text"
                            value={form.location}
                            onChange={(e) => setForm({ ...form, location: e.target.value })}
                            className="w-full bg-black/40 border border-white/10 rounded-none px-4 py-3 text-white text-sm focus:border-[#00E5FF] focus:outline-none transition-all font-mono"
                            placeholder="e.g., Klaus 2443"
                        />
                    </div>

                    <div className="space-y-2">
                        <label className="text-xs text-gray-500 uppercase tracking-widest font-mono block">
                            Temporal Stamp
                        </label>
                        <input
                            type="datetime-local"
                            value={form.eventDate}
                            onChange={(e) => setForm({ ...form, eventDate: e.target.value })}
                            className="w-full bg-black/40 border border-white/10 rounded-none px-4 py-3 text-white text-sm focus:border-[#00E5FF] focus:outline-none transition-all font-mono"
                        />
                    </div>
                </div>

                {/* Submit Button */}
                <button
                    onClick={handleSubmit}
                    disabled={!isValid || isSubmitting}
                    className="w-full px-8 py-5 bg-[#00E5FF] text-black font-black text-base uppercase tracking-[0.2em] hover:bg-[#00E5FF]/90 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_0_30px_rgba(0,168,168,0.3)] mt-6 rounded-none"
                >
                    {isSubmitting ? 'Processing...' : 'INITIALIZE EVENT'}
                </button>
            </div>
        </ModalWrapper>
    );
}
