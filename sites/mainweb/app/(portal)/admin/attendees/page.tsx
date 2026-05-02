'use client';

import { useSession } from 'next-auth/react';
import { trpc } from '@/lib/trpc';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { skipToken } from '@tanstack/react-query';
import AdminLayout from '@/components/portal/AdminLayout';
import { LiquidGlass } from '@/components/portal/LiquidGlass';
import { Download } from 'lucide-react';

export default function AttendeesPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const utils = trpc.useUtils();

  const [filter, setFilter] = useState<'all' | 'registered' | 'pending' | 'cancelled'>('all');

  // Fetch all hackathons for the dropdown
  const { data: hackathons } = trpc.hackathon.listAll.useQuery(undefined, { enabled: !!session });
  const [selectedHackathon, setSelectedHackathon] = useState<string | null>(null);

  // Fetch attendees for selected hackathon
  const { data: attendees, isLoading } = trpc.hackathon.adminGetAttendees.useQuery(
    selectedHackathon ? { hackathonId: selectedHackathon } : skipToken,
    { enabled: !!session && !!selectedHackathon }
  );

  if (status === 'unauthenticated') {
    router.push('/login');
    return null;
  }

  const handleDownloadCSV = () => {
    if (selectedHackathon) {
      // CSV export logic would go here
      console.log('Downloading CSV for hackathon:', selectedHackathon);
    }
  };

  return (
    <AdminLayout>
      <div className="relative z-10 max-w-7xl mx-auto">
        {/* Page Header */}
        <div className="mb-6 p-5 border border-white/5 bg-gradient-to-br from-accent/5 to-transparent rounded-2xl">
          <h1 className="text-2xl font-black text-white tracking-tighter mb-2">
            Attendees <span className="text-accent italic">Registry</span>
          </h1>
          <p className="text-text-muted text-sm">
            View and manage attendee registrations for hackathon events.
          </p>
        </div>

        <div className="space-y-6">
          {/* Hackathon Selector */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 bg-black/30 border border-white/5 rounded-xl p-1">
              <select
                value={selectedHackathon || ''}
                onChange={(e) => setSelectedHackathon(e.target.value || null)}
                className="bg-transparent text-white text-sm font-medium px-4 py-2 focus:outline-none cursor-pointer"
              >
                <option value="">Select a hackathon...</option>
                {hackathons?.map((h) => (
                  <option key={h.id} value={h.id}>
                    {h.name}
                  </option>
                ))}
              </select>
            </div>
            {selectedHackathon && (
              <button
                onClick={handleDownloadCSV}
                className="flex items-center gap-2 px-4 py-2 bg-accent/10 border border-accent/20 text-accent text-sm rounded-xl hover:bg-accent/20 transition-colors"
              >
                <Download className="h-4 w-4" />
                Export CSV
              </button>
            )}
          </div>

          {/* Filters */}
          <div className="flex items-center bg-black/30 border border-white/5 rounded-xl p-2 gap-2">
            <button
              onClick={() => setFilter('all')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                filter === 'all'
                  ? 'bg-gradient-to-r from-accent to-emerald-600 text-white shadow-lg shadow-accent/20'
                  : 'text-text-muted hover:text-white hover:bg-white/5'
              }`}
            >
              All
            </button>
            <button
              onClick={() => setFilter('registered')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                filter === 'registered'
                  ? 'bg-gradient-to-r from-accent to-emerald-600 text-white shadow-lg shadow-accent/20'
                  : 'text-text-muted hover:text-white hover:bg-white/5'
              }`}
            >
              Registered
            </button>
            <button
              onClick={() => setFilter('pending')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                filter === 'pending'
                  ? 'bg-gradient-to-r from-accent to-emerald-600 text-white shadow-lg shadow-accent/20'
                  : 'text-text-muted hover:text-white hover:bg-white/5'
              }`}
            >
              Pending
            </button>
            <button
              onClick={() => setFilter('cancelled')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                filter === 'cancelled'
                  ? 'bg-gradient-to-r from-accent to-emerald-600 text-white shadow-lg shadow-accent/20'
                  : 'text-text-muted hover:text-white hover:bg-white/5'
              }`}
            >
              Cancelled
            </button>
          </div>

          {/* Attendees List */}
          <div className="space-y-4">
            {isLoading ? (
              <div className="py-12 text-center">
                <p className="text-text-muted font-mono text-sm animate-pulse">Loading...</p>
              </div>
            ) : !attendees || attendees.length === 0 ? (
              <LiquidGlass className="p-16 text-center">
                <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mx-auto mb-4 border border-white/10">
                  <svg className="w-8 h-8 text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                  </svg>
                </div>
                <h3 className="text-white font-semibold mb-1">No attendees yet</h3>
                <p className="text-text-muted text-sm">Select a hackathon to view registrations.</p>
              </LiquidGlass>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-white/5 bg-black/20">
                <table className="w-full text-left">
                  <thead className="bg-black/30 border-b border-white/5">
                    <tr>
                      <th className="px-6 py-4 text-sm font-medium text-text-muted">Name</th>
                      <th className="px-6 py-4 text-sm font-medium text-text-muted">Email</th>
                      <th className="px-6 py-4 text-sm font-medium text-text-muted">Team</th>
                      <th className="px-6 py-4 text-sm font-medium text-text-muted">Status</th>
                      <th className="px-6 py-4 text-sm font-medium text-text-muted">Date</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {attendees
                      .filter((a) => {
                        if (filter === 'all') return true;
                        if (filter === 'registered') return a.registrationStatus === 'approved';
                        if (filter === 'pending') return a.registrationStatus === 'pending';
                        if (filter === 'cancelled') return a.registrationStatus === 'rejected';
                        return true;
                      })
                      .map((attendee) => (
                        <tr key={attendee.id} className="hover:bg-white/5 transition-colors">
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-3">
                              <img
                                src={(attendee.user?.image || null) as string || '/avatars/default.png'}
                                alt={(attendee.user?.name || attendee.user?.email) || ''}
                                className="h-10 w-10 rounded-full border border-white/10 object-cover"
                              />
                              <div>
                                <p className="font-medium text-white">
{(attendee.user?.name || attendee.user?.email) || ''}
</p>
                                <p className="text-sm text-text-muted">{attendee.user?.email || ''}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4 text-text-muted">{attendee.user?.email || ''}</td>
                          <td className="px-6 py-4 text-text-muted">{attendee.team?.name || 'Individual'}</td>
                          <td className="px-6 py-4">
                            <span
                              className={`px-3 py-1 rounded-full text-xs font-semibold ${
                                attendee.registrationStatus === 'approved'
                                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                  : attendee.registrationStatus === 'pending'
                                  ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                                  : attendee.registrationStatus === 'rejected'
                                  ? 'bg-red-500/10 text-red-400 border border-red-500/20'
                                  : 'bg-gray-500/10 text-text-muted border border-gray-500/20'
                              }`}
                            >
                              {attendee.registrationStatus}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-text-muted">
                            {new Date(attendee.registeredAt).toLocaleDateString()}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
