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
        {/* Page Header */}
        <div className="mb-6 p-5 border border-white/5 bg-gradient-to-br from-accent/5 to-transparent rounded-2xl">
          <h1 className="text-2xl font-black text-white tracking-tighter mb-2">
            Projects <span className="text-accent italic">Manager</span>
          </h1>
          <p className="text-text-muted text-sm">
            Browse and manage hackathon projects submitted by participants.
          </p>
        </div>

        <div className="p-16 text-center bg-black/20 border border-white/5 rounded-2xl">
          <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mx-auto mb-4 border border-white/10">
            <svg className="w-8 h-8 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          </div>
          <h2 className="text-white font-bold text-xl mb-2">No projects configured</h2>
          <p className="text-gray-500">
            Project management is under development. Hackathon registrations will be displayed in the attendees section.
          </p>
        </div>
      </div>
    </AdminLayout>
  );
}
