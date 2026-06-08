'use client';

import { useSession } from 'next-auth/react';
import { trpc } from '@/lib/trpc';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { QRCodeModal } from '@/components/portal/QRCodeModal';
import { EventFormModal } from '@/components/portal/EventFormModal';
import { LiquidGlass } from '@/components/portal/LiquidGlass';
import AdminLayout from '@/components/portal/AdminLayout';
import { QrCode } from 'lucide-react';


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
  const { data: events, isLoading: eventsLoading } = trpc.events.listAll.useQuery(undefined, {
    enabled: !!session && adminStatus?.isAdmin,
  });

  type StatusFilter = 'all' | 'open' | 'closed';
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  const createEventMutation = trpc.events.create.useMutation({
    onSuccess: (newEvent) => {
      if (newEvent) {
        utils.events.listAll.invalidate();
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

      <div className="relative z-10 max-w-7xl mx-auto">
        <div className="mb-6 p-5 border border-white/5 bg-gradient-to-br from-accent/5 via-cyan-900/10 to-transparent rounded-none relative overflow-hidden group hover:border-accent/30 transition-all duration-500">
          <div className="absolute inset-0 bg-gradient-to-r from-accent/5 via-transparent to-[#00E5FF]/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
          <p className="text-[10px] font-mono text-[#00E5FF]/60 uppercase tracking-[0.2em] mb-1 relative z-10 flex items-center gap-2">
            <QrCode className="w-3 h-3" /> Club Events
          </p>
          <h1 className="text-2xl font-black text-white tracking-tight mb-2 relative z-10 animate-in fade-in slide-in-from-left-4">
            Check-in <span className="text-transparent bg-clip-text bg-gradient-to-r from-accent via-cyan-400 to-[#00E5FF] italic">Manager</span>
          </h1>
          <p className="text-text-muted text-sm relative z-10">Create events, generate QR codes, and track attendance for general club gatherings.</p>
        </div>




        {/* Events Section */}
        <div className="space-y-6">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center bg-black/30 border border-white/5 p-1.5 rounded-none gap-1">
              {(['all', 'open', 'closed'] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setStatusFilter(f)}
                  className={`px-4 py-2 rounded-none text-sm font-semibold capitalize transition-all ${
                    statusFilter === f
                      ? f === 'open'
                        ? 'bg-[#00E5FF]/20 text-emerald-400 border border-[#00E5FF]/30'
                        : f === 'closed'
                        ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                        : 'bg-white/10 text-white border border-white/10'
                      : 'text-gray-500 hover:text-white hover:bg-white/5'
                  }`}
                >
                  {f === 'all'
                    ? `All (${events?.length ?? 0})`
                    : f === 'open'
                    ? `Open (${events?.filter((e) => e.checkInEnabled).length ?? 0})`
                    : `Closed (${events?.filter((e) => !e.checkInEnabled).length ?? 0})`}
                </button>
              ))}
            </div>
            <button
              onClick={() => setShowCreateEvent(true)}
              className="px-6 py-3 bg-gradient-to-r from-accent to-[#00E5FF] text-white font-semibold text-sm rounded-none active:scale-[0.98] transition-transform shadow-lg shadow-accent/20"
            >
              + New Event
            </button>
          </div>

          {eventsLoading ? (
            <div className="space-y-4">
              {[1, 2, 3].map((n) => (
                <div key={n} className="animate-pulse bg-white/5 border border-white/5 rounded-none p-6 h-28" />
              ))}
            </div>
          ) : !events || events.length === 0 ? (
            <LiquidGlass className="p-16 text-center">
              <div className="w-16 h-16 rounded-sm bg-white/5 flex items-center justify-center mx-auto mb-4 border border-white/10">
                <svg className="w-8 h-8 text-gray-600" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M19 3h-1V1h-2v2H8V1H6v2H5c-1.11 0-1.99.9-1.99 2L3 19c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V8h14v11zM7 10h5v5H7z" />
                </svg>
              </div>
              <h3 className="text-white font-semibold mb-1">No events yet</h3>
              <p className="text-gray-500 text-sm font-mono">Create your first event to get started.</p>
            </LiquidGlass>
          ) : (
            <div className="space-y-4">
              {events
                .filter((e) =>
                  statusFilter === 'all' ? true :
                  statusFilter === 'open' ? e.checkInEnabled :
                  !e.checkInEnabled
                )
                .map((event) => (
                  <LiquidGlass
                    key={event.id}
                    className={`p-6 hover:border-white/20 transition-all border-l-4 ${
                      event.checkInEnabled ? 'border-l-[#00E5FF]' : 'border-l-red-500/50'
                    }`}
                  >
                    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="text-lg font-bold text-white">{event.title}</h3>
                        <span
                          className={`px-2 py-1 rounded-sm text-[10px] uppercase tracking-wider font-semibold ${event.checkInEnabled
                            ? 'bg-[#00E5FF]/10 text-emerald-400 border border-[#00E5FF]/20'
                            : 'bg-red-500/10 text-red-400 border border-red-500/20'
                            }`}
                        >
                          {event.checkInEnabled ? 'Open' : 'Closed'}
                        </span>
                      </div>
                      {event.description && (
                        <p className="text-text-muted text-sm mb-3">{event.description}</p>
                      )}
                      <div className="flex flex-wrap gap-4 text-xs text-gray-500 font-mono">
                        <span>{event.location || 'No location'}</span>
                        <span>•</span>
                        <span>{new Date(event.eventDate).toLocaleDateString()}</span>
                        <span>•</span>
                        <span className="text-accent">{event.currentCheckIns} check-ins</span>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={() => {
                          generateQRCode(event.qrCode);
                          setSelectedEvent(event);
                        }}
                        className="px-4 py-2 bg-accent/10 border border-accent/20 text-accent text-sm font-medium rounded-none hover:bg-accent/20 transition-colors"
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
                        className={`px-4 py-2 border text-sm font-medium rounded-none transition-colors ${event.checkInEnabled
                          ? 'border-red-500/20 text-red-400 hover:bg-red-500/10'
                          : 'border-[#00E5FF]/20 text-emerald-400 hover:bg-[#00E5FF]/10'
                          }`}
                      >
                        {event.checkInEnabled ? 'Close' : 'Open'}
                      </button>
                      <button
                        onClick={() => {
                          if (confirm('Delete this event?')) {
                            deleteEventMutation.mutate({ eventId: event.id });
                          }
                        }}
                        className="px-4 py-2 border border-red-500/10 text-red-400/60 text-sm font-medium rounded-none hover:bg-red-500/10 hover:text-red-400 transition-colors"
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