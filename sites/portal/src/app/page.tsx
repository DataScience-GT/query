'use client';

import React from 'react';
import { trpc } from '../lib/trpc';

export default function Home() {
  const { mutate, data, isPending } = trpc.hello.sayHello.useMutation();

  const handleClick = () => {
    mutate();
  };

  return (
    <div className="min-h-screen bg-slate-950 relative overflow-hidden">
      {/* Grid background pattern */}
      <div className="absolute inset-0 bg-[linear-gradient(rgba(59,130,246,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(59,130,246,0.03)_1px,transparent_1px)] bg-[size:50px_50px]"></div>

      {/* Header */}
      <header className="relative z-10 px-6 py-6">
        <div className="max-w-7xl mx-auto flex items-center gap-3">
          <img
            src="/images/dsgt/apple-touch-icon.png"
            alt="DSGT Logo"
            className="w-12 h-12 rounded-lg"
          />
          <span className="text-white text-3xl font-bold">DSGT</span>
        </div>
      </header>

      {/* Main Content */}
      <main className="relative z-10">
        <div className="max-w-7xl mx-auto px-6 py-12 lg:py-20">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-center">

            {/* Left Side - Text Content */}
            <div className="space-y-8">
              <div className="space-y-6">
                <h1 className="text-5xl lg:text-6xl font-bold text-white leading-tight">
                  Query the world of{' '}
                  <span className="text-blue-400">
                    DSGT possibilities.
                  </span>
                </h1>

                {isPending ? (
                  <div className="text-gray-400 text-lg flex items-center gap-2">
                    <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce"></div>
                    <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce [animation-delay:100ms]"></div>
                    <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce [animation-delay:200ms]"></div>
                    <span className="ml-2">Loading...</span>
                  </div>
                ) : data ? (
                  <p className="text-gray-400 text-lg leading-relaxed">
                    {data.message}
                  </p>
                ) : (
                  <p className="text-gray-400 text-lg leading-relaxed">
                    Your all-in-one hub for DSGT events, resources, and community connections. Explore, engage, and elevate your{' '}
                    <span className="text-white font-semibold">tech journey</span>.
                  </p>
                )}
              </div>

              <div>
                <button
                  onClick={handleClick}
                  disabled={isPending}
                  className="px-8 py-4 bg-purple-600 disabled:bg-purple-800 text-white font-semibold rounded-lg"
                >
                  {isPending ? 'Loading...' : data ? 'Reload' : 'Get Started'}
                </button>
              </div>
            </div>

            {/* Right Side - Hero Image */}
            <div className="flex items-center justify-center">
              <div className="relative w-full max-w-md lg:max-w-lg">
                {/* Blue circle background */}
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-80 h-80 lg:w-96 lg:h-96 bg-blue-600/30 rounded-full blur-3xl"></div>

                {/* DSGT logo image */}
                <img
                  src="/images/dsgt/apple-touch-icon.png"
                  alt="DSGT"
                  className="relative z-10 w-full h-auto object-contain drop-shadow-2xl"
                  style={{ imageRendering: 'crisp-edges' }}
                  loading="eager"
                />
              </div>
            </div>

          </div>
        </div>
      </main>
    </div>
  );
}