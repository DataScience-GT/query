'use client';

import React from 'react';
import { useSession } from 'next-auth/react';
import { trpc } from '@/lib/trpc';
import { useParams, useRouter } from 'next/navigation';
import { LoadingScreen } from '@/components/portal/LoadingScreen';

export default function AdminAttendeeViewer() {
    const { data: session, status: authStatus } = useSession();
    const router = useRouter();
    const params = useParams();
    const hackathonId = params?.id as string;

    const { data: adminStatus, isLoading: adminLoading } = trpc.admin.isAdmin.useQuery(undefined, { enabled: !!session });
    const { data: hackathon, isLoading: loadingHackathon } = trpc.hackathon.getById.useQuery({ id: hackathonId }, { enabled: !!hackathonId });
    const { isLoading: loadingAttendees } = trpc.hackathon.adminGetAttendees.useQuery({ hackathonId }, { enabled: !!hackathonId && !!adminStatus?.isAdmin });

    if (authStatus === 'loading' || adminLoading || loadingHackathon || loadingAttendees) {
        return <LoadingScreen message="Loading Attendee Data..." />;
    }

    if (!session || !adminStatus?.isAdmin || !hackathon) {
        router.push('/dashboard');
        return null;
    }

    return (
        <div className="p-8">
            <h1 className="text-2xl font-bold mb-4">{hackathon.name} - Attendees</h1>
            <p className="text-text-muted">Attendee management UI coming soon...</p>
        </div>
    );
}
