'use client';

import React, { useState, useEffect } from 'react';
import { useSession, signIn } from 'next-auth/react';
import { trpc } from '@/lib/trpc';
import { useRouter } from 'next/navigation';

// DSGT Query - Premium Login Flow
// Modern, polished, standout UI/UX

export default function LoginPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [showEmailInput, setShowEmailInput] = useState(false);
  const [email, setEmail] = useState('');
  const [emailSending, setEmailSending] = useState(false);
  const [password, setPassword] = useState('');
  const [passwordSending, setPasswordSending] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);

  // Enhanced log system with timestamps
  const [logs, setLogs] = useState<string[]>([
    { text: "Initializing secure terminal...", timestamp: new Date().toISOString() },
    { text: "Connection encrypted ✓", timestamp: new Date().toISOString() },
    { text: "Authentication module: Ready", timestamp: new Date().toISOString() }
  ]);

  const { data: adminStatus } = trpc.admin.isAdmin.useQuery(undefined, { enabled: !!session });
  const { data: memberStatus } = trpc.member.checkStatus.useQuery(undefined, { enabled: !!session });
  const { data: judgeStatus } = trpc.judge.isJudge.useQuery(undefined, { enabled: !!session });

  useEffect(() => {
    setMounted(true);
    // Simulate system initialization with enhanced logs
    const timeouts = [
      setTimeout(() => {
        setLogs(prev => [...prev.slice(-4), {
          text: "> Network: Secure connection established",
          timestamp: new Date().toISOString()
        }]);
      }, 500),
      setTimeout(() => {
        setLogs(prev => [...prev.slice(-4), {
          text: "> Biometric scan: Awaiting user",
          timestamp: new Date().toISOString()
        }]);
      }, 1200),
      setTimeout(() => {
        setLogs(prev => [...prev.slice(-4), {
          text: "> Security protocols: Active",
          timestamp: new Date().toISOString()
        }]);
      }, 1800),
    ];
    return () => timeouts.forEach(clearTimeout);
  }, []);

  useEffect(() => {
    if (adminStatus) {
      const roleLog = adminStatus.isAdmin
        ? { text: `> Admin Portal: ${adminStatus.role?.toUpperCase()} // Access Level 5`, timestamp: new Date().toISOString() }
        : { text: "> Access Level: Standard User", timestamp: new Date().toISOString() };
      setLogs(prev => [...prev.slice(-4), roleLog]);
    }
  }, [adminStatus]);

  useEffect(() => {
    if (memberStatus) {
      const memberLog = memberStatus.isMember
        ? { text: `> Member Portal: ${memberStatus.memberType?.toUpperCase()} // ${memberStatus.daysRemaining} days active`, timestamp: new Date().toISOString() }
        : { text: "> Membership: Not Active", timestamp: new Date().toISOString() };
      setLogs(prev => [...prev.slice(-4), memberLog]);
    }
  }, [memberStatus]);

  useEffect(() => {
    if (judgeStatus?.isJudge) {
      setLogs(prev => [...prev.slice(-4), { text: "> Role Detected: JUDGE // Scoring panel ready", timestamp: new Date().toISOString() }]);
    }
  }, [judgeStatus]);

  useEffect(() => {
    if (status === 'authenticated' && session) {
      setLogs(prev => [...prev.slice(-4), {
        text: "> Authentication successful // Redirecting to secure dashboard...",
        timestamp: new Date().toISOString()
      }]);

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
    setLogs(prev => [...prev.slice(-4), {
      text: `> Sending verification code to ${email}... // Check your inbox`,
      timestamp: new Date().toISOString()
    }]);
    try {
      await signIn('nodemailer', { email, callbackUrl: '/dashboard', redirect: false });
      setLogs(prev => [...prev.slice(-4), { text: "> Verification code sent // Redirecting...", timestamp: new Date().toISOString() }]);
      router.push(`/verify?email=${encodeURIComponent(email)}`);
    } catch (error) {
      setLogs(prev => [...prev.slice(-4), {
        text: `> Error: Failed to send verification code`,
        timestamp: new Date().toISOString()
      }]);
      setEmailSending(false);
    }
  };

  const handlePasswordLogin = async () => {
    if (!password) return;
    setPasswordSending(true);
    setLogs(prev => [...prev.slice(-4), {
      text: "> Authenticating with password // Verifying credentials...",
      timestamp: new Date().toISOString()
    }]);
    try {
      await signIn('credentials', {
        email,
        password,
        callbackUrl: '/dashboard'
      });
      setLogs(prev => [...prev.slice(-4), {
        text: "> Authentication successful // Welcome back!",
        timestamp: new Date().toISOString()
      }]);
      router.push('/dashboard');
    } catch (error) {
      setLogs(prev => [...prev.slice(-4), {
        text: "> Error: Invalid credentials",
        timestamp: new Date().toISOString()
      }]);
      setPasswordSending(false);
    }
  };

  const handleSignIn = () => {
    setLogs(prev => [...prev.slice(-4), { text: "> Initializing OAuth flow...", timestamp: new Date().toISOString() }]);
    signIn('google', { callbackUrl: '/dashboard' });
  };

  if (!mounted) return (
    <div className="relative min-h-screen bg-gradient-to-br from-[#000000] via-[#050505] to-[#0a0a0a] flex items-center justify-center" />
  );

  const isRedirecting = status === 'authenticated';

  return (
    <div className="relative min-h-screen bg-gradient-to-br from-[#000000] via-[#050505] to-[#0a0a0a] text-gray-400 font-sans selection:bg-[#00A8A8]/30 overflow-hidden flex flex-col">
      {/* Animated Background */}
      <div className="absolute inset-0 z-0 overflow-hidden">
        {/* Gradient orbs */}
        <div className="absolute top-0 left-0 w-[800px] h-[800px] bg-[#00A8A8]/5 blur-[200px] rounded-full animate-[float_20s_ease-in-out_infinite]" />
        <div className="absolute bottom-0 right-0 w-[600px] h-[600px] bg-[#6366f1]/5 blur-[180px] rounded-full animate-[float_25s_ease-in-out_infinite_reverse]" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[1000px] h-[1000px] bg-[#00A8A8]/3 blur-[300px] rounded-full opacity-20" />

        {/* Grid pattern */}
        <div className="absolute inset-0 bg-[linear-gradient(rgba(0,255,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(0,255,255,0.03)_1px,transparent_1px)] bg-[size:60px_60px] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_50%,#000_70%,transparent_100%)]" />

        {/* Glowing particles */}
        <div className="absolute inset-0" style={{ backgroundImage: 'radial-gradient(circle at 20% 30%, rgba(0, 168, 168, 0.15) 0px, transparent 60%), radial-gradient(circle at 80% 70%, rgba(99, 102, 241, 0.12) 0px, transparent 50%)' }} />
      </div>

      {/* Main Content */}
      <main className="relative z-10 flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-5xl grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12 items-center">

          {/* Left Panel - Hero Content */}
          <div className="space-y-10 lg:space-y-14 animate-[fadeInUp_0.8s_ease-out_forwards]">
            {/* Status Badge */}
            <div className="flex items-center gap-4 animate-[fadeIn_0.5s_ease-out_0.2s_forwards]">
              <div className="h-1 w-16 bg-gradient-to-r from-[#00A8A8] to-[#006e6e] rounded-full" />
              <div className="flex items-center gap-3">
                <span className="text-sm font-mono text-[#00A8A8]/70 uppercase tracking-[0.3em]">Query Engine</span>
                <span className="text-xs font-mono text-gray-600 uppercase tracking-widest">v.2.1.0</span>
              </div>
            </div>

            {/* Hero Title */}
            <div className="animate-[fadeIn_0.5s_ease-out_0.3s_forwards]">
              <h1 className="text-6xl lg:text-8xl font-black text-white leading-[0.9] tracking-tighter uppercase">
                Query <br />
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#00A8A8] via-[#14b8a6] to-[#0891b2] italic transform -skew-x-6">
                  DSGT.
                </span>
              </h1>
            </div>

            {/* Subtitle */}
            <div className="space-y-5 animate-[fadeIn_0.5s_ease-out_0.4s_forwards]">
              <div className="inline-flex items-center gap-3 px-5 py-2 rounded-full bg-[#00A8A8]/5 border border-[#00A8A8]/20">
                <div className="w-2 h-2 rounded-full bg-[#00A8A8] animate-pulse" />
                <span className="text-xs font-mono text-[#00A8A8]/80 uppercase tracking-widest">
                  Georgia Tech Data Science
                </span>
              </div>
              <p className="text-sm text-gray-400 leading-relaxed max-w-md border-l-2 border-[#00A8A8]/30 pl-5 italic font-medium">
                The collective intelligence of Georgia Tech's largest data science community.
                Authenticate to access your personalized dashboard and join the conversation.
              </p>
            </div>

            {/* Stats Card */}
            <div className="grid grid-cols-3 gap-4 animate-[fadeIn_0.5s_ease-out_0.5s_forwards]">
              <div className="p-4 rounded-xl bg-[#0a0a0a]/60 border border-white/5 hover:border-[#00A8A8]/30 transition-all group">
                <p className="text-xs font-mono text-gray-600 uppercase tracking-wider mb-1">Active Members</p>
                <p className="text-2xl font-bold text-white">2.4k</p>
                <p className="text-[10px] font-mono text-[#00A8A8]/60 uppercase tracking-widest">+15% this month</p>
              </div>
              <div className="p-4 rounded-xl bg-[#0a0a0a]/60 border border-white/5 hover:border-[#00A8A8]/30 transition-all group">
                <p className="text-xs font-mono text-gray-600 uppercase tracking-wider mb-1">Events</p>
                <p className="text-2xl font-bold text-white">128</p>
                <p className="text-[10px] font-mono text-[#00A8A8]/60 uppercase tracking-widest">Ongoing</p>
              </div>
              <div className="p-4 rounded-xl bg-[#0a0a0a]/60 border border-white/5 hover:border-[#00A8A8]/30 transition-all group">
                <p className="text-xs font-mono text-gray-600 uppercase tracking-wider mb-1">Projects</p>
                <p className="text-2xl font-bold text-white">486</p>
                <p className="text-[10px] font-mono text-[#00A8A8]/60 uppercase tracking-widest">Submitted</p>
              </div>
            </div>
          </div>

          {/* Right Panel - Login Form */}
          <div className="space-y-8 animate-[fadeInRight_0.8s_ease-out_forwards]">
            {/* Terminal Window */}
            <div className="relative">
              {/* Window Header */}
              <div className="absolute -top-3 left-4 right-4 flex items-center gap-2">
                <div className="flex gap-2">
                  <div className="w-3 h-3 rounded-full bg-red-500/80 hover:bg-red-500 transition-colors" />
                  <div className="w-3 h-3 rounded-full bg-yellow-500/80 hover:bg-yellow-500 transition-colors" />
                  <div className="w-3 h-3 rounded-full bg-green-500/80 hover:bg-green-500 transition-colors" />
                </div>
                <span className="px-4 py-1.5 rounded-lg bg-[#0a0a0a]/80 border border-white/10 text-[10px] font-mono text-[#00A8A8]/60 uppercase tracking-widest">
                  authentication@terminal
                </span>
              </div>

              {/* Terminal Body */}
              <div className="relative p-6 rounded-2xl bg-[#050505]/80 backdrop-blur-xl border border-white/10 shadow-[0_8px_30px_rgba(0,0,0,0.5)]">
                {/* Decorative Line */}
                <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-[#00A8A8]/30 to-transparent" />

                {/* Logs Output */}
                <div className="space-y-2 font-mono text-[11px] leading-relaxed mb-6">
                  {logs.map((log, i) => (
                    <p key={i} className={`${i === logs.length - 1 ? 'text-[#00A8A8] animate-pulse' : 'text-gray-600'}`}>
                      <span className="text-gray-700">{'>'}</span>{' '}
                      {log.text}
                    </p>
                  ))}
                  {(emailSending || passwordSending || isRedirecting || status === 'loading') && (
                    <p className="text-[#00A8A8] animate-pulse">
                      {'>'} {status === 'loading' ? 'Syncing identity...' : emailSending ? 'Sending verification...' : passwordSending ? 'Authenticating...' : 'Processing request...'}
                    </p>
                  )}
                </div>

                {/* Auth Buttons */}
                <div className="space-y-4">
                  {/* Sign In Button */}
                  <button
                    onClick={handleSignIn}
                    disabled={emailSending || passwordSending || isRedirecting || status === 'loading'}
                    className="w-full py-5 bg-gradient-to-r from-white via-[#00A8A8] to-[#009E9E] text-black font-black text-[11px] uppercase tracking-[0.2em] rounded-lg hover:from-[#00A8A8] hover:via-[#14b8a6] hover:to-[#0891b2] transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_4px_20px_rgba(0,168,168,0.15)] hover:shadow-[0_4px_30px_rgba(0,168,168,0.25)]"
                  >
                    {isRedirecting ? 'Authenticated' : 'Sign In with Google'}
                  </button>

                  {/* Email Login */}
                  {!showEmailInput ? (
                    <button
                      onClick={() => {
                        setShowEmailInput(true);
                        setLogs(prev => [...prev.slice(-4), {
                          text: '> Email authentication mode activated',
                          timestamp: new Date().toISOString()
                        }]);
                      }}
                      disabled={emailSending || passwordSending || isRedirecting || status === 'loading'}
                      className="w-full py-5 border border-white/10 text-white font-black text-[11px] uppercase tracking-[0.2em] rounded-lg hover:bg-white/5 hover:border-white/20 transition-all active:scale-[0.98] disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      Send Verification Code
                    </button>
                  ) : (
                    <div className="space-y-4">
                      {/* Email Input */}
                      <div className="space-y-2">
                        <label className="block text-[10px] font-mono text-[#00A8A8]/70 uppercase tracking-widest">
                          Email Address
                        </label>
                        <input
                          type="email"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && handleEmailLogin()}
                          placeholder="your@email.com"
                          disabled={emailSending || emailSent}
                          className="w-full px-4 py-4 bg-[#0a0a0a]/60 border border-white/10 text-white font-mono text-[11px] rounded-lg focus:border-[#00A8A8]/50 focus:outline-none focus:ring-1 focus:ring-[#00A8A8]/30 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                        />
                      </div>

                      {/* Remember Me & Send */}
                      <div className="flex items-center justify-between gap-4">
                        <label className="flex items-center gap-2 cursor-pointer group">
                          <input
                            type="checkbox"
                            checked={rememberMe}
                            onChange={(e) => setRememberMe(e.target.checked)}
                            disabled={emailSending || emailSent}
                            className="w-4 h-4 rounded border border-white/20 bg-[#0a0a0a] text-[#00A8A8] focus:outline-none focus:ring-2 focus:ring-[#00A8A8]/30 disabled:opacity-30"
                          />
                          <span className="text-[10px] font-mono text-gray-500 uppercase tracking-wider group-hover:text-gray-400 transition-colors">
                            Remember device
                          </span>
                        </label>

                        <button
                          onClick={handleEmailLogin}
                          disabled={emailSending || emailSent || !email}
                          className="px-6 py-4 border border-white/10 text-white font-black text-[11px] uppercase tracking-[0.2em] rounded-lg hover:bg-[#00A8A8]/20 hover:border-[#00A8A8]/40 transition-all active:scale-[0.98] disabled:opacity-30 disabled:cursor-not-allowed"
                        >
                          {emailSent ? '✓ Sent' : emailSending ? 'Sending...' : 'Send Code'}
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Password Login */}
                  <div className="pt-4 border-t border-white/5 space-y-4">
                    <div className="flex items-center justify-center gap-2">
                      <span className="text-[10px] font-mono text-gray-600 uppercase tracking-widest">or</span>
                    </div>

                    <div className="space-y-2">
                      <div className="space-y-2">
                        <label className="block text-[10px] font-mono text-[#00A8A8]/70 uppercase tracking-widest">
                          Email Address
                        </label>
                        <input
                          type="email"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          placeholder="your@email.com"
                          disabled={passwordSending}
                          className="w-full px-4 py-4 bg-[#0a0a0a]/60 border border-white/10 text-white font-mono text-[11px] rounded-lg focus:border-[#00A8A8]/50 focus:outline-none focus:ring-1 focus:ring-[#00A8A8]/30 disabled:opacity-30 transition-all"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="block text-[10px] font-mono text-[#00A8A8]/70 uppercase tracking-widest">
                          Password
                        </label>
                        <input
                          type="password"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && handlePasswordLogin()}
                          placeholder="••••••••"
                          disabled={passwordSending}
                          className="w-full px-4 py-4 bg-[#0a0a0a]/60 border border-white/10 text-white font-mono text-[11px] rounded-lg focus:border-[#00A8A8]/50 focus:outline-none focus:ring-1 focus:ring-[#00A8A8]/30 disabled:opacity-30 transition-all"
                        />
                      </div>

                      <button
                        onClick={handlePasswordLogin}
                        disabled={passwordSending || !email || !password}
                        className="w-full py-5 bg-gradient-to-r from-[#00A8A8]/10 to-transparent border border-[#00A8A8]/20 text-white font-black text-[11px] uppercase tracking-[0.2em] rounded-lg hover:border-[#00A8A8]/40 hover:bg-[#00A8A8]/20 transition-all active:scale-[0.98] disabled:opacity-30 disabled:cursor-not-allowed"
                      >
                        {passwordSending ? 'Authenticating...' : 'Sign In'}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Footer Links */}
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 text-[10px] font-mono text-gray-600 uppercase tracking-widest animate-[fadeIn_0.5s_ease-out_0.8s_forwards]">
              <a href="/forgot-password" className="hover:text-[#00A8A8] hover:underline transition-colors">
                Forgot password?
              </a>
              <span className="hidden sm:inline">•</span>
              <span className="hover:text-[#00A8A8] hover:underline transition-colors cursor-pointer">Need help?</span>
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
            <span>STATUS: {status.toUpperCase()}</span>
          </div>
        </div>
      </footer>
    </div>
  );
}