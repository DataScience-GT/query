'use client';

import React, { useRef } from 'react';
import { LiquidGlass } from '@/components/portal/LiquidGlass';

type ParsedJudge = { name: string; email: string; track?: string };
type ParsedProject = { name: string; teamMembers?: string; mainTrack?: string; extraTracks: string[]; isCreateX: boolean };

export function ImportJudgesStep({
    selectedHackathonId,
    judgesData,
    handleJudgesCSV,
    importJudgesPending,
    importJudgesData,
    onImport,
}: {
    selectedHackathonId: string | null;
    judgesData: ParsedJudge[];
    handleJudgesCSV: (e: React.ChangeEvent<HTMLInputElement>) => void;
    importJudgesPending: boolean;
    importJudgesData: { created: number; skipped: number; errors: string[] } | null;
    onImport: () => void;
}) {
    const fileRef = useRef<HTMLInputElement>(null);
    return (
        <LiquidGlass className="rounded-none p-8">
            <h2 className="text-xl font-black text-[var(--text-primary)] uppercase tracking-tight mb-2">Import Judges</h2>
            <p className="text-xs text-[var(--text-subtle)] font-mono mb-6">CSV format: name, email, track (optional)</p>

            <input ref={fileRef} type="file" accept=".csv" onChange={handleJudgesCSV} className="hidden" />
            <button
                onClick={() => fileRef.current?.click()}
                className="w-full px-8 py-6 border-2 border-dashed border-[var(--border-subtle)] rounded-none text-[var(--text-subtle)] font-mono text-sm hover:border-accent/30 hover:text-accent transition-all mb-6"
            >
                {judgesData.length > 0 ? `${judgesData.length} judges loaded - click to re-upload` : 'Click to upload judges CSV'}
            </button>

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
                                    <tr key={i} className="border-t border-[var(--border-subtle)]">
                                        <td className="py-2 px-3 text-gray-600 font-mono">{i + 1}</td>
                                        <td className="py-2 px-3 text-[var(--text-primary)]">{j.name}</td>
                                        <td className="py-2 px-3 text-[var(--text-muted)] font-mono">{j.email}</td>
                                        <td className="py-2 px-3 text-accent">{j.track || '-'}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        {judgesData.length > 20 && (
                            <p className="text-xs text-gray-600 font-mono mt-2 text-center">...and {judgesData.length - 20} more</p>
                        )}
                    </div>

                    <button
                        onClick={onImport}
                        disabled={importJudgesPending || !selectedHackathonId}
                        className="w-full px-8 py-4 bg-accent/10 border border-accent/40 text-accent font-bold text-sm uppercase tracking-widest rounded-none hover:bg-accent/20 transition-all disabled:opacity-30 font-mono"
                    >
                        {importJudgesPending ? `Importing ${judgesData.length} judges...` : `Import ${judgesData.length} Judges`}
                    </button>

                    {importJudgesData && (
                        <div className="mt-4 p-4 bg-accent/10 border border-accent/20 rounded-none">
                            <p className="text-accent text-xs font-mono">
                                Created: {importJudgesData.created} | Skipped: {importJudgesData.skipped}
                            </p>
                            {importJudgesData.errors?.length > 0 && (
                                <div className="mt-2">
                                    {importJudgesData.errors.slice(0, 5).map((err: string, i: number) => (
                                        <p key={i} className="text-red-400 text-xs font-mono">{err}</p>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </>
            )}
        </LiquidGlass>
    );
}

export function ImportProjectsStep({
    selectedHackathonId,
    projectsData,
    handleProjectsCSV,
    importProjectsPending,
    importProjectsData,
    onImport,
}: {
    selectedHackathonId: string | null;
    projectsData: ParsedProject[];
    handleProjectsCSV: (e: React.ChangeEvent<HTMLInputElement>) => void;
    importProjectsPending: boolean;
    importProjectsData: { created: number; startTable: number; endTable: number } | null;
    onImport: () => void;
}) {
    const fileRef = useRef<HTMLInputElement>(null);
    return (
        <LiquidGlass className="rounded-none p-8">
            <h2 className="text-xl font-black text-[var(--text-primary)] uppercase tracking-tight mb-2">Import Projects</h2>
            <p className="text-xs text-[var(--text-subtle)] font-mono mb-6">CSV format: name, team_members (pipe-separated), main_track, extra_tracks (pipe-separated), is_create_x</p>

            <input ref={fileRef} type="file" accept=".csv" onChange={handleProjectsCSV} className="hidden" />
            <button
                onClick={() => fileRef.current?.click()}
                className="w-full px-8 py-6 border-2 border-dashed border-[var(--border-subtle)] rounded-none text-[var(--text-subtle)] font-mono text-sm hover:border-accent/30 hover:text-accent transition-all mb-6"
            >
                {projectsData.length > 0 ? `${projectsData.length} projects loaded - click to re-upload` : 'Click to upload projects CSV'}
            </button>

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
                                    <tr key={i} className="border-t border-[var(--border-subtle)]">
                                        <td className="py-2 px-3 text-gray-600 font-mono">{i + 1}</td>
                                        <td className="py-2 px-3 text-[var(--text-primary)]">{p.name}</td>
                                        <td className="py-2 px-3 text-[var(--text-muted)] font-mono text-[10px]">{p.teamMembers || '-'}</td>
                                        <td className="py-2 px-3 text-accent">{p.mainTrack || '-'}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        {projectsData.length > 20 && (
                            <p className="text-xs text-gray-600 font-mono mt-2 text-center">...and {projectsData.length - 20} more</p>
                        )}
                    </div>

                    <button
                        onClick={onImport}
                        disabled={importProjectsPending || !selectedHackathonId}
                        className="w-full px-8 py-4 bg-accent/10 border border-accent/40 text-accent font-bold text-sm uppercase tracking-widest rounded-none hover:bg-accent/20 transition-all disabled:opacity-30 font-mono"
                    >
                        {importProjectsPending ? `Importing ${projectsData.length} projects...` : `Import ${projectsData.length} Projects (Auto-Assign Tables)`}
                    </button>

                    {importProjectsData && (
                        <div className="mt-4 p-4 bg-accent/10 border border-accent/20 rounded-none">
                            <p className="text-accent text-xs font-mono">
                                Created: {importProjectsData.created} | Tables: {importProjectsData.startTable} - {importProjectsData.endTable}
                            </p>
                        </div>
                    )}
                </>
            )}
        </LiquidGlass>
    );
}
