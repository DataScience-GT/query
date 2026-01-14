'use client';

import React, { useState, useEffect } from 'react';
import { useSession, signIn } from 'next-auth/react';
import { trpc } from '@/lib/trpc';
import { useRouter } from 'next/navigation';

export default function Home() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [mounted, setMounted] = useState(false);

  // Terminal logs initialized with system startup messages
  const [logs, setLogs] = useState<string[]>([
    "Initializing terminal...",
    "System check: OK",
    "Loading background modules..."
  ]);

  // Check admin status
  const { data: adminStatus } = trpc.admin.isAdmin.useQuery(undefined, {
    enabled: !!session,
  });

  // Check member status
  const { data: memberStatus } = trpc.member.checkStatus.useQuery(undefined, {
    enabled: !!session,
  });

  // tRPC Mutation
  const { mutate: sayHello, isPending: helloLoading } =
    trpc.hello.sayHello.useMutation({
      onSuccess: (res) => {
        setLogs(prev => [...prev.slice(-4), `> Response: ${res.message}`]);
      },
      onError: () => {
        setLogs(prev => [...prev.slice(-4), "> Error: Connection failed"]);
      }
    });

  // Handle mounting and initial silent background status check
  useEffect(() => {
    setMounted(true);

    // Simulating background system discovery
    const timeout = setTimeout(() => {
        setLogs(prev => [...prev.slice(-4), "> Network: Established", "> Session: Awaiting user..."]);
    }, 800);

    return () => clearTimeout(timeout);
  }, []);

  // Add logs when admin/member status is checked
  useEffect(() => {
    if (adminStatus) {
      const roleLog = adminStatus.isAdmin
        ? `> Admin Access: ${adminStatus.role?.toUpperCase()}`
        : "> Access Level: Standard User";
      setLogs(prev => [...prev.slice(-4), roleLog]);
    }
  }, [adminStatus]);

  useEffect(() => {
    if (memberStatus) {
      const memberLog = memberStatus.isMember
        ? `> Membership: ${memberStatus.memberType?.toUpperCase()} (${memberStatus.daysRemaining} days remaining)`
        : "> Membership: Not Active";
      setLogs(prev => [...prev.slice(-4), memberLog]);
    }
  }, [memberStatus]);

  // SILENT BACKGROUND REDIRECT
  useEffect(() => {
    if (status === 'authenticated' && session) {
      setLogs(prev => [...prev.slice(-4), "> Auth success. Handshaking...", "> Redirecting to secure node..."]);
      const redirectTimeout = setTimeout(() => router.push('/dashboard'), 1200);
      return () => clearTimeout(redirectTimeout);
    }
  }, [status, session, router]);

  const handleTestEndpoint = () => {
    setLogs(prev => [...prev.slice(-4), "> Executing: public.sayHello()"]);
    sayHello();
  };

  const handleSignIn = () => {
    setLogs(prev => [...prev.slice(-4), "> Initializing OAuth Handshake..."]);
    signIn('google', { callbackUrl: '/dashboard' });
  };

  if (!mounted) return <div className="min-h-screen bg-[#050505]" />;

  const isRedirecting = status === 'authenticated';

  return (
    <div className="relative min-h-screen bg-[#050505] text-gray-400 font-sans selection:bg-[#00A8A8]/30 overflow-hidden flex items-center justify-center">

      {/* BACKGROUND EFFECTS */}
      <div className="absolute inset-0 z-0">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(0,168,168,0.05)_0%,transparent_70%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:40px_40px] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)]" />
      </div>

      <main className="relative z-10 max-w-7xl mx-auto px-6 lg:px-12 w-full grid grid-cols-1 lg:grid-cols-2 gap-20 items-center">

        {/* LEFT SIDE: COMMAND & CONTROL */}
        <div className="space-y-12">
          <div className="space-y-6">
            <div className="flex items-center gap-4">
               <div className="h-px w-12 bg-[#00A8A8]/30" />
               <span className="text-xs font-mono text-gray-500 uppercase tracking-[0.4em]">Query Engine // V.1</span>
            </div>

            <h1 className="text-7xl lg:text-9xl font-black text-white leading-[0.8] tracking-tighter uppercase">
              Query <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#00A8A8] to-[#005a5a] italic">
                DSGT.
              </span>
            </h1>

            <div className="max-w-md space-y-4">
               <p className="text-sm text-gray-500 leading-relaxed border-l-2 border-[#00A8A8]/20 pl-4 italic font-medium">
                The collective intelligence of Georgia Tech's largest data science community. Authenticate to access your dashboard.
               </p>

               {/* TERMINAL OUTPUT BOX */}
               <div className="bg-black/60 backdrop-blur-md border border-white/5 p-5 rounded-lg font-mono text-[11px] leading-relaxed shadow-2xl relative overflow-hidden group">
                  <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-[#00A8A8]/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                  {logs.map((log, i) => (
                    <p key={i} className={i === logs.length - 1 ? "text-[#00A8A8]" : "text-gray-600"}>
                      {log}
                    </p>
                  ))}
                  {(helloLoading || isRedirecting || status === 'loading') && (
                    <p className="text-[#00A8A8] animate-pulse">
                        {'>'} {status === 'loading' ? 'Syncing_Identity...' : 'Processing request...'}
                    </p>
                  )}
               </div>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-center gap-6">
            <button
              onClick={handleSignIn}
              disabled={helloLoading || isRedirecting || status === 'loading'}
              className="w-full sm:w-auto px-12 py-5 bg-white text-black font-black text-[11px] uppercase tracking-[0.2em] rounded-sm hover:bg-[#00A8A8] hover:text-white transition-all active:scale-95 disabled:opacity-30 shadow-[0_0_30px_rgba(0,168,168,0.1)]"
            >
              {isRedirecting ? 'Verified' : 'Sign In With Google'}
            </button>

            <button
              onClick={handleTestEndpoint}
              disabled={helloLoading || isRedirecting || status === 'loading'}
              className="w-full sm:w-auto px-8 py-5 border border-white/10 text-white font-black text-[11px] uppercase tracking-[0.2em] rounded-sm hover:bg-white/5 transition-all active:scale-95 disabled:opacity-30"
            >
              Test Endpoint
            </button>
          </div>
        </div>

        {/* RIGHT SIDE: THE CORE */}
        <div className="hidden lg:flex flex-col items-center justify-center relative">
          {/* Pulsing Core Glow */}
          <div className="absolute w-[500px] h-[500px] bg-[#00A8A8]/10 blur-[120px] rounded-full animate-pulse" />

          <div className="relative group">
            {/* Rotating Rings */}
            <div className="absolute -inset-4 border border-white/5 rounded-full animate-[spin_20s_linear_infinite]" />
            <div className="absolute -inset-8 border border-white/5 rounded-full animate-[spin_35s_linear_infinite_reverse] opacity-50" />

            <div className="relative z-10 p-8">
              <img
                src="/images/dsgt/apple-touch-icon.png"
                alt="DSGT Logo"
                /* REMOVED grayscale AND group-hover:grayscale-0 */
                className="w-72 h-72 object-contain drop-shadow-[0_0_50px_rgba(0,168,168,0.3)] transition-all duration-700 group-hover:scale-105"
              />
            </div>

            <div className="absolute -bottom-16 left-1/2 -translate-x-1/2 w-full text-center space-y-3">
               <p className="text-[10px] font-mono text-[#00A8A8]/50 uppercase tracking-[0.5em] animate-pulse">
                {isRedirecting ? "Handshake Verified" : status === 'loading' ? "Synchronizing..." : "Core Operational"}
               </p>
               <div className="flex justify-center gap-6 text-[8px] font-mono text-gray-700">
                  <span className="flex items-center gap-1">
                    <div className={`w-1 h-1 rounded-full ${isRedirecting ? 'bg-green-500' : 'bg-[#00A8A8]'}`} />
                    STATUS: {status.toUpperCase()}
                  </span>
                  <span className="flex items-center gap-1">
                    <div className="w-1 h-1 bg-[#00A8A8] rounded-full" />
                    REGION: ATL-08
                  </span>
               </div>
            </div>
          </div>
        </div>
      </main>

      <footer className="absolute bottom-8 left-12 right-12 flex justify-between items-center opacity-20 pointer-events-none">
        <div className="text-[9px] font-mono uppercase tracking-[0.4em]">Internal Terminal // Auth Gateway</div>
        <div className="text-[9px] font-mono uppercase tracking-[0.4em]">Access Node: 0812-ATL</div>
      </footer>
    </div>
  );
}