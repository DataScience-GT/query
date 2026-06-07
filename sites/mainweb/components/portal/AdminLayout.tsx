'use client';

import { useSession } from 'next-auth/react';
import AdminSidebar from './AdminSidebar';
import { useEffect, useState } from 'react';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { status } = useSession();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (status === 'unauthenticated') {
      window.location.href = '/login';
    } else if (status === 'authenticated') {
      setLoading(false);
    }
  }, [status]);

  if (loading) {
    return (
      <div className="relative min-h-screen bg-[#050505]">
        <div className="flex items-center justify-center h-screen">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#00A8A8] border-t-transparent" />
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen bg-[#0a0c10] dark:bg-darkBlue/80 text-gray-400 font-sans selection:bg-[#00A8A8]/30 overflow-x-hidden flex flex-col md:flex-row">
      <AdminSidebar />
      <div className="flex-1 transition-all duration-300 md:ml-20 lg:ml-64 w-full mt-16 md:mt-0">
        <div className="p-4 md:p-6">
          {children}
        </div>
      </div>
    </div>
  );
}
