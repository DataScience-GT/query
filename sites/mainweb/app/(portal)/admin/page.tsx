'use client';

import { useSession } from 'next-auth/react';
import { trpc } from '@/lib/trpc';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import Link from 'next/link';
import { QRCodeModal } from '@/components/portal/QRCodeModal';
import { EventFormModal } from '@/components/portal/EventFormModal';

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

  const [showCreateEvent, setShowCreateEvent] = useState(false);
  const [showQRCode, setShowQRCode] = useState<string | null>(null);
  const [qrCodeDataURL, setQrCodeDataURL] = useState<string>('');
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);

  const { data: adminStatus, isLoading: adminLoading } = trpc.admin.isAdmin.useQuery(undefined, {
    enabled: !!session,
  });
  const { data: events } = trpc.events.listAll.useQuery(undefined, {
    enabled: !!session && adminStatus?.isAdmin,
  });

  const createEventMutation = trpc.events.create.useMutation({
    onSuccess: (newEvent) => {
      if (newEvent) {
        setShowCreateEvent(false);
        generateQRCode(newEvent.qrCode);
        setSelectedEvent(newEvent as unknown as Event);
      }
    },
  });

  const toggleCheckInMutation = trpc.events.toggleCheckIn.useMutation({
    onSuccess: () => utils.events.listAll.invalidate(),
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

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login');
    } else if (status === 'authenticated' && !adminLoading && !adminStatus?.isAdmin) {
      router.push('/dashboard');
    }
  }, [status, adminStatus, adminLoading, router]);

  const generateQRCode = async (qrCode: string) => {
    try {
      const url = await QRCode.toDataURL(qrCode, {
        width: 400,
        margin: 3,
        color: { dark: '#000000', light: '#ffffff' },
      });
      setQrCodeDataURL(url);
      setShowQRCode(qrCode);
    } catch (err) {
      console.error('Error generating QR code:', err);
    }
  };

  const handleCreateEvent = (formData: { title: string; description: string; location: string; eventDate: string }) => {
    createEventMutation.mutate({
      title: formData.title,
      description: formData.description || undefined,
      location: formData.location || undefined,
      eventDate: new Date(formData.eventDate),
      maxCheckIns: undefined,
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
      <div className="min-h-screen min-h-[100dvh] bg-black flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-teal-500/30 border-t-teal-500 rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-500 text-sm">Verifying access...</p>
        </div>
      </div>
    );
  }

  if (!session || !adminStatus?.isAdmin) return null;

  return (
    <div className="relative min-h-screen min-h-[100dvh] bg-black text-gray-400 font-sans overflow-x-hidden">
      {/* Background */}
      <div className="fixed inset-0 z-0 pointer-events-none">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[400px] bg-teal-500/5 rounded-full blur-[120px]" />
      </div>

      {showCreateEvent && (
        <EventFormModal
          onClose={() => setShowCreateEvent(false)}
          onSubmit={handleCreateEvent}
          isSubmitting={createEventMutation.isPending}
        />
      )}

      {showQRCode && selectedEvent && (
        <QRCodeModal
          event={selectedEvent}
          qrCodeDataURL={qrCodeDataURL}
          onClose={() => setShowQRCode(null)}
          onDownload={downloadQRCode}
          onRegenerate={() => regenerateQRMutation.mutate({ eventId: selectedEvent.id })}
          isRegenerating={regenerateQRMutation.isPending}
        />
      )}

      <main className="relative z-10 max-w-6xl mx-auto py-8 px-4 md:px-6">
        {/* Header */}
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8 p-6 bg-white/[0.02] border border-white/5 rounded-2xl">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="w-2 h-2 rounded-full bg-teal-500 animate-pulse" />
              <p className="text-xs uppercase tracking-widest text-gray-500 font-medium">Admin Console</p>
            </div>
            <h1 className="text-2xl font-bold text-white">
              Admin <span className="bg-gradient-to-r from-teal-400 to-emerald-400 bg-clip-text text-transparent">Terminal</span>
            </h1>
            <p className="text-gray-500 text-sm">{adminStatus.role?.replace('_', ' ').toUpperCase()}</p>
          </div>
          <div className="flex gap-3">
            <Link
              href="/admin-judging"
              className="px-5 py-3 bg-white/5 border border-white/10 text-white text-sm font-medium rounded-xl hover:bg-white/10 transition-colors flex items-center gap-2"
            >
              <span className="w-2 h-2 rounded-full bg-teal-500" />
              Judging Portal
            </Link>
            <button
              onClick={() => router.push('/dashboard')}
              className="px-5 py-3 text-gray-400 hover:text-white text-sm font-medium transition-colors"
            >
              ← Back
            </button>
          </div>
        </header>

        {/* Events Section */}
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold text-white">Events</h2>
              <p className="text-gray-500 text-sm">{events?.length || 0} total events</p>
            </div>
            <button
              onClick={() => setShowCreateEvent(true)}
              className="px-6 py-3 bg-gradient-to-r from-teal-500 to-emerald-500 text-white font-semibold text-sm rounded-xl active:scale-[0.98] transition-transform shadow-lg shadow-teal-500/20"
            >
              + New Event
            </button>
          </div>

          {!events || events.length === 0 ? (
            <div className="p-16 bg-white/[0.02] border border-white/5 rounded-2xl text-center">
              <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-gray-600" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M19 3h-1V1h-2v2H8V1H6v2H5c-1.11 0-1.99.9-1.99 2L3 19c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V8h14v11zM7 10h5v5H7z" />
                </svg>
              </div>
              <h3 className="text-white font-semibold mb-1">No events yet</h3>
              <p className="text-gray-500 text-sm">Create your first event to get started.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {events.map((event) => (
                <div
                  key={event.id}
                  className="p-6 bg-white/[0.02] border border-white/5 hover:border-white/10 rounded-2xl transition-all"
                >
                  <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="text-lg font-bold text-white">{event.title}</h3>
                        <span
                          className={`px-2 py-1 rounded-full text-[10px] uppercase tracking-wider font-semibold ${event.checkInEnabled
                              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                              : 'bg-red-500/10 text-red-400 border border-red-500/20'
                            }`}
                        >
                          {event.checkInEnabled ? 'Active' : 'Disabled'}
                        </span>
                      </div>
                      {event.description && (
                        <p className="text-gray-400 text-sm mb-3">{event.description}</p>
                      )}
                      <div className="flex flex-wrap gap-4 text-xs text-gray-500">
                        <span>{event.location || 'No location'}</span>
                        <span>•</span>
                        <span>{new Date(event.eventDate).toLocaleDateString()}</span>
                        <span>•</span>
                        <span className="text-teal-400">{event.currentCheckIns} check-ins</span>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={() => {
                          generateQRCode(event.qrCode);
                          setSelectedEvent(event);
                        }}
                        className="px-4 py-2 bg-teal-500/10 border border-teal-500/20 text-teal-400 text-sm font-medium rounded-xl hover:bg-teal-500/20 transition-colors"
                      >
                        QR Code
                      </button>
                      <button
                        onClick={() =>
                          toggleCheckInMutation.mutate({
                            eventId: event.id,
                            enabled: !event.checkInEnabled,
                          })
                        }
                        className={`px-4 py-2 border text-sm font-medium rounded-xl transition-colors ${event.checkInEnabled
                            ? 'border-red-500/20 text-red-400 hover:bg-red-500/10'
                            : 'border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/10'
                          }`}
                      >
                        {event.checkInEnabled ? 'Disable' : 'Enable'}
                      </button>
                      <button
                        onClick={() => {
                          if (confirm('Delete this event?')) {
                            deleteEventMutation.mutate({ eventId: event.id });
                          }
                        }}
                        className="px-4 py-2 border border-red-500/10 text-red-400/60 text-sm font-medium rounded-xl hover:bg-red-500/10 hover:text-red-400 transition-colors"
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
      </main>
    </div>
  );
}