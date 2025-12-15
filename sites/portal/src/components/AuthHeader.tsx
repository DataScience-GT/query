"use client";
import React from "react";
import { useSession } from "@query/auth/hooks";

export default function AuthHeader() {
  const { data: user } = useSession();

  return (
    <div className="w-full bg-white border-b border-gray-200">
      <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
        <div className="text-lg font-bold">Portal</div>
        <div>
          {user ? (
            <div className="flex items-center space-x-3">
              <img src={user.image} alt={user.name} className="w-8 h-8 rounded-full" />
              <span className="font-medium">{user.name}</span>
              <button
                className="ml-2 px-3 py-1 bg-red-600 text-white rounded"
                onClick={async () => {
                  await fetch('/api/auth/logout', { method: 'POST' });
                  // optimistic update: refetch handled by react-query's invalidation if set up
                  window.location.reload();
                }}
              >
                Logout
              </button>
            </div>
          ) : (
            <a
              href="/api/auth/google/start"
              className="px-3 py-1 bg-blue-600 text-white rounded"
            >
              Sign in with Google
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
