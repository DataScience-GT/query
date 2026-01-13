'use client';

import { useSession, signOut } from 'next-auth/react';
import { trpc } from '@/lib/trpc';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import Background from '@/components/Background';
import QRCode from 'qrcode';

type AdminView = 'events' | 'members' | 'admins';

export default function AdminPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const utils = trpc.useUtils();

  const [view, setView] = useState<AdminView>('events');
  const [showCreateEvent, setShowCreateEvent] = useState(false);
  const [showQRCode, setShowQRCode] = useState<string | null>(null);
  const [qrCodeDataURL, setQrCodeDataURL] = useState<string>('');
  const [selectedEvent, setSelectedEvent] = useState<any>(null);

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
      // Auto-show QR code for new event
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
      <div className="min-h-screen bg-[#050505] flex items-center justify-center font-mono text-red-500 animate-pulse uppercase tracking-[0.5em]">
        Verifying_Clearance...
      </div>
    );
  }

  if (!session || !adminStatus?.isAdmin) return null;

  return (
    <div className="relative min-h-screen bg-[#050505] text-gray-400 font-sans selection:bg-red-500/30 overflow-x-hidden">
      <Background className="fixed inset-0 z-0 opacity-[0.03]" />

      {/* CREATE EVENT MODAL */}
      {showCreateEvent && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/95 backdrop-blur-md"
            onClick={() => setShowCreateEvent(false)}
          />
          <div className="relative w-full max-w-2xl bg-[#0a0a0a] border border-red-500/30 rounded-2xl p-6 shadow-[0_0_50px_rgba(239,68,68,0.3)] animate-in zoom-in-95 duration-300 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-6">
              <div>
                <h3 className="text-2xl font-black text-white italic uppercase tracking-tighter">
                  Create_Event
                </h3>
                <p className="text-[9px] font-mono text-red-500 uppercase tracking-widest">
                  Generate_QR_Check_In
                </p>
              </div>
              <button
                onClick={() => setShowCreateEvent(false)}
                className="text-gray-500 hover:text-white transition-colors text-[10px] uppercase tracking-widest"
              >
                [ Close ]
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-[9px] text-gray-500 uppercase tracking-widest font-mono block mb-2">
                  Event Title *
                </label>
                <input
                  type="text"
                  value={eventForm.title}
                  onChange={(e) => setEventForm({ ...eventForm, title: e.target.value })}
                  className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-3 text-white text-sm focus:border-red-500 focus:outline-none transition-all"
                  placeholder="e.g., Weekly Workshop"
                />
              </div>

              <div>
                <label className="text-[9px] text-gray-500 uppercase tracking-widest font-mono block mb-2">
                  Description
                </label>
                <textarea
                  value={eventForm.description}
                  onChange={(e) => setEventForm({ ...eventForm, description: e.target.value })}
                  className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-3 text-white text-sm focus:border-red-500 focus:outline-none transition-all resize-none"
                  rows={3}
                  placeholder="Event description..."
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[9px] text-gray-500 uppercase tracking-widest font-mono block mb-2">
                    Location
                  </label>
                  <input
                    type="text"
                    value={eventForm.location}
                    onChange={(e) => setEventForm({ ...eventForm, location: e.target.value })}
                    className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-3 text-white text-sm focus:border-red-500 focus:outline-none transition-all"
                    placeholder="e.g., Klaus 2443"
                  />
                </div>

                <div>
                  <label className="text-[9px] text-gray-500 uppercase tracking-widest font-mono block mb-2">
                    Event Date *
                  </label>
                  <input
                    type="datetime-local"
                    value={eventForm.eventDate}
                    onChange={(e) => setEventForm({ ...eventForm, eventDate: e.target.value })}
                    className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-3 text-white text-sm focus:border-red-500 focus:outline-none transition-all"
                  />
                </div>
              </div>

              <div>
                <label className="text-[9px] text-gray-500 uppercase tracking-widest font-mono block mb-2">
                  Max Check-ins (Optional)
                </label>
                <input
                  type="number"
                  value={eventForm.maxCheckIns}
                  onChange={(e) => setEventForm({ ...eventForm, maxCheckIns: e.target.value })}
                  className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-3 text-white text-sm focus:border-red-500 focus:outline-none transition-all"
                  placeholder="Unlimited"
                />
              </div>

              <button
                onClick={handleCreateEvent}
                disabled={!eventForm.title || !eventForm.eventDate || createEventMutation.isPending}
                className="w-full px-8 py-4 bg-red-500 text-white font-black text-sm uppercase tracking-widest hover:bg-red-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {createEventMutation.isPending ? 'Creating...' : 'Create Event & Generate QR'}
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
          <div className="relative w-full max-w-md bg-[#0a0a0a] border border-red-500/30 rounded-2xl p-6 shadow-[0_0_50px_rgba(239,68,68,0.3)] animate-in zoom-in-95 duration-300">
            <div className="flex justify-between items-center mb-6">
              <div>
                <h3 className="text-xl font-black text-white italic uppercase tracking-tighter">
                  Event_QR_Code
                </h3>
                <p className="text-[9px] font-mono text-red-500 uppercase tracking-widest">
                  {selectedEvent.title}
                </p>
              </div>
              <button
                onClick={() => setShowQRCode(null)}
                className="text-gray-500 hover:text-white transition-colors text-[10px] uppercase tracking-widest"
              >
                [ Close ]
              </button>
            </div>

            <div className="space-y-6">
              <div className="bg-white p-6 rounded-xl">
                {qrCodeDataURL && (
                  <img
                    src={qrCodeDataURL}
                    alt="Event QR Code"
                    className="w-full h-auto"
                  />
                )}
              </div>

              <div className="bg-black/40 border border-white/5 rounded-lg p-4 space-y-2">
                <div className="flex justify-between text-[9px] font-mono">
                  <span className="text-gray-600">EVENT:</span>
                  <span className="text-white">{selectedEvent.title}</span>
                </div>
                <div className="flex justify-between text-[9px] font-mono">
                  <span className="text-gray-600">CHECK-INS:</span>
                  <span className="text-white">
                    {selectedEvent.currentCheckIns} {selectedEvent.maxCheckIns ? `/ ${selectedEvent.maxCheckIns}` : ''}
                  </span>
                </div>
                <div className="flex justify-between text-[9px] font-mono">
                  <span className="text-gray-600">STATUS:</span>
                  <span className={selectedEvent.checkInEnabled ? 'text-green-500' : 'text-red-500'}>
                    {selectedEvent.checkInEnabled ? 'ACTIVE' : 'DISABLED'}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={downloadQRCode}
                  className="px-6 py-3 border border-white/10 text-white font-bold text-[10px] uppercase tracking-widest hover:bg-white/5 transition-all"
                >
                  Download QR
                </button>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(selectedEvent.qrCode);
                    alert('QR Code copied to clipboard!');
                  }}
                  className="px-6 py-3 border border-white/10 text-white font-bold text-[10px] uppercase tracking-widest hover:bg-white/5 transition-all"
                >
                  Copy Code
                </button>
              </div>

              <button
                onClick={() => {
                  if (confirm('Generate a new QR code? The old one will stop working.')) {
                    regenerateQRMutation.mutate({ eventId: selectedEvent.id });
                  }
                }}
                disabled={regenerateQRMutation.isPending}
                className="w-full px-6 py-3 bg-red-500/10 border border-red-500/30 text-red-500 font-bold text-[10px] uppercase tracking-widest hover:bg-red-500/20 transition-all disabled:opacity-50"
              >
                {regenerateQRMutation.isPending ? 'Regenerating...' : '🔄 Regenerate QR Code'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MAIN CONTENT */}
      <main className="relative z-10 max-w-7xl mx-auto px-6 py-12">
        {/* Header */}
        <div className="mb-12">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-5xl font-black text-white uppercase tracking-tighter mb-2">
                Admin_<span className="text-red-500 italic">Control</span>
              </h1>
              <p className="text-[10px] font-mono text-red-500 uppercase tracking-widest">
                System_Management_Panel // {adminStatus.role?.toUpperCase()}
              </p>
            </div>
            <button
              onClick={() => router.push('/dashboard')}
              className="px-6 py-3 border border-white/10 text-white font-bold text-[10px] uppercase tracking-widest hover:bg-white/5 transition-all"
            >
              ← Dashboard
            </button>
          </div>

          {/* View Tabs */}
          <div className="flex gap-4">
            <button
              onClick={() => setView('events')}
              className={`px-6 py-3 border font-bold text-[10px] uppercase tracking-widest transition-all ${
                view === 'events'
                  ? 'bg-red-500/10 border-red-500 text-red-500'
                  : 'border-white/10 text-white hover:bg-white/5'
              }`}
            >
              Events
            </button>
            <button
              onClick={() => setView('members')}
              className={`px-6 py-3 border font-bold text-[10px] uppercase tracking-widest transition-all opacity-50 cursor-not-allowed ${
                view === 'members'
                  ? 'bg-red-500/10 border-red-500 text-red-500'
                  : 'border-white/10 text-white hover:bg-white/5'
              }`}
            >
              Members
            </button>
            <button
              onClick={() => setView('admins')}
              className={`px-6 py-3 border font-bold text-[10px] uppercase tracking-widest transition-all opacity-50 cursor-not-allowed ${
                view === 'admins'
                  ? 'bg-red-500/10 border-red-500 text-red-500'
                  : 'border-white/10 text-white hover:bg-white/5'
              }`}
            >
              Admins
            </button>
          </div>
        </div>

        {/* EVENTS VIEW */}
        {view === 'events' && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
            <div className="flex justify-between items-center">
              <h2 className="text-2xl font-black text-white uppercase tracking-tight">
                Event_Management
              </h2>
              <button
                onClick={() => setShowCreateEvent(true)}
                className="px-6 py-3 bg-red-500 text-white font-bold text-[10px] uppercase tracking-widest hover:bg-red-600 transition-all"
              >
                + Create Event
              </button>
            </div>

            {!events || events.length === 0 ? (
              <div className="bg-black/60 border border-white/5 rounded-2xl p-12 text-center backdrop-blur-md">
                <div className="text-5xl mb-4 opacity-20">📅</div>
                <p className="text-gray-600 font-mono text-[10px] uppercase tracking-widest">
                  No_Events_Created
                </p>
                <p className="text-gray-700 text-[9px] mt-2">
                  Create your first event to generate QR codes for member check-ins
                </p>
              </div>
            ) : (
              <div className="grid gap-4">
                {events.map((event) => (
                  <div
                    key={event.id}
                    className="bg-black/60 border border-white/5 rounded-xl p-6 backdrop-blur-md hover:border-red-500/30 transition-all"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <h3 className="text-white font-black text-lg uppercase">
                            {event.title}
                          </h3>
                          <span
                            className={`px-2 py-1 rounded text-[8px] uppercase tracking-widest font-bold ${
                              event.checkInEnabled
                                ? 'bg-green-500/10 text-green-500 border border-green-500/30'
                                : 'bg-red-500/10 text-red-500 border border-red-500/30'
                            }`}
                          >
                            {event.checkInEnabled ? 'Active' : 'Disabled'}
                          </span>
                        </div>

                        {event.description && (
                          <p className="text-gray-500 text-sm mb-3">{event.description}</p>
                        )}

                        <div className="flex flex-wrap gap-4 text-[9px] font-mono text-gray-600">
                          {event.location && <span>📍 {event.location}</span>}
                          <span>📅 {new Date(event.eventDate).toLocaleString()}</span>
                          <span>
                            👥 {event.currentCheckIns} check-ins
                            {event.maxCheckIns && ` / ${event.maxCheckIns}`}
                          </span>
                        </div>
                      </div>

                      <div className="flex gap-2 ml-4">
                        <button
                          onClick={() => {
                            generateQRCode(event.qrCode);
                            setSelectedEvent(event);
                          }}
                          className="px-4 py-2 bg-red-500/10 border border-red-500/30 text-red-500 font-bold text-[9px] uppercase tracking-widest hover:bg-red-500/20 transition-all"
                        >
                          View QR
                        </button>
                        <button
                          onClick={() =>
                            toggleCheckInMutation.mutate({
                              eventId: event.id,
                              enabled: !event.checkInEnabled,
                            })
                          }
                          className="px-4 py-2 border border-white/10 text-white font-bold text-[9px] uppercase tracking-widest hover:bg-white/5 transition-all"
                        >
                          {event.checkInEnabled ? 'Disable' : 'Enable'}
                        </button>
                        <button
                          onClick={() => {
                            if (confirm('Delete this event? This cannot be undone.')) {
                              deleteEventMutation.mutate({ eventId: event.id });
                            }
                          }}
                          className="px-4 py-2 border border-red-500/30 text-red-500 font-bold text-[9px] uppercase tracking-widest hover:bg-red-500/10 transition-all"
                        >
                          Delete
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