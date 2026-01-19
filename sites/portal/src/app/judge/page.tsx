'use client';

import { useState, useEffect } from 'react';
import { useSession, signOut } from 'next-auth/react';
import { trpc } from '@/lib/trpc';
import { useRouter } from 'next/navigation';

export default function JudgePage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [score, setScore] = useState(5);
  const [comment, setComment] = useState('');

  const { data: judgeStatus, isLoading: checkingJudge } = trpc.judge.isJudge.useQuery(undefined, {
    enabled: !!session,
  });

  const { data: assignments } = trpc.judge.getMyAssignments.useQuery(undefined, {
    enabled: !!session && !!judgeStatus?.isJudge,
  });

  const hackathonId = assignments?.[0]?.hackathon?.id;

  const { data: nextTable, isLoading: loadingNext, refetch } = trpc.judge.getNextTable.useQuery(
    { hackathonId: hackathonId! },
    { enabled: !!hackathonId }
  );

  const { data: progress, refetch: refetchProgress } = trpc.judge.getProgress.useQuery(
    { hackathonId: hackathonId! },
    { enabled: !!hackathonId }
  );

  const submit = trpc.judge.completeAndNext.useMutation({
    onSuccess: () => {
      setScore(5);
      setComment('');
      refetch();
      refetchProgress();
    },
  });

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/');
  }, [status, router]);

  const handleSubmit = () => {
    if (!nextTable?.queueId || !nextTable?.project) return;
    submit.mutate({
      queueId: nextTable.queueId,
      projectId: nextTable.project.id,
      score,
      comment: comment || undefined,
    });
  };

  // Loading states
  if (!mounted || status === 'loading' || checkingJudge) {
    return (
      <div className="min-h-screen bg-[#050505] flex items-center justify-center font-mono text-[#00A8A8] animate-pulse uppercase tracking-[0.5em]">
        Syncing_Identity...
      </div>
    );
  }

  if (!session) return null;

  // Not a judge
  if (!judgeStatus?.isJudge) {
    return (
      <div className="min-h-screen bg-[#050505] flex flex-col items-center justify-center px-6 text-center">
        <div className="w-16 h-16 rounded-full bg-red-500/10 border border-red-500/30 flex items-center justify-center mb-6">
          <svg className="w-8 h-8 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </div>
        <h1 className="text-2xl font-black text-white uppercase tracking-tight mb-2">Access_Denied</h1>
        <p className="text-gray-500 font-mono text-sm mb-8">You're not registered as a judge.</p>
        <button
          onClick={() => signOut({ callbackUrl: '/' })}
          className="px-8 py-3 border border-red-500/20 text-red-500 font-mono text-[10px] uppercase tracking-[0.3em] hover:bg-red-500/10 transition-all"
        >
          Terminate_Session
        </button>
      </div>
    );
  }

  // No hackathon
  if (!hackathonId) {
    return (
      <div className="min-h-screen bg-[#050505] flex flex-col items-center justify-center px-6 text-center">
        <div className="w-16 h-16 rounded-full bg-yellow-500/10 border border-yellow-500/30 flex items-center justify-center mb-6">
          <svg className="w-8 h-8 text-yellow-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <h1 className="text-2xl font-black text-white uppercase tracking-tight mb-2">Awaiting_Assignment</h1>
        <p className="text-gray-500 font-mono text-sm mb-8">Please wait for event assignment.</p>
        <button
          onClick={() => signOut({ callbackUrl: '/' })}
          className="px-8 py-3 border border-white/10 text-gray-400 font-mono text-[10px] uppercase tracking-[0.3em] hover:bg-white/5 transition-all"
        >
          Terminate_Session
        </button>
      </div>
    );
  }

  const project = nextTable?.project;
  const isDone = nextTable?.done;

  // All done
  if (isDone) {
    return (
      <div className="min-h-screen bg-[#050505] flex flex-col items-center justify-center px-6 text-center">
        <div className="w-20 h-20 rounded-full bg-[#00A8A8]/10 border border-[#00A8A8]/30 flex items-center justify-center mb-8 shadow-[0_0_40px_rgba(0,168,168,0.2)]">
          <svg className="w-10 h-10 text-[#00A8A8]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h1 className="text-4xl font-black text-white uppercase tracking-tighter mb-2">
          Mission<br />
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#00A8A8] to-[#005a5a] italic">Complete</span>
        </h1>
        <p className="text-gray-500 font-mono text-sm mb-10">All projects evaluated. Thank you for judging.</p>
        <button
          onClick={() => signOut({ callbackUrl: '/' })}
          className="px-12 py-5 bg-white text-black font-black text-[11px] uppercase tracking-[0.2em] rounded-sm hover:bg-[#00A8A8] hover:text-white transition-all active:scale-95 shadow-[0_0_30px_rgba(0,168,168,0.1)]"
        >
          Exit_Terminal
        </button>
      </div>
    );
  }

  // Loading next
  if (loadingNext || !project) {
    return (
      <div className="min-h-screen bg-[#050505] flex items-center justify-center font-mono text-[#00A8A8] animate-pulse uppercase tracking-[0.5em]">
        Loading_Project...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#050505] flex flex-col selection:bg-[#00A8A8]/30">
      {/* Background */}
      <div className="fixed inset-0 z-0 pointer-events-none">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(0,168,168,0.03)_0%,transparent_70%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808008_1px,transparent_1px),linear-gradient(to_bottom,#80808008_1px,transparent_1px)] bg-[size:40px_40px]" />
      </div>

      {/* Progress bar */}
      <div className="h-1 bg-white/5 relative z-10">
        <div
          className="h-full bg-gradient-to-r from-[#00A8A8] to-[#005a5a] transition-all duration-500 shadow-[0_0_10px_rgba(0,168,168,0.5)]"
          style={{ width: `${progress?.percentage || 0}%` }}
        />
      </div>

      {/* Content */}
      <main className="flex-1 flex flex-col px-5 py-6 max-w-lg mx-auto w-full relative z-10">
        {/* Table number display */}
        <div className="text-center py-8">
          <p className="text-[10px] text-gray-500 uppercase tracking-[0.4em] font-mono mb-4">Current_Table</p>
          <div className="relative inline-block">
            <div className="absolute inset-0 bg-[#00A8A8]/10 blur-[50px] rounded-full" />
            <p className="relative text-9xl font-black text-white leading-none tracking-tighter drop-shadow-[0_0_30px_rgba(0,168,168,0.3)]">
              {project.tableNumber}
            </p>
          </div>
          <p className="text-gray-600 text-[10px] font-mono mt-4 uppercase tracking-widest">
            {progress?.completed}/{progress?.total} Evaluated
          </p>
        </div>

        {/* Project info card */}
        <div className="bg-black/60 backdrop-blur-md border border-white/5 rounded-lg p-5 mb-5 relative overflow-hidden group">
          <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-[#00A8A8]/30 to-transparent" />
          <p className="text-[9px] text-gray-500 uppercase tracking-[0.3em] font-mono mb-2">Project_Name</p>
          <h2 className="text-lg font-bold text-white mb-1">{project.name}</h2>
          {project.teamMembers && (
            <p className="text-gray-500 text-sm font-mono">{project.teamMembers}</p>
          )}
        </div>

        {/* Score selector */}
        <div className="bg-black/60 backdrop-blur-md border border-white/5 rounded-lg p-5 mb-5">
          <div className="flex items-center justify-between mb-4">
            <span className="text-[9px] text-gray-500 uppercase tracking-[0.3em] font-mono">Score_Value</span>
            <span className="text-4xl font-black text-[#00A8A8] drop-shadow-[0_0_10px_rgba(0,168,168,0.5)]">{score}</span>
          </div>

          {/* Score buttons */}
          <div className="grid grid-cols-5 gap-2">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
              <button
                key={n}
                onClick={() => setScore(n)}
                className={`py-3 rounded font-mono font-bold text-sm transition-all ${
                  score === n
                    ? 'bg-[#00A8A8] text-white shadow-[0_0_20px_rgba(0,168,168,0.4)]'
                    : 'bg-white/5 text-gray-400 border border-white/10 hover:bg-white/10 active:scale-95'
                }`}
              >
                {n}
              </button>
            ))}
          </div>
        </div>

        {/* Comment */}
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="Add evaluation notes (optional)..."
          className="bg-black/60 backdrop-blur-md border border-white/5 rounded-lg p-4 text-white placeholder-gray-600 resize-none mb-5 min-h-[80px] font-mono text-sm focus:border-[#00A8A8]/30 focus:outline-none transition-colors"
        />

        {/* Submit button */}
        <button
          onClick={handleSubmit}
          disabled={submit.isPending}
          className="mt-auto px-12 py-5 bg-white text-black font-black text-[11px] uppercase tracking-[0.2em] rounded-sm hover:bg-[#00A8A8] hover:text-white transition-all active:scale-95 disabled:opacity-30 shadow-[0_0_30px_rgba(0,168,168,0.1)]"
        >
          {submit.isPending ? 'Processing...' : 'Submit_&_Next'}
        </button>

        {/* Sign out link */}
        <button
          onClick={() => signOut({ callbackUrl: '/' })}
          className="text-gray-600 text-[10px] font-mono py-4 uppercase tracking-[0.3em] hover:text-[#00A8A8] transition-colors"
        >
          Terminate_Session
        </button>
      </main>
    </div>
  );
}
