'use client';

import React, { useState, useEffect } from 'react';
import { useSession, signIn } from 'next-auth/react';
import { trpc } from '@/lib/trpc';
import { useRouter } from 'next/navigation';

export default function Home() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [mounted, setMounted] = useState(false);

  const { data: adminStatus } = trpc.admin.isAdmin.useQuery(undefined, {
    enabled: !!session,
  });

  const { data: judgeStatus } = trpc.judge.isJudge.useQuery(undefined, {
    enabled: !!session,
  });

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (status === 'authenticated' && session) {
      const redirectTimeout = setTimeout(() => {
        if (judgeStatus?.isJudge && !adminStatus?.isAdmin) {
          router.push('/judge');
        } else {
          router.push('/dashboard');
        }
      }, 800);
      return () => clearTimeout(redirectTimeout);
    }
  }, [status, session, router, judgeStatus, adminStatus]);

  const handleSignIn = () => {
    signIn('google', { callbackUrl: '/dashboard' });
  };

  if (!mounted) return <div className="min-h-screen bg-black" />;

  const isRedirecting = status === 'authenticated';
  const isLoading = status === 'loading';

  return (
    <div className="relative min-h-screen min-h-[100dvh] bg-black text-gray-400 font-sans overflow-hidden flex items-center justify-center">
      {/* Background */}
      <div className="absolute inset-0 z-0">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-teal-500/10 rounded-full blur-[200px]" />
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff03_1px,transparent_1px),linear-gradient(to_bottom,#ffffff03_1px,transparent_1px)] bg-[size:60px_60px]" />
      </div>

      <main className="relative z-10 w-full max-w-md mx-auto px-6 text-center">
        {/* Logo */}
        <div className="mb-10">
          <div className="relative inline-block">
            <div className="absolute inset-0 bg-gradient-to-b from-teal-500/30 to-transparent blur-[60px] scale-150" />
            <img
              src="/images/dsgt/apple-touch-icon.png"
              alt="DSGT Logo"
              className="relative w-24 h-24 mx-auto drop-shadow-[0_0_30px_rgba(0,168,168,0.4)]"
            />
          </div>
        </div>

        {/* Title */}
        <h1 className="text-5xl font-black text-white leading-tight tracking-tight mb-3">
          Query <span className="bg-gradient-to-r from-teal-400 to-emerald-400 bg-clip-text text-transparent">DSGT</span>
        </h1>
        <p className="text-gray-500 text-sm mb-10 max-w-xs mx-auto">
          Georgia Tech's largest data science community. Sign in to access your dashboard.
        </p>

        {/* Sign In Button */}
        <button
          onClick={handleSignIn}
          disabled={isLoading || isRedirecting}
          className="w-full px-8 py-5 bg-gradient-to-r from-teal-500 to-emerald-500 text-white font-bold text-base rounded-2xl active:scale-[0.98] transition-transform shadow-xl shadow-teal-500/30 disabled:opacity-50 mb-4"
        >
          {isRedirecting ? (
            <span className="flex items-center justify-center gap-2">
              <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              Redirecting...
            </span>
          ) : isLoading ? (
            <span className="flex items-center justify-center gap-2">
              <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              Loading...
            </span>
          ) : (
            <span className="flex items-center justify-center gap-3">
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
              </svg>
              Sign in with Google
            </span>
          )}
        </button>

        {/* Status indicator */}
        <div className="flex items-center justify-center gap-2 text-xs text-gray-600">
          <div className={`w-1.5 h-1.5 rounded-full ${isRedirecting ? 'bg-emerald-500' : isLoading ? 'bg-yellow-500 animate-pulse' : 'bg-teal-500'}`} />
          <span className="uppercase tracking-widest font-mono">
            {isRedirecting ? 'Authenticated' : isLoading ? 'Syncing...' : 'Ready'}
          </span>
        </div>
      </main>

      {/* Footer */}
      <footer className="absolute bottom-8 left-0 right-0 text-center">
        <p className="text-[10px] text-gray-700 uppercase tracking-[0.3em] font-mono">
          Data Science @ Georgia Tech
        </p>
      </footer>
    </div>
  );
}