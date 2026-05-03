'use client';

import React from 'react';
import { useSession } from 'next-auth/react';
import { trpc } from '@/lib/trpc';
import { useParams, useRouter } from 'next/navigation';
import { LiquidGlass } from '@/components/portal/LiquidGlass';
import { LoadingScreen } from '@/components/portal/LoadingScreen';
import Link from 'next/link';
import Image from 'next/image';

function statusColors(status: string) {
    switch (status) {
        case 'approved': return 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20';
        case 'pending': return 'text-amber-400 bg-amber-500/10 border-amber-500/20';
        case 'rejected': return 'text-rose-400 bg-rose-500/10 border-rose-500/20';
        case 'waitlisted': return 'text-cyan-400 bg-cyan-500/10 border-cyan-500/20';
        case 'checked_in': return 'text-purple-400 bg-purple-500/10 border-purple-500/20';
        default: return 'text-text-muted bg-gray-500/10 border-gray-500/20';
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

    // Export CSV function
    const exportToCSV = () => {
        if (!attendees || attendees.length === 0) return;
        if (!hackathon) return;
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

    if (authStatus === 'loading' || adminLoading || loadingHackathon || loadingAttendees) {
        return <LoadingScreen message="Loading Attendee Data..." />;
    }

    if (!session || !adminStatus?.isAdmin || !hackathon) {
        router.push('/dashboard');
        return null;
    }
}
