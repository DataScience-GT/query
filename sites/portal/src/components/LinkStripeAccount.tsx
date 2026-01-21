'use client';

import { useState } from 'react';
import { trpc } from '@/lib/trpc';

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

  const utils = trpc.useUtils();

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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    linkMutation.mutate(formData);
  };

  if (success) {
    return (
      <div className="p-6 rounded-xl border border-green-500 bg-green-500/10">
        <p className="text-[10px] uppercase tracking-widest font-black mb-2 text-green-400">
          Account_Linked
        </p>
        <p className="text-[11px] font-mono text-white">
          Your account has been linked. You are now a member!
        </p>
      </div>
    );
  }

  if (!isOpen) {
    return (
      <div className="p-6 rounded-xl border border-white/5 bg-white/[0.02]">
        <p className="text-[10px] text-gray-500 uppercase tracking-widest font-black mb-2">
          Member_Access
        </p>
        <p className="text-[11px] font-mono text-gray-600 font-bold uppercase mb-3">
          ○ Offline
        </p>
        <button
          onClick={() => setIsOpen(true)}
          className="w-full px-4 py-3 border border-[#00A8A8]/30 bg-[#00A8A8]/10 text-[#00A8A8] text-[9px] font-bold tracking-widest hover:bg-[#00A8A8]/20 transition-all"
        >
          Already_Paid? Link_Account →
        </button>
        <p className="text-[8px] text-gray-600 mt-2 font-mono">
          Used a different email for payment? Link it here.
        </p>
      </div>
    );
  }

  return (
    <div className="p-6 rounded-xl border border-[#00A8A8]/30 bg-[#00A8A8]/5">
      <div className="flex justify-between items-center mb-4">
        <p className="text-[10px] uppercase tracking-widest font-black text-[#00A8A8]">
          Link_Payment_Account
        </p>
        <button
          onClick={() => setIsOpen(false)}
          className="text-gray-500 hover:text-white text-[9px] uppercase tracking-widest"
        >
          [ Cancel ]
        </button>
      </div>

      <p className="text-[9px] text-gray-400 mb-4 font-mono">
        Enter the name and email you used during Stripe checkout to link your payment.
      </p>

      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-[8px] text-gray-500 uppercase tracking-widest block mb-1">
              First Name
            </label>
            <input
              type="text"
              value={formData.firstName}
              onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
              className="w-full bg-black/40 border border-white/10 rounded px-3 py-2 text-white text-[11px] focus:border-[#00A8A8] focus:outline-none"
              placeholder="John"
              required
            />
          </div>
          <div>
            <label className="text-[8px] text-gray-500 uppercase tracking-widest block mb-1">
              Last Name
            </label>
            <input
              type="text"
              value={formData.lastName}
              onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
              className="w-full bg-black/40 border border-white/10 rounded px-3 py-2 text-white text-[11px] focus:border-[#00A8A8] focus:outline-none"
              placeholder="Doe"
              required
            />
          </div>
        </div>

        <div>
          <label className="text-[8px] text-gray-500 uppercase tracking-widest block mb-1">
            Email Used For Payment
          </label>
          <input
            type="email"
            value={formData.email}
            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
            className="w-full bg-black/40 border border-white/10 rounded px-3 py-2 text-white text-[11px] focus:border-[#00A8A8] focus:outline-none"
            placeholder="john@school.edu"
            required
          />
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500/30 rounded p-3">
            <p className="text-[9px] text-red-400 font-mono">{error}</p>
          </div>
        )}

        <button
          type="submit"
          disabled={linkMutation.isPending}
          className="w-full px-4 py-3 bg-[#00A8A8] text-black font-bold text-[10px] uppercase tracking-widest hover:bg-[#00A8A8]/80 transition-all disabled:opacity-50"
        >
          {linkMutation.isPending ? 'Linking...' : 'Link_Account'}
        </button>
      </form>
    </div>
  );
}
