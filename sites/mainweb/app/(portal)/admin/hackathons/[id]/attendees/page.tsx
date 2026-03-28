'use client';

import React from 'react';
import { useSession } from 'next-auth/react';
import { trpc } from '@/lib/trpc';
import { useParams, useRouter } from 'next/navigation';
import Background from '@/components/portal/Background';
import { LiquidGlass } from '@/components/portal/LiquidGlass';
import { LoadingScreen } from '@/components/portal/LoadingScreen';
import Link from 'next/link';
import Image from 'next/image';

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

export default function AdminAttendeeViewer() {
    const { data: session, status: authStatus } = useSession();
    const router = useRouter();
    const params = useParams();
    const hackathonId = params?.id as string;

    const { data: adminStatus, isLoading: adminLoading } = trpc.admin.isAdmin.useQuery(undefined, { enabled: !!session });

    const { data: hackathon, isLoading: loadingHackathon } = trpc.hackathon.getById.useQuery({ id: hackathonId }, { enabled: !!hackathonId });
    const { data: attendees, isLoading: loadingAttendees } = trpc.hackathon.adminGetAttendees.useQuery({ hackathonId }, { enabled: !!hackathonId && !!adminStatus?.isAdmin });

    if (authStatus === 'loading' || adminLoading || loadingHackathon || loadingAttendees) {
        return <LoadingScreen message="Loading Attendee Data..." />;
    }

    if (!session || !adminStatus?.isAdmin) {
        router.push('/dashboard');
        return null;
    }

    if (!hackathon) {
        return (
            <div className="min-h-screen flex items-center justify-center text-white">
                Hackathon not found.
            </div>
        );
    }

    const exportToCSV = () => {
        if (!attendees || attendees.length === 0) return;

        const headers = ['Name', 'Email', 'Status', 'Team', 'Shirt Size', 'Dietary Restrictions', 'Emergency Contact', 'Emergency Phone', 'Registered At'];

        const rows = attendees.map(a => [
            `"${a.user?.name || 'Unknown'}"`,
            `"${a.user?.email || 'Unknown'}"`,
            `"${a.registrationStatus}"`,
            `"${a.team?.name || 'No Team'}"`,
            `"${a.shirtSize || 'None'}"`,
            `"${(a.dietaryRestrictions || []).join(', ') || 'None'}"`,
            `"${a.emergencyContact || ''}"`,
            `"${a.emergencyPhone || ''}"`,
            `"${new Date(a.registeredAt).toISOString()}"`
        ]);

        const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', `${hackathon.name.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_attendees.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    return (
        <div className="relative min-h-screen bg-[#050505] text-gray-400 font-sans selection:bg-[#00A8A8]/30">
            <Background className="fixed inset-0 z-0 opacity-[0.03]" />
            <main className="relative z-10 max-w-7xl mx-auto py-20 px-6">

                <Link href="/admin/hackathons" className="mb-8 flex items-center gap-2 text-gray-500 hover:text-white transition-colors text-sm font-mono uppercase tracking-wider group w-fit">
                    <svg className="w-4 h-4 transform group-hover:-translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
                    Back to Hackathons
                </Link>

                <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-12">
                    <div>
                        <p className="text-[#00A8A8] font-mono text-sm tracking-[0.2em] uppercase mb-2 flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-[#00A8A8] animate-pulse" />
                            Attendee Registry
                        </p>
                        <h1 className="text-4xl md:text-5xl font-black text-white uppercase tracking-tight italic">
                            {hackathon.name}
                        </h1>
                        <p className="text-gray-500 font-mono mt-2 flex gap-4">
                            <span>Total Registered: <strong className="text-white">{attendees?.length || 0}</strong></span>
                            <span>/</span>
                            <span>Capacity: <strong className="text-white">{hackathon.maxParticipants || 'Unlimited'}</strong></span>
                        </p>
                    </div>

                    <button
                        onClick={exportToCSV}
                        className="px-6 py-3 bg-[#00A8A8]/10 text-[#00A8A8] border border-[#00A8A8]/30 hover:bg-[#00A8A8]/20 hover:border-[#00A8A8]/50 transition-all rounded-lg font-mono text-xs uppercase tracking-wider font-bold flex items-center justify-center gap-2"
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                        Export CSV
                    </button>
                </div>

                <LiquidGlass className="p-0 overflow-hidden border-white/5">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm whitespace-nowrap">
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
                                        <td colSpan={5} className="px-6 py-12 text-center text-gray-500 font-mono italic">
                                            No registrations found for this event.
                                        </td>
                                    </tr>
                                ) : (
                                    attendees.map((attendee) => (
                                        <tr key={attendee.id} className="hover:bg-white/[0.02] transition-colors">
                                            <td className="px-6 py-4">
                                                <div className="flex items-center gap-3">
                                                    <Image
                                                        src={attendee.user?.image || '/avatar-placeholder.png'}
                                                        alt="Avatar"
                                                        width={32} height={32}
                                                        className="rounded-full bg-black border border-white/10"
                                                    />
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
                                            <td className="px-6 py-4">
                                                {attendee.team ? (
                                                    <div className="flex items-center gap-2">
                                                        <svg className="w-3 h-3 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
                                                        <span className="text-gray-300 font-medium">{attendee.team.name}</span>
                                                    </div>
                                                ) : (
                                                    <span className="text-gray-500 italic text-xs">No Team</span>
                                                )}
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="flex flex-col gap-1">
                                                    <p className="text-gray-400 text-xs"><span className="text-gray-500">Shirt:</span> {attendee.shirtSize || 'None'}</p>
                                                    {attendee.dietaryRestrictions && attendee.dietaryRestrictions.length > 0 && (
                                                        <p className="text-gray-400 text-xs"><span className="text-gray-500">Diet:</span> {attendee.dietaryRestrictions.join(', ')}</p>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 text-gray-500 font-mono text-xs">
                                                {new Date(attendee.registeredAt).toLocaleDateString()}
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </LiquidGlass>
            </main>
        </div>
    );
}
