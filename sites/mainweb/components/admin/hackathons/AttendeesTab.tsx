'use client';

import React, { useState, useMemo } from 'react';
import Image from 'next/image';
import { trpc } from '@/lib/trpc';
import { LiquidGlass } from '@/components/portal/LiquidGlass';
import { ChevronDown, ChevronUp, ExternalLink, Check, X, Clock, UserCheck, UserX, Users, Shield } from 'lucide-react';

type RegistrationStatus = 'pending' | 'approved' | 'rejected' | 'waitlisted' | 'checked_in';

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

function statusIcon(status: string) {
    switch (status) {
        case 'approved': return <UserCheck className="w-3.5 h-3.5" />;
        case 'pending': return <Clock className="w-3.5 h-3.5" />;
        case 'rejected': return <UserX className="w-3.5 h-3.5" />;
        case 'waitlisted': return <Users className="w-3.5 h-3.5" />;
        case 'checked_in': return <Shield className="w-3.5 h-3.5" />;
        default: return null;
    }
}

export function AttendeesTab({ hackathonId, hackathonName }: { hackathonId: string; hackathonName: string }) {
    const utils = trpc.useUtils();
    const { data: attendees, isLoading } = trpc.hackathon.adminGetAttendees.useQuery({ hackathonId });
    const { data: hackathon } = trpc.hackathon.getById.useQuery({ id: hackathonId });
    const updateStatus = trpc.hackathon.updateParticipantStatus.useMutation({
        onSuccess: () => {
            utils.hackathon.adminGetAttendees.invalidate({ hackathonId });
            utils.hackathon.getById.invalidate({ id: hackathonId });
            utils.hackathon.listAll.invalidate();
        },
    });

    const batchUpdateStatus = trpc.hackathon.batchUpdateParticipantStatus.useMutation({
        onSuccess: () => {
            utils.hackathon.adminGetAttendees.invalidate({ hackathonId });
            utils.hackathon.getById.invalidate({ id: hackathonId });
            utils.hackathon.listAll.invalidate();
            setSelectedIds(new Set());
        },
    });

    const updateHackathon = trpc.hackathon.update.useMutation({
        onSuccess: () => {
            utils.hackathon.getById.invalidate({ id: hackathonId });
            utils.hackathon.listAll.invalidate();
        },
    });

    const [expandedRow, setExpandedRow] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState<'all' | RegistrationStatus>('all');
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

    // Stats
    const stats = useMemo(() => {
        if (!attendees) return { total: 0, pending: 0, approved: 0, rejected: 0, waitlisted: 0, checked_in: 0 };
        return {
            total: attendees.length,
            pending: attendees.filter((a) => a.registrationStatus === 'pending').length,
            approved: attendees.filter((a) => a.registrationStatus === 'approved').length,
            rejected: attendees.filter((a) => a.registrationStatus === 'rejected').length,
            waitlisted: attendees.filter((a) => a.registrationStatus === 'waitlisted').length,
            checked_in: attendees.filter((a) => a.registrationStatus === 'checked_in').length,
        };
    }, [attendees]);

    if (isLoading) return <div className="text-gray-500 font-mono text-center py-20 animate-pulse">Loading Registry...</div>;

    const filteredAttendees = attendees?.filter((a) => {
        if (statusFilter !== 'all' && a.registrationStatus !== statusFilter) return false;
        if (!searchQuery.trim()) return true;
        const q = searchQuery.toLowerCase();
        return (
            (a.user?.name || '').toLowerCase().includes(q) ||
            (a.user?.email || '').toLowerCase().includes(q) ||
            (a.school || '').toLowerCase().includes(q) ||
            (a.major || '').toLowerCase().includes(q) ||
            (a.firstName || '').toLowerCase().includes(q) ||
            (a.lastName || '').toLowerCase().includes(q) ||
            (a.whyAttend || '').toLowerCase().includes(q)
        );
    }) || [];

    const exportToCSV = () => {
        if (!filteredAttendees || filteredAttendees.length === 0) return;
        const headers = ['Name', 'Email', 'Status', 'Team', 'School', 'Major', 'Grad Year', 'Why Attend', 'Shirt Size', 'Dietary Restrictions', 'Emergency Contact', 'Emergency Phone', 'Registered At'];
        type Attendee = (typeof filteredAttendees)[number];
        const rows = filteredAttendees.map((a: Attendee) => [
            `"${a.firstName || ''} ${a.lastName || ''}"`,
            `"${a.user?.email || 'Unknown'}"`,
            `"${a.registrationStatus}"`,
            `"${a.team?.name || 'No Team'}"`,
            `"${a.school || ''}"`,
            `"${a.major || ''}"`,
            `"${a.graduationYear || ''}"`,
            `"${(a.whyAttend || '').replace(/"/g, "'")}"`,
            `"${a.shirtSize || 'None'}"`,
            `"${(a.dietaryRestrictions || []).join(', ') || 'None'}"`,
            `"${a.emergencyContact || ''}"`,
            `"${a.emergencyPhone || ''}"`,
            `"${new Date(a.registeredAt).toISOString()}"`,
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

    const handleStatusUpdate = (participantId: string, newStatus: RegistrationStatus) => {
        updateStatus.mutate({ hackathonId, participantId, status: newStatus });
    };

    const handleBulkAction = (newStatus: RegistrationStatus) => {
        batchUpdateStatus.mutate({
            hackathonId,
            participantIds: Array.from(selectedIds),
            status: newStatus,
        });
    };

    const toggleSelect = (id: string) => {
        const next = new Set(selectedIds);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        setSelectedIds(next);
    };

    const selectAllVisible = () => {
        if (selectedIds.size === filteredAttendees.length) {
            setSelectedIds(new Set());
        } else {
            setSelectedIds(new Set(filteredAttendees.map((a) => a.id)));
        }
    };

    const regDeadline = hackathon?.registrationDeadline ? new Date(hackathon.registrationDeadline) : null;
    const deadlinePassed = regDeadline && regDeadline < new Date();

    return (
        <div className="animate-in fade-in slide-in-from-bottom-4 duration-300 space-y-6">
            {/* Registration Controls Card */}
            <LiquidGlass className="p-6 border-white/5 relative overflow-hidden">
                <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-amber-500/30 to-transparent" />
                <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6">
                    <div>
                        <h3 className="text-sm font-bold text-white uppercase tracking-widest flex items-center gap-2 mb-2">
                            <Clock className="w-4 h-4 text-amber-400" />
                            Registration Controls
                        </h3>
                        <div className="flex items-center gap-4 flex-wrap">
                            <div className="flex items-center gap-2">
                                <span className="text-xs font-mono text-gray-500 uppercase tracking-wider">Status:</span>
                                <span className={`px-2 py-1 rounded text-xs font-mono font-bold uppercase tracking-wider ${hackathon?.status === 'open' ? 'text-green-400 bg-green-500/10 border border-green-500/20' : 'text-yellow-400 bg-yellow-500/10 border border-yellow-500/20'}`}>
                                    {hackathon?.status || 'unknown'}
                                </span>
                            </div>
                            <div className="flex items-center gap-2">
                                <span className="text-xs font-mono text-gray-500 uppercase tracking-wider">Deadline:</span>
                                <span className={`text-xs font-mono font-bold ${deadlinePassed ? 'text-red-400' : 'text-amber-400'}`}>
                                    {regDeadline ? regDeadline.toLocaleString() : 'No deadline set'}
                                    {deadlinePassed ? ' (PASSED)' : ''}
                                </span>
                            </div>
                        </div>
                    </div>
                    <div className="flex items-center gap-3 flex-wrap">
                        {hackathon?.status !== 'open' && (
                            <button
                                onClick={() => updateHackathon.mutate({ id: hackathonId, status: 'open' })}
                                disabled={updateHackathon.isPending}
                                className="px-4 py-2.5 bg-green-500/10 border border-green-500/20 text-green-400 text-xs font-bold uppercase tracking-wider rounded-xl hover:bg-green-500/20 transition-colors disabled:opacity-50"
                            >
                                Open Registration
                            </button>
                        )}
                        {hackathon?.status === 'open' && (
                            <button
                                onClick={() => updateHackathon.mutate({ id: hackathonId, status: 'closed' })}
                                disabled={updateHackathon.isPending}
                                className="px-4 py-2.5 bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-bold uppercase tracking-wider rounded-xl hover:bg-red-500/20 transition-colors disabled:opacity-50"
                            >
                                Close Registration
                            </button>
                        )}
                        <div className="flex items-center gap-2">
                            <input
                                type="datetime-local"
                                defaultValue={regDeadline ? regDeadline.toISOString().slice(0, 16) : ''}
                                onChange={(e) => {
                                    if (e.target.value) {
                                        updateHackathon.mutate({ id: hackathonId, registrationDeadline: new Date(e.target.value) });
                                    }
                                }}
                                className="px-3 py-2 bg-black/40 border border-white/10 rounded-lg text-white text-xs font-mono focus:border-[#00A8A8]/50 focus:outline-none transition-colors [color-scheme:dark]"
                            />
                        </div>
                    </div>
                </div>
            </LiquidGlass>

            {/* Stats Overview */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                {[
                    { label: 'Total', value: stats.total, color: 'text-white', bg: 'bg-white/5', border: 'border-white/10', filter: 'all' as const },
                    { label: 'Pending', value: stats.pending, color: 'text-yellow-400', bg: 'bg-yellow-500/5', border: 'border-yellow-500/15', filter: 'pending' as const },
                    { label: 'Approved', value: stats.approved, color: 'text-green-400', bg: 'bg-green-500/5', border: 'border-green-500/15', filter: 'approved' as const },
                    { label: 'Rejected', value: stats.rejected, color: 'text-red-400', bg: 'bg-red-500/5', border: 'border-red-500/15', filter: 'rejected' as const },
                    { label: 'Waitlisted', value: stats.waitlisted, color: 'text-blue-400', bg: 'bg-blue-500/5', border: 'border-blue-500/15', filter: 'waitlisted' as const },
                    { label: 'Checked In', value: stats.checked_in, color: 'text-purple-400', bg: 'bg-purple-500/5', border: 'border-purple-500/15', filter: 'checked_in' as const },
                ].map((stat) => (
                    <button
                        key={stat.label}
                        onClick={() => setStatusFilter(stat.filter)}
                        className={`p-4 rounded-xl border transition-all text-left ${statusFilter === stat.filter ? `${stat.bg} ${stat.border} ring-1 ring-white/10 scale-[1.02]` : 'bg-black/20 border-white/5 hover:bg-white/[0.03] hover:border-white/10'}`}
                    >
                        <p className={`text-2xl font-black font-mono ${stat.color}`}>{stat.value}</p>
                        <p className="text-[10px] font-mono text-gray-500 uppercase tracking-widest mt-1">{stat.label}</p>
                    </button>
                ))}
            </div>

            {/* Header + Actions */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h2 className="text-xl font-bold text-white uppercase tracking-wider">Applications</h2>
                    <p className="text-sm font-mono text-gray-500">{filteredAttendees.length} of {attendees?.length || 0} registrations</p>
                </div>
                <div className="flex items-center gap-3 flex-wrap">
                    {selectedIds.size > 0 && (
                        <div className="flex items-center gap-2 animate-in fade-in duration-200">
                            <span className="text-xs font-mono text-accent font-bold">{selectedIds.size} selected</span>
                            <button
                                onClick={() => handleBulkAction('approved')}
                                className="px-3 py-1.5 bg-green-500/10 border border-green-500/20 text-green-400 rounded-lg text-xs font-bold uppercase tracking-wider hover:bg-green-500/20 transition-colors flex items-center gap-1.5"
                            >
                                <Check className="w-3 h-3" /> Approve All
                            </button>
                            <button
                                onClick={() => handleBulkAction('rejected')}
                                className="px-3 py-1.5 bg-red-500/10 border border-red-500/20 text-red-400 rounded-lg text-xs font-bold uppercase tracking-wider hover:bg-red-500/20 transition-colors flex items-center gap-1.5"
                            >
                                <X className="w-3 h-3" /> Reject All
                            </button>
                            <button
                                onClick={() => handleBulkAction('waitlisted')}
                                className="px-3 py-1.5 bg-blue-500/10 border border-blue-500/20 text-blue-400 rounded-lg text-xs font-bold uppercase tracking-wider hover:bg-blue-500/20 transition-colors flex items-center gap-1.5"
                            >
                                <Clock className="w-3 h-3" /> Waitlist All
                            </button>
                        </div>
                    )}
                    <button
                        onClick={exportToCSV}
                        className="px-4 py-2 bg-white/5 border border-white/10 hover:bg-white/10 transition-colors rounded-lg font-mono text-xs uppercase tracking-wider font-bold text-white flex items-center gap-2"
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                        Export CSV
                    </button>
                </div>
            </div>

            {/* Search */}
            <div className="flex-1">
                <input
                    type="text"
                    placeholder="Search by name, email, school, major, or response..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full bg-black/30 border border-white/10 rounded-xl px-4 py-3 text-white placeholder:text-gray-600 focus:outline-none focus:border-[#00A8A8]/50 transition-colors"
                />
            </div>

            {/* Table */}
            <LiquidGlass className="p-0 overflow-hidden overflow-x-auto border-white/5 relative z-10">
                <table className="w-full text-left text-sm whitespace-nowrap min-w-[900px]">
                    <thead className="bg-black/40 border-b border-white/10 text-gray-400 font-mono text-[10px] uppercase tracking-wider">
                        <tr>
                            <th className="px-4 py-4 font-semibold w-10">
                                <input
                                    type="checkbox"
                                    checked={selectedIds.size === filteredAttendees.length && filteredAttendees.length > 0}
                                    onChange={selectAllVisible}
                                    className="w-3.5 h-3.5 rounded border-white/20 bg-transparent accent-[#00A8A8] cursor-pointer"
                                />
                            </th>
                            <th className="px-4 py-4 font-semibold w-8"></th>
                            <th className="px-4 py-4 font-semibold">Applicant</th>
                            <th className="px-4 py-4 font-semibold">Status</th>
                            <th className="px-4 py-4 font-semibold">School & Major</th>
                            <th className="px-4 py-4 font-semibold">Applied</th>
                            <th className="px-6 py-4 font-semibold text-right">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                        {filteredAttendees.length === 0 ? (
                            <tr>
                                <td colSpan={7} className="px-6 py-12 text-center text-gray-500 font-mono italic">No registrations found.</td>
                            </tr>
                        ) : (
                            filteredAttendees.map((attendee) => (
                                <React.Fragment key={attendee.id}>
                                    <tr className={`hover:bg-white/[0.02] transition-colors cursor-pointer ${selectedIds.has(attendee.id) ? 'bg-accent/[0.03]' : ''}`}>
                                        <td className="px-4 py-4" onClick={(e) => { e.stopPropagation(); toggleSelect(attendee.id); }}>
                                            <input
                                                type="checkbox"
                                                checked={selectedIds.has(attendee.id)}
                                                onChange={() => toggleSelect(attendee.id)}
                                                className="w-3.5 h-3.5 rounded border-white/20 bg-transparent accent-[#00A8A8] cursor-pointer"
                                            />
                                        </td>
                                        <td className="px-4 py-4" onClick={() => setExpandedRow(expandedRow === attendee.id ? null : attendee.id)}>
                                            {expandedRow === attendee.id ? <ChevronUp className="w-4 h-4 text-cyan-400" /> : <ChevronDown className="w-4 h-4 text-gray-500" />}
                                        </td>
                                        <td className="px-4 py-4" onClick={() => setExpandedRow(expandedRow === attendee.id ? null : attendee.id)}>
                                            <div className="flex items-center gap-3">
                                                <Image src={attendee.user?.image || '/avatar-placeholder.png'} alt="Avatar" width={32} height={32} className="rounded-full bg-black shrink-0" />
                                                <div>
                                                    <p className="text-white font-bold">{attendee.firstName && attendee.lastName ? `${attendee.firstName} ${attendee.lastName}` : (attendee.user?.name || 'Unknown User')}</p>
                                                    <p className="text-gray-500 text-xs font-mono">{attendee.user?.email || 'No email'}</p>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-4 py-4" onClick={() => setExpandedRow(expandedRow === attendee.id ? null : attendee.id)}>
                                            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded border text-[10px] font-mono font-bold uppercase tracking-wider ${statusColors(attendee.registrationStatus)}`}>
                                                {statusIcon(attendee.registrationStatus)}
                                                {attendee.registrationStatus === 'checked_in' ? 'Checked In' : attendee.registrationStatus}
                                            </span>
                                        </td>
                                        <td className="px-4 py-4" onClick={() => setExpandedRow(expandedRow === attendee.id ? null : attendee.id)}>
                                            <p className="text-gray-300 text-xs max-w-[200px] truncate">{attendee.school || 'N/A'}</p>
                                            <p className="text-gray-500 text-xs truncate max-w-[200px]">{attendee.major || 'N/A'}</p>
                                        </td>
                                        <td className="px-4 py-4 text-xs font-mono text-gray-500" onClick={() => setExpandedRow(expandedRow === attendee.id ? null : attendee.id)}>
                                            {new Date(attendee.registeredAt).toLocaleDateString()}
                                        </td>
                                        <td className="px-4 py-4 text-right" onClick={(e) => e.stopPropagation()}>
                                            <div className="flex items-center justify-end gap-1.5">
                                                {attendee.registrationStatus !== 'approved' && (
                                                    <button
                                                        onClick={() => handleStatusUpdate(attendee.id, 'approved')}
                                                        disabled={updateStatus.isPending}
                                                        title="Approve"
                                                        className="p-2 rounded-lg bg-green-500/10 border border-green-500/20 text-green-400 hover:bg-green-500/20 transition-all disabled:opacity-50 hover:scale-110"
                                                    >
                                                        <Check className="w-3.5 h-3.5" />
                                                    </button>
                                                )}
                                                {attendee.registrationStatus !== 'rejected' && (
                                                    <button
                                                        onClick={() => handleStatusUpdate(attendee.id, 'rejected')}
                                                        disabled={updateStatus.isPending}
                                                        title="Reject"
                                                        className="p-2 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20 transition-all disabled:opacity-50 hover:scale-110"
                                                    >
                                                        <X className="w-3.5 h-3.5" />
                                                    </button>
                                                )}
                                                {attendee.registrationStatus !== 'waitlisted' && (
                                                    <button
                                                        onClick={() => handleStatusUpdate(attendee.id, 'waitlisted')}
                                                        disabled={updateStatus.isPending}
                                                        title="Waitlist"
                                                        className="p-2 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-400 hover:bg-blue-500/20 transition-all disabled:opacity-50 hover:scale-110"
                                                    >
                                                        <Clock className="w-3.5 h-3.5" />
                                                    </button>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                    {expandedRow === attendee.id && (
                                        <tr className="bg-black/30">
                                            <td colSpan={7} className="p-0">
                                                <div className="p-6 md:p-8 animate-in fade-in duration-300">
                                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">

                                                        {/* Application Details */}
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

                                                        {/* Questionnaire Response */}
                                                        <div className="space-y-4 lg:col-span-1 md:col-span-2">
                                                            <h4 className="text-[10px] uppercase font-bold tracking-widest text-cyan-500 border-b border-cyan-500/20 pb-2 mb-3">Questionnaire Response</h4>
                                                            <div>
                                                                <p className="text-gray-500 text-[10px] uppercase tracking-wider mb-1">Hackathons Attended</p>
                                                                <p className="text-sm text-gray-200 font-mono bg-white/5 w-fit px-2 py-0.5 rounded border border-white/10">{attendee.hackathonsAttended ?? 0}</p>
                                                            </div>
                                                            <div>
                                                                <p className="text-gray-500 text-[10px] uppercase tracking-wider mb-2">Why do you want to attend?</p>
                                                                <div className="bg-white/5 border border-white/5 p-4 rounded-xl">
                                                                    <p className="text-xs text-gray-300 italic whitespace-pre-wrap leading-relaxed">
                                                                        {attendee.whyAttend ? `"${attendee.whyAttend}"` : 'No answer provided.'}
                                                                    </p>
                                                                </div>
                                                            </div>

                                                            {/* Quick action buttons in expanded view */}
                                                            <div className="pt-4 flex items-center gap-3 border-t border-white/5">
                                                                <span className="text-[10px] font-mono text-gray-500 uppercase tracking-wider">Quick Decision:</span>
                                                                <button
                                                                    onClick={() => handleStatusUpdate(attendee.id, 'approved')}
                                                                    disabled={updateStatus.isPending || attendee.registrationStatus === 'approved'}
                                                                    className="px-4 py-2 bg-green-500/10 border border-green-500/20 text-green-400 rounded-lg text-xs font-bold uppercase tracking-wider hover:bg-green-500/20 transition-colors disabled:opacity-30 flex items-center gap-1.5"
                                                                >
                                                                    <Check className="w-3 h-3" /> Approve
                                                                </button>
                                                                <button
                                                                    onClick={() => handleStatusUpdate(attendee.id, 'rejected')}
                                                                    disabled={updateStatus.isPending || attendee.registrationStatus === 'rejected'}
                                                                    className="px-4 py-2 bg-red-500/10 border border-red-500/20 text-red-400 rounded-lg text-xs font-bold uppercase tracking-wider hover:bg-red-500/20 transition-colors disabled:opacity-30 flex items-center gap-1.5"
                                                                >
                                                                    <X className="w-3 h-3" /> Reject
                                                                </button>
                                                                <button
                                                                    onClick={() => handleStatusUpdate(attendee.id, 'waitlisted')}
                                                                    disabled={updateStatus.isPending || attendee.registrationStatus === 'waitlisted'}
                                                                    className="px-4 py-2 bg-blue-500/10 border border-blue-500/20 text-blue-400 rounded-lg text-xs font-bold uppercase tracking-wider hover:bg-blue-500/20 transition-colors disabled:opacity-30 flex items-center gap-1.5"
                                                                >
                                                                    <Clock className="w-3 h-3" /> Waitlist
                                                                </button>
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
