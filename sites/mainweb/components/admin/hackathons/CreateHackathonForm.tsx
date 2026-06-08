'use client';

import React, { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { LiquidGlass } from '@/components/portal/LiquidGlass';

export function CreateHackathonForm({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [location, setLocation] = useState('');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [regDeadline, setRegDeadline] = useState('');
    const [maxParticipants, setMaxParticipants] = useState('');
    const [theme, setTheme] = useState('');
    const [error, setError] = useState('');

    const createMutation = trpc.hackathon.create.useMutation({
        onSuccess: () => onCreated(),
        onError: (e) => setError(e.message),
    });

    function handleSubmit() {
        if (!name.trim() || !startDate || !endDate) {
            setError('Name, start date, and end date are required.');
            return;
        }
        setError('');
        createMutation.mutate({
            name: name.trim(),
            description: description.trim() || undefined,
            location: location.trim() || undefined,
            startDate: new Date(startDate),
            endDate: new Date(endDate),
            registrationDeadline: regDeadline ? new Date(regDeadline) : undefined,
            maxParticipants: maxParticipants ? parseInt(maxParticipants) : undefined,
            theme: theme.trim() || undefined,
        });
    }

    return (
        <LiquidGlass className="p-6 mb-6 relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-[#00E5FF]/30 to-transparent" />
            <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-bold text-white">New Hackathon</h3>
                <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors text-sm font-mono">✕</button>
            </div>

            <div className="space-y-4">
                <div>
                    <label className="block text-xs uppercase tracking-[0.15em] font-bold text-gray-500 mb-2 font-mono">Name *</label>
                    <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Hacklytics 2026" className="w-full px-4 py-3 bg-black/40 border border-white/10 rounded-none text-white text-sm font-mono placeholder:text-gray-600 focus:border-[#00E5FF]/50 focus:outline-none transition-colors" />
                </div>

                <div>
                    <label className="block text-xs uppercase tracking-[0.15em] font-bold text-gray-500 mb-2 font-mono">Description</label>
                    <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What's this hackathon about?" rows={3} className="w-full px-4 py-3 bg-black/40 border border-white/10 rounded-none text-white text-sm font-mono placeholder:text-gray-600 focus:border-[#00E5FF]/50 focus:outline-none transition-colors resize-none" />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                        <label className="block text-xs uppercase tracking-[0.15em] font-bold text-gray-500 mb-2 font-mono">Location</label>
                        <input type="text" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Klaus 1443" className="w-full px-4 py-3 bg-black/40 border border-white/10 rounded-none text-white text-sm font-mono placeholder:text-gray-600 focus:border-[#00E5FF]/50 focus:outline-none transition-colors" />
                    </div>
                    <div>
                        <label className="block text-xs uppercase tracking-[0.15em] font-bold text-gray-500 mb-2 font-mono">Theme</label>
                        <input type="text" value={theme} onChange={(e) => setTheme(e.target.value)} placeholder="Data for Good" className="w-full px-4 py-3 bg-black/40 border border-white/10 rounded-none text-white text-sm font-mono placeholder:text-gray-600 focus:border-[#00E5FF]/50 focus:outline-none transition-colors" />
                    </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                        <label className="block text-xs uppercase tracking-[0.15em] font-bold text-gray-500 mb-2 font-mono">Start Date *</label>
                        <input type="datetime-local" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-full px-4 py-3 bg-black/40 border border-white/10 rounded-none text-white text-sm font-mono focus:border-[#00E5FF]/50 focus:outline-none transition-colors [color-scheme:dark]" />
                    </div>
                    <div>
                        <label className="block text-xs uppercase tracking-[0.15em] font-bold text-gray-500 mb-2 font-mono">End Date *</label>
                        <input type="datetime-local" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-full px-4 py-3 bg-black/40 border border-white/10 rounded-none text-white text-sm font-mono focus:border-[#00E5FF]/50 focus:outline-none transition-colors [color-scheme:dark]" />
                    </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                        <label className="block text-xs uppercase tracking-[0.15em] font-bold text-gray-500 mb-2 font-mono">Registration Deadline</label>
                        <input type="datetime-local" value={regDeadline} onChange={(e) => setRegDeadline(e.target.value)} className="w-full px-4 py-3 bg-black/40 border border-white/10 rounded-none text-white text-sm font-mono focus:border-[#00E5FF]/50 focus:outline-none transition-colors [color-scheme:dark]" />
                    </div>
                    <div>
                        <label className="block text-xs uppercase tracking-[0.15em] font-bold text-gray-500 mb-2 font-mono">Max Participants</label>
                        <input type="number" value={maxParticipants} onChange={(e) => setMaxParticipants(e.target.value)} placeholder="500" className="w-full px-4 py-3 bg-black/40 border border-white/10 rounded-none text-white text-sm font-mono placeholder:text-gray-600 focus:border-[#00E5FF]/50 focus:outline-none transition-colors" />
                    </div>
                </div>

                {error && <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-none"><p className="text-red-400 text-sm font-mono">{error}</p></div>}

                <div className="flex items-center gap-4 pt-2">
                    <button
                        onClick={handleSubmit}
                        disabled={createMutation.isPending}
                        className="px-6 py-3 bg-gradient-to-r from-[#00E5FF] to-[#00E5FF] text-white font-semibold text-sm rounded-none active:scale-[0.98] transition-transform shadow-[4px_4px_0_0_#00E5FF] disabled:opacity-50"
                    >
                        {createMutation.isPending ? 'Creating...' : 'Create Hackathon'}
                    </button>
                    <button onClick={onClose} className="px-4 py-3 text-gray-500 hover:text-white text-sm font-mono transition-colors">Cancel</button>
                </div>
            </div>
        </LiquidGlass>
    );
}
