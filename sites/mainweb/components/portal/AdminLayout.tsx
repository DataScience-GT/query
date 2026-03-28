'use client';

import React, { useEffect, useState } from 'react';
import { useSession, signOut } from 'next-auth/react';
import { trpc } from '@/lib/trpc';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import Background from '@/components/portal/Background';

const TABS = [
    { label: 'Check-in Console', href: '/admin', id: 'admin', icon: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z' },
    { label: 'Hackathon Manager', href: '/admin/hackathons', id: 'admin-hackathons', icon: 'M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10' },
    { label: 'Event Builder', href: '/admin/setup', id: 'admin-setup', icon: 'M11 4a2 2 0 114 0v1a1 1 0 001 1h3a1 1 0 011 1v3a1 1 0 01-1 1h-1a2 2 0 100 4h1a1 1 0 011 1v3a1 1 0 01-1 1h-3a1 1 0 01-1-1v-1a2 2 0 10-4 0v1a1 1 0 01-1 1H7a1 1 0 01-1-1v-3a1 1 0 00-1-1H4a2 2 0 110-4h1a1 1 0 001-1V7a1 1 0 011-1h3a1 1 0 001-1V4z' },
    { label: 'Voting Results', href: '/admin/judging', id: 'admin-judging', icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z' },
    { label: 'Back to Dashboard', href: '/dashboard', id: 'dashboard', icon: 'M11 15l-3-3m0 0l3-3m-3 3h8M3 12a9 9 0 1118 0 9 9 0 01-18 0z' }
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
    const { data: session, status } = useSession();
    const router = useRouter();
    const pathname = usePathname();
    const [mounted, setMounted] = useState(false);

    const { data: adminStatus, isLoading: adminLoading } = trpc.admin.isAdmin.useQuery(undefined, {
        enabled: !!session,
    });

    useEffect(() => {
        setMounted(true);
    }, []);

    useEffect(() => {
        if (status === 'unauthenticated') {
            router.push('/login');
        } else if (status === 'authenticated' && mounted && !adminLoading && !adminStatus?.isAdmin) {
            router.push('/dashboard');
        }
    }, [status, adminStatus, adminLoading, router, mounted]);

    if (!mounted || status === 'loading' || adminLoading) {
        return (
            <div className="min-h-screen bg-[#050505] flex items-center justify-center">
                <Background className="fixed inset-0 z-0 opacity-[0.03]" />
                <div className="text-center relative z-10">
                    <div className="w-12 h-12 border-4 border-[#00A8A8]/30 border-t-[#00A8A8] rounded-full animate-spin mx-auto mb-4" />
                    <p className="text-[#00A8A8] text-sm font-mono uppercase tracking-widest animate-pulse">Authenticating Admin...</p>
                </div>
            </div>
        );
    }

    if (!session || !adminStatus?.isAdmin) return null;

    const currentTabId = pathname.split('/')[1] || 'admin';

    return (
        <div className="relative min-h-screen bg-[#050505] text-gray-400 font-sans flex overflow-hidden">
            <Background className="fixed inset-0 z-0 opacity-[0.03]" />

            {/* Desktop Sidebar */}
            <aside className="hidden md:flex w-72 flex-col h-screen sticky top-0 border-r border-white/5 bg-black/40 backdrop-blur-3xl z-40">
                <div className="p-8 pb-4">
                    <div className="flex items-center gap-2 mb-2">
                        <span className="w-2 h-2 rounded-full bg-[#00A8A8] animate-pulse shadow-[0_0_8px_rgba(0,168,168,0.5)]" />
                        <p className="text-xs uppercase tracking-widest text-[#00A8A8] font-mono font-bold">Admin Console</p>
                    </div>
                    <h1 className="text-3xl font-black text-white uppercase tracking-tighter leading-none mb-1">
                        System <span className="text-[#00A8A8] italic font-serif">Core</span>
                    </h1>
                    <p className="text-[10px] text-gray-500 font-mono uppercase tracking-[0.2em]">{adminStatus.role?.replace(/_/g, ' ')}</p>
                </div>

                <div className="flex-1 px-4 py-8 space-y-2 overflow-y-auto overflow-x-hidden no-scrollbar">
                    {TABS.map((tab) => {
                        const isActive = currentTabId === tab.id;
                        const isDashboard = tab.id === 'dashboard';
                        return (
                            <Link key={tab.id} href={tab.href}>
                                <div className={`flex items-center gap-4 px-5 py-4 rounded-xl transition-all duration-300 group border ${isActive
                                    ? 'bg-[#00A8A8]/10 border-[#00A8A8]/30 text-white shadow-[0_0_15px_rgba(0,168,168,0.1)] scale-[1.02]'
                                    : isDashboard
                                        ? 'bg-white/[0.02] border-white/5 text-gray-400 hover:bg-white/5 hover:text-white mt-12'
                                        : 'border-transparent text-gray-500 hover:bg-white/[0.03] hover:text-gray-200 hover:border-white/5'
                                    }`}>
                                    <svg className={`w-5 h-5 transition-colors ${isActive ? 'text-[#00A8A8]' : 'text-gray-600 group-hover:text-gray-400'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={isActive ? 2 : 1.5} d={tab.icon} />
                                    </svg>
                                    <span className={`text-xs font-mono uppercase tracking-widest ${isActive ? 'font-bold' : 'font-medium'}`}>
                                        {tab.label}
                                    </span>
                                </div>
                            </Link>
                        );
                    })}
                </div>

                <div className="p-6 border-t border-white/5">
                    <button
                        onClick={() => signOut({ callbackUrl: '/login' })}
                        className="w-full flex items-center justify-center gap-3 px-5 py-4 border border-red-500/20 text-red-500/60 font-mono text-[10px] uppercase font-bold tracking-[0.2em] hover:bg-red-500/10 hover:text-red-500 hover:border-red-500/40 transition-all rounded-xl group"
                    >
                        <svg className="w-4 h-4 group-hover:-translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                        </svg>
                        Terminate Session
                    </button>
                </div>
            </aside>

            {/* Main Content Area */}
            <main className="flex-1 flex flex-col min-w-0 h-screen overflow-y-auto no-scrollbar relative z-10 w-full px-4 md:px-8 lg:px-12 py-8 md:py-12">
                <div className="max-w-[1400px] w-full mx-auto">
                    {children}
                </div>
            </main>

            {/* Mobile Top Bar */}
            <div className="md:hidden fixed top-0 left-0 right-0 h-16 bg-black/80 backdrop-blur-xl border-b border-white/5 z-50 flex items-center justify-between px-6">
                <h1 className="text-xl font-black text-white uppercase tracking-tighter">
                    System <span className="text-[#00A8A8] italic font-serif">Core</span>
                </h1>
            </div>

            {/* Mobile Bottom Navigation (Floating) */}
            <div className="md:hidden fixed bottom-6 left-1/2 -translate-x-1/2 z-50 w-[90%] max-w-sm rounded-full bg-black/80 backdrop-blur-xl border border-white/10 p-2 flex items-center justify-between shadow-[0_10px_40px_rgba(0,0,0,0.5)]">
                {TABS.slice(0, 4).map((tab) => {
                    const isActive = currentTabId === tab.id;
                    return (
                        <Link key={tab.id} href={tab.href} className={`flex-1 flex justify-center py-3 rounded-full transition-all ${isActive ? 'bg-[#00A8A8]/20 text-[#00A8A8]' : 'text-gray-500 hover:text-white'}`}>
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={isActive ? 2.5 : 1.5} d={tab.icon} />
                            </svg>
                        </Link>
                    )
                })}
            </div>
        </div>
    );
}
