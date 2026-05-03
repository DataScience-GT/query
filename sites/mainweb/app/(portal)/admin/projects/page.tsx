'use client';

import { useSession } from 'next-auth/react';
import { trpc } from '@/lib/trpc';
import { useRouter } from 'next/navigation';
import AdminLayout from '@/components/portal/AdminLayout';
import { LiquidGlass } from '@/components/portal/LiquidGlass';

export default function ProjectsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  if (status === 'unauthenticated') {
    router.push('/login');
    return null;
  }

  return (
    <AdminLayout>
      <div className="relative z-10 max-w-7xl mx-auto">
        {/* Animated Background */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-[-15%] left-[-10%] w-[700px] h-[700px] bg-gradient-to-r from-accent/6 via-cyan-900/12 to-purple-900/8 blur-[350px] rounded-full" />
          <div className="absolute bottom-[-20%] right-[-8%] w-[600px] h-[600px] bg-gradient-to-r from-emerald-900/12 via-cyan-900/10 to-indigo-900/8 blur-[300px] rounded-full" />
        </div>

        {/* Page Header - Enhanced */}
        <div className="relative mb-6 p-6 border border-white/5 bg-gradient-to-br from-accent/8 via-cyan-900/12 to-transparent rounded-2xl overflow-hidden group hover:border-accent/40 transition-all duration-500">
          <div className="absolute inset-0 bg-gradient-to-r from-accent/5 via-transparent to-emerald-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
          <div className="absolute -bottom-20 -right-20 w-56 h-56 bg-accent/10 rounded-full blur-[100px] opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
          <h1 className="relative text-3xl font-black text-white tracking-tighter mb-3 group-hover:text-transparent group-hover:bg-clip-text group-hover:bg-gradient-to-r group-hover:from-accent group-hover:via-cyan-400 group-hover:to-emerald-500 transition-all duration-500">
            Projects <span className="text-accent italic font-bold">Manager</span>
          </h1>
          <p className="relative text-text-muted text-sm font-mono">
            Browse and manage hackathon projects submitted by participants.
          </p>
        </div>

        {/* Content Area - Enhanced */}
        <div className="relative p-16 text-center bg-black/20 border border-white/5 rounded-2xl overflow-hidden group hover:border-white/20 transition-all duration-300">
          {/* Decorative corner accents */}
          <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:opacity-10 transition-opacity">
            <svg className="w-40 h-40 text-white" viewBox="0 0 24 24" fill="currentColor"><path d="M9 11l3 3L22 4" /></svg>
          </div>
          <div className="absolute bottom-0 left-0 p-8 opacity-5 group-hover:opacity-10 transition-opacity">
            <svg className="w-40 h-40 text-white" viewBox="0 0 24 24" fill="currentColor"><path d="M15 11l-3-3L2 4" /></svg>
          </div>

          {/* Icon - Enhanced */}
          <div className="relative inline-flex items-center justify-center w-20 h-20 rounded-full bg-gradient-to-br from-accent/10 via-cyan-900/5 to-transparent border border-accent/20 group-hover:border-accent/40 group-hover:shadow-[0_0_30px_rgba(0,168,168,0.3)] transition-all duration-500">
            <div className="absolute inset-0 rounded-full bg-gradient-to-br from-accent/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
            <svg className="relative w-10 h-10 text-accent group-hover:text-white transition-colors duration-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          </div>

          {/* Heading - Enhanced */}
          <h2 className="relative mt-6 text-white font-bold text-2xl group-hover:text-transparent group-hover:bg-clip-text group-hover:bg-gradient-to-r group-hover:from-white group-hover:via-cyan-200 to-gray-400 transition-all duration-500">
            No projects configured
          </h2>

          {/* Description - Enhanced */}
          <p className="relative text-gray-500 font-mono text-sm mt-3 group-hover:text-gray-400 transition-colors">
            Project management is under development. Hackathon registrations will be displayed in the attendees section.
          </p>

          {/* Decorative underline */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-24 h-[2px] bg-gradient-to-r from-accent/50 via-cyan-500/30 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
        </div>
      </div>
    </AdminLayout>
  );
}
