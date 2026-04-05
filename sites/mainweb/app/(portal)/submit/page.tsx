'use client';

import { useSession } from 'next-auth/react';
import { trpc } from '@/lib/trpc';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import Background from '@/components/portal/Background';
import { LiquidGlass } from '@/components/portal/LiquidGlass';
import { LoadingScreen } from '@/components/portal/LoadingScreen';
import Link from 'next/link';

function SubmitPortalContent() {
    const { data: session, status } = useSession();
    const router = useRouter();
    const searchParams = useSearchParams();
    const urlHackathonId = searchParams.get('id');

    const utils = trpc.useUtils();

    // Context & State
    const [selectedHackathonId, setSelectedHackathonId] = useState<string>(urlHackathonId || '');
    const [teamName, setTeamName] = useState('');
    const [joinTeamId, setJoinTeamId] = useState('');

    const [projectName, setProjectName] = useState('');
    const [projectDesc, setProjectDesc] = useState('');
    const [githubUrl, setGithubUrl] = useState('');
    const [videoUrl, setVideoUrl] = useState('');
    const [demoUrl, setDemoUrl] = useState('');

    const [error, setError] = useState('');
    const [successMessage, setSuccessMessage] = useState('');
    const [projectSubmitted, setProjectSubmitted] = useState(false);

    // Queries
    const { data: myRegs, isLoading: loadingRegs } = trpc.hackathon.myRegistrations.useQuery(undefined, { enabled: !!session });

    // We get the specific registration / team context based on selected hackathon
    const currentReg = myRegs?.find(r => r.hackathonId === selectedHackathonId);
    const hasSubmitted = currentReg?.hasSubmittedProject || projectSubmitted;

    // Mutations
    const createTeam = trpc.team.createTeam.useMutation({
        onSuccess: () => {
            utils.hackathon.myRegistrations.invalidate();
            setTeamName('');
            setError('');
        },
        onError: (err) => setError(err.message)
    });

    const joinTeam = trpc.team.joinTeam.useMutation({
        onSuccess: () => {
            utils.hackathon.myRegistrations.invalidate();
            setJoinTeamId('');
            setError('');
        },
        onError: (err) => setError(err.message)
    });

    const leaveTeam = trpc.team.leaveTeam.useMutation({
        onSuccess: () => {
            utils.hackathon.myRegistrations.invalidate();
            setError('');
        },
        onError: (err) => setError(err.message)
    });

    const submitProject = trpc.team.submitProject.useMutation({
        onSuccess: () => {
            utils.hackathon.myRegistrations.invalidate();
            setError('');
            setSuccessMessage('Project successfully submitted to the judging pipeline!');
            setProjectSubmitted(true);
        },
        onError: (err) => setError(err.message)
    });

    useEffect(() => {
        if (!selectedHackathonId && myRegs && myRegs.length > 0) {
            const firstReg = myRegs[0];
            if (firstReg) {
                setSelectedHackathonId(firstReg.hackathonId);
            }
        }
    }, [myRegs, selectedHackathonId]);

    // Handle initial state if we already submitted
    useEffect(() => {
        if (currentReg?.team?.projects && currentReg.team.projects.length > 0) {
            const p = currentReg.team.projects[0];
            if (p) {
                setProjectName(p.name || '');
                setProjectDesc(p.description || '');
                setGithubUrl(p.githubUrl || '');
                setVideoUrl(p.videoUrl || '');
                setDemoUrl(p.demoUrl || '');
            }
        }
    }, [currentReg]);

    if (status === 'loading' || loadingRegs) {
        return <LoadingScreen message="Initializing Workspace..." />;
    }

    if (!session) {
        router.push('/login');
        return null;
    }

    const activeRegs = myRegs?.filter(reg => reg.hackathon.endDate ? new Date(reg.hackathon.endDate) >= new Date() : true) || [];

    return (
        <div className="relative min-h-screen bg-[#050505] text-gray-400 font-sans selection:bg-[#00A8A8]/30 overflow-x-hidden">
            <Background className="fixed inset-0 z-0 opacity-[0.03]" />

            <main className="relative z-10 max-w-5xl mx-auto px-6 py-24 min-h-screen">

                {/* Header Link */}
                <div className="w-full flex justify-between items-center mb-12">
                    <Link href="/dashboard" className="text-gray-500 hover:text-white transition-colors font-mono text-xs tracking-widest uppercase flex items-center gap-2">
                        <span className="text-lg">←</span> Central Gateway
                    </Link>
                </div>

                <div className="w-full space-y-12">
                    {/* Welcome Header */}
                    <div className="space-y-6">
                        <div className="inline-block px-5 py-2 border border-[#00A8A8]/20 rounded-full bg-[#00A8A8]/5 mb-2">
                            <p className="text-[10px] font-mono text-[#00A8A8] uppercase tracking-[0.5em] font-black flex items-center gap-2">
                                <span className="w-1.5 h-1.5 bg-[#00A8A8] rounded-full animate-pulse" />
                                Project Initialization
                            </p>
                        </div>

                        <h1 className="text-5xl lg:text-7xl font-black text-white uppercase tracking-tighter leading-[0.85]">
                            Submission<br />
                            <span className="text-[#00A8A8] italic">
                                Terminal
                            </span>
                        </h1>
                    </div>

                    {!myRegs || myRegs.length === 0 ? (
                        <LiquidGlass className="p-12 text-center border-orange-500/20">
                            <h3 className="text-2xl font-bold text-white mb-4">No Active Registrations</h3>
                            <p className="text-gray-500 font-mono mb-8">You must register for a hackathon before you can form a team or submit a project.</p>
                            <Link href="/hackathons" className="px-8 py-4 bg-white/5 border border-white/10 text-white font-bold rounded-xl hover:bg-white/10 transition-colors">
                                Browse Hackathons
                            </Link>
                        </LiquidGlass>
                    ) : (
                        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">

                            {/* LEFT ALCOVE - CONTEXT / TEAM */}
                            <div className="lg:col-span-4 space-y-8">
                                <LiquidGlass className="p-6">
                                    <div className="space-y-2 mb-6">
                                        <label className="text-[10px] font-mono text-gray-500 uppercase tracking-widest font-bold ml-1">Context: Event</label>
                                        <select
                                            className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-[#00A8A8]/50 transition-colors"
                                            value={selectedHackathonId}
                                            onChange={(e) => {
                                                setSelectedHackathonId(e.target.value);
                                                setError('');
                                                setSuccessMessage('');
                                                setProjectSubmitted(false);
                                            }}
                                        >
                                            <option value="" disabled>Select Hackathon...</option>
                                            {activeRegs.map(r => (
                                                <option key={r.hackathonId} value={r.hackathonId}>{r.hackathon.name}</option>
                                            ))}
                                        </select>
                                    </div>

                                    {currentReg?.team ? (
                                        <div className="space-y-4">
                                            <h3 className="text-sm font-bold text-[#00A8A8] uppercase tracking-widest border-b border-white/10 pb-2">Active Squad</h3>
                                            <div className="p-4 bg-[#00A8A8]/5 border border-[#00A8A8]/20 rounded-xl">
                                                <p className="text-white font-black text-xl tracking-tight mb-4">{currentReg.team.name}</p>

                                                <div className="space-y-2">
                                                    <p className="text-[10px] text-gray-400 font-mono uppercase tracking-widest">Team ID (For invites)</p>
                                                    <div className="p-2 bg-black/50 border border-white/5 rounded font-mono text-xs text-[#00A8A8] text-center select-all">
                                                        {currentReg.team.id}
                                                    </div>
                                                </div>

                                                <div className="mt-6 pt-4 border-t border-white/5">
                                                    <p className="text-[10px] text-gray-500 font-mono uppercase tracking-widest mb-2">Members ({currentReg.team.currentMembers}/{currentReg.team.maxMembers})</p>

                                                </div>

                                                {currentReg.team.captainId === session?.user?.id ? (
                                                    <p className="text-xs text-emerald-500 font-mono mt-4">✓ You are the Captain</p>
                                                ) : (
                                                    <button
                                                        onClick={() => leaveTeam.mutate({ hackathonId: selectedHackathonId })}
                                                        disabled={leaveTeam.isPending}
                                                        className="w-full mt-6 py-2 border border-red-500/20 text-red-500 text-xs font-mono uppercase tracking-widest rounded-lg hover:bg-red-500/10 transition-colors"
                                                    >
                                                        {leaveTeam.isPending ? 'Leaving...' : 'Leave Team'}
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="space-y-6">
                                            <h3 className="text-sm font-bold text-gray-300 uppercase tracking-widest border-b border-white/10 pb-2">Squad Formation</h3>
                                            <p className="text-xs font-mono text-gray-500">You are currently operating SOLO. Create or join a team to link your profiles for the final submission.</p>

                                            <div className="pt-2 space-y-3">
                                                <input
                                                    type="text"
                                                    placeholder="Awesome Team Name"
                                                    value={teamName}
                                                    onChange={e => setTeamName(e.target.value)}
                                                    className="w-full px-4 py-3 bg-black/40 border border-white/10 rounded-xl text-white text-sm font-mono placeholder:text-gray-600 focus:border-[#00A8A8]/50 focus:outline-none transition-colors"
                                                />
                                                <button
                                                    onClick={() => {
                                                        if (teamName.trim().length === 0) {
                                                            setError("Team name is required");
                                                            return;
                                                        }
                                                        createTeam.mutate({ hackathonId: selectedHackathonId, name: teamName })
                                                    }}
                                                    disabled={createTeam.isPending}
                                                    className="w-full py-3 bg-white/5 border border-white/10 text-white font-bold text-xs uppercase tracking-widest rounded-xl hover:bg-white/10 transition-all font-mono"
                                                >
                                                    {createTeam.isPending ? 'Deploying...' : 'Create Team'}
                                                </button>
                                            </div>

                                            <div className="flex items-center gap-4 py-2">
                                                <div className="flex-1 h-px bg-white/10"></div>
                                                <span className="text-[10px] font-mono text-gray-600 uppercase">OR</span>
                                                <div className="flex-1 h-px bg-white/10"></div>
                                            </div>

                                            <div className="space-y-3">
                                                <input
                                                    type="text"
                                                    placeholder="Paste Invite ID..."
                                                    value={joinTeamId}
                                                    onChange={e => setJoinTeamId(e.target.value)}
                                                    className="w-full px-4 py-3 bg-black/40 border border-white/10 rounded-xl text-white text-sm font-mono placeholder:text-gray-600 focus:border-[#00A8A8]/50 focus:outline-none transition-colors"
                                                />
                                                <button
                                                    onClick={() => joinTeam.mutate({ hackathonId: selectedHackathonId, teamId: joinTeamId })}
                                                    disabled={joinTeam.isPending || joinTeamId.trim().length === 0}
                                                    className="w-full py-3 bg-white/5 text-gray-400 text-xs uppercase tracking-widest rounded-xl hover:bg-white/10 hover:text-white transition-all font-mono"
                                                >
                                                    {joinTeam.isPending ? 'Syncing...' : 'Join Team'}
                                                </button>
                                            </div>

                                        </div>
                                    )}

                                </LiquidGlass>

                            </div>

                            {/* RIGHT ALCOVE - PROJECT SUBMISSION */}
                            <div className="lg:col-span-8 flex flex-col">
                                <LiquidGlass className="p-8 md:p-12 relative overflow-hidden flex-1 border-t-2 border-[#00A8A8]/30">
                                    <div className="absolute top-0 right-0 p-8 opacity-5">
                                        <svg className="w-48 h-48 text-[#00A8A8]" viewBox="0 0 24 24" fill="currentColor"><path d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96zM14 13v4h-4v-4H7l5-5 5 5h-3z" /></svg>
                                    </div>

                                    <h2 className="text-3xl font-black text-white uppercase tracking-tight mb-2 relative z-10">
                                        Project Repository
                                    </h2>
                                    <p className="text-sm font-mono text-gray-500 mb-10 relative z-10">
                                        Finalize your hackathon submission. Only the core properties are required. If you are in a team, only the <span className="text-[#00A8A8] font-bold">Captain</span> can deploy the final record.
                                    </p>

                                    {error && (
                                        <div className="p-4 mb-8 bg-red-500/10 border border-red-500/20 rounded-xl relative z-10">
                                            <p className="text-red-400 font-mono text-sm">{error}</p>
                                        </div>
                                    )}

                                    {successMessage && (
                                        <div className="p-6 mb-8 bg-emerald-500/10 border border-emerald-500/20 rounded-xl relative z-10 flex items-center justify-between">
                                            <p className="text-emerald-400 font-mono text-sm font-bold flex items-center gap-3">
                                                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                                                {successMessage}
                                            </p>
                                            <Link href="/dashboard" className="px-4 py-2 bg-emerald-500/20 text-emerald-400 text-xs rounded hover:bg-emerald-500/30 transition-colors uppercase tracking-widest font-mono">
                                                Return
                                            </Link>
                                        </div>
                                    )}

                                    <form onSubmit={(e) => {
                                        e.preventDefault();
                                        submitProject.mutate({
                                            hackathonId: selectedHackathonId,
                                            teamId: currentReg?.team?.id,
                                            name: projectName,
                                            description: projectDesc,
                                            githubUrl,
                                            demoUrl,
                                            videoUrl
                                        });
                                    }} className="space-y-8 relative z-10">

                                        {/* Name & Desc */}
                                        <div className="space-y-4">
                                            <div>
                                                <label className="block text-xs uppercase tracking-[0.15em] font-bold text-gray-500 mb-2 font-mono">Code Name <span className="text-[#00A8A8]">*</span></label>
                                                <input
                                                    type="text"
                                                    required
                                                    value={projectName}
                                                    onChange={e => setProjectName(e.target.value)}
                                                    placeholder="Project Apollo"
                                                    className="w-full px-5 py-4 bg-black/40 border border-white/10 rounded-xl text-white font-mono placeholder:text-gray-600 focus:border-[#00A8A8]/50 focus:outline-none transition-colors"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-xs uppercase tracking-[0.15em] font-bold text-gray-500 mb-2 font-mono">Mission Briefing <span className="text-[#00A8A8]">*</span></label>
                                                <textarea
                                                    required
                                                    value={projectDesc}
                                                    onChange={e => setProjectDesc(e.target.value)}
                                                    placeholder="Explain the problem you solved and how you built it..."
                                                    rows={5}
                                                    className="w-full px-5 py-4 bg-black/40 border border-white/10 rounded-xl text-white font-mono placeholder:text-gray-600 focus:border-[#00A8A8]/50 focus:outline-none transition-colors resize-none"
                                                />
                                            </div>
                                        </div>

                                        {/* Links */}
                                        <div className="p-6 border border-white/5 rounded-2xl bg-white/[0.02]">
                                            <h3 className="text-sm font-bold text-white uppercase tracking-widest mb-6 flex items-center gap-3">
                                                <span className="w-1.5 h-1.5 bg-gray-500 rounded-full"></span>
                                                External Vectors
                                            </h3>

                                            <div className="space-y-4">
                                                <div>
                                                    <label className="block text-xs uppercase tracking-[0.15em] font-bold text-gray-500 mb-2 font-mono">Repository (GitHub)</label>
                                                    <input
                                                        type="url"
                                                        value={githubUrl}
                                                        onChange={e => setGithubUrl(e.target.value)}
                                                        placeholder="https://github.com/..."
                                                        className="w-full px-4 py-3 bg-black/60 border border-white/5 rounded-lg text-gray-300 text-sm font-mono placeholder:text-gray-700 focus:border-[#00A8A8]/30 focus:outline-none transition-colors"
                                                    />
                                                </div>
                                                <div>
                                                    <label className="block text-xs uppercase tracking-[0.15em] font-bold text-gray-500 mb-2 font-mono">Video Demo (YouTube)</label>
                                                    <input
                                                        type="url"
                                                        value={videoUrl}
                                                        onChange={e => setVideoUrl(e.target.value)}
                                                        placeholder="https://youtube.com/..."
                                                        className="w-full px-4 py-3 bg-black/60 border border-white/5 rounded-lg text-gray-300 text-sm font-mono placeholder:text-gray-700 focus:border-[#00A8A8]/30 focus:outline-none transition-colors"
                                                    />
                                                </div>
                                                <div>
                                                    <label className="block text-xs uppercase tracking-[0.15em] font-bold text-gray-500 mb-2 font-mono">Live Demo (Vercel, etc)</label>
                                                    <input
                                                        type="url"
                                                        value={demoUrl}
                                                        onChange={e => setDemoUrl(e.target.value)}
                                                        placeholder="https://..."
                                                        className="w-full px-4 py-3 bg-black/60 border border-white/5 rounded-lg text-gray-300 text-sm font-mono placeholder:text-gray-700 focus:border-[#00A8A8]/30 focus:outline-none transition-colors"
                                                    />
                                                </div>
                                            </div>
                                        </div>

                                        <div className="pt-6 border-t border-white/5 flex items-center justify-between">
                                            <p className="text-xs font-mono text-gray-500">
                                                {hasSubmitted ? 'Project record exists. Resubmitting will overwrite it.' : 'Ready for deployment.'}
                                            </p>
                                            <button
                                                type="submit"
                                                disabled={submitProject.isPending}
                                                className={`px-10 py-5 font-black text-lg uppercase tracking-[0.2em] transition-all flex items-center gap-3 rounded-2xl shadow-[0_0_30px_rgba(0,168,168,0.2)] hover:shadow-[0_0_50px_rgba(0,168,168,0.4)] hover:scale-[1.02] active:scale-[0.98] ${hasSubmitted
                                                    ? 'bg-transparent border-2 border-[#00A8A8] text-[#00A8A8] hover:bg-[#00A8A8] hover:text-black'
                                                    : 'bg-[#00A8A8] text-black hover:bg-white border-2 border-transparent'
                                                    }`}
                                            >
                                                {submitProject.isPending ? 'UPLOADING...' : hasSubmitted ? 'UPDATE RECORD' : 'DEPLOY RECORD'}
                                                {!submitProject.isPending && (
                                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
                                                )}
                                            </button>
                                        </div>

                                    </form>

                                </LiquidGlass>
                            </div>

                        </div>
                    )}
                </div>
            </main>
        </div>
    );
}

export default function SubmitPortalPage() {
    return (
        <>
            {/* @ts-expect-error Suspense type mismatch due to @types/react */}
            <Suspense fallback={<LoadingScreen message="Initializing Workspace..." />}>
                <SubmitPortalContent />
            </Suspense>
        </>
    );
}
