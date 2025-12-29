'use client';

import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { useRouter } from 'next/navigation';

interface ProfileFormProps {
  user: {
    id: string;
    name?: string | null;
    email: string;
    image?: string | null;
    bio?: string | null;
  };
}

export default function ProfileForm({ user }: ProfileFormProps) {
  const router = useRouter();
  const utils = trpc.useUtils();

  const [formData, setFormData] = useState({
    name: user.name || '',
    image: user.image || '',
    bio: user.bio || '',
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  const updateProfile = trpc.user.updateProfile.useMutation({
    onSuccess: () => {
      setMessage({ type: 'success', text: 'Profile updated successfully' });
      utils.user.me.invalidate();
      setIsSubmitting(false);

      setTimeout(() => setMessage(null), 3000);
    },
    onError: (error) => {
      setMessage({ type: 'error', text: error.message || 'Failed to update profile' });
      setIsSubmitting(false);
    },
  });

  const handleSubmit = () => {
    setIsSubmitting(true);
    setMessage(null);

    updateProfile.mutate({
      name: formData.name || undefined,
      image: formData.image || undefined,
      bio: formData.bio || undefined,
    });
  };

  return (
    <div className="space-y-6">
      {message && (
        <div className={`p-4 rounded-lg border ${
          message.type === 'success'
            ? 'bg-[#00A8A8]/10 border-[#00A8A8]/30 text-[#00A8A8]'
            : 'bg-red-500/10 border-red-500/30 text-red-500'
        }`}>
          <p className="text-[10px] uppercase tracking-widest">{message.text}</p>
        </div>
      )}

      <div className="space-y-2">
        <label className="text-[9px] text-gray-500 uppercase tracking-widest font-mono">
          Display_Name
        </label>
        <input
          type="text"
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          placeholder="Enter your name"
          className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-3 text-white text-sm focus:border-[#00A8A8] focus:outline-none transition-all"
          maxLength={100}
        />
        <p className="text-[8px] text-gray-700 uppercase">Visible to all users</p>
      </div>

      <div className="space-y-2">
        <label className="text-[9px] text-gray-500 uppercase tracking-widest font-mono">
          Avatar_URL
        </label>
        <input
          type="url"
          value={formData.image}
          onChange={(e) => setFormData({ ...formData, image: e.target.value })}
          placeholder="https://example.com/avatar.jpg"
          className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-3 text-white text-sm focus:border-[#00A8A8] focus:outline-none transition-all font-mono"
        />
        <p className="text-[8px] text-gray-700 uppercase">Direct link to JPG/PNG image</p>
      </div>

      <div className="space-y-2">
        <label className="text-[9px] text-gray-500 uppercase tracking-widest font-mono">
          Public_Bio
        </label>
        <textarea
          value={formData.bio}
          onChange={(e) => setFormData({ ...formData, bio: e.target.value })}
          placeholder="Tell the community about yourself..."
          rows={4}
          className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-3 text-white text-sm focus:border-[#00A8A8] focus:outline-none transition-all resize-none"
          maxLength={500}
        />
        <div className="flex justify-between items-center">
          <p className="text-[8px] text-gray-700 uppercase">Visible on your profile</p>
          <p className="text-[8px] text-gray-600 font-mono">{formData.bio.length}/500</p>
        </div>
      </div>

      <div className="space-y-2">
        <label className="text-[9px] text-gray-500 uppercase tracking-widest font-mono">
          Email_Address
        </label>
        <input
          type="email"
          value={user.email}
          disabled
          className="w-full bg-black/20 border border-white/5 rounded-lg px-4 py-3 text-gray-600 text-sm cursor-not-allowed font-mono"
        />
        <p className="text-[8px] text-gray-700 uppercase">Cannot be modified</p>
      </div>

      <div className="bg-white/5 border border-white/10 rounded-lg p-4">
        <p className="text-[9px] text-gray-500 uppercase tracking-widest mb-2">💡 Profile Tips</p>
        <ul className="text-[10px] text-gray-400 space-y-1">
          <li>• Use a clear profile picture for better recognition</li>
          <li>• Keep your bio concise and professional</li>
          <li>• Your email is private and used only for authentication</li>
        </ul>
      </div>

      <div className="flex gap-3 pt-4">
        <button
          onClick={handleSubmit}
          disabled={isSubmitting}
          className={`flex-1 py-3 bg-[#00A8A8] text-black font-bold uppercase text-[10px] tracking-widest rounded-lg transition-all ${
            isSubmitting
              ? 'opacity-50 cursor-not-allowed'
              : 'hover:bg-[#00A8A8]/80'
          }`}
        >
          {isSubmitting ? 'Updating...' : 'Save_Changes'}
        </button>
      </div>
    </div>
  );
}