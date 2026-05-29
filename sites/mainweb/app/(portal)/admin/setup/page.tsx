'use client';

import React, { useState, useEffect } from 'react';
import { Zap } from 'lucide-react';
import { useSession } from 'next-auth/react';
import { trpc } from '@/lib/trpc';
import { useRouter } from 'next/navigation';
import { LiquidGlass } from '@/components/portal/LiquidGlass';
import AdminLayout from '@/components/portal/AdminLayout';
import { SetupWizard } from '@/components/admin/setup/SetupWizard';
import { CreateHackathonStep } from '@/components/admin/setup/CreateHackathonStep';
import { ImportJudgesStep, ImportProjectsStep } from '@/components/admin/setup/ImportDataStep';

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
    const [hackathonTracks, setHackathonTracks] = useState('');
    const [hackathonChallenges, setHackathonChallenges] = useState('');
    const [selectedHackathonId, setSelectedHackathonId] = useState<string | null>(null);

    // CSV data
    const [judgesData, setJudgesData] = useState<ParsedJudge[]>([]);
    const [projectsData, setProjectsData] = useState<ParsedProject[]>([]);

    // Status tracking
    const [judgesImported, setJudgesImported] = useState(false);
    const [projectsImported, setProjectsImported] = useState(false);
    const [judgesAssigned, setJudgesAssigned] = useState(false);

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
        if (status === 'unauthenticated') {
            router.push('/login');
        } else if (status === 'authenticated' && !adminLoading && !adminStatus?.isAdmin) {
            router.push('/dashboard');
        }
    }, [status, adminStatus, adminLoading, router]);

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

    if (!mounted) return null;

    const steps = [
        { num: 1, label: 'Create Hackathon', done: !!selectedHackathonId },
        { num: 2, label: 'Import Judges', done: judgesImported },
        { num: 3, label: 'Import Projects', done: projectsImported },
        { num: 4, label: 'Assign Judges', done: judgesAssigned },
    ];

    return (
        <AdminLayout>
            <div className="relative z-10 max-w-4xl mx-auto">
                <div className="mb-12">
                    <p className="text-[10px] font-mono text-[#00A8A8]/60 uppercase tracking-[0.2em] mb-2 flex items-center gap-2">
                        <Zap className="w-3 h-3" /> Hackathon Hub
                    </p>
                    <h1 className="text-4xl font-black text-white uppercase tracking-tighter mb-1">
                        Judging Data <span className="text-accent italic">Import</span>
                    </h1>
                    <p className="text-sm font-mono text-text-muted uppercase tracking-widest">
                        Configure the event and import CSV files
                    </p>
                </div>

                {/* Progress Steps */}
                <SetupWizard activeStep={activeStep} setActiveStep={setActiveStep} steps={steps} />

                {/* Step 1: Create Hackathon */}
                {activeStep === 1 && (
                    <CreateHackathonStep
                        hackathons={hackathons || []}
                        selectedHackathonId={selectedHackathonId}
                        setSelectedHackathonId={setSelectedHackathonId}
                        setActiveStep={setActiveStep}
                        hackathonName={hackathonName}
                        setHackathonName={setHackathonName}
                        hackathonTracks={hackathonTracks}
                        setHackathonTracks={setHackathonTracks}
                        hackathonChallenges={hackathonChallenges}
                        setHackathonChallenges={setHackathonChallenges}
                        createHackathonPending={createHackathon.isPending}
                        onCreateHackathon={() => {
                            if (!hackathonName.trim()) return;

                            // Parse tracks and challenges
                            const parsedTracks = hackathonTracks.split(',').map(s => s.trim()).filter(Boolean);
                            const parsedChallenges = hackathonChallenges.split(',').map(s => s.trim()).filter(Boolean);

                            createHackathon.mutate({
                                name: hackathonName.trim(),
                                startDate: new Date(),
                                endDate: new Date(Date.now() + 86400000),
                                tracks: parsedTracks.length > 0 ? parsedTracks : undefined,
                                challenges: parsedChallenges.length > 0 ? parsedChallenges : undefined,
                            });
                        }}
                    />
                )}

                {/* Step 2: Import Judges */}
                {activeStep === 2 && (
                    <ImportJudgesStep
                        selectedHackathonId={selectedHackathonId}
                        judgesData={judgesData}
                        handleJudgesCSV={handleJudgesCSV}
                        importJudgesPending={importJudges.isPending}
                        importJudgesData={importJudges.data || null}
                        onImport={() => {
                            if (!selectedHackathonId) return;
                            importJudges.mutate({
                                hackathonId: selectedHackathonId,
                                judges: judgesData,
                            });
                        }}
                    />
                )}

                {/* Step 3: Import Projects */}
                {activeStep === 3 && (
                    <ImportProjectsStep
                        selectedHackathonId={selectedHackathonId}
                        projectsData={projectsData}
                        handleProjectsCSV={handleProjectsCSV}
                        importProjectsPending={importProjects.isPending}
                        importProjectsData={importProjects.data || null}
                        onImport={() => {
                            if (!selectedHackathonId) return;
                            importProjects.mutate({
                                hackathonId: selectedHackathonId,
                                projects: projectsData,
                            });
                        }}
                    />
                )}

                {/* Step 4: Auto-Assign Judges */}
                {activeStep === 4 && (
                    <LiquidGlass className="rounded-lg p-8">
                        <h2 className="text-xl font-black text-white uppercase tracking-tight mb-2">Auto-Assign Judges to Projects</h2>
                        <p className="text-xs text-text-muted font-mono mb-8">
                            Main track judges get 3-9 projects. Special label judges get all matching projects (randomized).
                        </p>

                        <button
                            onClick={() => {
                                if (!selectedHackathonId) return;
                                assignJudges.mutate({ hackathonId: selectedHackathonId });
                            }}
                            disabled={assignJudges.isPending || !selectedHackathonId}
                            className="w-full px-8 py-6 bg-gradient-to-r from-accent/10 to-emerald-500/10 border-2 border-accent/40 text-white font-black text-lg uppercase tracking-widest rounded-2xl hover:from-accent/20 hover:to-emerald-500/20 transition-all disabled:opacity-30 font-mono shadow-[0_0_30px_rgba(0,168,168,0.1)]"
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
                                                    <td className="py-2 px-3 text-accent">{a.track || 'General'}</td>
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
                                    onClick={() => router.push('/admin/judging')}
                                    className="px-10 py-4 bg-accent/10 border border-accent/40 text-accent font-bold text-sm uppercase tracking-widest rounded-xl hover:bg-accent/20 transition-all font-mono"
                                >
                                    Go to Results Dashboard
                                </button>
                            </div>
                        )}
                    </LiquidGlass>
                )}
            </div>
        </AdminLayout>
    );
}
