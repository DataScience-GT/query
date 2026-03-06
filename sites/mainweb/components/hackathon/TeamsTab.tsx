'use client';

import React, { useState } from 'react';
import { trpc } from '@/lib/trpc';
import Image from 'next/image';
import { LiquidGlass } from '@/components/portal/LiquidGlass';

export function TeamsTab({
    hackathonId,
    isRegistered,
    myTeamId,
}: {
    hackathonId: string;
    isRegistered: boolean;
    myTeamId: string | null;
}) {
    const { data: teams, isLoading } = trpc.team.list.useQuery({ hackathonId });
    const [showCreate, setShowCreate] = useState(false);
    const [teamName, setTeamName] = useState('');
    const [teamDesc, setTeamDesc] = useState('');
    const [maxMembers, setMaxMembers] = useState(4);
    const [error, setError] = useState('');

    const utils = trpc.useUtils();

    const createTeam = trpc.team.createTeam.useMutation({
        onSuccess: () => {
            setShowCreate(false);
            setTeamName('');
            setTeamDesc('');
            setError('');
            utils.team.list.invalidate({ hackathonId });
            utils.hackathon.myRegistrations.invalidate();
        },
        onError: (e) => setError(e.message),
    });

    const joinTeam = trpc.team.joinTeam.useMutation({
        onSuccess: () => {
            utils.team.list.invalidate({ hackathonId });
            utils.hackathon.myRegistrations.invalidate();
        },
        onError: (e) => setError(e.message),
    });

    const leaveTeam = trpc.team.leaveTeam.useMutation({
        onSuccess: () => {
            utils.team.list.invalidate({ hackathonId });
            utils.hackathon.myRegistrations.invalidate();
        },
        onError: (e) => setError(e.message),
    });

    if (isLoading) return <div className="py-16 text-center text-xs font-semibold uppercase tracking-widest text-white/40 animate-pulse">Loading teams...</div>;

    const myTeam = teams?.find((t) => t.id === myTeamId);
    const otherTeams = teams?.filter((t) => t.id !== myTeamId) ?? [];

    return (
        <div className="space-y-6 animate-in fade-in duration-300">
            {!isRegistered && (
                <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl flex items-center gap-3">
                    <svg className="w-5 h-5 text-amber-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" /></svg>
                    <p className="text-amber-400 text-sm font-medium">Register for this hackathon first to create or join teams.</p>
                </div>
            )}

            {error && (
                <div className="p-4 bg-rose-500/10 border border-rose-500/20 rounded-xl flex items-center gap-3">
                    <svg className="w-5 h-5 text-rose-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                    <p className="text-rose-400 text-sm font-medium">{error}</p>
                </div>
            )}

            {myTeam && (
                <LiquidGlass className="p-8 relative overflow-hidden bg-white/[0.01] border-white/5">
                    <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/10 rounded-full blur-[80px] pointer-events-none" />
                    <div className="relative z-10">
                        <div className="flex items-center gap-2.5 mb-5">
                            <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_10px_rgba(52,211,153,0.5)]" />
                            <h3 className="text-[11px] uppercase tracking-widest font-bold text-emerald-400">Your Team</h3>
                        </div>
                        <h2 className="text-3xl font-bold text-white tracking-tight mb-3">{myTeam.name}</h2>
                        {myTeam.description && <p className="text-white/50 text-sm mb-6 max-w-2xl leading-relaxed">{myTeam.description}</p>}

                        <div className="flex flex-wrap gap-3 mb-6">
                            {(myTeam.participants || []).map((p: { id: string; userId: string; user: { name?: string | null; image?: string | null } }) => (
                                <div key={p.id} className="flex items-center gap-3 px-4 py-2 bg-white/5 border border-white/10 rounded-xl">
                                    {p.user.image ? (
                                        <Image src={p.user.image} alt="" width={24} height={24} className="rounded-full shadow-sm" />
                                    ) : (
                                        <div className="w-6 h-6 rounded-full bg-white/10 flex items-center justify-center text-[10px] font-bold text-white/40 shadow-sm">
                                            {(p.user.name?.[0] ?? '?').toUpperCase()}
                                        </div>
                                    )}
                                    <span className="text-sm text-white/80 font-medium">{p.user.name ?? 'Unknown'}</span>
                                    {p.userId === myTeam.captainId && (
                                        <span className="text-[9px] font-bold text-amber-400 uppercase tracking-widest bg-amber-400/10 px-2 py-0.5 rounded-md ml-1 border border-amber-400/20">Capt</span>
                                    )}
                                </div>
                            ))}
                        </div>

                        <div className="flex items-center gap-5 pt-4 border-t border-white/5">
                            <span className="text-sm font-medium text-white/40 flex items-center gap-2">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
                                {myTeam.currentMembers} / {myTeam.maxMembers} Members
                            </span>
                            <button
                                onClick={() => { setError(''); leaveTeam.mutate({ hackathonId }); }}
                                disabled={leaveTeam.isPending}
                                className="px-5 py-2.5 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 hover:bg-rose-500/20 transition-all text-xs font-bold uppercase tracking-widest disabled:opacity-50"
                            >
                                {leaveTeam.isPending ? 'Leaving...' : 'Leave Team'}
                            </button>
                        </div>
                    </div>
                </LiquidGlass>
            )}

            {isRegistered && !myTeamId && (
                <LiquidGlass className="p-8 bg-white/[0.01] border-white/5">
                    {!showCreate ? (
                        <button
                            onClick={() => setShowCreate(true)}
                            className="w-full group flex flex-col items-center justify-center gap-3 py-10 rounded-2xl bg-cyan-500/5 border border-dashed border-cyan-500/30 hover:bg-cyan-500/10 hover:border-cyan-500/50 transition-all"
                        >
                            <div className="w-12 h-12 rounded-full bg-cyan-500/10 flex items-center justify-center group-hover:bg-cyan-500/20 transition-colors">
                                <svg className="w-6 h-6 text-cyan-400 group-hover:scale-110 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                            </div>
                            <span className="text-cyan-400 font-bold text-sm uppercase tracking-widest group-hover:text-cyan-300 transition-colors">Create a New Team</span>
                        </button>
                    ) : (
                        <div className="space-y-5 animate-in fade-in slide-in-from-bottom-4 duration-300">
                            <h3 className="text-[11px] uppercase tracking-widest font-bold text-cyan-400">New Team Details</h3>

                            <input type="text" value={teamName} onChange={(e) => setTeamName(e.target.value)} placeholder="Team Name" maxLength={100} className="w-full px-5 py-4 bg-[#0a0a0a] border border-white/10 rounded-xl text-white text-sm font-medium placeholder:text-white/20 focus:border-cyan-500/50 focus:bg-white/[0.02] focus:outline-none focus:ring-1 focus:ring-cyan-500/50 transition-all" />

                            <textarea value={teamDesc} onChange={(e) => setTeamDesc(e.target.value)} placeholder="What are you building? What skills are you looking for?" maxLength={1000} rows={4} className="w-full px-5 py-4 bg-[#0a0a0a] border border-white/10 rounded-xl text-white text-sm font-medium placeholder:text-white/20 focus:border-cyan-500/50 focus:bg-white/[0.02] focus:outline-none focus:ring-1 focus:ring-cyan-500/50 transition-all resize-none" />

                            <div>
                                <label className="block text-[11px] uppercase tracking-widest font-semibold text-white/50 mb-3">Capacity</label>
                                <div className="flex gap-2">
                                    {[2, 3, 4, 5, 6].map((n) => (
                                        <button key={n} onClick={() => setMaxMembers(n)} className={`w-12 h-12 rounded-xl text-sm font-bold border transition-all ${maxMembers === n ? 'bg-cyan-500/20 border-cyan-500/50 text-cyan-400 shadow-[0_0_15px_rgba(6,182,212,0.2)]' : 'bg-[#0a0a0a] border-white/10 text-white/40 hover:bg-white/5'}`}>{n}</button>
                                    ))}
                                </div>
                            </div>

                            <div className="flex flex-col sm:flex-row items-center gap-4 pt-4 border-t border-white/5">
                                <button
                                    onClick={() => { setError(''); createTeam.mutate({ hackathonId, name: teamName, description: teamDesc || undefined, maxMembers }); }}
                                    disabled={!teamName.trim() || createTeam.isPending}
                                    className="w-full sm:w-auto px-8 py-4 rounded-xl bg-cyan-500 text-[#020202] font-bold text-sm uppercase tracking-widest hover:bg-cyan-400 transition-all disabled:opacity-50 hover:shadow-[0_0_20px_rgba(6,182,212,0.4)] hover:-translate-y-0.5"
                                >
                                    {createTeam.isPending ? 'Processing...' : 'Create Team'}
                                </button>
                                <button onClick={() => { setShowCreate(false); setError(''); }} className="w-full sm:w-auto px-6 py-4 text-white/40 hover:text-white text-sm font-bold uppercase tracking-widest transition-colors">
                                    Cancel
                                </button>
                            </div>
                        </div>
                    )}
                </LiquidGlass>
            )}

            <div>
                <h3 className="text-[11px] uppercase tracking-widest font-bold text-white/40 mb-5 ml-1 flex items-center gap-2">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
                    {otherTeams.length > 0 ? `${otherTeams.length} Team${otherTeams.length !== 1 ? 's' : ''} Looking for Members` : 'No Teams Yet'}
                </h3>

                {otherTeams.length === 0 && !myTeam && (
                    <LiquidGlass className="p-12 text-center bg-white/[0.01] border-white/5">
                        <div className="w-16 h-16 bg-white/[0.02] border border-white/5 rounded-2xl flex items-center justify-center mx-auto mb-5">
                            <svg className="w-8 h-8 text-white/30" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
                        </div>
                        <p className="text-white/40 text-sm font-medium">No teams created yet. Be the first!</p>
                    </LiquidGlass>
                )}

                <div className="space-y-4">
                    {otherTeams.map((team) => {
                        const isFull = team.currentMembers >= team.maxMembers;
                        const canJoin = isRegistered && !myTeamId && team.isOpen && !isFull;

                        return (
                            <LiquidGlass key={team.id} className="p-6 relative overflow-hidden bg-white/[0.01] border-white/5 hover:border-cyan-500/30 transition-all hover:bg-white/[0.02] group">
                                <div className="absolute inset-0 bg-gradient-to-r from-cyan-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />

                                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-5 relative z-10">
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-3 mb-2">
                                            <h3 className="text-xl font-bold text-white tracking-tight truncate group-hover:text-cyan-300 transition-colors">{team.name}</h3>
                                            {!team.isOpen && <span className="text-[9px] font-bold text-rose-400 uppercase tracking-widest bg-rose-500/10 border border-rose-500/20 px-2 py-0.5 rounded-md">Closed</span>}
                                            {isFull && <span className="text-[9px] font-bold text-amber-400 uppercase tracking-widest bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-md">Full</span>}
                                        </div>
                                        {team.description && <p className="text-white/50 text-sm mb-4 line-clamp-2 leading-relaxed">{team.description}</p>}

                                        <div className="flex items-center gap-3">
                                            <div className="flex -space-x-2">
                                                {(team.participants || []).slice(0, 5).map((p: { id: string; user: { name?: string | null; image?: string | null } }) => (
                                                    p.user.image ? (
                                                        <Image key={p.id} src={p.user.image} alt="" width={32} height={32} className="rounded-full border-2 border-[#0a0a0a] shadow-sm relative z-10 hover:z-20 transition-all hover:scale-110" />
                                                    ) : (
                                                        <div key={p.id} className="w-8 h-8 rounded-full bg-white/10 border-2 border-[#0a0a0a] flex items-center justify-center text-[10px] font-bold text-white/60 shadow-sm relative z-10 hover:z-20 transition-all hover:scale-110">
                                                            {(p.user.name?.[0] ?? '?').toUpperCase()}
                                                        </div>
                                                    )
                                                ))}
                                                {team.currentMembers > 5 && (
                                                    <div className="w-8 h-8 rounded-full bg-white/5 border-2 border-[#0a0a0a] flex items-center justify-center text-[10px] font-bold text-white/40 relative z-10">
                                                        +{team.currentMembers - 5}
                                                    </div>
                                                )}
                                            </div>
                                            <span className="text-xs font-semibold text-white/40 bg-white/5 border border-white/5 px-2.5 py-1 rounded-md">
                                                {team.currentMembers} / {team.maxMembers}
                                            </span>
                                        </div>
                                    </div>

                                    {canJoin && (
                                        <button
                                            onClick={() => { setError(''); joinTeam.mutate({ hackathonId, teamId: team.id }); }}
                                            disabled={joinTeam.isPending}
                                            className="flex-shrink-0 group/btn px-6 py-3 rounded-xl bg-cyan-500/10 border border-cyan-500/30 hover:bg-cyan-500/20 hover:border-cyan-500/50 transition-all disabled:opacity-50 hover:shadow-[0_0_15px_rgba(6,182,212,0.2)]"
                                        >
                                            <span className="text-cyan-400 font-bold text-xs uppercase tracking-widest group-hover/btn:text-cyan-300 transition-colors">
                                                {joinTeam.isPending ? 'Joining...' : 'Join Team'}
                                            </span>
                                        </button>
                                    )}
                                </div>
                            </LiquidGlass>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
