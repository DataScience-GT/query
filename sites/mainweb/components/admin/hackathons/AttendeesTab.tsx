'use client';

import React, { useState } from 'react';
import Image from 'next/image';
import { trpc } from '@/lib/trpc';
import { LiquidGlass } from '@/components/portal/LiquidGlass';
import { ChevronDown, ChevronUp, ExternalLink } from 'lucide-react';

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
    const utils = trpc.useUtils();
    const { data: attendees, isLoading } = trpc.hackathon.adminGetAttendees.useQuery({ hackathonId });
    const updateStatus = trpc.hackathon.updateParticipantStatus.useMutation({
        onSuccess: () => {
            utils.hackathon.adminGetAttendees.invalidate({ hackathonId });
        }
    });

    const [expandedRow, setExpandedRow] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'approved' | 'rejected' | 'waitlisted' | 'checked_in'>('all');

    if (isLoading) return <div className="text-gray-500 font-mono text-center py-20 animate-pulse">Loading Registry...</div>;

    const filteredAttendees = attendees?.filter((a) => {
        if (statusFilter !== 'all' && a.registrationStatus !== statusFilter) return false;
        if (!searchQuery.trim()) return true;
        const q = searchQuery.toLowerCase();
        return (
            (a.user?.name || '').toLowerCase().includes(q) ||
            (a.user?.email || '').toLowerCase().includes(q) ||
            (a.school || '').toLowerCase().includes(q) ||
            (a.major || '').toLowerCase().includes(q)
        );
    }) || [];

    const exportToCSV = () => {
        if (!filteredAttendees || filteredAttendees.length === 0) return;
        const headers = ['Name', 'Email', 'Status', 'Team', 'School', 'Major', 'Grad Year', 'Shirt Size', 'Dietary Restrictions', 'Emergency Contact', 'Emergency Phone', 'Registered At'];

        type Attendee = typeof filteredAttendees[number];

        const rows = filteredAttendees.map((a: Attendee) => [
            `"${a.user?.name || 'Unknown'}"`, `"${a.user?.email || 'Unknown'}"`, `"${a.registrationStatus}"`, `"${a.team?.name || 'No Team'}"`,
            `"${a.school || ''}"`, `"${a.major || ''}"`, `"${a.graduationYear || ''}"`,
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

    const handleStatusUpdate = (participantId: string, newStatus: "pending" | "approved" | "rejected" | "waitlisted" | "checked_in") => {
        updateStatus.mutate({ hackathonId, participantId, status: newStatus });
    };

    return (
        <div className="animate-in fade-in slide-in-from-bottom-4 duration-300">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
                <div>
                    <h2 className="text-xl font-bold text-white uppercase tracking-wider">Registered Users</h2>
                    <p className="text-sm font-mono text-gray-500">{filteredAttendees.length} of {attendees?.length || 0} Total Participants</p>
                </div>
                <button
                    onClick={exportToCSV}
                    className="w-full sm:w-auto px-4 py-2 bg-white/5 border border-white/10 hover:bg-white/10 transition-colors rounded-lg font-mono text-xs uppercase tracking-wider font-bold text-white flex items-center justify-center gap-2"
                >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                    Export CSV
                </button>
            </div>

            {/* Search and Filters */}
            <div className="flex flex-col md:flex-row gap-4 mb-6">
                <div className="flex-1">
                    <input
                        type="text"
                        placeholder="Search by name, email, school, or major..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full bg-black/30 border border-white/10 rounded-xl px-4 py-3 text-white placeholder:text-gray-600 focus:outline-none focus:border-[#00A8A8]/50 transition-colors"
                    />
                </div>
                <div className="flex flex-wrap gap-2 items-center bg-black/30 border border-white/5 p-1.5 rounded-xl">
                    {(['all', 'pending', 'approved', 'waitlisted', 'rejected', 'checked_in'] as const).map((s) => (
                        <button
                            key={s}
                            onClick={() => setStatusFilter(s)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold uppercase tracking-wider transition-all border border-transparent ${
                                statusFilter === s
                                    ? 'bg-[#00A8A8]/20 text-[#00A8A8] border-[#00A8A8]/30 shadow-[#00A8A8]/10'
                                    : 'text-gray-400 hover:text-white hover:bg-white/5'
                            }`}
                        >
                            {s === 'all' ? 'All' : s === 'checked_in' ? 'Checked In' : s.charAt(0).toUpperCase() + s.slice(1)}
                        </button>
                    ))}
                </div>
            </div>

            <LiquidGlass className="p-0 overflow-hidden overflow-x-auto border-white/5 relative z-10">
                <table className="w-full text-left text-sm whitespace-nowrap min-w-[800px]">
                    <thead className="bg-black/40 border-b border-white/10 text-gray-400 font-mono text-[10px] uppercase tracking-wider">
                        <tr>
                            <th className="px-6 py-4 font-semibold w-12"></th>
                            <th className="px-6 py-4 font-semibold">Participant</th>
                            <th className="px-6 py-4 font-semibold">Status</th>
                            <th className="px-6 py-4 font-semibold">School & Major</th>
                            <th className="px-6 py-4 font-semibold text-right">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                        {(!filteredAttendees || filteredAttendees.length === 0) ? (
                            <tr>
                                <td colSpan={5} className="px-6 py-12 text-center text-gray-500 font-mono italic">No registrations found.</td>
                            </tr>
                        ) : (
                            filteredAttendees.map((attendee) => (
                                <React.Fragment key={attendee.id}>
                                    <tr className="hover:bg-white/[0.02] transition-colors cursor-pointer" onClick={() => setExpandedRow(expandedRow === attendee.id ? null : attendee.id)}>
                                        <td className="px-6 py-4">
                                            {expandedRow === attendee.id ? <ChevronUp className="w-4 h-4 text-cyan-400" /> : <ChevronDown className="w-4 h-4 text-gray-500" />}
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-3">
                                                <Image src={attendee.user?.image || '/avatar-placeholder.png'} alt="Avatar" width={32} height={32} className="rounded-full bg-black shrink-0" />
                                                <div>
                                                    <p className="text-white font-bold">{attendee.user?.name || 'Unknown User'}</p>
                                                    <p className="text-gray-500 text-xs font-mono">{attendee.user?.email || 'No email'}</p>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className={`px-2 py-1 rounded border text-[10px] font-mono font-bold uppercase tracking-wider ${statusColors(attendee.registrationStatus)}`}>
                                                {attendee.registrationStatus}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4">
                                            <p className="text-gray-300 text-xs max-w-[200px] truncate">{attendee.school || 'N/A'}</p>
                                            <p className="text-gray-500 text-xs truncate max-w-[200px]">{attendee.major || 'N/A'}</p>
                                        </td>
                                        <td className="px-6 py-4 text-right" onClick={e => e.stopPropagation()}>
                                            <select 
                                                className={`bg-black border rounded-lg text-xs font-mono px-3 py-1.5 outline-none cursor-pointer ${statusColors(attendee.registrationStatus)} disabled:opacity-50`}
                                                value={attendee.registrationStatus}
                                                onChange={(e) => handleStatusUpdate(attendee.id, e.target.value as any)}
                                                disabled={updateStatus.isPending}
                                            >
                                                <option value="pending">Pending</option>
                                                <option value="waitlisted">Waitlisted</option>
                                                <option value="approved">Approved</option>
                                                <option value="rejected">Rejected</option>
                                                <option value="checked_in">Checked In</option>
                                            </select>
                                        </td>
                                    </tr>
                                    {expandedRow === attendee.id && (
                                        <tr className="bg-black/30">
                                            <td colSpan={5} className="p-0">
                                                <div className="p-6 md:p-8 animate-in fade-in duration-300">
                                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                                                        
                                                        {/* General Info */}
                                                        <div className="space-y-4">
                                                            <h4 className="text-[10px] uppercase font-bold tracking-widest text-cyan-500 border-b border-cyan-500/20 pb-2 mb-3">Application Details</h4>
                                                            <div>
                                                                <p className="text-gray-500 text-[10px] uppercase tracking-wider mb-1">Education</p>
                                                                <p className="text-sm text-gray-200">{attendee.school} • {attendee.levelOfStudy}</p>
                                                                <p className="text-xs text-gray-400">{attendee.major} (Class of {attendee.graduationYear})</p>
                                                            </div>
                                                            <div>
                                                                <p className="text-gray-500 text-[10px] uppercase tracking-wider mb-1">Personal</p>
                                                                <p className="text-sm text-gray-200">{attendee.age} years old • {attendee.gender || 'Not specified'}</p>
                                                                <p className="text-sm text-gray-200">{attendee.country}</p>
                                                                <p className="text-xs text-gray-400 mt-1">{attendee.phone}</p>
                                                            </div>
                                                        </div>

                                                        {/* Experience & Logistics */}
                                                        <div className="space-y-4">
                                                            <h4 className="text-[10px] uppercase font-bold tracking-widest text-cyan-500 border-b border-cyan-500/20 pb-2 mb-3">Logistics & Links</h4>
                                                            <div className="flex gap-4">
                                                                {attendee.resumeUrl && (
                                                                    <a href={attendee.resumeUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-xs font-bold text-cyan-400 hover:text-cyan-300 transition-colors">
                                                                        <ExternalLink className="w-3 h-3" /> Resume
                                                                    </a>
                                                                )}
                                                                {attendee.githubUrl && (
                                                                    <a href={attendee.githubUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-xs font-bold text-cyan-400 hover:text-cyan-300 transition-colors">
                                                                        <ExternalLink className="w-3 h-3" /> GitHub
                                                                    </a>
                                                                )}
                                                                {attendee.linkedinUrl && (
                                                                    <a href={attendee.linkedinUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-xs font-bold text-cyan-400 hover:text-cyan-300 transition-colors">
                                                                        <ExternalLink className="w-3 h-3" /> LinkedIn
                                                                    </a>
                                                                )}
                                                            </div>
                                                            <div className="grid grid-cols-2 gap-4 pt-2">
                                                                <div>
                                                                    <p className="text-gray-500 text-[10px] uppercase tracking-wider mb-1">Shirt Size</p>
                                                                    <p className="text-sm text-gray-200 font-bold">{attendee.shirtSize || 'N/A'}</p>
                                                                </div>
                                                                <div>
                                                                    <p className="text-gray-500 text-[10px] uppercase tracking-wider mb-1">Dietary</p>
                                                                    <p className="text-sm text-gray-200">{(attendee.dietaryRestrictions || []).join(', ') || 'None'}</p>
                                                                </div>
                                                            </div>
                                                            <div>
                                                                <p className="text-gray-500 text-[10px] uppercase tracking-wider mb-1">Emergency</p>
                                                                <p className="text-sm text-gray-200">{attendee.emergencyContact}</p>
                                                                <p className="text-xs text-gray-400">{attendee.emergencyPhone}</p>
                                                            </div>
                                                        </div>

                                                        {/* Questionnaire */}
                                                        <div className="space-y-4 lg:col-span-1 md:col-span-2">
                                                            <h4 className="text-[10px] uppercase font-bold tracking-widest text-cyan-500 border-b border-cyan-500/20 pb-2 mb-3">Questionnaire</h4>
                                                            <div>
                                                                <p className="text-gray-500 text-[10px] uppercase tracking-wider mb-1">Hackathons Attended</p>
                                                                <p className="text-sm text-gray-200 font-mono bg-white/5 w-fit px-2 py-0.5 rounded border border-white/10">{attendee.hackathonsAttended ?? 0}</p>
                                                            </div>
                                                            <div>
                                                                <p className="text-gray-500 text-[10px] uppercase tracking-wider mb-2">Why Attend?</p>
                                                                <div className="bg-white/5 border border-white/5 p-4 rounded-xl">
                                                                    <p className="text-xs text-gray-300 italic whitespace-pre-wrap leading-relaxed">
                                                                        {attendee.whyAttend ? `"${attendee.whyAttend}"` : "No answer provided."}
                                                                    </p>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            </td>
                                        </tr>
                                    )}
                                </React.Fragment>
                            ))
                        )}
                    </tbody>
                </table>
            </LiquidGlass>
        </div>
    );
}
