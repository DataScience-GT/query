'use client';

import { useSession, signOut } from 'next-auth/react';
import { trpc } from '@/lib/trpc';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import Background from '@/components/Background';
import QRCode from 'qrcode';
import Link from 'next/link';

type AdminView = 'events' | 'members' | 'admins';

type Event = {
  id: string;
  title: string;
  description: string | null;
  location: string | null;
  eventDate: Date;
  qrCode: string;
  checkInEnabled: boolean;
  currentCheckIns: number;
  maxCheckIns: number | null;
};

export default function AdminPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const utils = trpc.useUtils();

  const [view, setView] = useState<AdminView>('events');
  const [showCreateEvent, setShowCreateEvent] = useState(false);
  const [showQRCode, setShowQRCode] = useState<string | null>(null);
  const [qrCodeDataURL, setQrCodeDataURL] = useState<string>('');
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);

  // Event form state
  const [eventForm, setEventForm] = useState({
    title: '',
    description: '',
    location: '',
    eventDate: '',
    maxCheckIns: '',
  });

  // Queries
  const { data: adminStatus, isLoading: adminLoading } = trpc.admin.isAdmin.useQuery(undefined, {
    enabled: !!session,
  });
  const { data: events } = trpc.events.listAll.useQuery(undefined, {
    enabled: !!session && adminStatus?.isAdmin,
  });

  // Mutations
  const createEventMutation = trpc.events.create.useMutation({
    onSuccess: (newEvent) => {
      utils.events.listAll.invalidate();
      setEventForm({
        title: '',
        description: '',
        location: '',
        eventDate: '',
        maxCheckIns: '',
      });
      setShowCreateEvent(false);
      generateQRCode(newEvent.qrCode);
      setSelectedEvent(newEvent);
    },
  });

  const toggleCheckInMutation = trpc.events.toggleCheckIn.useMutation({
    onSuccess: () => {
      utils.events.listAll.invalidate();
    },
  });

  const deleteEventMutation = trpc.events.delete.useMutation({
    onSuccess: () => {
      utils.events.listAll.invalidate();
      setShowQRCode(null);
      setSelectedEvent(null);
    },
  });

  const regenerateQRMutation = trpc.events.regenerateQR.useMutation({
    onSuccess: (updatedEvent) => {
      utils.events.listAll.invalidate();
      generateQRCode(updatedEvent.qrCode);
      setSelectedEvent(updatedEvent);
    },
  });

  // Auth & Admin Guard
  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/');
    } else if (status === 'authenticated' && !adminLoading && !adminStatus?.isAdmin) {
      router.push('/dashboard');
    }
  }, [status, adminStatus, adminLoading, router]);

  const generateQRCode = async (qrCode: string) => {
    try {
      const url = await QRCode.toDataURL(qrCode, {
        width: 400,
        margin: 2,
        color: {
          dark: '#00A8A8',
          light: '#0a0a0a',
        },
      });
      setQrCodeDataURL(url);
      setShowQRCode(qrCode);
    } catch (err) {
      console.error('Error generating QR code:', err);
    }
  };

  const handleCreateEvent = () => {
    createEventMutation.mutate({
      title: eventForm.title,
      description: eventForm.description || undefined,
      location: eventForm.location || undefined,
      eventDate: new Date(eventForm.eventDate),
      maxCheckIns: eventForm.maxCheckIns ? parseInt(eventForm.maxCheckIns) : undefined,
    });
  };

  const downloadQRCode = () => {
    const link = document.createElement('a');
    link.download = `${selectedEvent?.title || 'event'}-qr.png`;
    link.href = qrCodeDataURL;
    link.click();
  };

  if (status === 'loading' || adminLoading) {
    return (
      <div className="min-h-screen bg-[#050505] flex items-center justify-center font-mono text-[#00A8A8] animate-pulse uppercase tracking-[0.5em]">
        Verifying_Clearance...
      </div>
    );
  }

  if (!session || !adminStatus?.isAdmin) return null;

  return (
    <div className="relative min-h-screen bg-[#050505] text-gray-400 font-sans selection:bg-[#00A8A8]/30 overflow-x-hidden">
      <Background className="fixed inset-0 z-0 opacity-[0.03]" />

      {/* CREATE EVENT MODAL */}
      {showCreateEvent && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/95 backdrop-blur-md"
            onClick={() => setShowCreateEvent(false)}
          />
          <div className="relative w-full max-w-2xl bg-[#0A0A0A] border border-[#00A8A8]/30 rounded-2xl p-8 shadow-[0_0_50px_rgba(0,168,168,0.2)] animate-in zoom-in-95 duration-300 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-8 pb-4 border-b border-white/5">
              <div>
                <h3 className="text-3xl font-black text-white italic uppercase tracking-tighter">
                  Create_Event
                </h3>
                <p className="text-xs font-mono text-[#00A8A8] uppercase tracking-widest">
                  Configure_QR_Protocols
                </p>
              </div>
              <button
                onClick={() => setShowCreateEvent(false)}
                className="text-gray-500 hover:text-white transition-colors text-sm uppercase tracking-widest font-mono p-2 hover:bg-white/5 rounded"
              >
                [ Close_Panel ]
              </button>
            </div>

            <div className="space-y-6">
              <div className="space-y-2">
                <label className="text-sm text-gray-500 uppercase tracking-widest font-mono block font-bold mb-2">
                  Event_Title_Identifier
                </label>
                <input
                  type="text"
                  value={eventForm.title}
                  onChange={(e) => setEventForm({ ...eventForm, title: e.target.value })}
                  className="w-full bg-black/40 border border-white/10 rounded-xl px-6 py-4 text-white text-base focus:border-[#00A8A8] focus:outline-none transition-all font-mono"
                  placeholder="e.g., Weekly_Workshop_01"
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs text-gray-500 uppercase tracking-widest font-mono block">
                  Data_Description
                </label>
                <textarea
                  value={eventForm.description}
                  onChange={(e) => setEventForm({ ...eventForm, description: e.target.value })}
                  className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-3 text-white text-sm focus:border-[#00A8A8] focus:outline-none transition-all resize-none font-mono"
                  rows={3}
                  placeholder="System details..."
                />
              </div>

              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-xs text-gray-500 uppercase tracking-widest font-mono block">
                    Location_Node
                  </label>
                  <input
                    type="text"
                    value={eventForm.location}
                    onChange={(e) => setEventForm({ ...eventForm, location: e.target.value })}
                    className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-3 text-white text-sm focus:border-[#00A8A8] focus:outline-none transition-all font-mono"
                    placeholder="e.g., Klaus_2443"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-xs text-gray-500 uppercase tracking-widest font-mono block">
                    Temporal_Stamp
                  </label>
                  <input
                    type="datetime-local"
                    value={eventForm.eventDate}
                    onChange={(e) => setEventForm({ ...eventForm, eventDate: e.target.value })}
                    className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-3 text-white text-sm focus:border-[#00A8A8] focus:outline-none transition-all font-mono"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs text-gray-500 uppercase tracking-widest font-mono block">
                  CheckIn_Limit
                </label>
                <input
                  type="number"
                  value={eventForm.maxCheckIns}
                  onChange={(e) => setEventForm({ ...eventForm, maxCheckIns: e.target.value })}
                  className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-3 text-white text-sm focus:border-[#00A8A8] focus:outline-none transition-all font-mono"
                  placeholder="Unrestricted"
                />
              </div>

              <button
                onClick={handleCreateEvent}
                disabled={!eventForm.title || !eventForm.eventDate || createEventMutation.isPending}
                className="w-full px-8 py-5 bg-[#00A8A8] text-black font-black text-base uppercase tracking-[0.2em] hover:bg-[#00A8A8]/90 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_0_30px_rgba(0,168,168,0.3)] mt-6 rounded-xl"
              >
                {createEventMutation.isPending ? 'Processing...' : 'INITIALIZE_EVENT'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* QR CODE MODAL */}
      {showQRCode && selectedEvent && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/95 backdrop-blur-md"
            onClick={() => setShowQRCode(null)}
          />
          <div className="relative w-full max-w-md bg-[#0A0A0A] border border-[#00A8A8]/30 rounded-2xl p-8 shadow-[0_0_50px_rgba(0,168,168,0.2)] animate-in zoom-in-95 duration-300">
            <div className="flex justify-between items-center mb-8 pb-4 border-b border-white/5">
              <div>
                <h3 className="text-2xl font-black text-white italic uppercase tracking-tighter">
                  QR_Protocols
                </h3>
                <p className="text-xs font-mono text-[#00A8A8] uppercase tracking-widest">
                  {selectedEvent.title}
                </p>
              </div>
              <button
                onClick={() => setShowQRCode(null)}
                className="text-gray-500 hover:text-white transition-colors text-xs uppercase tracking-widest font-mono p-2 hover:bg-white/5 rounded"
              >
                [ Close ]
              </button>
            </div>

            <div className="space-y-8">
              <div className="bg-white p-6 rounded-xl shadow-[inset_0_0_20px_rgba(0,0,0,0.1)]">
                {qrCodeDataURL && (
                  <img
                    src={qrCodeDataURL}
                    alt="Event QR Code"
                    className="w-full h-auto"
                  />
                )}
              </div>

              <div className="bg-black/40 border border-white/5 rounded-xl p-6 space-y-3">
                <div className="flex justify-between text-xs font-mono">
                  <span className="text-gray-600 uppercase">IDENT:</span>
                  <span className="text-white">{selectedEvent.title}</span>
                </div>
                <div className="flex justify-between text-xs font-mono">
                  <span className="text-gray-600 uppercase">SYNC_COUNT:</span>
                  <span className="text-white">
                    {selectedEvent.currentCheckIns} {selectedEvent.maxCheckIns ? `/ ${selectedEvent.maxCheckIns}` : ''}
                  </span>
                </div>
                <div className="flex justify-between text-xs font-mono">
                  <span className="text-gray-600 uppercase">STATUS:</span>
                  <span className={selectedEvent.checkInEnabled ? 'text-green-500 shadow-[0_0_10px_rgba(34,197,94,0.3)]' : 'text-red-500'}>
                    {selectedEvent.checkInEnabled ? 'LINK_ACTIVE' : 'LINK_TERMINATED'}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <button
                  onClick={downloadQRCode}
                  className="px-6 py-3 bg-white/5 border border-white/10 text-white font-bold text-xs uppercase tracking-widest hover:bg-white/10 transition-all rounded font-mono"
                >
                  SAVE_IMG
                </button>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(selectedEvent.qrCode);
                    alert('Access Code copied to buffer.');
                  }}
                  className="px-6 py-3 bg-white/5 border border-white/10 text-white font-bold text-xs uppercase tracking-widest hover:bg-white/10 transition-all rounded font-mono"
                >
                  COPY_VAL
                </button>
              </div>

              <button
                onClick={() => {
                  if (confirm('Regenerate protocols? Current QR will be deprecated.')) {
                    regenerateQRMutation.mutate({ eventId: selectedEvent.id });
                  }
                }}
                disabled={regenerateQRMutation.isPending}
                className="w-full px-6 py-3 bg-red-500/5 border border-red-500/20 text-red-500/80 font-bold text-xs uppercase tracking-widest hover:bg-red-500/10 transition-all disabled:opacity-50 rounded font-mono"
              >
                {regenerateQRMutation.isPending ? 'RENEWING...' : 'REBOOT_QR_SYSTEM'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MAIN CONTENT */}
      <main className="relative z-10 max-w-7xl mx-auto px-6 py-16">
        {/* Header Section */}
        <div className="bg-black/60 backdrop-blur-md border border-white/5 p-8 mb-12 rounded-2xl shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-[#00A8A8]/20 to-transparent"></div>

          <div className="flex flex-col md:flex-row md:items-center justify-between gap-8">
            <div>
              <div className="flex items-center gap-3 mb-4">
                <div className="h-2 w-2 rounded-full bg-[#00A8A8] animate-pulse" />
                <span className="text-xs font-mono text-gray-500 uppercase tracking-widest">Root_Admin_Session</span>
              </div>
              <h1 className="text-5xl font-black text-white uppercase tracking-tighter mb-2">
                Admin_<span className="text-[#00A8A8] italic">Terminal</span>
              </h1>
              <p className="text-sm font-mono text-gray-500 uppercase tracking-widest">
                System_Access_Layer // {adminStatus.role?.replace('_', ' ').toUpperCase()}
              </p>
            </div>

            <div className="flex gap-4">
              <Link
                href="/admin-judging"
                className="px-8 py-5 bg-white/[0.03] border border-white/10 text-white font-bold text-sm uppercase tracking-[0.2em] hover:bg-[#00A8A8]/10 hover:border-[#00A8A8]/30 hover:text-[#00A8A8] transition-all rounded-xl flex items-center gap-4 group"
              >
                <span className="w-3 h-3 rounded-full bg-[#00A8A8]/50 group-hover:bg-[#00A8A8] transition-colors" />
                Judging_Portal
              </Link>
              <button
                onClick={() => router.push('/dashboard')}
                className="px-8 py-5 border border-white/10 text-white font-bold text-sm uppercase tracking-widest hover:bg-white/5 transition-all rounded-xl font-mono"
              >
                &lt; Return_to_Root
              </button>
            </div>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex gap-4 mb-12 bg-white/[0.02] p-2 rounded-xl border border-white/5 inline-flex">
          <button
            onClick={() => setView('events')}
            className={`px-10 py-4 rounded-xl font-bold text-sm uppercase tracking-widest transition-all duration-300 ${view === 'events'
              ? 'bg-white/5 text-white shadow-[0_4px_12px_rgba(0,0,0,0.3)] border border-white/10'
              : 'text-gray-500 hover:text-white hover:bg-white/[0.02]'
              }`}
          >
            Event_Core
          </button>
          <button
            onClick={() => setView('members')}
            className={`px-10 py-4 rounded-xl font-bold text-sm uppercase tracking-widest transition-all opacity-30 cursor-not-allowed ${view === 'members'
              ? 'bg-white/5 text-white'
              : 'text-gray-500'
              }`}
          >
            Users_Record
          </button>
          <button
            onClick={() => setView('admins')}
            className={`px-10 py-4 rounded-xl font-bold text-sm uppercase tracking-widest transition-all opacity-30 cursor-not-allowed ${view === 'admins'
              ? 'bg-white/5 text-white'
              : 'text-gray-500'
              }`}
          >
            Admin_Nodes
          </button>
        </div>

        {/* EVENTS VIEW */}
        {view === 'events' && (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-8 duration-500">
            <div className="flex justify-between items-end mb-4">
              <div>
                <p className="text-xs text-gray-600 uppercase tracking-[0.4em] mb-2 font-mono">Operations_Log</p>
                <h2 className="text-3xl font-black text-white italic uppercase tracking-tighter">
                  Active_Events
                </h2>
              </div>
              <button
                onClick={() => setShowCreateEvent(true)}
                className="px-8 py-4 bg-[#00A8A8] text-black font-black text-xs uppercase tracking-[0.2em] hover:bg-[#00A8A8]/90 transition-all rounded-lg shadow-[0_0_20px_rgba(0,168,168,0.2)]"
              >
                + NEW_EVENT_BUFFER
              </button>
            </div>

            {!events || events.length === 0 ? (
              <div className="bg-black/60 backdrop-blur-md border border-white/5 p-24 rounded-2xl text-center">
                <div className="absolute inset-0 bg-gradient-to-br from-white/[0.02] to-transparent" />
                <div className="relative z-10">
                  <div className="text-6xl mb-6 opacity-5 group-hover:opacity-10 transition-opacity">
                    <svg className="w-24 h-24 mx-auto text-white" fill="currentColor" viewBox="0 0 24 24"><path d="M19 3h-1V1h-2v2H8V1H6v2H5c-1.11 0-1.99.9-1.99 2L3 19c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V8h14v11zM7 10h5v5H7z" /></svg>
                  </div>
                  <p className="text-gray-500 font-mono text-xs uppercase tracking-[0.3em] mb-3">
                    0_Data_Entries_Found
                  </p>
                  <p className="text-gray-700 text-xs uppercase tracking-widest max-w-md mx-auto leading-relaxed">
                    Initialize a new event sequence to begin QR-based identity verification protocols.
                  </p>
                </div>
              </div>
            ) : (
              <div className="grid gap-6">
                {events.map((event) => (
                  <div
                    key={event.id}
                    className="p-8 bg-black/60 border border-white/5 rounded-2xl hover:border-[#00A8A8]/30 transition-all duration-300 group"
                  >
                    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-8 relative z-10">
                      <div className="flex-1">
                        <div className="flex items-center gap-4 mb-4">
                          <h3 className="text-white font-black text-2xl uppercase italic tracking-tight">
                            {event.title}
                          </h3>
                          <span
                            className={`px-3 py-1.5 rounded-full text-[9px] uppercase tracking-widest font-bold font-mono border ${event.checkInEnabled
                              ? 'bg-green-500/10 text-green-500 border-green-500/20 shadow-[0_0_10px_rgba(34,197,94,0.1)]'
                              : 'bg-red-500/10 text-red-500 border-red-500/20'
                              }`}
                          >
                            {event.checkInEnabled ? 'SYSTEM_ONLINE' : 'SYSTEM_DISABLED'}
                          </span>
                        </div>

                        {event.description && (
                          <p className="text-gray-400 text-lg mb-8 font-mono leading-relaxed max-w-2xl">
                            &gt; {event.description}
                          </p>
                        )}

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                          <div className="space-y-1">
                            <p className="text-[9px] text-gray-700 uppercase tracking-widest font-black">Location_Node</p>
                            <p className="text-sm text-gray-300 uppercase font-mono">{event.location || 'Remote_Access'}</p>
                          </div>
                          <div className="space-y-1">
                            <p className="text-[9px] text-gray-700 uppercase tracking-widest font-black">Temporal_Stamp</p>
                            <p className="text-sm text-gray-300 uppercase font-mono">{new Date(event.eventDate).toLocaleString()}</p>
                          </div>
                          <div className="space-y-1">
                            <p className="text-[9px] text-gray-700 uppercase tracking-widest font-black">Sync_Metrics</p>
                            <p className="text-sm text-gray-300 uppercase font-mono">
                              {event.currentCheckIns} {event.maxCheckIns ? `/ ${event.maxCheckIns}` : 'Unlimited'} Records
                            </p>
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-col gap-4 min-w-[240px]">
                        <button
                          onClick={() => {
                            generateQRCode(event.qrCode);
                            setSelectedEvent(event);
                          }}
                          className="w-full px-8 py-5 bg-[#00A8A8]/10 border border-[#00A8A8]/20 text-[#00A8A8] font-black text-sm uppercase tracking-widest hover:bg-[#00A8A8]/20 transition-all rounded-xl shadow-[inset_0_0_20px_rgba(0,168,168,0.05)]"
                        >
                          ACCESS_QR
                        </button>
                        <button
                          onClick={() =>
                            toggleCheckInMutation.mutate({
                              eventId: event.id,
                              enabled: !event.checkInEnabled,
                            })
                          }
                          className={`w-full px-8 py-5 border font-black text-sm uppercase tracking-widest transition-all rounded-xl font-mono ${event.checkInEnabled
                            ? 'border-red-500/30 bg-red-500/10 text-red-500 hover:bg-red-500/20'
                            : 'border-green-500/30 bg-green-500/10 text-green-500 hover:bg-green-500/20'}`}
                        >
                          {event.checkInEnabled ? 'TERMINATE_LINK' : 'INITIALIZE_LINK'}
                        </button>
                        <button
                          onClick={() => {
                            if (confirm('Delete this event? This cannot be undone.')) {
                              deleteEventMutation.mutate({ eventId: event.id });
                            }
                          }}
                          className="w-full px-8 py-5 border border-red-500/20 text-red-500/60 font-black text-sm uppercase tracking-widest hover:bg-red-500/10 hover:text-red-500 transition-all rounded-xl font-mono"
                        >
                          SYSTEM_PURGE
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}