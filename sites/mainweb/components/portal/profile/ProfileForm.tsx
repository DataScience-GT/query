'use client';

import { useState, useRef, useEffect } from 'react';
import { trpc } from '@/lib/trpc';
import { LiquidGlass } from '@/components/portal/LiquidGlass';
import SkillsInterestsInput from './SkillsInterestsInput';

interface ProfileFormProps {
  user: {
    id: string;
    name?: string | null;
    email: string;
    image?: string | null;
    bio?: string | null;
    website?: string | null;
    location?: string | null;
  };
}

export default function ProfileForm({ user }: ProfileFormProps) {
  const utils = trpc.useUtils();

  const [formData, setFormData] = useState({
    name: user.name || '',
    bio: user.bio || '',
    website: user.website || '',
    location: user.location || '',
  });

  const { data: memberStatus } = trpc.member.checkStatus.useQuery();
  const isMember = memberStatus?.isMember;

  const { data: memberData } = trpc.member.me.useQuery(undefined, {
    enabled: !!isMember,
  });

  const [memberForm, setMemberForm] = useState({
    linkedinUrl: '',
    githubUrl: '',
    portfolioUrl: '',
    skills: [] as string[],
    interests: [] as string[],
  });

  useEffect(() => {
    if (memberData) {
      setMemberForm({
        linkedinUrl: memberData.linkedinUrl || '',
        githubUrl: memberData.githubUrl || '',
        portfolioUrl: memberData.portfolioUrl || '',
        skills: memberData.skills || [],
        interests: memberData.interests || [],
      });
    }
  }, [memberData]);

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

  const updateMember = trpc.member.update.useMutation({
    onSuccess: () => {
      utils.member.me.invalidate();
    },
    onError: (error) => {
      setMessage({ type: 'error', text: error.message || 'Failed to update member profile' });
      setIsSubmitting(false);
    }
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
      website: formData.website || undefined,
      location: formData.location || undefined,
    });

    if (isMember) {
      updateMember.mutate({
        linkedinUrl: memberForm.linkedinUrl || undefined,
        githubUrl: memberForm.githubUrl || undefined,
        portfolioUrl: memberForm.portfolioUrl || undefined,
        skills: memberForm.skills.length > 0 ? memberForm.skills : undefined,
        interests: memberForm.interests.length > 0 ? memberForm.interests : undefined,
      });
    }
  };

  return (
    <div className="space-y-6">
      {message && (
        <div className={`p-4 rounded-none border ${message.type === 'success'
          ? 'bg-accent/10 border-accent/30 text-accent'
          : 'bg-red-500/10 border-red-500/30 text-red-500'
          }`}>
          <p className="text-xs uppercase tracking-widest">{message.text}</p>
        </div>
      )}

      <div className="flex flex-col items-center space-y-4 mb-6 pt-2">
        <div
          className="relative w-32 h-32 rounded-sm overflow-hidden bg-[var(--bg-primary)]/40 border border-[var(--border-subtle)] group cursor-pointer"
          onClick={() => fileInputRef.current?.click()}
        >
          {imagePreview ? (
             
            <img src={imagePreview} alt="Profile" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-[var(--text-subtle)]">
              <svg className="w-12 h-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
            </div>
          )}
          <div className={`absolute inset-0 bg-[var(--bg-primary)]/60 flex items-center justify-center transition-opacity ${isUploadingImage ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
            <span className="text-[var(--text-primary)] text-xs font-bold uppercase tracking-widest text-center px-2">
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
        <label className="text-xs text-[var(--text-subtle)] uppercase tracking-widest font-mono">
          Display Name
        </label>
        <input
          type="text"
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          placeholder="Enter your name"
          className="w-full bg-[var(--bg-primary)]/40 border border-[var(--border-subtle)] rounded-none px-4 py-3 text-[var(--text-primary)] text-sm focus:border-accent focus:outline-none transition-all"
          maxLength={100}
        />
        <p className="text-[10px] text-gray-700 uppercase">Visible to all users</p>
      </div>


      <div className="space-y-2">
        <label className="text-xs text-[var(--text-subtle)] uppercase tracking-widest font-mono">
          Public Bio
        </label>
        <textarea
          value={formData.bio}
          onChange={(e) => setFormData({ ...formData, bio: e.target.value })}
          placeholder="Tell the community about yourself..."
          rows={4}
          className="w-full bg-[var(--bg-primary)]/40 border border-[var(--border-subtle)] rounded-none px-4 py-3 text-[var(--text-primary)] text-sm focus:border-accent focus:outline-none transition-all resize-none"
          maxLength={500}
        />
        <div className="flex justify-between items-center">
          <p className="text-[10px] text-gray-700 uppercase">Visible on your profile</p>
          <p className="text-[10px] text-gray-600 font-mono">{formData.bio.length}/500</p>
        </div>
      </div>

      <div className="space-y-2">
        <label className="text-xs text-[var(--text-subtle)] uppercase tracking-widest font-mono">
          Website
        </label>
        <input
          type="url"
          value={formData.website}
          onChange={(e) => setFormData({ ...formData, website: e.target.value })}
          placeholder="https://your-website.com"
          className="w-full bg-[var(--bg-primary)]/40 border border-[var(--border-subtle)] rounded-none px-4 py-3 text-[var(--text-primary)] text-sm focus:border-accent focus:outline-none transition-all"
          maxLength={500}
        />
      </div>

      <div className="space-y-2">
        <label className="text-xs text-[var(--text-subtle)] uppercase tracking-widest font-mono">
          Location
        </label>
        <input
          type="text"
          value={formData.location}
          onChange={(e) => setFormData({ ...formData, location: e.target.value })}
          placeholder="E.g. Atlanta, GA"
          className="w-full bg-[var(--bg-primary)]/40 border border-[var(--border-subtle)] rounded-none px-4 py-3 text-[var(--text-primary)] text-sm focus:border-accent focus:outline-none transition-all"
          maxLength={200}
        />
      </div>

      <div className="space-y-2">
        <label className="text-xs text-[var(--text-subtle)] uppercase tracking-widest font-mono">
          Email Address
        </label>
        <input
          type="email"
          value={user.email}
          disabled
          className="w-full bg-[var(--bg-primary)]/20 border border-[var(--border-subtle)] rounded-none px-4 py-3 text-gray-600 text-sm cursor-not-allowed font-mono"
        />
        <p className="text-[10px] text-gray-700 uppercase">Cannot be modified</p>
      </div>

      {isMember && (
        <div className="pt-6 mt-6 border-t border-[var(--border-subtle)] space-y-6">
          <div className="flex items-center gap-2 mb-2">
            <span className="w-2 h-2 rounded-sm bg-green-500 animate-pulse"></span>
            <h3 className="text-sm font-bold text-[var(--text-primary)] uppercase tracking-widest">Member Details</h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-xs text-[var(--text-subtle)] uppercase tracking-widest font-mono">
                LinkedIn URL
              </label>
              <input
                type="url"
                value={memberForm.linkedinUrl}
                onChange={(e) => setMemberForm({ ...memberForm, linkedinUrl: e.target.value })}
                placeholder="https://linkedin.com/in/..."
                className="w-full bg-[var(--bg-primary)]/40 border border-[var(--border-subtle)] rounded-none px-4 py-3 text-[var(--text-primary)] text-sm focus:border-green-500/50 focus:outline-none transition-all"
              />
            </div>

            <div className="space-y-2">
              <label className="text-xs text-[var(--text-subtle)] uppercase tracking-widest font-mono">
                GitHub URL
              </label>
              <input
                type="url"
                value={memberForm.githubUrl}
                onChange={(e) => setMemberForm({ ...memberForm, githubUrl: e.target.value })}
                placeholder="https://github.com/..."
                className="w-full bg-[var(--bg-primary)]/40 border border-[var(--border-subtle)] rounded-none px-4 py-3 text-[var(--text-primary)] text-sm focus:border-green-500/50 focus:outline-none transition-all"
              />
            </div>

            <div className="space-y-2">
              <label className="text-xs text-[var(--text-subtle)] uppercase tracking-widest font-mono">
                Portfolio URL
              </label>
              <input
                type="url"
                value={memberForm.portfolioUrl}
                onChange={(e) => setMemberForm({ ...memberForm, portfolioUrl: e.target.value })}
                placeholder="https://your-portfolio.com"
                className="w-full bg-[var(--bg-primary)]/40 border border-[var(--border-subtle)] rounded-none px-4 py-3 text-[var(--text-primary)] text-sm focus:border-green-500/50 focus:outline-none transition-all"
              />
            </div>
          </div>

          <div className="space-y-6">
            <div className="space-y-2 mt-4">
              <label className="text-xs text-[var(--text-subtle)] uppercase tracking-widest font-mono">
                Core Skills
              </label>
              <SkillsInterestsInput
                items={memberForm.skills}
                setItems={(skills) => setMemberForm({ ...memberForm, skills })}
                placeholder="E.g., React, Python, Data Analysis..."
                maxItems={15}
                accentColor="blue-500"
              />
            </div>

            <div className="space-y-2 mt-4">
              <label className="text-xs text-[var(--text-subtle)] uppercase tracking-widest font-mono">
                Interests & Focus Areas
              </label>
              <SkillsInterestsInput
                items={memberForm.interests}
                setItems={(interests) => setMemberForm({ ...memberForm, interests })}
                placeholder="E.g., Open Source, Machine Learning..."
                maxItems={10}
                accentColor="purple-500"
              />
            </div>
          </div>
        </div>
      )}

      <LiquidGlass className="bg-white/5 border border-[var(--border-subtle)] rounded-none p-4 mt-6">
        <p className="text-xs text-[var(--text-subtle)] uppercase tracking-widest mb-2">Profile Tips</p>
        <ul className="text-xs text-[var(--text-muted)] space-y-1">
          <li>&gt; Use a clear profile picture for better recognition</li>
          <li>&gt; Keep your bio concise and professional</li>
          <li>&gt; Your email is private and used only for authentication</li>
        </ul>
      </LiquidGlass>

      <div className="flex gap-3 pt-4">
        <button
          onClick={handleSubmit}
          disabled={isSubmitting}
          className={`flex-1 py-3 bg-accent text-black font-bold uppercase text-xs tracking-widest rounded-none transition-all ${isSubmitting
            ? 'opacity-50 cursor-not-allowed'
            : 'hover:bg-accent/80'
            }`}
        >
          {isSubmitting ? 'Updating...' : 'Save Changes'}
        </button>
      </div>
    </div>
  );
}