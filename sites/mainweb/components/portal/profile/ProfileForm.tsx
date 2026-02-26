'use client';

import { useState, useRef } from 'react';
import { trpc } from '@/lib/trpc';
import { useRouter } from 'next/navigation';
import { LiquidGlass } from '@/components/portal/LiquidGlass';

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
    bio: user.bio || '',
  });

  const [imagePreview, setImagePreview] = useState<string | null>(user.image || null);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  const updateProfileImage = trpc.user.updateProfileImage.useMutation({
    onSuccess: () => {
      setMessage({ type: 'success', text: 'Profile image updated successfully' });
      utils.user.me.invalidate();
      setIsUploadingImage(false);
      setTimeout(() => setMessage(null), 3000);
    },
    onError: (error) => {
      setMessage({ type: 'error', text: error.message || 'Failed to update profile image' });
      setIsUploadingImage(false);
    },
  });

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setMessage({ type: 'error', text: 'Please select an image file' });
      return;
    }

    setIsUploadingImage(true);
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_SIZE = 512;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_SIZE) {
            height *= MAX_SIZE / width;
            width = MAX_SIZE;
          }
        } else {
          if (height > MAX_SIZE) {
            width *= MAX_SIZE / height;
            height = MAX_SIZE;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          setIsUploadingImage(false);
          setMessage({ type: 'error', text: 'Failed to process image' });
          return;
        }

        ctx.drawImage(img, 0, 0, width, height);

        const base64Image = canvas.toDataURL('image/jpeg', 0.8);
        setImagePreview(base64Image);

        updateProfileImage.mutate({ base64Image });
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
    // Reset file input so same file can be selected again if needed
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSubmit = () => {
    setIsSubmitting(true);
    setMessage(null);

    updateProfile.mutate({
      name: formData.name || undefined,
      bio: formData.bio || undefined,
    });
  };

  return (
    <div className="space-y-6">
      {message && (
        <div className={`p-4 rounded-lg border ${message.type === 'success'
          ? 'bg-[#00A8A8]/10 border-[#00A8A8]/30 text-[#00A8A8]'
          : 'bg-red-500/10 border-red-500/30 text-red-500'
          }`}>
          <p className="text-xs uppercase tracking-widest">{message.text}</p>
        </div>
      )}

      <div className="flex flex-col items-center space-y-4 mb-6 pt-2">
        <div
          className="relative w-32 h-32 rounded-full overflow-hidden bg-black/40 border border-white/10 group cursor-pointer"
          onClick={() => fileInputRef.current?.click()}
        >
          {imagePreview ? (
            <img src={imagePreview} alt="Profile" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-gray-500">
              <svg className="w-12 h-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
            </div>
          )}
          <div className={`absolute inset-0 bg-black/60 flex items-center justify-center transition-opacity ${isUploadingImage ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
            <span className="text-white text-xs font-bold uppercase tracking-widest text-center px-2">
              {isUploadingImage ? 'Uploading...' : 'Change'}
            </span>
          </div>
        </div>
        <input
          type="file"
          ref={fileInputRef}
          className="hidden"
          accept="image/jpeg,image/png,image/webp"
          onChange={handleImageChange}
        />
      </div>

      <div className="space-y-2">
        <label className="text-xs text-gray-500 uppercase tracking-widest font-mono">
          Display Name
        </label>
        <input
          type="text"
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          placeholder="Enter your name"
          className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-3 text-white text-sm focus:border-[#00A8A8] focus:outline-none transition-all"
          maxLength={100}
        />
        <p className="text-[10px] text-gray-700 uppercase">Visible to all users</p>
      </div>


      <div className="space-y-2">
        <label className="text-xs text-gray-500 uppercase tracking-widest font-mono">
          Public Bio
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
          <p className="text-[10px] text-gray-700 uppercase">Visible on your profile</p>
          <p className="text-[10px] text-gray-600 font-mono">{formData.bio.length}/500</p>
        </div>
      </div>

      <div className="space-y-2">
        <label className="text-xs text-gray-500 uppercase tracking-widest font-mono">
          Email Address
        </label>
        <input
          type="email"
          value={user.email}
          disabled
          className="w-full bg-black/20 border border-white/5 rounded-lg px-4 py-3 text-gray-600 text-sm cursor-not-allowed font-mono"
        />
        <p className="text-[10px] text-gray-700 uppercase">Cannot be modified</p>
      </div>

      <LiquidGlass className="bg-white/5 border border-white/10 rounded-lg p-4">
        <p className="text-xs text-gray-500 uppercase tracking-widest mb-2">Profile Tips</p>
        <ul className="text-xs text-gray-400 space-y-1">
          <li>&gt; Use a clear profile picture for better recognition</li>
          <li>&gt; Keep your bio concise and professional</li>
          <li>&gt; Your email is private and used only for authentication</li>
        </ul>
      </LiquidGlass>

      <div className="flex gap-3 pt-4">
        <button
          onClick={handleSubmit}
          disabled={isSubmitting}
          className={`flex-1 py-3 bg-[#00A8A8] text-black font-bold uppercase text-xs tracking-widest rounded-lg transition-all ${isSubmitting
            ? 'opacity-50 cursor-not-allowed'
            : 'hover:bg-[#00A8A8]/80'
            }`}
        >
          {isSubmitting ? 'Updating...' : 'Save Changes'}
        </button>
      </div>
    </div>
  );
}