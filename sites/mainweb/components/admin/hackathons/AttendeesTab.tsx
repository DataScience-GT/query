'use client';

import React from 'react';
import Image from 'next/image';
import { trpc } from '@/lib/trpc';
import { LiquidGlass } from '@/components/portal/LiquidGlass';

function statusColors(status: string) {
    switch (status) {
        case 'approved': return 'text-green-400 bg-green-500/10 border-green-500/20';
        case 'pending': return 'text-yellow-400 bg-yellow-500/10 border-yellow-500/20';
        case 'rejected': return 'text-red-400 bg-red-500/10 border-red-500/20';
        case 'waitlisted': return 'text-blue-400 bg-blue-500/10 border-blue-500/20';
        case 'checked_in': return 'text-purple-400 bg-purple-500/10 border-purple-500/20';
        default: return 'text-gray-400 bg-gray-500/10 border-gray-500/20';
    }
}

export function AttendeesTab({ hackathonId, hackathonName }: { hackathonId: string, hackathonName: string }) {
    const { data: attendees, isLoading } = trpc.hackathon.adminGetAttendees.useQuery({ hackathonId });

    if (isLoading) return <div className="text-gray-500 font-mono text-center py-20 animate-pulse">Loading Registry...</div>;

    const exportToCSV = () => {
        if (!attendees || attendees.length === 0) return;
        const headers = ['Name', 'Email', 'Status', 'Team', 'Shirt Size', 'Dietary Restrictions', 'Emergency Contact', 'Emergency Phone', 'Registered At'];

        type Attendee = NonNullable<typeof attendees>[number];

        const rows = attendees.map((a: Attendee) => [
            `"${a.user?.name || 'Unknown'}"`, `"${a.user?.email || 'Unknown'}"`, `"${a.registrationStatus}"`, `"${a.team?.name || 'No Team'}"`,
            `"${a.shirtSize || 'None'}"`, `"${(a.dietaryRestrictions || []).join(', ') || 'None'}"`, `"${a.emergencyContact || ''}"`,
            `"${a.emergencyPhone || ''}"`, `"${new Date(a.registeredAt).toISOString()}"`
        ]);
        const csvContent = [headers.join(','), ...rows.map((r: string[]) => r.join(','))].join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', `${hackathonName.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_attendees.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    return (
        <div className="animate-in fade-in slide-in-from-bottom-4 duration-300">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
                <div>
                    <h2 className="text-xl font-bold text-white uppercase tracking-wider">Registered Users</h2>
                    <p className="text-sm font-mono text-gray-500">{attendees?.length || 0} Total Participants</p>
                </div>
                <button
                    onClick={exportToCSV}
                    className="w-full sm:w-auto px-4 py-2 bg-white/5 border border-white/10 hover:bg-white/10 transition-colors rounded-lg font-mono text-xs uppercase tracking-wider font-bold text-white flex items-center justify-center gap-2"
                >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                    Export CSV
                </button>
            </div>

            <LiquidGlass className="p-0 overflow-hidden overflow-x-auto border-white/5">
                <table className="w-full text-left text-sm whitespace-nowrap min-w-[800px]">
                    <thead className="bg-black/40 border-b border-white/10 text-gray-400 font-mono text-[10px] uppercase tracking-wider">
                        <tr>
                            <th className="px-6 py-4 font-semibold">Participant</th>
                            <th className="px-6 py-4 font-semibold">Status</th>
                            <th className="px-6 py-4 font-semibold">Team</th>
                            <th className="px-6 py-4 font-semibold">Logistics</th>
                            <th className="px-6 py-4 font-semibold">Registered</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                        {(!attendees || attendees.length === 0) ? (
                            <tr>
                                <td colSpan={5} className="px-6 py-12 text-center text-gray-500 font-mono italic">No registrations found.</td>
                            </tr>
                        ) : (
                            attendees.map((attendee: NonNullable<typeof attendees>[number]) => (
                                <tr key={attendee.id} className="hover:bg-white/[0.02] transition-colors">
                                    <td className="px-6 py-4">
                                        <div className="flex items-center gap-3">
                                            <Image src={attendee.user?.image || '/avatar-placeholder.png'} alt="Avatar" width={32} height={32} className="rounded-full bg-black shrink-0" />
                                            <div>
                                                <p className="text-white font-bold">{attendee.user?.name || 'Unknown User'}</p>
                                                <p className="text-gray-500 text-xs">{attendee.user?.email || 'No email'}</p>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <span className={`px-2 py-1 rounded border text-[10px] font-mono font-bold uppercase tracking-wider ${statusColors(attendee.registrationStatus)}`}>
                                            {attendee.registrationStatus}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 text-gray-300 font-medium">
                                        {attendee.team?.name || <span className="text-gray-600 italic font-normal text-xs">No Team</span>}
                                    </td>
                                    <td className="px-6 py-4 text-xs font-mono">
                                        <p className="text-gray-400"><span className="text-gray-500">Shirt:</span> {attendee.shirtSize}</p>
                                    </td>
                                    <td className="px-6 py-4 text-gray-500 font-mono text-xs">
                                        {new Date(attendee.registeredAt).toLocaleDateString()}
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </LiquidGlass>
        </div>
    );
}
