'use client';

import React, { useState, useEffect } from 'react';
import { trpc } from '../lib/trpc';
import Link from "next/link";

export default function Home() {
  const { mutate, data, isPending } = trpc.hello.sayHello.useMutation();
  const [logs, setLogs] = useState<string[]>(["Initializing terminal...", "Waiting for user input..."]);

  const handleClick = () => {
    setLogs(prev => [...prev.slice(-4), "> Executing: sayHello.mutate()"]);
    mutate(undefined, {
      onSuccess: () => setLogs(prev => [...prev.slice(-4), "> Success: Response received"]),
      onError: () => setLogs(prev => [...prev.slice(-4), "> Error: Connection failed"])
    });
  };

  return (
    <div className="relative min-h-screen bg-[#050505] text-gray-400 font-sans selection:bg-indigo-500/30 overflow-hidden flex items-center justify-center">

      {/* BACKGROUND EFFECTS */}
      <div className="absolute inset-0 z-0">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(79,70,229,0.05)_0%,transparent_70%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:40px_40px] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)]" />
      </div>

      <main className="relative z-10 max-w-7xl mx-auto px-6 lg:px-12 w-full grid grid-cols-1 lg:grid-cols-2 gap-20 items-center">

        {/* LEFT SIDE: COMMAND & CONTROL */}
        <div className="space-y-12">
          <div className="space-y-6">
            <div className="flex items-center gap-4">
               <div className="h-px w-12 bg-indigo-500/30" />
               <span className="text-xs font-mono text-gray-500 uppercase tracking-[0.4em]">Query Engine // V.1</span>
            </div>

            <h1 className="text-7xl lg:text-9xl font-black text-white leading-[0.8] tracking-tighter uppercase">
              Query <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-indigo-800 italic">
                DSGT.
              </span>
            </h1>

            <div className="max-w-md space-y-4">
               <p className="text-sm text-gray-500 leading-relaxed border-l-2 border-indigo-500/20 pl-4 italic font-medium">
                The collective intelligence of Georgia Tech's largest data science community. Authenticate below.
               </p>

               {/* TERMINAL OUTPUT BOX */}
               <div className="bg-black/60 backdrop-blur-md border border-white/5 p-5 rounded-lg font-mono text-[11px] leading-relaxed shadow-2xl relative overflow-hidden group">
                  <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-indigo-500/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                  {logs.map((log, i) => (
                    <p key={i} className={i === logs.length - 1 ? "text-indigo-400" : "text-gray-600"}>
                      {log}
                    </p>
                  ))}
                  {isPending && <p className="text-indigo-400 animate-pulse">{'>'} Awaiting server response...</p>}
                  {data && (
                    <div className="mt-4 p-3 rounded bg-indigo-500/5 border border-indigo-500/20 animate-in fade-in zoom-in-95 duration-300">
                      <p className="text-[9px] uppercase tracking-widest text-indigo-500/50 mb-1">Incoming Stream</p>
                      <p className="text-indigo-200 text-xs">"{data.message}"</p>
                    </div>
                  )}
               </div>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-center gap-6">
            <button
              onClick={handleClick}
              disabled={isPending}
              className="w-full sm:w-auto px-12 py-5 bg-white text-black font-black text-[11px] uppercase tracking-[0.2em] rounded-sm hover:bg-indigo-400 transition-all active:scale-95 disabled:opacity-30 shadow-[0_0_30px_rgba(255,255,255,0.05)]"
            >
              {isPending ? 'Executing...' : 'Execute Query'}
            </button>
          </div>
        </div>

        {/* RIGHT SIDE: THE CORE */}
        <div className="hidden lg:flex flex-col items-center justify-center relative">
          <div className="absolute w-[500px] h-[500px] bg-indigo-600/10 blur-[120px] rounded-full animate-pulse" />

          <div className="relative group">
            {/* Rotating border effect */}
            <div className="absolute -inset-4 border border-white/5 rounded-full animate-[spin_20s_linear_infinite]" />
            <div className="absolute -inset-8 border border-white/5 rounded-full animate-[spin_35s_linear_infinite_reverse] opacity-50" />

            <div className="relative z-10 p-8">
              <img
                src="/images/dsgt/apple-touch-icon.png"
                alt="DSGT Core"
                className="w-72 h-72 object-contain drop-shadow-[0_0_50px_rgba(99,102,241,0.3)] transition-all duration-700 group-hover:scale-105"
              />
            </div>

            {/* Visual HUD Metadata */}
            <div className="absolute -bottom-16 left-1/2 -translate-x-1/2 w-full text-center space-y-3">
               <p className="text-[10px] font-mono text-indigo-500/50 uppercase tracking-[0.5em] animate-pulse">Core Operational</p>
               <div className="flex justify-center gap-6 text-[8px] font-mono text-gray-700">
                  <span className="flex items-center gap-1"><div className="w-1 h-1 bg-indigo-500 rounded-full" /> LATENCY: 24MS</span>
                  <span className="flex items-center gap-1"><div className="w-1 h-1 bg-indigo-500 rounded-full" /> ENCRYPT: AES-256</span>
                  <span className="flex items-center gap-1"><div className="w-1 h-1 bg-indigo-500 rounded-full" /> LOAD: 0.04%</span>
               </div>
            </div>
          </div>
        </div>
      </main>

      {/* FOOTER BAR */}
      <footer className="absolute bottom-8 left-12 right-12 flex justify-between items-center opacity-20 pointer-events-none">
        <div className="text-[9px] font-mono uppercase tracking-[0.4em]">Internal Terminal // Query Engine</div>
        <div className="text-[9px] font-mono uppercase tracking-[0.4em]">Access Node: 0812-ATL</div>
      </footer>
    </div>
  );
}