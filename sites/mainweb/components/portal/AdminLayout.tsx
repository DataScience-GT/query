'use client';

import { useSession } from 'next-auth/react';
import { useEffect, useState } from 'react';
import Background from './Background';
import { Spinner } from './Spinner';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession();
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
          <Spinner className="w-8 h-8 text-[#00A8A8]" />
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen bg-[#050505] text-gray-400 font-sans selection:bg-[#00A8A8]/30 overflow-x-hidden">
      <Background className="fixed inset-0 z-0 opacity-[0.03]" />
      <div className="relative z-10 flex flex-col min-h-screen">
        {children}
      </div>
    </div>
  );
}