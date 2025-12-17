'use client';

import { trpc } from '../lib/trpc';

export default function Home() {
  const { mutate, data, isPending } = trpc.hello.sayHello.useMutation();

  const handleClick = () => {
    mutate();
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-purple-600 via-indigo-500 to-blue-400 p-6">
      <div className="bg-white/90 backdrop-blur-md shadow-2xl rounded-2xl p-10 max-w-lg w-full text-center animate-fadeIn">
        <h1 className="text-4xl font-extrabold text-gray-800 mb-6">
          Welcome to the Portal
        </h1>

        {isPending ? (
          <div className="text-gray-500 animate-pulse text-lg">Loading...</div>
        ) : data ? (
          <p className="text-gray-700 text-lg mb-6">{data.message}</p>
        ) : (
          <p className="text-gray-500 text-lg mb-6">Click the button to load the message</p>
        )}

        <button
          onClick={handleClick}
          disabled={isPending}
          className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white font-semibold py-3 px-6 rounded-lg shadow-md transition duration-300"
        >
          {isPending ? 'Loading...' : data ? 'Reload' : 'Get Started'}
        </button>
      </div>

      <p className="mt-6 text-white/80 text-sm">
        Powered by TRPC & Next.js
      </p>
    </div>
  );
}