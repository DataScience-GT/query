'use client';

import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import Image from 'next/image';

export default function ProfileForm({ user }: { user: { name?: string | null; image?: string | null } }) {
  const utils = trpc.useUtils();
  const [name, setName] = useState(user.name || '');
  const [imageUrl, setImageUrl] = useState(user.image || '');

  const updateProfile = trpc.user.updateProfile.useMutation({
    onSuccess: () => utils.user.me.invalidate(),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateProfile.mutate({ name, image: imageUrl });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6 animate-in fade-in duration-500">
      <div className="flex items-center gap-6 p-4 bg-white/5 rounded-xl border border-white/5">
        <Image
          src={imageUrl || '/avatar-placeholder.png'}
          alt="Preview"
          width={64} height={64}
          className="rounded-full border-2 border-[#00A8A8] object-cover bg-black"
        />
        <div className="flex-1 space-y-1">
          <label className="text-[9px] uppercase tracking-widest text-gray-500">Profile_Image_URL (.jpg/.png)</label>
          <input
            value={imageUrl}
            onChange={e => setImageUrl(e.target.value)}
            placeholder="https://example.com/photo.jpg"
            className="w-full bg-black/40 border border-white/10 rounded p-2 text-xs text-white focus:border-[#00A8A8]/50 outline-none"
          />
        </div>
      </div>

      <div className="space-y-1">
        <label className="text-[9px] uppercase tracking-widest text-gray-500">Display_Name</label>
        <input
          value={name}
          onChange={e => setName(e.target.value)}
          className="w-full bg-black/40 border border-white/10 rounded p-3 text-sm text-white focus:border-[#00A8A8]/50 outline-none"
        />
      </div>

      <button type="submit" disabled={updateProfile.isPending} className="w-full py-4 bg-white/10 text-white border border-white/10 uppercase font-black text-[10px] tracking-widest hover:bg-white hover:text-black transition-all">
        {updateProfile.isPending ? 'Uploading_Data...' : 'Update_Basic_Node'}
      </button>
    </form>
  );
}