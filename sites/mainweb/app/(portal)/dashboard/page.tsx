'use client';

import { useSession, signOut } from 'next-auth/react';
import { trpc } from '@/lib/trpc';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import LinkStripeAccount from '@/components/portal/LinkStripeAccount';
import ProfileForm from '@/components/portal/profile/ProfileForm';

export default function Dashboard() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [mode, setMode] = useState<'DASHBOARD' | 'PROFILE'>('DASHBOARD');

  const { data: userData } = trpc.user.me.useQuery(undefined, { enabled: !!session });
  const { data: memberStatus } = trpc.member.checkStatus.useQuery(undefined, { enabled: !!session });
  const { data: adminStatus } = trpc.admin.isAdmin.useQuery(undefined, { enabled: !!session });

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/login');
  }, [status, router]);

  if (status === 'loading') {
    return (
      <div className="min-h-screen min-h-[100dvh] bg-black flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-teal-500/30 border-t-teal-500 rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-500 text-sm">Loading...</p>
        </div>
      </div>
    );
  }

  if (!session) return null;

  return (
    <div className="relative min-h-screen min-h-[100dvh] bg-black text-gray-400 font-sans overflow-x-hidden">
      {/* Background */}
      <div className="fixed inset-0 z-0 pointer-events-none">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[400px] bg-teal-500/5 rounded-full blur-[120px]" />
      </div>

      <main className="relative z-10 max-w-6xl mx-auto py-8 px-4 md:px-6">
        {/* Header */}
        <header className="flex items-center justify-between mb-8 p-4 bg-white/[0.02] border border-white/5 rounded-2xl">
          <div className="flex items-center gap-4">
            <div className="relative">
              <div className="absolute -inset-0.5 bg-gradient-to-r from-teal-500 to-emerald-500 rounded-full opacity-50 blur" />
              <Image
                src={userData?.image || '/avatar-placeholder.png'}
                alt="Avatar"
                width={48}
                height={48}
                className="relative rounded-full border-2 border-black bg-black object-cover w-12 h-12"
              />
            </div>
            <div>
              <p className="text-white font-bold text-base">{userData?.name || 'User'}</p>
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${adminStatus?.isAdmin ? 'bg-red-500' : memberStatus?.isMember ? 'bg-emerald-500' : 'bg-yellow-500'}`} />
                <p className="text-gray-500 text-xs uppercase tracking-wider font-medium">
                  {adminStatus?.isAdmin ? 'Admin' : memberStatus?.isMember ? 'Member' : 'Guest'}
                </p>
              </div>
            </div>
          </div>
          <button
            onClick={() => signOut({ callbackUrl: '/login' })}
            className="px-4 py-2 text-gray-500 hover:text-red-400 text-xs uppercase tracking-wider font-medium transition-colors"
          >
            Sign Out
          </button>
        </header>

        {/* Navigation */}
        <div className="flex gap-2 mb-8">
          <button
            onClick={() => setMode('DASHBOARD')}
            className={`px-6 py-3 rounded-xl text-sm font-semibold transition-all ${mode === 'DASHBOARD'
                ? 'bg-gradient-to-r from-teal-500 to-emerald-500 text-white shadow-lg shadow-teal-500/20'
                : 'bg-white/5 text-gray-400 hover:text-white'
              }`}
          >
            Dashboard
          </button>
          <button
            onClick={() => setMode('PROFILE')}
            className={`px-6 py-3 rounded-xl text-sm font-semibold transition-all ${mode === 'PROFILE'
                ? 'bg-gradient-to-r from-teal-500 to-emerald-500 text-white shadow-lg shadow-teal-500/20'
                : 'bg-white/5 text-gray-400 hover:text-white'
              }`}
          >
            Profile
          </button>
        </div>

        {mode === 'PROFILE' ? (
          /* Profile View */
          <div className="bg-white/[0.02] border border-white/5 rounded-2xl p-6">
            <h2 className="text-xl font-bold text-white mb-6">Edit Profile</h2>
            <ProfileForm user={{
              id: userData?.id || '',
              name: userData?.name,
              email: userData?.email || '',
              image: userData?.image,
              bio: userData?.bio
            }} />
          </div>
        ) : (
          /* Dashboard View */
          <div className="space-y-6">
            {adminStatus?.isAdmin ? (
              /* Admin Card */
              <Link href="/admin" className="block group">
                <div className="relative p-8 bg-white/[0.02] border border-white/5 hover:border-teal-500/30 rounded-2xl transition-all overflow-hidden">
                  <div className="absolute inset-0 bg-gradient-to-br from-teal-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                  <div className="absolute top-4 right-4 w-16 h-16 bg-gradient-to-br from-teal-500 to-emerald-600 rounded-2xl flex items-center justify-center opacity-20 group-hover:opacity-40 transition-opacity">
                    <svg className="w-8 h-8 text-white" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm0 14.2c-2.5 0-4.71-1.28-6-3.22.03-1.99 4-3.08 6-3.08 1.99 0 5.97 1.09 6 3.08-1.29 1.94-3.5 3.22-6 3.22z" />
                    </svg>
                  </div>
                  <div className="relative z-10">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="w-2 h-2 rounded-full bg-teal-500" />
                      <p className="text-xs uppercase tracking-widest text-teal-400 font-semibold">Admin Access</p>
                    </div>
                    <h3 className="text-2xl font-bold text-white mb-2 group-hover:text-teal-400 transition-colors">
                      Admin Control Panel
                    </h3>
                    <p className="text-gray-500 text-sm mb-6">
                      Manage events, view check-ins, and configure system settings.
                    </p>
                    <span className="inline-flex items-center gap-2 text-sm text-teal-400 font-medium">
                      Open Panel
                      <svg className="w-4 h-4 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                      </svg>
                    </span>
                  </div>
                </div>
              </Link>
            ) : (
              /* Member Cards */
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {memberStatus?.isMember ? (
                  <Link href="/club" className="block group">
                    <div className="relative h-full p-6 bg-white/[0.02] border border-white/5 hover:border-emerald-500/30 rounded-2xl transition-all overflow-hidden">
                      <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                      <div className="relative z-10">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="w-2 h-2 rounded-full bg-emerald-500" />
                          <p className="text-xs uppercase tracking-widest text-emerald-400 font-semibold">Active Member</p>
                        </div>
                        <h3 className="text-xl font-bold text-white mb-2 group-hover:text-emerald-400 transition-colors">
                          Member Portal
                        </h3>
                        <p className="text-gray-500 text-sm mb-4">
                          Access club resources, events, and member benefits.
                        </p>
                        <span className="inline-flex items-center gap-2 text-sm text-emerald-400 font-medium">
                          Enter
                          <svg className="w-4 h-4 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                          </svg>
                        </span>
                      </div>
                    </div>
                  </Link>
                ) : (
                  <div>
                    <LinkStripeAccount />
                  </div>
                )}

                {/* Hacklytics Coming Soon */}
                <div className="relative h-full p-6 bg-white/[0.02] border border-yellow-500/10 rounded-2xl">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="w-2 h-2 rounded-full bg-yellow-500 animate-pulse" />
                    <p className="text-xs uppercase tracking-widest text-yellow-500 font-semibold">Coming Soon</p>
                  </div>
                  <h3 className="text-xl font-bold text-white mb-2">Hacklytics</h3>
                  <p className="text-gray-500 text-sm">
                    Hackathon portal under construction.
                  </p>
                </div>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}