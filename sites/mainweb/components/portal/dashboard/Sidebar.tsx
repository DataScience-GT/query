'use client';

import React from 'react';
import Image from 'next/image';
import { signOut } from 'next-auth/react';
import { LiquidGlass } from '../LiquidGlass';

interface SidebarProps {
    user: {
        name?: string | null;
        image?: string | null;
    };
    status: 'admin' | 'member' | 'guest';
    activeTab: string;
    onTabChange: (tab: string) => void;
    tabs: Array<{
        key: string;
        label: string;
    }>;
}

export function Sidebar({
    user,
    status,
    activeTab,
    onTabChange,
    tabs,
}: SidebarProps) {
    const statusConfig = {
        admin: {
            color: 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]',
            label: 'ADMIN',
        },
        member: {
            color: 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]',
            label: 'MEMBER',
        },
        guest: {
            color: 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]',
            label: 'GUEST',
        },
    };

    return (
        <LiquidGlass className="p-6 relative overflow-visible">
            {/* User Profile Header */}
            <div className="flex items-center gap-5 border-b border-white/5 pb-8 mb-8">
                <div className="relative group">
                    <div className="absolute -inset-0.5 bg-gradient-to-r from-[#EAFF2B] to-blue-600 rounded-sm opacity-50 blur group-hover:opacity-75 transition duration-1000 group-hover:duration-200" />
                    <Image
                        src={user.image || '/avatar-placeholder.png'}
                        alt="Avatar"
                        width={56}
                        height={56}
                        className="relative rounded-sm border border-black bg-black object-cover h-14 w-14 transition-all duration-300"
                    />
                </div>
                <div className="space-y-1">
                    <p className="text-white font-bold uppercase tracking-tight text-base font-mono">
                        {user.name || 'GUEST'}
                    </p>
                    <div className="flex items-center gap-2">
                        <div className={`h-2 w-2 rounded-sm ${statusConfig[status].color}`} />
                        <p className="text-gray-500 text-xs uppercase tracking-widest font-bold">
                            {statusConfig[status].label}
                        </p>
                    </div>
                </div>
            </div>

            {/* Navigation */}
            <nav className="space-y-2">
                {tabs.map((tab) => (
                    <button
                        key={tab.key}
                        onClick={() => onTabChange(tab.key)}
                        className={`w-full group flex items-center justify-between px-6 py-4 rounded-none text-sm font-bold tracking-widest transition-all duration-200 border border-transparent
              ${activeTab === tab.key
                                ? 'bg-white/[0.03] text-white border-white/5 shadow-[inset_0_0_20px_rgba(255,255,255,0.02)]'
                                : 'text-gray-500 hover:text-white hover:bg-white/[0.02]'
                            }`}
                    >
                        <span>{tab.label}</span>
                        <span
                            className={`h-2 w-2 rounded-sm transition-all ${activeTab === tab.key ? 'bg-[#EAFF2B]' : 'bg-transparent group-hover:bg-white/20'
                                }`}
                        />
                    </button>
                ))}
            </nav>

            {/* Sign Out */}
            <div className="mt-8 pt-8 border-t border-white/5">
                <button
                    onClick={() => signOut({ callbackUrl: '/login' })}
                    className="w-full py-4 px-6 rounded-none bg-red-500/[0.05] border border-red-500/10 text-red-500/60 hover:bg-red-500/10 hover:text-red-400 hover:border-red-500/30 transition-all font-mono text-xs uppercase tracking-[0.2em] flex items-center justify-center gap-3 group"
                >
                    <span className="w-2 h-2 bg-red-500/40 rounded-sm group-hover:bg-red-500 transition-colors" />
                    Terminate Session
                </button>
            </div>
        </LiquidGlass>
    );
}
