'use client';

import { useEffect, useState } from 'react';
import { useSession, signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const { status } = useSession();
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [logs, setLogs] = useState<string[]>([
    "Initializing judging terminal...",
    "System check: OK",
    "Loading authentication modules..."
  ]);

  useEffect(() => {
    setMounted(true);
    const timeout = setTimeout(() => {
      setLogs(prev => [...prev.slice(-4), "> Network: Established", "> Session: Awaiting judge..."]);
    }, 800);
    return () => clearTimeout(timeout);
  }, []);

  useEffect(() => {
    if (status === 'authenticated') {
      setLogs(prev => [...prev.slice(-4), "> Auth success. Verifying credentials...", "> Redirecting to judging interface..."]);
      const timeout = setTimeout(() => router.push('/judge'), 1000);
      return () => clearTimeout(timeout);
    }
  }, [status, router]);

  const handleSignIn = () => {
    setLogs(prev => [...prev.slice(-4), "> Initializing OAuth..."]);
    signIn('google', { callbackUrl: '/judge' });
  };

  if (!mounted) return <div className="min-h-screen bg-[#050505]" />;

  const isRedirecting = status === 'authenticated';

  return (
    <div className="relative min-h-screen bg-[#050505] text-gray-400 font-sans selection:bg-[#00A8A8]/30 overflow-hidden flex items-center justify-center">
      {/* Background effects */}
      <div className="absolute inset-0 z-0">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(0,168,168,0.05)_0%,transparent_70%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:40px_40px] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)]" />
      </div>

      <main className="relative z-10 w-full max-w-md mx-auto px-6">
        <div className="space-y-8">
          {/* Header */}
          <div className="text-center space-y-4">
            <div className="flex items-center justify-center gap-4 mb-6">
              <div className="h-px w-12 bg-[#00A8A8]/30" />
              <span className="text-xs font-mono text-gray-500 uppercase tracking-[0.3em]">DSGT // Judging</span>
              <div className="h-px w-12 bg-[#00A8A8]/30" />
            </div>

            <h1 className="text-5xl font-black text-white leading-tight tracking-tighter uppercase">
              Hackathon<br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#00A8A8] to-[#005a5a] italic">
                Judging
              </span>
            </h1>

            <p className="text-sm text-gray-500 font-mono">
              Project Evaluation Terminal
            </p>
          </div>

          {/* Terminal box */}
          <div className="bg-black/60 backdrop-blur-md border border-white/5 p-5 rounded-lg font-mono text-[11px] leading-relaxed shadow-2xl relative overflow-hidden group">
            <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-[#00A8A8]/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
            {logs.map((log, i) => (
              <p key={i} className={i === logs.length - 1 ? "text-[#00A8A8]" : "text-gray-600"}>
                {log}
              </p>
            ))}
            {(isRedirecting || status === 'loading') && (
              <p className="text-[#00A8A8] animate-pulse">
                {'>'} {status === 'loading' ? 'Syncing_Identity...' : 'Processing request...'}
              </p>
            )}
          </div>

          {/* Sign in button */}
          {status === 'loading' ? (
            <div className="text-center text-gray-500 font-mono text-xs animate-pulse uppercase tracking-widest">
              Initializing...
            </div>
          ) : (
            <button
              onClick={handleSignIn}
              disabled={isRedirecting}
              className="w-full flex items-center justify-center gap-3 px-8 py-5 bg-white text-black font-black text-[11px] uppercase tracking-[0.2em] rounded-sm hover:bg-[#00A8A8] hover:text-white transition-all active:scale-95 disabled:opacity-30 shadow-[0_0_30px_rgba(0,168,168,0.1)]"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              {isRedirecting ? 'Verified' : 'Sign In with Google'}
            </button>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="absolute bottom-8 left-0 right-0 text-center">
        <p className="text-[9px] font-mono text-gray-700 uppercase tracking-[0.4em]">
          Data Science @ Georgia Tech
        </p>
      </footer>
    </div>
  );
}
