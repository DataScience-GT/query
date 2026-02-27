'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useSession, signOut } from 'next-auth/react';
import { trpc } from '@/lib/trpc';
import { useRouter } from 'next/navigation';
import Background from '@/components/portal/Background';
import { LiquidGlass } from '@/components/portal/LiquidGlass';

type ParsedJudge = { name: string; email: string; track?: string };
type ParsedProject = { name: string; teamMembers?: string; mainTrack?: string; extraTracks: string[]; isCreateX: boolean };

function parseCSV(text: string): string[][] {
    return text
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => line.split(',').map((cell) => cell.trim()));
}

export default function AdminSetupPage() {
    const { data: session, status } = useSession();
    const router = useRouter();
    const [mounted, setMounted] = useState(false);

    // Step state
    const [activeStep, setActiveStep] = useState(1);
    const [hackathonName, setHackathonName] = useState('');
    const [selectedHackathonId, setSelectedHackathonId] = useState<string | null>(null);

    // CSV data
    const [judgesData, setJudgesData] = useState<ParsedJudge[]>([]);
    const [projectsData, setProjectsData] = useState<ParsedProject[]>([]);

    // Status tracking
    const [judgesImported, setJudgesImported] = useState(false);
    const [projectsImported, setProjectsImported] = useState(false);
    const [judgesAssigned, setJudgesAssigned] = useState(false);

    // File refs
    const judgesFileRef = useRef<HTMLInputElement>(null);
    const projectsFileRef = useRef<HTMLInputElement>(null);

    // Admin check
    const { data: adminStatus, isLoading: adminLoading } = trpc.admin.isAdmin.useQuery(undefined, {
        enabled: !!session,
    });

    const { data: hackathons, refetch: refetchHackathons } = trpc.hackathon.list.useQuery({}, {
        enabled: !!session && !!adminStatus?.isAdmin,
    });

    // Mutations
    const createHackathon = trpc.hackathon.create.useMutation({
        onSuccess: (data) => {
            setSelectedHackathonId(data?.id ?? null);
            setActiveStep(2);
            refetchHackathons();
        },
    });

    const importJudges = trpc.judge.bulkImportJudges.useMutation({
        onSuccess: () => {
            setJudgesImported(true);
            setActiveStep(3);
        },
    });

    const importProjects = trpc.judge.bulkImportProjects.useMutation({
        onSuccess: () => {
            setProjectsImported(true);
            setActiveStep(4);
        },
    });

    const assignJudges = trpc.judge.assignJudgesToProjects.useMutation({
        onSuccess: () => {
            setJudgesAssigned(true);
        },
    });

    useEffect(() => setMounted(true), []);

    useEffect(() => {
        if (status === 'unauthenticated') router.push('/login');
    }, [status, router]);

    // Parse judges CSV: name,email,track
    const handleJudgesCSV = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
            const rows = parseCSV(ev.target?.result as string);
            // Skip header row if it looks like headers
            const start = rows[0]?.[0]?.toLowerCase() === 'name' ? 1 : 0;
            const parsed: ParsedJudge[] = rows.slice(start).map((row) => ({
                name: row[0] || '',
                email: row[1] || '',
                track: row[2] || undefined,
            })).filter((j) => j.name && j.email);
            setJudgesData(parsed);
        };
        reader.readAsText(file);
    };

    // Parse projects CSV: name,team_members,main_track,extra_tracks,is_create_x
    const handleProjectsCSV = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
            const rows = parseCSV(ev.target?.result as string);
            const start = rows[0]?.[0]?.toLowerCase() === 'name' ? 1 : 0;
            const parsed: ParsedProject[] = rows.slice(start).map((row) => ({
                name: row[0] || '',
                teamMembers: row[1] || undefined,
                mainTrack: row[2] || undefined,
                extraTracks: row[3] ? row[3].split('|').map(s => s.trim()).filter(Boolean) : [],
                isCreateX: row[4]?.toLowerCase() === 'true',
            })).filter((p) => p.name);
            setProjectsData(parsed);
        };
        reader.readAsText(file);
    };

    if (!mounted || status === 'loading' || adminLoading) {
        return (
            <div className="min-h-screen bg-[#050505] flex items-center justify-center">
                <div className="w-6 h-6 border-2 border-[#00A8A8] border-t-transparent rounded-full animate-spin" />
            </div>
        );
    }

    if (!adminStatus?.isAdmin) {
        return (
            <div className="min-h-screen bg-[#050505] flex items-center justify-center">
                <LiquidGlass className="p-8 text-center">
                    <p className="text-red-400 font-bold uppercase tracking-widest text-sm">Access Denied</p>
                </LiquidGlass>
            </div>
        );
    }

    const steps = [
        { num: 1, label: 'Create Hackathon', done: !!selectedHackathonId },
        { num: 2, label: 'Import Judges', done: judgesImported },
        { num: 3, label: 'Import Projects', done: projectsImported },
        { num: 4, label: 'Assign Judges', done: judgesAssigned },
    ];

    return (
        <div className="min-h-screen bg-[#050505] text-gray-400 font-sans selection:bg-[#00A8A8]/30 overflow-x-hidden">
            <Background className="fixed inset-0 z-0 opacity-[0.03]" />

            <main className="relative z-10 max-w-4xl mx-auto px-6 py-16">
                {/* Header */}
                <LiquidGlass className="rounded-lg p-8 mb-12 relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-[#00A8A8]/20 to-transparent" />
                    <div className="flex items-center justify-between">
                        <div>
                            <div className="flex items-center gap-3 mb-4">
                                <div className="h-2 w-2 rounded-full bg-[#00A8A8] animate-pulse" />
                                <span className="text-xs font-mono text-gray-500 uppercase tracking-widest">Hackathon Setup</span>
                            </div>
                            <h1 className="text-4xl font-black text-white uppercase tracking-tighter mb-1">
                                Event <span className="text-[#00A8A8] italic">Builder</span>
                            </h1>
                        </div>
                        <div className="flex gap-3">
                            <button
                                onClick={() => router.push('/admin-judging')}
                                className="px-6 py-3 bg-black/40 border border-white/10 text-white font-bold text-xs uppercase tracking-widest hover:bg-[#00A8A8]/10 hover:border-[#00A8A8]/30 hover:text-[#00A8A8] transition-all rounded-xl font-mono"
                            >
                                Results Dashboard
                            </button>
                            <button
                                onClick={() => signOut({ callbackUrl: '/login' })}
                                className="px-6 py-3 border border-red-500/20 text-red-500/60 font-bold text-xs uppercase tracking-widest hover:bg-red-500/10 hover:text-red-500 transition-all rounded-xl font-mono"
                            >
                                Sign Out
                            </button>
                        </div>
                    </div>
                </LiquidGlass>

                {/* Progress Steps */}
                <div className="flex items-center gap-2 mb-12">
                    {steps.map((s, i) => (
                        <React.Fragment key={s.num}>
                            <button
                                onClick={() => setActiveStep(s.num)}
                                className={`flex items-center gap-3 px-5 py-3 rounded-xl border transition-all text-xs font-bold uppercase tracking-widest font-mono ${activeStep === s.num
                                        ? 'bg-[#00A8A8]/10 border-[#00A8A8]/40 text-white'
                                        : s.done
                                            ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                                            : 'bg-white/[0.02] border-white/5 text-gray-600'
                                    }`}
                            >
                                <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black ${s.done ? 'bg-emerald-500/20 text-emerald-400' : activeStep === s.num ? 'bg-[#00A8A8]/20 text-[#00A8A8]' : 'bg-white/5 text-gray-600'
                                    }`}>
                                    {s.done ? '\u2713' : s.num}
                                </span>
                                {s.label}
                            </button>
                            {i < steps.length - 1 && <div className="w-6 h-px bg-white/10" />}
                        </React.Fragment>
                    ))}
                </div>

                {/* Step 1: Create Hackathon */}
                {activeStep === 1 && (
                    <LiquidGlass className="rounded-lg p-8">
                        <h2 className="text-xl font-black text-white uppercase tracking-tight mb-6">Create Hackathon</h2>

                        {/* Existing hackathons */}
                        {hackathons && hackathons.length > 0 && (
                            <div className="mb-8">
                                <p className="text-xs text-gray-500 font-mono uppercase tracking-widest mb-3">Or select an existing event:</p>
                                <div className="flex flex-wrap gap-2">
                                    {hackathons.map((h) => (
                                        <button
                                            key={h.id}
                                            onClick={() => { setSelectedHackathonId(h.id); setActiveStep(2); }}
                                            className={`px-5 py-2.5 rounded-xl font-bold text-xs uppercase tracking-widest transition-all border ${selectedHackathonId === h.id
                                                    ? 'bg-[#00A8A8]/10 border-[#00A8A8]/50 text-white'
                                                    : 'bg-white/[0.02] border-white/5 text-gray-500 hover:text-white hover:bg-white/5'
                                                }`}
                                        >
                                            {h.name}
                                        </button>
                                    ))}
                                </div>
                                <div className="my-6 flex items-center gap-4">
                                    <div className="flex-1 h-px bg-white/10" />
                                    <span className="text-xs text-gray-600 font-mono uppercase tracking-widest">or create new</span>
                                    <div className="flex-1 h-px bg-white/10" />
                                </div>
                            </div>
                        )}

                        <div className="space-y-4 max-w-md">
                            <input
                                type="text"
                                placeholder="Event name (e.g. Hacklytics 2026)"
                                value={hackathonName}
                                onChange={(e) => setHackathonName(e.target.value)}
                                className="w-full px-5 py-4 bg-black/40 border border-white/10 rounded-xl text-white font-mono placeholder:text-gray-600 focus:outline-none focus:border-[#00A8A8]/40 transition-colors"
                            />
                            <button
                                onClick={() => {
                                    if (!hackathonName.trim()) return;
                                    createHackathon.mutate({
                                        name: hackathonName.trim(),
                                        startDate: new Date(),
                                        endDate: new Date(Date.now() + 86400000),
                                    });
                                }}
                                disabled={!hackathonName.trim() || createHackathon.isPending}
                                className="w-full px-8 py-4 bg-[#00A8A8]/10 border border-[#00A8A8]/40 text-[#00A8A8] font-bold text-sm uppercase tracking-widest rounded-xl hover:bg-[#00A8A8]/20 transition-all disabled:opacity-30 font-mono"
                            >
                                {createHackathon.isPending ? 'Creating...' : 'Create Event'}
                            </button>
                        </div>
                    </LiquidGlass>
                )}

                {/* Step 2: Import Judges */}
                {activeStep === 2 && (
                    <LiquidGlass className="rounded-lg p-8">
                        <h2 className="text-xl font-black text-white uppercase tracking-tight mb-2">Import Judges</h2>
                        <p className="text-xs text-gray-500 font-mono mb-6">CSV format: name, email, track (optional)</p>

                        <input
                            ref={judgesFileRef}
                            type="file"
                            accept=".csv"
                            onChange={handleJudgesCSV}
                            className="hidden"
                        />
                        <button
                            onClick={() => judgesFileRef.current?.click()}
                            className="w-full px-8 py-6 border-2 border-dashed border-white/10 rounded-2xl text-gray-500 font-mono text-sm hover:border-[#00A8A8]/30 hover:text-[#00A8A8] transition-all mb-6"
                        >
                            {judgesData.length > 0 ? `${judgesData.length} judges loaded - click to re-upload` : 'Click to upload judges CSV'}
                        </button>

                        {/* Preview table */}
                        {judgesData.length > 0 && (
                            <>
                                <div className="overflow-x-auto mb-6">
                                    <table className="w-full text-xs">
                                        <thead>
                                            <tr className="text-gray-600 uppercase tracking-widest">
                                                <th className="text-left py-2 px-3 font-mono">#</th>
                                                <th className="text-left py-2 px-3 font-mono">Name</th>
                                                <th className="text-left py-2 px-3 font-mono">Email</th>
                                                <th className="text-left py-2 px-3 font-mono">Track</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {judgesData.slice(0, 20).map((j, i) => (
                                                <tr key={i} className="border-t border-white/5">
                                                    <td className="py-2 px-3 text-gray-600 font-mono">{i + 1}</td>
                                                    <td className="py-2 px-3 text-white">{j.name}</td>
                                                    <td className="py-2 px-3 text-gray-400 font-mono">{j.email}</td>
                                                    <td className="py-2 px-3 text-[#00A8A8]">{j.track || '-'}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                    {judgesData.length > 20 && (
                                        <p className="text-xs text-gray-600 font-mono mt-2 text-center">...and {judgesData.length - 20} more</p>
                                    )}
                                </div>

                                <button
                                    onClick={() => {
                                        if (!selectedHackathonId) return;
                                        importJudges.mutate({
                                            hackathonId: selectedHackathonId,
                                            judges: judgesData,
                                        });
                                    }}
                                    disabled={importJudges.isPending || !selectedHackathonId}
                                    className="w-full px-8 py-4 bg-[#00A8A8]/10 border border-[#00A8A8]/40 text-[#00A8A8] font-bold text-sm uppercase tracking-widest rounded-xl hover:bg-[#00A8A8]/20 transition-all disabled:opacity-30 font-mono"
                                >
                                    {importJudges.isPending ? `Importing ${judgesData.length} judges...` : `Import ${judgesData.length} Judges`}
                                </button>

                                {importJudges.data && (
                                    <div className="mt-4 p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl">
                                        <p className="text-emerald-400 text-xs font-mono">
                                            Created: {importJudges.data.created} | Skipped: {importJudges.data.skipped}
                                        </p>
                                        {importJudges.data.errors.length > 0 && (
                                            <div className="mt-2">
                                                {importJudges.data.errors.slice(0, 5).map((err, i) => (
                                                    <p key={i} className="text-red-400 text-xs font-mono">{err}</p>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </>
                        )}
                    </LiquidGlass>
                )}

                {/* Step 3: Import Projects */}
                {activeStep === 3 && (
                    <LiquidGlass className="rounded-lg p-8">
                        <h2 className="text-xl font-black text-white uppercase tracking-tight mb-2">Import Projects</h2>
                        <p className="text-xs text-gray-500 font-mono mb-6">CSV format: name, team_members (pipe-separated), main_track, extra_tracks (pipe-separated), is_create_x</p>

                        <input
                            ref={projectsFileRef}
                            type="file"
                            accept=".csv"
                            onChange={handleProjectsCSV}
                            className="hidden"
                        />
                        <button
                            onClick={() => projectsFileRef.current?.click()}
                            className="w-full px-8 py-6 border-2 border-dashed border-white/10 rounded-2xl text-gray-500 font-mono text-sm hover:border-[#00A8A8]/30 hover:text-[#00A8A8] transition-all mb-6"
                        >
                            {projectsData.length > 0 ? `${projectsData.length} projects loaded - click to re-upload` : 'Click to upload projects CSV'}
                        </button>

                        {/* Preview table */}
                        {projectsData.length > 0 && (
                            <>
                                <div className="overflow-x-auto mb-6">
                                    <table className="w-full text-xs">
                                        <thead>
                                            <tr className="text-gray-600 uppercase tracking-widest">
                                                <th className="text-left py-2 px-3 font-mono">Table</th>
                                                <th className="text-left py-2 px-3 font-mono">Name</th>
                                                <th className="text-left py-2 px-3 font-mono">Team</th>
                                                <th className="text-left py-2 px-3 font-mono">Track</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {projectsData.slice(0, 20).map((p, i) => (
                                                <tr key={i} className="border-t border-white/5">
                                                    <td className="py-2 px-3 text-gray-600 font-mono">{i + 1}</td>
                                                    <td className="py-2 px-3 text-white">{p.name}</td>
                                                    <td className="py-2 px-3 text-gray-400 font-mono text-[10px]">{p.teamMembers || '-'}</td>
                                                    <td className="py-2 px-3 text-[#00A8A8]">{p.mainTrack || '-'}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                    {projectsData.length > 20 && (
                                        <p className="text-xs text-gray-600 font-mono mt-2 text-center">...and {projectsData.length - 20} more</p>
                                    )}
                                </div>

                                <button
                                    onClick={() => {
                                        if (!selectedHackathonId) return;
                                        importProjects.mutate({
                                            hackathonId: selectedHackathonId,
                                            projects: projectsData,
                                        });
                                    }}
                                    disabled={importProjects.isPending || !selectedHackathonId}
                                    className="w-full px-8 py-4 bg-[#00A8A8]/10 border border-[#00A8A8]/40 text-[#00A8A8] font-bold text-sm uppercase tracking-widest rounded-xl hover:bg-[#00A8A8]/20 transition-all disabled:opacity-30 font-mono"
                                >
                                    {importProjects.isPending ? `Importing ${projectsData.length} projects...` : `Import ${projectsData.length} Projects (Auto-Assign Tables)`}
                                </button>

                                {importProjects.data && (
                                    <div className="mt-4 p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl">
                                        <p className="text-emerald-400 text-xs font-mono">
                                            Created: {importProjects.data.created} | Tables: {importProjects.data.startTable} - {importProjects.data.endTable}
                                        </p>
                                    </div>
                                )}
                            </>
                        )}
                    </LiquidGlass>
                )}

                {/* Step 4: Auto-Assign Judges */}
                {activeStep === 4 && (
                    <LiquidGlass className="rounded-lg p-8">
                        <h2 className="text-xl font-black text-white uppercase tracking-tight mb-2">Auto-Assign Judges to Projects</h2>
                        <p className="text-xs text-gray-500 font-mono mb-8">
                            Main track judges get 3-9 projects. Special label judges get all matching projects (randomized).
                        </p>

                        <button
                            onClick={() => {
                                if (!selectedHackathonId) return;
                                assignJudges.mutate({ hackathonId: selectedHackathonId });
                            }}
                            disabled={assignJudges.isPending || !selectedHackathonId}
                            className="w-full px-8 py-6 bg-gradient-to-r from-[#00A8A8]/10 to-emerald-500/10 border-2 border-[#00A8A8]/40 text-white font-black text-lg uppercase tracking-widest rounded-2xl hover:from-[#00A8A8]/20 hover:to-emerald-500/20 transition-all disabled:opacity-30 font-mono shadow-[0_0_30px_rgba(0,168,168,0.1)]"
                        >
                            {assignJudges.isPending ? 'Assigning...' : 'Auto-Assign All Judges'}
                        </button>

                        {assignJudges.data && (
                            <div className="mt-6">
                                <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl mb-4">
                                    <p className="text-emerald-400 text-sm font-mono font-bold mb-2">
                                        Assigned {assignJudges.data.totalJudges} judges
                                    </p>
                                </div>
                                <div className="overflow-x-auto">
                                    <table className="w-full text-xs">
                                        <thead>
                                            <tr className="text-gray-600 uppercase tracking-widest">
                                                <th className="text-left py-2 px-3 font-mono">Judge</th>
                                                <th className="text-left py-2 px-3 font-mono">Track</th>
                                                <th className="text-left py-2 px-3 font-mono">Projects</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {assignJudges.data.assignments.map((a, i) => (
                                                <tr key={i} className="border-t border-white/5">
                                                    <td className="py-2 px-3 text-white">{a.judgeName || 'Unknown'}</td>
                                                    <td className="py-2 px-3 text-[#00A8A8]">{a.track || 'General'}</td>
                                                    <td className="py-2 px-3 text-gray-400 font-mono">{a.assignedCount}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}

                        {judgesAssigned && (
                            <div className="mt-8 text-center">
                                <p className="text-emerald-400 text-sm font-bold mb-4">Setup complete - all judges assigned.</p>
                                <button
                                    onClick={() => router.push('/admin-judging')}
                                    className="px-10 py-4 bg-[#00A8A8]/10 border border-[#00A8A8]/40 text-[#00A8A8] font-bold text-sm uppercase tracking-widest rounded-xl hover:bg-[#00A8A8]/20 transition-all font-mono"
                                >
                                    Go to Results Dashboard
                                </button>
                            </div>
                        )}
                    </LiquidGlass>
                )}
            </main>
        </div>
    );
}
