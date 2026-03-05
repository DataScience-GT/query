'use client';

import { useSession } from 'next-auth/react';
import { trpc } from '@/lib/trpc';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { LiquidGlass } from '@/components/portal/LiquidGlass';
import AdminLayout from '@/components/portal/AdminLayout';

type HackathonStatus = 'draft' | 'open' | 'closed' | 'in_progress' | 'completed' | 'cancelled';

const STATUSES: { value: HackathonStatus; label: string; color: string; bg: string; border: string }[] = [
    { value: 'draft', label: 'Draft', color: 'text-gray-400', bg: 'bg-gray-500/10', border: 'border-gray-500/20' },
    { value: 'open', label: 'Open', color: 'text-green-400', bg: 'bg-green-500/10', border: 'border-green-500/20' },
    { value: 'closed', label: 'Closed', color: 'text-yellow-400', bg: 'bg-yellow-500/10', border: 'border-yellow-500/20' },
    { value: 'in_progress', label: 'In Progress', color: 'text-[#00A8A8]', bg: 'bg-[#00A8A8]/10', border: 'border-[#00A8A8]/20' },
    { value: 'completed', label: 'Completed', color: 'text-blue-400', bg: 'bg-blue-500/10', border: 'border-blue-500/20' },
    { value: 'cancelled', label: 'Cancelled', color: 'text-red-400', bg: 'bg-red-500/10', border: 'border-red-500/20' },
];

function getStatusMeta(s: string) {
    return STATUSES.find((x) => x.value === s) ?? STATUSES[0]!;
}

function toInputDate(d: Date | string) {
    const dt = new Date(d);
    return dt.toISOString().slice(0, 16);
}

export default function AdminHackathonsPage() {
    const { data: session, status } = useSession();
    const router = useRouter();
    const utils = trpc.useUtils();

    const [showCreate, setShowCreate] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);

    const { data: hackathons, isLoading } = trpc.hackathon.listAll.useQuery(undefined, { enabled: !!session });

    return (
        <AdminLayout>
            <div className="relative z-10 max-w-6xl mx-auto">
                <div className="flex items-center justify-between mb-8">
                    <div>
                        <h1 className="text-3xl font-black text-white uppercase tracking-tighter mb-1">
                            Hackathon <span className="text-[#00A8A8] italic">Manager</span>
                        </h1>
                        <p className="text-sm font-mono text-gray-500 uppercase tracking-widest">
                            Manage your hackathon events
                        </p>
                    </div>
                    <button
                        onClick={() => setShowCreate(true)}
                        className="px-6 py-3 bg-gradient-to-r from-[#00A8A8] to-emerald-500 text-white font-semibold text-sm rounded-xl active:scale-[0.98] transition-transform shadow-[0_0_20px_rgba(0,168,168,0.2)]"
                    >
                        + New Hackathon
                    </button>
                </div>

                {showCreate && (
                    <CreateForm
                        onClose={() => setShowCreate(false)}
                        onCreated={() => {
                            setShowCreate(false);
                            utils.hackathon.listAll.invalidate();
                        }}
                    />
                )}

                {editingId && (
                    <EditForm
                        hackathonId={editingId}
                        onClose={() => setEditingId(null)}
                        onSaved={() => {
                            setEditingId(null);
                            utils.hackathon.listAll.invalidate();
                        }}
                    />
                )}

                <div className="space-y-6">
                    <div>
                        <h2 className="text-xl font-bold text-white mb-1">Hackathons</h2>
                        <p className="text-gray-500 text-sm font-mono">{hackathons?.length || 0} total</p>
                    </div>

                    {isLoading ? (
                        <div className="py-12 text-center">
                            <p className="text-gray-600 font-mono text-sm uppercase tracking-wider animate-pulse">Loading...</p>
                        </div>
                    ) : !hackathons || hackathons.length === 0 ? (
                        <LiquidGlass className="p-16 text-center">
                            <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mx-auto mb-4 border border-white/10">
                                <svg className="w-8 h-8 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>
                            </div>
                            <h3 className="text-white font-semibold mb-1">No hackathons yet</h3>
                            <p className="text-gray-500 text-sm font-mono">Create your first hackathon to get started.</p>
                        </LiquidGlass>
                    ) : (
                        <div className="space-y-4">
                            {hackathons.map((h: NonNullable<typeof hackathons>[number]) => {
                                const sm = getStatusMeta(h.status);
                                return (
                                    <HackathonCard
                                        key={h.id}
                                        hackathon={h}
                                        statusMeta={sm}
                                        onEdit={() => setEditingId(h.id)}
                                        onStatusChange={(_newStatus) => {
                                            utils.hackathon.listAll.invalidate();
                                        }}
                                    />
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>
        </AdminLayout>
    );
}

function HackathonCard({
    hackathon,
    statusMeta,
    onEdit,
    onStatusChange,
}: {
    hackathon: {
        id: string;
        name: string;
        description?: string | null;
        location?: string | null;
        startDate: Date | string;
        endDate: Date | string;
        status: HackathonStatus;
        isPublic: boolean;
        currentParticipants: number;
        maxParticipants?: number | null;
    };
    statusMeta: (typeof STATUSES)[number];
    onEdit: () => void;
    onStatusChange: (s: HackathonStatus) => void;
}) {
    const [showStatusMenu, setShowStatusMenu] = useState(false);
    const utils = trpc.useUtils();

    const updateMutation = trpc.hackathon.update.useMutation({
        onSuccess: () => {
            utils.hackathon.listAll.invalidate();
            setShowStatusMenu(false);
            onStatusChange(hackathon.status);
        },
    });

    return (
        <LiquidGlass className="p-6 hover:border-white/20 transition-all">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-2">
                        <Link href={`/hackathons?id=${hackathon.id}`}>
                            <h3 className="text-lg font-bold text-white hover:text-[#00A8A8] transition-colors truncate">{hackathon.name}</h3>
                        </Link>
                    </div>
                    {hackathon.description && <p className="text-gray-400 text-sm mb-3 line-clamp-2">{hackathon.description}</p>}
                    <div className="flex flex-wrap gap-4 text-xs text-gray-500 font-mono">
                        <span>{hackathon.location || 'No location'}</span>
                        <span>•</span>
                        <span>{new Date(hackathon.startDate).toLocaleDateString()} – {new Date(hackathon.endDate).toLocaleDateString()}</span>
                        <span>•</span>
                        <span className="text-[#00A8A8]">{hackathon.currentParticipants}{hackathon.maxParticipants ? `/${hackathon.maxParticipants}` : ''} participants</span>
                    </div>
                </div>

                <div className="flex flex-wrap gap-2 relative">
                    <div className="relative">
                        <button
                            onClick={() => setShowStatusMenu(!showStatusMenu)}
                            className={`px-4 py-2 ${statusMeta.bg} border ${statusMeta.border} ${statusMeta.color} text-sm font-medium rounded-xl transition-colors flex items-center gap-2`}
                        >
                            {statusMeta.label} ▾
                        </button>
                        {showStatusMenu && (
                            <>
                                <div className="fixed inset-0 z-40" onClick={() => setShowStatusMenu(false)} />
                                <div className="absolute right-0 top-12 z-50 w-48 bg-[#111] border border-white/10 rounded-xl shadow-2xl overflow-hidden">
                                    {STATUSES.map((s) => (
                                        <button
                                            key={s.value}
                                            onClick={() => updateMutation.mutate({ id: hackathon.id, status: s.value })}
                                            disabled={hackathon.status === s.value || updateMutation.isPending}
                                            className={`w-full px-4 py-3 text-left text-sm flex items-center gap-3 transition-colors disabled:opacity-30 ${hackathon.status === s.value ? 'bg-white/5' : 'hover:bg-white/5'
                                                }`}
                                        >
                                            <span className={`w-2 h-2 rounded-full ${s.bg.replace('/10', '')} ${s.color.replace('text-', 'bg-').replace('-400', '-500')}`} />
                                            <span className={hackathon.status === s.value ? 'text-white font-semibold' : 'text-gray-400'}>{s.label}</span>
                                        </button>
                                    ))}
                                </div>
                            </>
                        )}
                    </div>

                    <Link
                        href={`/admin-hackathons/${hackathon.id}`}
                        className="px-4 py-2 bg-white/5 border border-white/10 text-white text-sm font-bold tracking-wider uppercase rounded-xl hover:bg-white/10 hover:border-white/20 transition-all flex items-center gap-2"
                    >
                        Dashboard <span className="text-lg leading-none">→</span>
                    </Link>

                    <button
                        onClick={onEdit}
                        className="px-4 py-2 border border-white/10 text-gray-400 text-sm font-medium rounded-xl hover:bg-white/5 hover:text-white transition-colors"
                    >
                        Edit
                    </button>

                    <button
                        onClick={() => {
                            updateMutation.mutate({
                                id: hackathon.id,
                                isPublic: !hackathon.isPublic,
                            });
                        }}
                        className={`px-4 py-2 border text-sm font-medium rounded-xl transition-colors ${hackathon.isPublic
                            ? 'border-green-500/20 text-green-400 hover:bg-green-500/10'
                            : 'border-red-500/20 text-red-400 hover:bg-red-500/10'
                            }`}
                    >
                        {hackathon.isPublic ? 'Public' : 'Hidden'}
                    </button>
                </div>
            </div>
        </LiquidGlass>
    );
}

function CreateForm({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [location, setLocation] = useState('');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [regDeadline, setRegDeadline] = useState('');
    const [maxParticipants, setMaxParticipants] = useState('');
    const [theme, setTheme] = useState('');
    const [error, setError] = useState('');

    const createMutation = trpc.hackathon.create.useMutation({
        onSuccess: () => onCreated(),
        onError: (e) => setError(e.message),
    });

    function handleSubmit() {
        if (!name.trim() || !startDate || !endDate) {
            setError('Name, start date, and end date are required.');
            return;
        }
        setError('');
        createMutation.mutate({
            name: name.trim(),
            description: description.trim() || undefined,
            location: location.trim() || undefined,
            startDate: new Date(startDate),
            endDate: new Date(endDate),
            registrationDeadline: regDeadline ? new Date(regDeadline) : undefined,
            maxParticipants: maxParticipants ? parseInt(maxParticipants) : undefined,
            theme: theme.trim() || undefined,
        });
    }

    return (
        <LiquidGlass className="p-6 mb-6 relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-[#00A8A8]/30 to-transparent" />
            <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-bold text-white">New Hackathon</h3>
                <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors text-sm font-mono">✕</button>
            </div>

            <div className="space-y-4">
                <div>
                    <label className="block text-xs uppercase tracking-[0.15em] font-bold text-gray-500 mb-2 font-mono">Name *</label>
                    <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Hacklytics 2026" className="w-full px-4 py-3 bg-black/40 border border-white/10 rounded-lg text-white text-sm font-mono placeholder:text-gray-600 focus:border-[#00A8A8]/50 focus:outline-none transition-colors" />
                </div>

                <div>
                    <label className="block text-xs uppercase tracking-[0.15em] font-bold text-gray-500 mb-2 font-mono">Description</label>
                    <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What's this hackathon about?" rows={3} className="w-full px-4 py-3 bg-black/40 border border-white/10 rounded-lg text-white text-sm font-mono placeholder:text-gray-600 focus:border-[#00A8A8]/50 focus:outline-none transition-colors resize-none" />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                        <label className="block text-xs uppercase tracking-[0.15em] font-bold text-gray-500 mb-2 font-mono">Location</label>
                        <input type="text" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Klaus 1443" className="w-full px-4 py-3 bg-black/40 border border-white/10 rounded-lg text-white text-sm font-mono placeholder:text-gray-600 focus:border-[#00A8A8]/50 focus:outline-none transition-colors" />
                    </div>
                    <div>
                        <label className="block text-xs uppercase tracking-[0.15em] font-bold text-gray-500 mb-2 font-mono">Theme</label>
                        <input type="text" value={theme} onChange={(e) => setTheme(e.target.value)} placeholder="Data for Good" className="w-full px-4 py-3 bg-black/40 border border-white/10 rounded-lg text-white text-sm font-mono placeholder:text-gray-600 focus:border-[#00A8A8]/50 focus:outline-none transition-colors" />
                    </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                        <label className="block text-xs uppercase tracking-[0.15em] font-bold text-gray-500 mb-2 font-mono">Start Date *</label>
                        <input type="datetime-local" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-full px-4 py-3 bg-black/40 border border-white/10 rounded-lg text-white text-sm font-mono focus:border-[#00A8A8]/50 focus:outline-none transition-colors [color-scheme:dark]" />
                    </div>
                    <div>
                        <label className="block text-xs uppercase tracking-[0.15em] font-bold text-gray-500 mb-2 font-mono">End Date *</label>
                        <input type="datetime-local" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-full px-4 py-3 bg-black/40 border border-white/10 rounded-lg text-white text-sm font-mono focus:border-[#00A8A8]/50 focus:outline-none transition-colors [color-scheme:dark]" />
                    </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                        <label className="block text-xs uppercase tracking-[0.15em] font-bold text-gray-500 mb-2 font-mono">Registration Deadline</label>
                        <input type="datetime-local" value={regDeadline} onChange={(e) => setRegDeadline(e.target.value)} className="w-full px-4 py-3 bg-black/40 border border-white/10 rounded-lg text-white text-sm font-mono focus:border-[#00A8A8]/50 focus:outline-none transition-colors [color-scheme:dark]" />
                    </div>
                    <div>
                        <label className="block text-xs uppercase tracking-[0.15em] font-bold text-gray-500 mb-2 font-mono">Max Participants</label>
                        <input type="number" value={maxParticipants} onChange={(e) => setMaxParticipants(e.target.value)} placeholder="500" className="w-full px-4 py-3 bg-black/40 border border-white/10 rounded-lg text-white text-sm font-mono placeholder:text-gray-600 focus:border-[#00A8A8]/50 focus:outline-none transition-colors" />
                    </div>
                </div>

                {error && <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg"><p className="text-red-400 text-sm font-mono">{error}</p></div>}

                <div className="flex items-center gap-4 pt-2">
                    <button
                        onClick={handleSubmit}
                        disabled={createMutation.isPending}
                        className="px-6 py-3 bg-gradient-to-r from-[#00A8A8] to-emerald-500 text-white font-semibold text-sm rounded-xl active:scale-[0.98] transition-transform shadow-lg shadow-[#00A8A8]/20 disabled:opacity-50"
                    >
                        {createMutation.isPending ? 'Creating...' : 'Create Hackathon'}
                    </button>
                    <button onClick={onClose} className="px-4 py-3 text-gray-500 hover:text-white text-sm font-mono transition-colors">Cancel</button>
                </div>
            </div>
        </LiquidGlass>
    );
}

function EditForm({ hackathonId, onClose, onSaved }: { hackathonId: string; onClose: () => void; onSaved: () => void }) {
    const { data: hackathon, isLoading } = trpc.hackathon.getById.useQuery({ id: hackathonId });

    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [location, setLocation] = useState('');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [regDeadline, setRegDeadline] = useState('');
    const [maxParticipants, setMaxParticipants] = useState('');
    const [theme, setTheme] = useState('');
    const [error, setError] = useState('');
    const [loaded, setLoaded] = useState(false);

    useEffect(() => {
        if (hackathon && !loaded) {
            setName(hackathon.name);
            setDescription(hackathon.description || '');
            setLocation(hackathon.location || '');
            setStartDate(toInputDate(hackathon.startDate));
            setEndDate(toInputDate(hackathon.endDate));
            setRegDeadline(hackathon.registrationDeadline ? toInputDate(hackathon.registrationDeadline) : '');
            setMaxParticipants(hackathon.maxParticipants?.toString() || '');
            setTheme(hackathon.theme || '');
            setLoaded(true);
        }
    }, [hackathon, loaded]);

    const updateMutation = trpc.hackathon.update.useMutation({
        onSuccess: () => onSaved(),
        onError: (e) => setError(e.message),
    });

    function handleSubmit() {
        if (!name.trim()) { setError('Name is required.'); return; }
        setError('');
        updateMutation.mutate({
            id: hackathonId,
            name: name.trim(),
            description: description.trim() || undefined,
            location: location.trim() || undefined,
            startDate: startDate ? new Date(startDate) : undefined,
            endDate: endDate ? new Date(endDate) : undefined,
            registrationDeadline: regDeadline ? new Date(regDeadline) : undefined,
            maxParticipants: maxParticipants ? parseInt(maxParticipants) : undefined,
            theme: theme.trim() || undefined,
        });
    }

    if (isLoading || !hackathon) {
        return (
            <LiquidGlass className="p-6 mb-6">
                <p className="text-gray-600 font-mono text-sm animate-pulse">Loading hackathon...</p>
            </LiquidGlass>
        );
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
            <div className="relative z-10 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
                <LiquidGlass className="p-6 relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-yellow-500/30 to-transparent" />
                    <div className="flex items-center justify-between mb-6">
                        <h3 className="text-lg font-bold text-white">Edit Hackathon</h3>
                        <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors text-sm font-mono">✕</button>
                    </div>

                    <div className="space-y-4">
                        <div>
                            <label className="block text-xs uppercase tracking-[0.15em] font-bold text-gray-500 mb-2 font-mono">Name</label>
                            <input type="text" value={name} onChange={(e) => setName(e.target.value)} className="w-full px-4 py-3 bg-black/40 border border-white/10 rounded-lg text-white text-sm font-mono focus:border-[#00A8A8]/50 focus:outline-none transition-colors" />
                        </div>
                        <div>
                            <label className="block text-xs uppercase tracking-[0.15em] font-bold text-gray-500 mb-2 font-mono">Description</label>
                            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} className="w-full px-4 py-3 bg-black/40 border border-white/10 rounded-lg text-white text-sm font-mono focus:border-[#00A8A8]/50 focus:outline-none transition-colors resize-none" />
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs uppercase tracking-[0.15em] font-bold text-gray-500 mb-2 font-mono">Location</label>
                                <input type="text" value={location} onChange={(e) => setLocation(e.target.value)} className="w-full px-4 py-3 bg-black/40 border border-white/10 rounded-lg text-white text-sm font-mono focus:border-[#00A8A8]/50 focus:outline-none transition-colors" />
                            </div>
                            <div>
                                <label className="block text-xs uppercase tracking-[0.15em] font-bold text-gray-500 mb-2 font-mono">Theme</label>
                                <input type="text" value={theme} onChange={(e) => setTheme(e.target.value)} className="w-full px-4 py-3 bg-black/40 border border-white/10 rounded-lg text-white text-sm font-mono focus:border-[#00A8A8]/50 focus:outline-none transition-colors" />
                            </div>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs uppercase tracking-[0.15em] font-bold text-gray-500 mb-2 font-mono">Start Date</label>
                                <input type="datetime-local" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-full px-4 py-3 bg-black/40 border border-white/10 rounded-lg text-white text-sm font-mono focus:border-[#00A8A8]/50 focus:outline-none transition-colors [color-scheme:dark]" />
                            </div>
                            <div>
                                <label className="block text-xs uppercase tracking-[0.15em] font-bold text-gray-500 mb-2 font-mono">End Date</label>
                                <input type="datetime-local" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-full px-4 py-3 bg-black/40 border border-white/10 rounded-lg text-white text-sm font-mono focus:border-[#00A8A8]/50 focus:outline-none transition-colors [color-scheme:dark]" />
                            </div>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs uppercase tracking-[0.15em] font-bold text-gray-500 mb-2 font-mono">Registration Deadline</label>
                                <input type="datetime-local" value={regDeadline} onChange={(e) => setRegDeadline(e.target.value)} className="w-full px-4 py-3 bg-black/40 border border-white/10 rounded-lg text-white text-sm font-mono focus:border-[#00A8A8]/50 focus:outline-none transition-colors [color-scheme:dark]" />
                            </div>
                            <div>
                                <label className="block text-xs uppercase tracking-[0.15em] font-bold text-gray-500 mb-2 font-mono">Max Participants</label>
                                <input type="number" value={maxParticipants} onChange={(e) => setMaxParticipants(e.target.value)} className="w-full px-4 py-3 bg-black/40 border border-white/10 rounded-lg text-white text-sm font-mono focus:border-[#00A8A8]/50 focus:outline-none transition-colors" />
                            </div>
                        </div>

                        {error && <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg"><p className="text-red-400 text-sm font-mono">{error}</p></div>}

                        <div className="flex items-center gap-4 pt-2">
                            <button
                                onClick={handleSubmit}
                                disabled={updateMutation.isPending}
                                className="px-6 py-3 bg-gradient-to-r from-[#00A8A8] to-emerald-500 text-white font-semibold text-sm rounded-xl active:scale-[0.98] transition-transform shadow-lg shadow-[#00A8A8]/20 disabled:opacity-50"
                            >
                                {updateMutation.isPending ? 'Saving...' : 'Save Changes'}
                            </button>
                            <button onClick={onClose} className="px-4 py-3 text-gray-500 hover:text-white text-sm font-mono transition-colors">Cancel</button>
                        </div>
                    </div>
                </LiquidGlass>
            </div>
        </div>
    );
}
