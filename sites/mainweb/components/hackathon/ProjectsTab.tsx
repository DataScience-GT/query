'use client';

import React from 'react';
import { trpc } from '@/lib/trpc';
import { LiquidGlass } from '@/components/portal/LiquidGlass';

export function ProjectsTab({ hackathonId }: { hackathonId: string }) {
    const { data: projects, isLoading } = trpc.hackathon.getPublicProjects.useQuery({ hackathonId });

    if (isLoading) return <div className="py-16 text-center text-xs font-semibold uppercase tracking-widest text-white/40 animate-pulse">Loading amazing projects...</div>;

    if (!projects || projects.length === 0) {
        return (
            <LiquidGlass className="p-16 text-center border-white/5 bg-white/[0.01]">
                <div className="w-16 h-16 bg-white/[0.02] border border-white/5 rounded-none flex items-center justify-center mx-auto mb-6">
                    <svg className="w-8 h-8 text-white/30" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>
                </div>
                <h3 className="text-lg font-medium text-white mb-2">No Projects Yet</h3>
                <p className="text-sm text-white/40">Projects will appear here once they are submitted.</p>
            </LiquidGlass>
        );
    }

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {projects.map((project) => (
                <LiquidGlass key={project.id} className="p-1 group flex flex-col h-full hover:-translate-y-1 transition-all duration-500 bg-white/[0.01] border-white/5 hover:border-white/20 hover:shadow-[0_20px_40px_-15px_rgba(34,211,238,0.15)]">
                    <div className="flex-1 relative flex flex-col bg-[#0a0a0a] rounded-none p-6 md:p-8 overflow-hidden z-10">
                        {/* Hover Gradient Overlay */}
                        <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />

                        <div className="flex items-start justify-between mb-4 relative z-10">
                            <h3 className="text-xl font-bold text-white group-hover:text-cyan-300 transition-colors leading-tight">{project.name}</h3>
                            {project.status === 'winner' && (
                                <span className="bg-amber-400/10 text-amber-400 border border-amber-400/20 text-[10px] font-bold uppercase tracking-widest px-2.5 py-1 rounded-sm shadow-[0_0_15px_rgba(251,191,36,0.3)] shrink-0 ml-3">Winner</span>
                            )}
                        </div>

                        <p className="text-sm text-white/50 mb-6 line-clamp-3 leading-relaxed relative z-10 flex-1">{project.description}</p>

                        <div className="relative z-10">
                            {project.technologies && project.technologies.length > 0 && (
                                <div className="flex flex-wrap gap-2 mb-4">
                                    {project.technologies.slice(0, 4).map(tech => (
                                        <span key={tech} className="text-[10px] font-semibold text-white/40 bg-white/5 border border-white/5 px-2.5 py-1 rounded-md uppercase tracking-wider">{tech}</span>
                                    ))}
                                    {project.technologies.length > 4 && <span className="text-[10px] font-semibold text-white/30 px-1 py-1">+{project.technologies.length - 4}</span>}
                                </div>
                            )}

                            {project.challenges && project.challenges.length > 0 && (
                                <div className="mb-5 space-y-1.5">
                                    {project.challenges.map(c => (
                                        <div key={c} className="text-xs font-medium text-cyan-400/80 flex items-center gap-2">
                                            <div className="w-1 h-1 rounded-sm bg-cyan-400/50" />
                                            {c.replace('MLH_', '')}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        <div className="mt-auto pt-5 border-t border-white/5 flex items-center justify-between relative z-10">
                            <div className="text-xs text-white/40">
                                By <span className="text-white/80 font-medium">{project.team?.name || 'Unknown Team'}</span>
                            </div>
                            <div className="flex gap-2.5">
                                {project.githubUrl && (
                                    <a href={project.githubUrl} target="_blank" rel="noopener noreferrer" className="w-8 h-8 rounded-sm bg-white/5 border border-white/10 flex items-center justify-center text-white/40 hover:text-white hover:bg-white/10 transition-all">
                                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path fillRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" clipRule="evenodd" /></svg>
                                    </a>
                                )}
                                {project.demoUrl && (
                                    <a href={project.demoUrl} target="_blank" rel="noopener noreferrer" className="w-8 h-8 rounded-sm bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400 hover:bg-cyan-500/20 hover:text-cyan-300 transition-all shadow-[0_0_10px_rgba(6,182,212,0.2)]">
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                                    </a>
                                )}
                            </div>
                        </div>
                    </div>
                </LiquidGlass>
            ))}
        </div>
    );
}
