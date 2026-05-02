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

  if (!mounted) return <div className="min-h-screen bg-[var(--bg-secondary)]" />;

  const isRedirecting = status === 'authenticated';

  return (
    <div className="relative min-h-screen bg-[var(--bg-secondary)] text-text-muted font-sans selection:bg-accent/30 overflow-hidden flex items-center justify-center">

      <div className="absolute inset-0 z-0">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(0,168,168,0.05)_0%,transparent_70%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:40px_40px] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)]" />
      </div>

      <main className="relative z-10 max-w-7xl mx-auto px-6 lg:px-12 w-full grid grid-cols-1 lg:grid-cols-2 gap-20 items-center">

        <div className="space-y-12">
          <div className="space-y-6">
            <div className="flex items-center gap-4">
              <div className="h-px w-12 bg-accent/30" />
              <span className="text-xs font-mono text-text-muted uppercase tracking-[0.4em]">Query Engine // V.1</span>
            </div>

            <h1 className="text-7xl lg:text-9xl font-black text-white leading-[0.8] tracking-tighter uppercase">
              Query <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-accent to-cyan-700 italic">
                DSGT.
              </span>
            </h1>

            <div className="max-w-md space-y-4">
              <p className="text-sm text-text-muted leading-relaxed border-l-2 border-accent/20 pl-4 italic font-medium">
                The collective intelligence of Georgia Tech's largest data science community. Authenticate to access your dashboard.
              </p>
            </div>

              <div className="bg-black/60 backdrop-blur-md border border-white/5 p-5 rounded-lg font-mono text-[11px] leading-relaxed shadow-2xl relative overflow-hidden group">
                <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-accent/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                {logs.map((log, i) => (
                  <p key={i} className={i === logs.length - 1 ? "text-accent" : "text-text-disabled"}>
                    {log}
                  </p>
                ))}
                {(emailSending || isRedirecting || status === 'loading') && (
                  <p className="text-accent animate-pulse">
                    {'>'} {status === 'loading' ? 'Syncing_Identity...' : emailSending ? 'Sending_Verification...' : 'Processing request...'}
                  </p>
                )}
              </div>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-center gap-6">
            <button
              onClick={handleSignIn}
              disabled={emailSending || isRedirecting || status === 'loading'}
              className="w-full sm:w-auto px-12 py-5 bg-white text-black font-black text-[11px] uppercase tracking-[0.2em] rounded-sm hover:bg-accent hover:text-white transition-all active:scale-95 disabled:opacity-30 shadow-[0_0_30px_rgba(0,168,168,0.1)]"
            >
              {isRedirecting ? 'Verified' : 'Sign In'}
            </button>

            {!showEmailInput ? (
              <button
                onClick={() => {
                  setShowEmailInput(true);
                  setLogs(prev => [...prev.slice(-4), "> Email auth mode activated."]);
                }}
                disabled={emailSending || isRedirecting || status === 'loading'}
                className="w-full sm:w-auto px-8 py-5 border border-white/10 text-white font-black text-[11px] uppercase tracking-[0.2em] rounded-sm hover:bg-white/5 transition-all active:scale-95 disabled:opacity-30"
              >
                Email Login
              </button>
            ) : (
              <div className="flex w-full sm:w-auto gap-2">
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleEmailLogin()}
                  placeholder="your@email.com"
                  disabled={emailSending || emailSent}
                  className="flex-1 sm:w-48 px-4 py-5 bg-black/60 border border-white/10 text-white font-mono text-[11px] rounded-sm focus:border-accent/50 focus:outline-none placeholder:text-text-disabled disabled:opacity-30"
                  autoFocus
                />
                <button
                  onClick={handleEmailLogin}
                  disabled={emailSending || emailSent || !email}
                  className="px-6 py-5 border border-white/10 text-white font-black text-[11px] uppercase tracking-[0.2em] rounded-sm hover:bg-accent/20 hover:border-accent/30 transition-all active:scale-95 disabled:opacity-30"
                >
                  {emailSent ? 'Sent ✓' : emailSending ? '...' : 'Send'}
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="hidden lg:flex flex-col items-center justify-center relative">
          <div className="absolute w-[500px] h-[500px] bg-accent/10 blur-[120px] rounded-full animate-pulse" />

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

            <div className="absolute -bottom-16 left-1/2 -translate-x-1/2 w-full text-center space-y-3">
              <p className="text-[10px] font-mono text-accent/50 uppercase tracking-[0.5em] animate-pulse">
                {isRedirecting ? "Handshake Verified" : status === 'loading' ? "Synchronizing..." : "Core Operational"}
              </p>
              <div className="flex justify-center gap-6 text-[8px] font-mono text-gray-700">
                <span className="flex items-center gap-1">
                  <div className={`w-1 h-1 rounded-full ${isRedirecting ? 'bg-green-500' : 'bg-accent'}`} />
                  STATUS: {status.toUpperCase()}
                </span>
                <span className="flex items-center gap-1">
                  <div className="w-1 h-1 bg-accent rounded-full" />
                  REGION: ATL-08
                </span>
              </div>
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