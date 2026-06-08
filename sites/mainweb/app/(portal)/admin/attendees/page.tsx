'use client';

import { useSession } from 'next-auth/react';
import { trpc } from '@/lib/trpc';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { skipToken } from '@tanstack/react-query';
import AdminLayout from '@/components/portal/AdminLayout';
import { LiquidGlass } from '@/components/portal/LiquidGlass';
import { Download, QrCode } from 'lucide-react';

export default function AttendeesPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [filter, setFilter] = useState<'all' | 'registered' | 'pending' | 'cancelled'>('all');
  const [selectedHackathon, setSelectedHackathon] = useState<string | null>(null);

  const { data: hackathonList } = trpc.hackathon.listAll.useQuery(undefined, { enabled: !!session });

  const { data: attendees, isLoading } = trpc.hackathon.adminGetAttendees.useQuery(
    selectedHackathon ? { hackathonId: selectedHackathon } : skipToken,
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
        {/* Animated Background Gradient */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-[-20%] left-[-10%] w-[600px] h-[600px] bg-gradient-to-r from-accent/5 via-emerald-900/10 to-purple-900/10 blur-[300px] rounded-sm" />
          <div className="absolute bottom-[-15%] right-[-5%] w-[500px] h-[500px] bg-gradient-to-r from-emerald-900/10 via-emerald-900/8 to-indigo-900/10 blur-[250px] rounded-sm" />
        </div>

        {/* Page Header */}
        <div className="relative mb-6 p-6 border border-[var(--border-subtle)] bg-gradient-to-br from-accent/8 via-emerald-900/10 to-transparent rounded-none overflow-hidden group hover:border-accent/40 transition-all duration-500">
          <div className="absolute inset-0 bg-gradient-to-r from-accent/5 via-transparent to-accent/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
          <p className="text-[10px] font-mono text-accent/60 uppercase tracking-[0.2em] mb-1 relative z-10 flex items-center gap-2">
            <QrCode className="w-3 h-3" /> Club Events
          </p>
          <h1 className="relative text-3xl font-black text-[var(--text-primary)] tracking-tighter mb-3 group-hover:text-transparent group-hover:bg-clip-text group-hover:bg-gradient-to-r group-hover:from-accent group-hover:via-emerald-400 group-hover:to-accent transition-all duration-500">
            Attendees <span className="text-accent italic font-bold">Registry</span>
          </h1>
          <p className="relative text-text-muted text-sm font-mono">
            View and manage attendee registrations for events.
          </p>
          {/* Decorative Corner Accent */}
          <div className="absolute -bottom-16 -right-16 w-48 h-48 bg-accent/5 rounded-sm blur-[60px] opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
        </div>

        <div className="space-y-6">
          {/* Hackathon Selector - Enhanced */}
          <div className="flex items-center justify-between gap-4 animate-in fade-in slide-in-from-bottom-2">
            <div className="flex items-center gap-3 bg-[var(--bg-primary)]/30 border border-[var(--border-subtle)] rounded-none p-1.5 group-hover:border-white/20 transition-colors">
              <select
                value={selectedHackathon || ''}
                onChange={(e) => setSelectedHackathon(e.target.value || null)}
                className="bg-transparent text-[var(--text-primary)] text-sm font-medium px-5 py-3 focus:outline-none cursor-pointer hover:text-[var(--text-primary)] transition-all"
              >
                <option value="">Select an event...</option>
                {hackathonList?.map((hackathon) => (
                  <option key={hackathon.id} value={hackathon.id}>
                    {hackathon.name}
                  </option>
                ))}
              </select>
            </div>
            {selectedHackathon && (
              <button
                onClick={handleDownloadCSV}
                className="flex items-center gap-2.5 px-5 py-2.5 bg-gradient-to-r from-accent/15 to-accent/15 border border-accent/25 hover:border-accent/40 text-accent text-sm font-medium rounded-none hover:bg-accent/25 transition-all active:scale-95 shadow-[0_0_20px_rgba(16,185,129,0.15)] hover:shadow-[0_0_25px_rgba(16,185,129,0.25)]"
              >
                <Download className="h-4 w-4" />
                Export CSV
              </button>
            )}
          </div>

          {/* Filters - Enhanced */}
          <div className="flex items-center bg-[var(--bg-primary)]/30 border border-[var(--border-subtle)] rounded-none p-2.5 gap-2 overflow-x-auto animate-in fade-in slide-in-from-bottom-2">
            <button
              onClick={() => setFilter('all')}
              className={`px-4 py-2 rounded-none text-sm font-medium transition-all duration-300 whitespace-nowrap ${
                filter === 'all'
                  ? 'bg-gradient-to-r from-accent to-accent text-[var(--text-primary)] shadow-lg shadow-accent/20 hover:shadow-xl hover:shadow-accent/30 hover:scale-105 active:scale-95'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-white/5 hover:scale-105 active:scale-95'
              }`}
            >
              All
            </button>
            <button
              onClick={() => setFilter('registered')}
              className={`px-4 py-2 rounded-none text-sm font-medium transition-all duration-300 whitespace-nowrap ${
                filter === 'registered'
                  ? 'bg-gradient-to-r from-accent to-green-600 text-[var(--text-primary)] shadow-[4px_4px_0_0_var(--accent)] hover:shadow-xl hover:shadow-[var(--accent)]/30 hover:scale-105 active:scale-95'
                  : 'text-[var(--text-muted)] hover:text-accent hover:bg-accent/10 hover:border-accent/30 hover:scale-105 active:scale-95'
              }`}
            >
              Registered
            </button>
            <button
              onClick={() => setFilter('pending')}
              className={`px-4 py-2 rounded-none text-sm font-medium transition-all duration-300 whitespace-nowrap ${
                filter === 'pending'
                  ? 'bg-gradient-to-r from-amber-500 to-yellow-600 text-[var(--text-primary)] shadow-lg shadow-amber-500/20 hover:shadow-xl hover:shadow-amber-500/30 hover:scale-105 active:scale-95'
                  : 'text-[var(--text-muted)] hover:text-amber-400 hover:bg-amber-500/10 hover:border-amber-500/30 hover:scale-105 active:scale-95'
              }`}
            >
              Pending
            </button>
            <button
              onClick={() => setFilter('cancelled')}
              className={`px-4 py-2 rounded-none text-sm font-medium transition-all duration-300 whitespace-nowrap ${
                filter === 'cancelled'
                  ? 'bg-gradient-to-r from-red-500 to-rose-600 text-[var(--text-primary)] shadow-lg shadow-red-500/20 hover:shadow-xl hover:shadow-red-500/30 hover:scale-105 active:scale-95'
                  : 'text-[var(--text-muted)] hover:text-red-400 hover:bg-red-500/10 hover:border-red-500/30 hover:scale-105 active:scale-95'
              }`}
            >
              Cancelled
            </button>
            {/* Status indicator */}
            <div className="ml-2 w-2 h-2 rounded-sm bg-accent animate-pulse shadow-[0_0_8px_var(--accent)]" />
          </div>

          {/* Attendees List - Enhanced */}
          <div className="space-y-4">
            {isLoading ? (
              <div className="py-12 text-center relative overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-r from-accent/5 via-emerald-900/5 to-purple-900/5 animate-pulse" />
                <p className="relative text-text-muted font-mono text-sm animate-pulse">Loading registrations...</p>
              </div>
            ) : !attendees || attendees.length === 0 ? (
              <LiquidGlass className="p-16 text-center">
                <div className="w-16 h-16 rounded-sm bg-white/5 flex items-center justify-center mx-auto mb-4 border border-[var(--border-subtle)]">
                  <svg className="w-8 h-8 text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                  </svg>
                </div>
                <h3 className="text-[var(--text-primary)] font-semibold mb-1">No attendees yet</h3>
                <p className="text-text-muted text-sm">Select an event to view registrations.</p>
              </LiquidGlass>
            ) : (
              <div className="overflow-x-auto rounded-none border border-[var(--border-subtle)] bg-[var(--bg-primary)]/20 relative overflow-hidden group hover:border-white/20 transition-all duration-300">
                <div className="absolute inset-0 bg-gradient-to-br from-accent/[0.02] via-transparent to-accent/[0.02] opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                <div className="absolute -top-24 -right-24 w-48 h-48 bg-accent/5 rounded-sm blur-[80px] opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                <table className="w-full text-left">
                  <thead className="bg-[var(--bg-primary)]/30 border-b border-[var(--border-subtle)]">
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
                              { }
                              <img
                                src={attendee.user?.image || '/avatars/default.png'}
                                alt={attendee.user?.name || 'Attendee'}
                                className="h-10 w-10 rounded-sm border border-[var(--border-subtle)] object-cover"
                              />
                              <div>
                                <p className="font-medium text-[var(--text-primary)]">{attendee.user?.name || `${attendee.firstName ?? ''} ${attendee.lastName ?? ''}`.trim() || 'Unknown'}</p>
                                <p className="text-sm text-[var(--text-subtle)]">{attendee.user?.email}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4 text-[var(--text-muted)]">{attendee.user?.email}</td>
                          <td className="px-6 py-4 text-[var(--text-muted)]">{attendee.team?.name || 'Individual'}</td>
                          <td className="px-6 py-4">
                            <span
                              className={`px-3 py-1 rounded-sm text-xs font-semibold ${
                                attendee.registrationStatus === 'approved' || attendee.registrationStatus === 'checked_in'
                                  ? 'bg-accent/10 text-accent border border-accent/20'
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
                          <td className="px-6 py-4 text-[var(--text-muted)]">
                            {attendee.registeredAt ? new Date(attendee.registeredAt).toLocaleDateString() : '—'}
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
