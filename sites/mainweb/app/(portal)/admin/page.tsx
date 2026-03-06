'use client';

import { useSession } from 'next-auth/react';
import { trpc } from '@/lib/trpc';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import Link from 'next/link';
import { QRCodeModal } from '@/components/portal/QRCodeModal';
import { EventFormModal } from '@/components/portal/EventFormModal';
import { LiquidGlass } from '@/components/portal/LiquidGlass';
import AdminLayout from '@/components/portal/AdminLayout';
import { EventHeader } from '@/components/admin/events/EventHeader';

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

  return (
    <AdminLayout>
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

      <div className="relative z-10 max-w-6xl mx-auto">
        <EventHeader />

        {/* Events Section */}
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold text-white">Events</h2>
              <p className="text-gray-500 text-sm font-mono">{events?.length || 0} total events</p>
            </div>
            <button
              onClick={() => setShowCreateEvent(true)}
              className="px-6 py-3 bg-gradient-to-r from-[#00A8A8] to-emerald-500 text-white font-semibold text-sm rounded-xl active:scale-[0.98] transition-transform shadow-lg shadow-[#00A8A8]/20"
            >
              + New Event
            </button>
          </div>

          {!events || events.length === 0 ? (
            <LiquidGlass className="p-16 text-center">
              <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mx-auto mb-4 border border-white/10">
                <svg className="w-8 h-8 text-gray-600" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M19 3h-1V1h-2v2H8V1H6v2H5c-1.11 0-1.99.9-1.99 2L3 19c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V8h14v11zM7 10h5v5H7z" />
                </svg>
              </div>
              <h3 className="text-white font-semibold mb-1">No events yet</h3>
              <p className="text-gray-500 text-sm font-mono">Create your first event to get started.</p>
            </LiquidGlass>
          ) : (
            <div className="space-y-4">
              {events.map((event) => (
                <LiquidGlass
                  key={event.id}
                  className="p-6 hover:border-white/20 transition-all"
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
                      <div className="flex flex-wrap gap-4 text-xs text-gray-500 font-mono">
                        <span>{event.location || 'No location'}</span>
                        <span>•</span>
                        <span>{new Date(event.eventDate).toLocaleDateString()}</span>
                        <span>•</span>
                        <span className="text-[#00A8A8]">{event.currentCheckIns} check-ins</span>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={() => {
                          generateQRCode(event.qrCode);
                          setSelectedEvent(event);
                        }}
                        className="px-4 py-2 bg-[#00A8A8]/10 border border-[#00A8A8]/20 text-[#00A8A8] text-sm font-medium rounded-xl hover:bg-[#00A8A8]/20 transition-colors"
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
                </LiquidGlass>
              ))}
            </div>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}