 'use client';

import { trpc } from '@/utils/trpc';
import { useEffect, useState } from 'react';
import { useSession } from '@query/auth/hooks';

export default function PortalHome() {
  const { data, isLoading } = trpc.portal.getDashboard.useQuery();
  const utils = trpc.useContext();
  const updateProfile = trpc.portal.updateProfile.useMutation({
    onSuccess: () => {
      utils.portal.getDashboard.invalidate();
    },
  });
  const { data: me } = useSession();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-xl">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-4xl font-bold text-gray-900 mb-8">
          Portal Dashboard
        </h1>

        {data && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
              <h3 className="text-sm font-medium text-gray-500 mb-2">Users</h3>
              <p className="text-3xl font-bold text-gray-900">{data.stats.users}</p>
            </div>

            <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
              <h3 className="text-sm font-medium text-gray-500 mb-2">Revenue</h3>
              <p className="text-3xl font-bold text-gray-900">${data.stats.revenue}</p>
            </div>

            <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
              <h3 className="text-sm font-medium text-gray-500 mb-2">Growth</h3>
              <p className="text-3xl font-bold text-gray-900">{data.stats.growth}%</p>
            </div>
          </div>
        )}

        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
          <h2 className="text-xl font-semibold mb-4">Authentication</h2>
          {me ? (
            <div>
              <p className="mb-2">Signed in as <strong>{me.email}</strong></p>
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  await updateProfile.mutateAsync({ name: me.name ?? '', email: me.email });
                }}
              >
                <button type="submit" className="px-4 py-2 bg-indigo-600 text-white rounded-md mr-2">Update profile</button>
                <button
                  type="button"
                  className="px-4 py-2 bg-red-600 text-white rounded-md"
                  onClick={async () => {
                    await fetch('/api/auth/logout', { method: 'POST' });
                    window.location.reload();
                  }}
                >
                  Sign out
                </button>
              </form>
            </div>
          ) : (
            <a
              href="/api/auth/google/start"
              className="px-4 py-2 bg-blue-600 text-white rounded-md inline-block"
            >
              Sign in with Google
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
