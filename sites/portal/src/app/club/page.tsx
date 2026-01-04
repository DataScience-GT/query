'use client';

import { useSession } from 'next-auth/react';
import { trpc } from '@/lib/trpc';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

export default function MemberProfilePage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [isEditing, setIsEditing] = useState(false);

  // Fetch member data
  const { data: memberData, isLoading } = trpc.member.me.useQuery(undefined, {
    enabled: !!session,
  });

  const { data: memberStatus } = trpc.member.checkStatus.useQuery(undefined, {
    enabled: !!session,
  });

  const { data: memberHistory } = trpc.member.history.useQuery(undefined, {
    enabled: !!session,
  });

  // Redirect if not authenticated
  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/');
    }
  }, [status, router]);

  // Redirect if not a member
  useEffect(() => {
    if (status === 'authenticated' && memberStatus && !memberStatus.isMember) {
      router.push('/member/register');
    }
  }, [status, memberStatus, router]);

  if (status === 'loading' || isLoading) {
    return (
      <div className="min-h-screen bg-[#050505] flex items-center justify-center">
        <div className="text-indigo-500 animate-pulse uppercase tracking-[0.5em] font-mono text-sm">
          Loading Profile...
        </div>
      </div>
    );
  }

  if (!session || !memberData) {
    return null;
  }

  return (
    <div className="min-h-screen bg-[#050505] text-gray-400">
      {/* Background Effects */}
      <div className="absolute inset-0 z-0 opacity-30">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(79,70,229,0.05)_0%,transparent_70%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:40px_40px]" />
      </div>

      {/* Header */}
      <header className="relative z-10 border-b border-white/5 bg-black/60 backdrop-blur-md">
        <div className="max-w-6xl mx-auto px-6 py-6 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => router.push('/dashboard')}
              className="text-gray-500 hover:text-white transition-colors font-mono text-xs uppercase tracking-widest"
            >
              ← Dashboard
            </button>
            <div className="h-4 w-px bg-white/10" />
            <h1 className="text-2xl font-black text-white uppercase tracking-tighter italic">
              Member Profile
            </h1>
          </div>
          <button
            onClick={() => setIsEditing(!isEditing)}
            className="px-6 py-2 border border-indigo-500/30 text-indigo-400 font-mono text-xs uppercase tracking-widest hover:bg-indigo-500/10 transition-all rounded-sm"
          >
            {isEditing ? 'Cancel' : 'Edit Profile'}
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="relative z-10 max-w-6xl mx-auto px-6 py-12">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

          {/* Left Column - Member Card */}
          <div className="lg:col-span-1 space-y-6">
            <div className="bg-black/60 border border-white/5 rounded-lg p-6 backdrop-blur-sm">
              <div className="flex flex-col items-center text-center space-y-4">
                <img
                  src={session.user?.image || ''}
                  alt={memberData.firstName}
                  className="w-24 h-24 rounded-full border-2 border-indigo-500/30 grayscale"
                />
                <div>
                  <h2 className="text-xl font-bold text-white uppercase tracking-tight">
                    {memberData.firstName} {memberData.lastName}
                  </h2>
                  <p className="text-xs text-gray-600 uppercase tracking-widest font-mono mt-1">
                    {memberStatus?.memberType} Member
                  </p>
                </div>

                {/* Member Status Badge */}
                {memberStatus?.isActive ? (
                  <div className="w-full p-3 bg-emerald-500/10 border border-emerald-500/30 rounded text-center">
                    <p className="text-emerald-500 font-mono text-xs uppercase tracking-widest">
                      ✓ Active
                    </p>
                    <p className="text-gray-500 text-[10px] mt-1">
                      {memberStatus.daysRemaining} days remaining
                    </p>
                  </div>
                ) : (
                  <div className="w-full p-3 bg-amber-500/10 border border-amber-500/30 rounded text-center">
                    <p className="text-amber-500 font-mono text-xs uppercase tracking-widest">
                      ⚠ Expired
                    </p>
                    <button
                      onClick={() => router.push('/member/renew')}
                      className="w-full mt-2 py-2 bg-amber-600 text-white font-bold text-[10px] uppercase tracking-widest rounded hover:bg-amber-500 transition-all"
                    >
                      Renew Membership
                    </button>
                  </div>
                )}
              </div>

              <div className="mt-6 pt-6 border-t border-white/5 space-y-3 font-mono text-xs">
                <div className="flex justify-between">
                  <span className="text-gray-600 uppercase tracking-widest">Member Since</span>
                  <span className="text-white">{new Date(memberData.joinedAt).toLocaleDateString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600 uppercase tracking-widest">Renewals</span>
                  <span className="text-white">{memberStatus?.renewalCount || 0}</span>
                </div>
                {memberData.school && (
                  <div className="flex justify-between">
                    <span className="text-gray-600 uppercase tracking-widest">School</span>
                    <span className="text-white text-right">{memberData.school}</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Right Column - Details */}
          <div className="lg:col-span-2 space-y-6">

            {/* Personal Information */}
            <div className="bg-black/60 border border-white/5 rounded-lg p-6 backdrop-blur-sm">
              <h3 className="text-lg font-black text-white uppercase tracking-tighter mb-6 flex items-center gap-3">
                <span className="text-indigo-500">01.</span> Personal Information
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="text-[10px] text-gray-600 uppercase tracking-widest font-mono">First Name</label>
                  <p className="text-white mt-1">{memberData.firstName}</p>
                </div>
                <div>
                  <label className="text-[10px] text-gray-600 uppercase tracking-widest font-mono">Last Name</label>
                  <p className="text-white mt-1">{memberData.lastName}</p>
                </div>
                <div>
                  <label className="text-[10px] text-gray-600 uppercase tracking-widest font-mono">Email</label>
                  <p className="text-white mt-1">{session.user?.email}</p>
                </div>
                <div>
                  <label className="text-[10px] text-gray-600 uppercase tracking-widest font-mono">Phone</label>
                  <p className="text-white mt-1">{memberData.phoneNumber || 'Not provided'}</p>
                </div>
              </div>
            </div>

            {/* Academic Information */}
            <div className="bg-black/60 border border-white/5 rounded-lg p-6 backdrop-blur-sm">
              <h3 className="text-lg font-black text-white uppercase tracking-tighter mb-6 flex items-center gap-3">
                <span className="text-indigo-500">02.</span> Academic Information
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="text-[10px] text-gray-600 uppercase tracking-widest font-mono">School</label>
                  <p className="text-white mt-1">{memberData.school || 'Not provided'}</p>
                </div>
                <div>
                  <label className="text-[10px] text-gray-600 uppercase tracking-widest font-mono">Major</label>
                  <p className="text-white mt-1">{memberData.major || 'Not provided'}</p>
                </div>
                <div>
                  <label className="text-[10px] text-gray-600 uppercase tracking-widest font-mono">Graduation Year</label>
                  <p className="text-white mt-1">{memberData.graduationYear || 'Not provided'}</p>
                </div>
              </div>
            </div>

            {/* Skills & Interests */}
            <div className="bg-black/60 border border-white/5 rounded-lg p-6 backdrop-blur-sm">
              <h3 className="text-lg font-black text-white uppercase tracking-tighter mb-6 flex items-center gap-3">
                <span className="text-indigo-500">03.</span> Skills & Interests
              </h3>

              <div className="space-y-4">
                <div>
                  <label className="text-[10px] text-gray-600 uppercase tracking-widest font-mono mb-2 block">Skills</label>
                  <div className="flex flex-wrap gap-2">
                    {memberData.skills && memberData.skills.length > 0 ? (
                      memberData.skills.map((skill, idx) => (
                        <span
                          key={idx}
                          className="px-3 py-1 bg-indigo-500/10 border border-indigo-500/30 text-indigo-400 text-xs font-mono rounded-sm"
                        >
                          {skill}
                        </span>
                      ))
                    ) : (
                      <p className="text-gray-600 text-sm italic">No skills listed</p>
                    )}
                  </div>
                </div>

                <div>
                  <label className="text-[10px] text-gray-600 uppercase tracking-widest font-mono mb-2 block">Interests</label>
                  <div className="flex flex-wrap gap-2">
                    {memberData.interests && memberData.interests.length > 0 ? (
                      memberData.interests.map((interest, idx) => (
                        <span
                          key={idx}
                          className="px-3 py-1 bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs font-mono rounded-sm"
                        >
                          {interest}
                        </span>
                      ))
                    ) : (
                      <p className="text-gray-600 text-sm italic">No interests listed</p>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Social Links */}
            <div className="bg-black/60 border border-white/5 rounded-lg p-6 backdrop-blur-sm">
              <h3 className="text-lg font-black text-white uppercase tracking-tighter mb-6 flex items-center gap-3">
                <span className="text-indigo-500">04.</span> Social Links
              </h3>
              <div className="space-y-3">
                {memberData.linkedinUrl && (
                  <a
                    href={memberData.linkedinUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-3 text-sm text-gray-400 hover:text-indigo-400 transition-colors"
                  >
                    <span className="font-mono uppercase tracking-widest text-xs">LinkedIn</span>
                    <span className="text-gray-700">→</span>
                  </a>
                )}
                {memberData.githubUrl && (
                  <a
                    href={memberData.githubUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-3 text-sm text-gray-400 hover:text-indigo-400 transition-colors"
                  >
                    <span className="font-mono uppercase tracking-widest text-xs">GitHub</span>
                    <span className="text-gray-700">→</span>
                  </a>
                )}
                {memberData.portfolioUrl && (
                  <a
                    href={memberData.portfolioUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-3 text-sm text-gray-400 hover:text-indigo-400 transition-colors"
                  >
                    <span className="font-mono uppercase tracking-widest text-xs">Portfolio</span>
                    <span className="text-gray-700">→</span>
                  </a>
                )}
                {!memberData.linkedinUrl && !memberData.githubUrl && !memberData.portfolioUrl && (
                  <p className="text-gray-600 text-sm italic">No social links provided</p>
                )}
              </div>
            </div>

            {/* Membership History */}
            {memberHistory && memberHistory.length > 0 && (
              <div className="bg-black/60 border border-white/5 rounded-lg p-6 backdrop-blur-sm">
                <h3 className="text-lg font-black text-white uppercase tracking-tighter mb-6 flex items-center gap-3">
                  <span className="text-indigo-500">05.</span> Membership History
                </h3>
                <div className="space-y-3">
                  {memberHistory.map((entry) => (
                    <div
                      key={entry.id}
                      className="flex items-center justify-between p-3 bg-white/5 rounded border border-white/5"
                    >
                      <div>
                        <p className="text-white text-sm font-mono uppercase tracking-widest">
                          {entry.action}
                        </p>
                        <p className="text-gray-600 text-xs mt-1">
                          {entry.startDate ? new Date(entry.startDate).toLocaleDateString() : 'N/A'} - {entry.endDate ? new Date(entry.endDate).toLocaleDateString() : 'N/A'}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}