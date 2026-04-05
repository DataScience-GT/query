'use client';

import { useState, useEffect } from 'react';
import { trpc } from '@/lib/trpc';
import { LiquidGlass } from '@/components/portal/LiquidGlass';

interface LinkStripeAccountProps {
  onSuccess?: () => void;
}

export default function LinkStripeAccount({ onSuccess }: LinkStripeAccountProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
  });
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isChecking, setIsChecking] = useState(true);
  const [isPaying, setIsPaying] = useState(false);

  const utils = trpc.useUtils();

  const autoLinkMutation = trpc.stripe.attemptAutoLink.useMutation({
    onSuccess: (data) => {
      setIsChecking(false);
      if (data.success) {
        setSuccess(true);
        utils.member.checkStatus.invalidate();
        onSuccess?.();
      }
    },
    onError: () => {
      setIsChecking(false);
    }
  });

  useEffect(() => {
    // Attempt to auto-link on mount
    autoLinkMutation.mutate();
  }, []);




  const linkMutation = trpc.stripe.linkAccount.useMutation({
    onSuccess: () => {
      setSuccess(true);
      setError(null);
      // Invalidate member status to refresh the UI
      utils.member.checkStatus.invalidate();
      onSuccess?.();
    },
    onError: (err) => {
      setError(err.message);
      setSuccess(false);
    },
  });

  const payMutation = trpc.stripe.createCheckoutSession.useMutation({
    onSuccess: (data) => {
      if (data?.url) {
        window.location.href = data.url;
      }
    },
    onError: (err) => {
      setError(err.message);
      setIsPaying(false);
    },
  });

  const handlePay = () => {
    setError(null);
    setIsPaying(true);
    payMutation.mutate({ returnUrl: window.location.href });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    linkMutation.mutate(formData);
  };

  if (success) {
    return (
      <LiquidGlass className="h-full p-8 flex flex-col items-center justify-center text-center !bg-green-500/10 !border-green-500/30">
        <div className="w-12 h-12 rounded-full bg-green-500/20 flex items-center justify-center mb-4">
          <svg className="w-6 h-6 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
        </div>
        <p className="text-xs uppercase tracking-widest font-black mb-2 text-green-400">
          Access Granted
        </p>
        <p className="text-sm font-mono text-gray-300">
          Identity verified. Refreshing protocols...
        </p>
      </LiquidGlass>
    );
  }

  if (isChecking) {
    return (
      <LiquidGlass className="relative h-full p-8 flex flex-col items-center justify-center text-center !bg-[#0A0A0A] border-white/5 animate-pulse">
        <div className="w-8 h-8 rounded-full border-2 border-[#00A8A8] border-t-transparent animate-spin mb-4" />
        <p className="text-xs uppercase tracking-[0.2em] font-bold text-[#00A8A8] animate-pulse">
          Syncing Protocols...
        </p>
      </LiquidGlass>
    );
  }

  if (!isOpen) {
    return (
      <LiquidGlass className="relative h-full p-8 hover:!border-[#00A8A8]/30 transition-all duration-300 flex flex-col group !bg-[#0A0A0A]">

        {/* Decorative offline gradient */}
        <div className="absolute inset-0 bg-gradient-to-br from-[#00A8A8]/5 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

        <div className="relative z-10 flex-1 flex flex-col">
          <div className="flex justify-between items-start mb-6">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] font-bold mb-2 text-[#00A8A8] drop-shadow-[0_0_5px_rgba(0,168,168,0.5)]">
                Member Node
              </p>
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-[#00A8A8]/50 animate-pulse" />
                <h3 className="text-2xl font-bold text-gray-500 uppercase tracking-tight group-hover:text-[#00A8A8] transition-colors">
                  Inactive
                </h3>
              </div>
            </div>
            <div className="opacity-20 group-hover:opacity-100 transition-opacity">
              <svg className="w-8 h-8 text-[#00A8A8]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" /></svg>
            </div>
          </div>

          <p className="text-sm text-gray-600 font-mono mb-6 leading-relaxed">
            Membership verification required for terminal access. Dues: $15.00/yr.
          </p>

          <div className="mt-auto space-y-3">
            <button
              onClick={handlePay}
              disabled={payMutation.isPending}
              className="w-full py-4 px-4 bg-[#00A8A8] text-black hover:bg-[#00A8A8]/90 text-xs font-bold tracking-[0.2em] uppercase transition-all rounded shadow-[0_0_20px_rgba(0,168,168,0.3)] hover:shadow-[0_0_30px_rgba(0,168,168,0.5)] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {payMutation.isPending ? 'Processing...' : 'Pay Membership Dues ($15)'}
            </button>

            <button
              onClick={() => setIsOpen(true)}
              className="w-full py-3 px-4 bg-white/5 border border-white/10 hover:bg-white/10 text-xs font-bold tracking-[0.2em] uppercase transition-all rounded text-gray-400 hover:text-white"
            >
              Link Existing Payment
            </button>
          </div>

          {error && (
            <div className="mt-4 text-[9px] text-red-500 font-mono uppercase tracking-widest text-center">
              Error initiating protocol: {error}
            </div>
          )}
        </div>
      </LiquidGlass>
    );
  }

  return (
    <LiquidGlass className="h-full p-8 border-[#00A8A8]/30 relative overflow-hidden !bg-[#0A0A0A]">
      <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none">
        <svg className="w-32 h-32 text-[#00A8A8]" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z" /></svg>
      </div>

      <div className="relative z-10">
        <div className="flex justify-between items-center mb-6 border-b border-white/5 pb-4">
          <p className="text-xs uppercase tracking-[0.2em] font-black text-[#00A8A8]">
            Identify Verification
          </p>
          <button
            onClick={() => setIsOpen(false)}
            className="text-gray-600 hover:text-white text-xs uppercase tracking-widest font-mono hover:bg-white/5 px-3 py-1.5 rounded transition-all"
          >
            [ ABORT ]
          </button>
        </div>

        <p className="text-xs text-gray-500 mb-6 font-mono leading-relaxed">
          Please inputs the credentials used for the transaction to verify database entry.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-[10px] text-gray-500 uppercase tracking-widest font-mono">
                First Name
              </label>
              <input
                type="text"
                value={formData.firstName}
                onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                className="w-full bg-black/40 border border-white/10 rounded px-3 py-2 text-white text-sm font-mono focus:border-[#00A8A8] focus:outline-none focus:bg-[#00A8A8]/5 transition-all placeholder:text-gray-800"
                placeholder="JOHN"
                required
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] text-gray-500 uppercase tracking-widest font-mono">
                Last Name
              </label>
              <input
                type="text"
                value={formData.lastName}
                onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                className="w-full bg-black/40 border border-white/10 rounded px-3 py-2 text-white text-sm font-mono focus:border-[#00A8A8] focus:outline-none focus:bg-[#00A8A8]/5 transition-all placeholder:text-gray-800"
                placeholder="DOE"
                required
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-[10px] text-gray-500 uppercase tracking-widest font-mono">
              Transaction Email
            </label>
            <input
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              className="w-full bg-black/40 border border-white/10 rounded px-3 py-2 text-white text-sm font-mono focus:border-[#00A8A8] focus:outline-none focus:bg-[#00A8A8]/5 transition-all placeholder:text-gray-800"
              placeholder="ident@example.com"
              required
            />
          </div>

          {error && (
            <div className="bg-red-500/5 border border-red-500/20 rounded p-3 flex items-start gap-2">
              <span className="text-red-500 text-xs">!</span>
              <p className="text-[9px] text-red-400 font-mono leading-tight pt-0.5">{error}</p>
            </div>
          )}

          <button
            type="submit"
            disabled={linkMutation.isPending}
            className="w-full mt-2 px-4 py-3 bg-[#00A8A8] text-black font-bold text-xs uppercase tracking-[0.2em] hover:bg-[#00A8A8]/90 transition-all disabled:opacity-50 hover:shadow-[0_0_20px_rgba(0,168,168,0.3)]"
          >
            {linkMutation.isPending ? 'Verifying...' : 'Authenticate Payment'}
          </button>
        </form>
      </div>
    </LiquidGlass>
  );
}
