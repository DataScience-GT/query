'use client';

import React, { useState, useEffect } from 'react';
import { useSession, signIn } from 'next-auth/react';
import { trpc } from '@/lib/trpc';
import { useRouter } from 'next/navigation';

// DSGT Query - Premium Landing Page
// Ultra-modern, standout UI/UX

export default function Home() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [showEmailInput, setShowEmailInput] = useState(false);
  const [email, setEmail] = useState('');
  const [emailSending, setEmailSending] = useState(false);
  const [emailSent, setEmailSent] = useState(false);

  // Enhanced log system
  const [logs, setLogs] = useState<string[]>([
    "Initializing terminal...",
    "System check: OK",
    "Loading background modules..."
  ]);

  const { data: adminStatus } = trpc.admin.isAdmin.useQuery(undefined, { enabled: !!session });
  const { data: memberStatus } = trpc.member.checkStatus.useQuery(undefined, { enabled: !!session });
  const { data: judgeStatus } = trpc.judge.isJudge.useQuery(undefined, { enabled: !!session });

  useEffect(() => {
    setMounted(true);

    // Enhanced initialization sequence
    const timeouts = [
      setTimeout(() => {
        setLogs(prev => [...prev.slice(-4), "> Network: Secure connection established ✓"]);
      }, 600),
      setTimeout(() => {
        setLogs(prev => [...prev.slice(-4), "> Authentication module: Ready">
        setLogs(prev => [...prev.slice(-4), "> Security protocols: Active ✓"];
      }, 1200),
      setTimeout(() => {
        setLogs(prev => [...prev.slice(-4), "> Session: Awaiting user..."]);
      }, 1600),
    ];
    return () => timeouts.forEach(clearTimeout);
  }, []);

  useEffect(() => {
    if (adminStatus) {
      const roleLog = adminStatus.isAdmin
        ? `> Admin Access Granted // Level ${adminStatus.role?.toUpperCase()}`
        : "> Access Level: Standard User";
      setLogs(prev => [...prev.slice(-4), roleLog]);
    }
  }, [adminStatus]);

  useEffect(() => {
    if (memberStatus) {
      const memberLog = memberStatus.isMember
        ? `> Member Status: ${memberStatus.memberType?.toUpperCase()} // ${memberStatus.daysRemaining} days active`
        : "> Membership: Not Active";
      setLogs(prev => [...prev.slice(-4), memberLog]);
    }
  }, [memberStatus]);

  useEffect(() => {
    if (judgeStatus?.isJudge) {
      setLogs(prev => [...prev.slice(-4), "> Role Detected: JUDGE // Scoring panel ready"]);
    }
  }, [judgeStatus]);

  useEffect(() => {
    if (status === 'authenticated' && session) {
      setLogs(prev => [...prev.slice(-4), "> Auth success // Redirecting to dashboard..."]);

      const redirectTimeout = setTimeout(() => {
        if (judgeStatus?.isJudge && !adminStatus?.isAdmin) {
          router.push('/judge');
        } else {
          router.push('/dashboard');
        }
      }, 1500);

      return () => clearTimeout(redirectTimeout);
    }
  }, [status, session, router, judgeStatus, adminStatus]);

  const handleEmailLogin = async () => {
    if (!email) return;
    setEmailSending(true);
    setLogs(prev => [...prev.slice(-4), `> Sending verification code to ${email}... // Check your inbox`]);
    try {
      await signIn('nodemailer', { email, callbackUrl: '/dashboard', redirect: false });
      setLogs(prev => [...prev.slice(-4), "> Code sent! Redirecting..."]);
      router.push(`/verify?email=${encodeURIComponent(email)}`);
    } catch {
      setLogs(prev => [...prev.slice(-4), "> Error: Failed to send code."]);
      setEmailSending(false);
    }
  };

  const handleSignIn = () => {
    setLogs(prev => [...prev.slice(-4), "> Initializing OAuth..."]);
    signIn('google', { callbackUrl: '/dashboard' });
  };

  if (!mounted) return <div className="min-h-screen bg-gradient-to-br from-[#000000] via-[#050505] to-[#0a0a0a]" />;

  const isRedirecting = status === 'authenticated';

  return (
    <div className="relative min-h-screen bg-gradient-to-br from-[#000000] via-[#050505] to-[#0a0a0a] text-gray-400 font-sans selection:bg-[#00A8A8]/30 overflow-hidden flex flex-col">

      {/* Animated Background */}
      <div className="absolute inset-0 z-0 overflow-hidden">
        {/* Gradient orbs */}
        <div className="absolute top-[-10%] left-[-10%] w-[800px] h-[800px] bg-[#00A8A8]/5 blur-[250px] rounded-full animate-[float_20s_ease-in-out_infinite]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[600px] h-[600px] bg-[#6366f1]/5 blur-[200px] rounded-full animate-[float_25s_ease-in-out_infinite_reverse]" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[1000px] h-[1000px] bg-[radial-gradient(circle_at_center,rgba(0,168,168,0.08)_0%,transparent_70%)]" />

        {/* Grid pattern */}
        <div className="absolute inset-0 bg-[linear-gradient(rgba(0,255,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(0,255,255,0.03)_1px,transparent_1px)] bg-[size:80px_80px] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_50%,#000_70%,transparent_100%)]" />

        {/* Floating particles */}
        <div className="absolute inset-0" style={{
          backgroundImage: `
            radial-gradient(circle at 15% 30%, rgba(0, 168, 168, 0.08) 0%, transparent 50%),
            radial-gradient(circle at 85% 70%, rgba(99, 102, 241, 0.06) 0%, transparent 50%),
            radial-gradient(circle at 50% 80%, rgba(59, 130, 246, 0.04) 0%, transparent 40%)
          `
        }} />

        {/* Animated scanline */}
        <div className="absolute inset-0 bg-[linear-gradient(0deg,transparent_0%,rgba(0,168,168,0.03)_50%,transparent_100%)] animate-[scanline_8s_linear_infinite] pointer-events-none" />
      </div>

      {/* Main Content */}
      <main className="relative z-10 flex-1 flex items-center justify-center px-6 lg:px-12 w-full">
        <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-16 lg:gap-20 items-center w-full">

          {/* Left Panel - Hero */}
          <div className="space-y-12 lg:space-y-16 animate-[fadeInUp_1s_ease-out_forwards]">
            {/* Status Badge */}
            <div className="flex items-center gap-4 animate-[fadeIn_0.5s_ease-out_0.2s_forwards]">
              <div className="h-1 w-16 bg-gradient-to-r from-[#00A8A8] via-[#14b8a6] to-[#00A8A8] rounded-full" />
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono text-[#00A8A8]/70 uppercase tracking-[0.3em]">Query Engine</span>
                <span className="w-1 h-1 rounded-full bg-[#00A8A8]" />
                <span className="text-xs font-mono text-gray-600 uppercase tracking-widest">v.2.1.0</span>
              </div>
            </div>

            {/* Hero Title */}
            <div className="animate-[fadeIn_0.5s_ease-out_0.3s_forwards]">
              <h1 className="text-7xl lg:text-9xl font-black text-white leading-[0.85] tracking-tighter uppercase">
                Query <br />
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#00A8A8] via-[#14b8a6] to-[#0891b2] italic transform -skew-x-6">
                  DSGT.
                </span>
              </h1>
            </div>

            {/* Subtitle */}
            <div className="space-y-6 animate-[fadeIn_0.5s_ease-out_0.4s_forwards]">
              <div className="inline-flex items-center gap-3 px-6 py-3 rounded-full bg-[#00A8A8]/5 border border-[#00A8A8]/20 backdrop-blur-sm">
                <div className="w-2 h-2 rounded-full bg-[#00A8A8] animate-pulse" />
                <span className="text-sm font-mono text-[#00A8A8]/80 uppercase tracking-widest">
                  Georgia Tech Data Science Community
                </span>
              </div>
              <p className="text-base text-gray-400 leading-relaxed max-w-md border-l-2 border-[#00A8A8]/30 pl-5 italic font-medium">
                The collective intelligence of Georgia Tech's largest data science community.
                Connect with peers, discover events, and contribute to groundbreaking research.
              </p>
            </div>

            {/* CTA Buttons */}
            <div className="flex flex-col sm:flex-row items-center gap-5 animate-[fadeIn_0.5s_ease-out_0.5s_forwards]">
              <button
                onClick={handleSignIn}
                disabled={emailSending || isRedirecting || status === 'loading'}
                className="group w-full sm:w-auto px-14 py-6 bg-white text-black font-black text-[11px] uppercase tracking-[0.2em] rounded-sm hover:bg-gradient-to-r hover:from-[#00A8A8] hover:via-[#14b8a6] hover:to-[#00A8A8] hover:text-white transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed shadow-[0_0_40px_rgba(0,168,168,0.15)] hover:shadow-[0_0_60px_rgba(0,168,168,0.3)]"
              >
                <span className="group-hover:underline decoration-2 underline-offset-4">
                  {isRedirecting ? 'Authenticated' : 'Sign In'}
                </span>
              </button>

              {!showEmailInput ? (
                <button
                  onClick={() => {
                    setShowEmailInput(true);
                    setLogs(prev => [...prev.slice(-4), "> Email auth mode activated."]);
                  }}
                  disabled={emailSending || isRedirecting || status === 'loading'}
                  className="w-full sm:w-auto px-8 py-6 border border-white/10 text-white font-black text-[11px] uppercase tracking-[0.2em] rounded-sm hover:bg-white/5 hover:border-white/20 transition-all active:scale-95 disabled:opacity-30"
                >
                  Email Login
                </button>
              ) : (
                <div className="flex w-full sm:w-auto gap-3">
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleEmailLogin()}
                    placeholder="your@email.com"
                    disabled={emailSending || emailSent}
                    className="flex-1 sm:w-56 px-5 py-6 bg-black/60 border border-white/10 text-white font-mono text-[11px] rounded-sm focus:border-[#00A8A8]/50 focus:outline-none focus:ring-2 focus:ring-[#00A8A8]/20 placeholder:text-gray-600 disabled:opacity-30 transition-all"
                  />
                  <button
                    onClick={handleEmailLogin}
                    disabled={emailSending || emailSent || !email}
                    className="px-6 py-6 border border-white/10 text-white font-black text-[11px] uppercase tracking-[0.2em] rounded-sm hover:bg-[#00A8A8]/20 hover:border-[#00A8A8]/40 transition-all active:scale-95 disabled:opacity-30"
                  >
                    {emailSent ? '✓ Sent' : emailSending ? '.·.' : 'Send'}
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Right Panel - Visual */}
          <div className="hidden lg:flex flex-col items-center justify-center relative animate-[fadeIn_0.6s_ease-out_forwards]">
            {/* Background glow */}
            <div className="absolute w-[500px] h-[500px] bg-gradient-to-br from-[#00A8A8]/10 via-[#6366f1]/5 to-transparent blur-[150px] rounded-full animate-[pulse_8s_ease-in-out_infinite]" />

            {/* Central visual */}
            <div className="relative group animate-[float_6s_ease-in-out_infinite]">
              {/* Rotating rings */}
              <div className="absolute -inset-8 border border-white/5 rounded-full animate-[spin_25s_linear_infinite]" />
              <div className="absolute -inset-12 border border-white/5 rounded-full animate-[spin_40s_linear_infinite_reverse] opacity-40" />
              <div className="absolute -inset-16 border border-white/5 rounded-full animate-[spin_55s_linear_infinite]" opacity-20 />

              {/* Central content */}
              <div className="relative z-10 p-12">
                <img
                  src="/images/dsgt/apple-touch-icon.png"
                  alt="DSGT Logo"
                  className="w-80 h-80 object-contain drop-shadow-[0_0_80px_rgba(0,168,168,0.3)] transition-all duration-700 group-hover:scale-110 group-hover:rotate-3"
                />
              </div>

              {/* Status indicator */}
              <div className="absolute -bottom-20 left-1/2 -translate-x-1/2 w-full text-center space-y-3">
                <p className="text-[10px] font-mono text-[#00A8A8]/60 uppercase tracking-[0.5em] animate-pulse">
                  {isRedirecting ? "✓ Handshake Verified" : status === 'loading' ? "• Synchronizing..." : "● Core Operational"}
                </p>
                <div className="flex justify-center gap-4 text-[9px] font-mono text-gray-700">
                  <span className="flex items-center gap-1">
                    <div className={`w-1.5 h-1.5 rounded-full ${isRedirecting ? 'bg-green-500' : status === 'authenticated' ? 'bg-green-500 animate-pulse' : 'bg-[#00A8A8]'}`} />
                    <span className={isRedirecting ? 'text-green-500/80' : ''}>{status.toUpperCase()}</span>
                  </span>
                  <span className="flex items-center gap-1">
                    <div className="w-1.5 h-1.5 bg-[#00A8A8] rounded-full" />
                    REGION: ATL-08
                  </span>
                  <span className="flex items-center gap-1">
                    <div className="w-1.5 h-1.5 bg-purple-500 rounded-full animate-pulse" />
                    JUDGE: {judgeStatus?.isJudge ? 'ACTIVE' : 'OPEN'}
                  </span>
                </div>
              </div>

              {/* Decorative element */}
              <div className="absolute -top-4 -right-4 w-24 h-24 border border-[#00A8A8]/20 rounded-full animate-[spin_10s_linear_infinite]" />
              <div className="absolute -bottom-4 -left-4 w-32 h-32 border border-white/5 rounded-full animate-[spin_15s_linear_infinite_reverse]" />
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="relative z-10 px-6 py-4">
        <div className="flex justify-between items-center text-[9px] font-mono text-gray-700 uppercase tracking-[0.4em]">
          <div>Internal Terminal // Auth Gateway v2.1</div>
          <div className="flex items-center gap-2">
            <span className={`w-1.5 h-1.5 rounded-full ${isRedirecting ? 'bg-green-500' : 'bg-[#00A8A8]'}`} />
            <span>ACCESS NODE: 0812-ATL</span>
          </div>
        </div>
      </footer>

      {/* Global styles for custom animations */}
      <style jsx global>{`
        @keyframes float {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-20px); }
        }
        @keyframes scanline {
          0% { transform: translateY(-100%); }
          100% { transform: translateY(100%); }
        }
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes fadeInUp {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        @keyframes fadeInRight {
          from {
            opacity: 0;
            transform: translateX(20px);
          }
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }
      `}</style>
    </div>
  );
}