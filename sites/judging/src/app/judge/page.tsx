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
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
        <div className="text-gray-500">Loading...</div>
      </div>
    );
  }

  if (!session) return null;

  // Not a judge
  if (!judgeStatus?.isJudge) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex flex-col items-center justify-center px-6 text-center">
        <div className="w-12 h-12 rounded-full bg-red-500/10 flex items-center justify-center mb-4">
          <svg className="w-6 h-6 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </div>
        <h1 className="text-xl font-semibold text-white mb-2">Not Authorized</h1>
        <p className="text-gray-500 mb-6">You're not registered as a judge.</p>
        <button onClick={() => signOut({ callbackUrl: '/' })} className="text-gray-400 underline">
          Sign out
        </button>
      </div>
    );
  }

  // No hackathon
  if (!hackathonId) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex flex-col items-center justify-center px-6 text-center">
        <div className="w-12 h-12 rounded-full bg-yellow-500/10 flex items-center justify-center mb-4">
          <svg className="w-6 h-6 text-yellow-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <h1 className="text-xl font-semibold text-white mb-2">No Event Assigned</h1>
        <p className="text-gray-500 mb-6">Please wait for assignment.</p>
        <button onClick={() => signOut({ callbackUrl: '/' })} className="text-gray-400 underline">
          Sign out
        </button>
      </div>
    );
  }

  const project = nextTable?.project;
  const isDone = nextTable?.done;

  // All done
  if (isDone) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex flex-col items-center justify-center px-6 text-center">
        <div className="w-16 h-16 rounded-full bg-green-500/10 flex items-center justify-center mb-6">
          <svg className="w-8 h-8 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h1 className="text-2xl font-bold text-white mb-2">All Done!</h1>
        <p className="text-gray-500 mb-8">Thanks for judging.</p>
        <button
          onClick={() => signOut({ callbackUrl: '/' })}
          className="bg-white text-black font-semibold py-3 px-8 rounded-xl"
        >
          Exit
        </button>
      </div>
    );
  }

  // Loading next
  if (loadingNext || !project) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
        <div className="text-gray-500">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] flex flex-col">
      {/* Progress */}
      <div className="h-1 bg-gray-800">
        <div
          className="h-full bg-white transition-all duration-300"
          style={{ width: `${progress?.percentage || 0}%` }}
        />
      </div>

      {/* Content */}
      <main className="flex-1 flex flex-col px-5 py-6 max-w-lg mx-auto w-full">
        {/* Table number */}
        <div className="text-center py-8">
          <p className="text-gray-500 text-sm uppercase tracking-wide mb-2">Table</p>
          <p className="text-8xl font-black text-white leading-none">{project.tableNumber}</p>
          <p className="text-gray-600 text-sm mt-3">
            {progress?.completed}/{progress?.total}
          </p>
        </div>

        {/* Project info */}
        <div className="bg-gray-900/50 rounded-2xl p-5 mb-5">
          <h2 className="text-lg font-semibold text-white mb-1">{project.name}</h2>
          {project.teamMembers && (
            <p className="text-gray-400 text-sm">{project.teamMembers}</p>
          )}
        </div>

        {/* Score selector */}
        <div className="bg-gray-900/50 rounded-2xl p-5 mb-5">
          <div className="flex items-center justify-between mb-4">
            <span className="text-gray-400 text-sm">Score</span>
            <span className="text-3xl font-bold text-white">{score}</span>
          </div>

          {/* Score buttons */}
          <div className="grid grid-cols-5 gap-2">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
              <button
                key={n}
                onClick={() => setScore(n)}
                className={`py-3 rounded-xl font-semibold transition-all ${
                  score === n
                    ? 'bg-white text-black'
                    : 'bg-gray-800 text-gray-400 active:bg-gray-700'
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
          placeholder="Add a note (optional)"
          className="bg-gray-900/50 rounded-2xl p-4 text-white placeholder-gray-600 resize-none mb-5 min-h-[80px]"
        />

        {/* Submit */}
        <button
          onClick={handleSubmit}
          disabled={submit.isPending}
          className="mt-auto bg-white text-black font-semibold py-4 rounded-2xl active:scale-[0.98] transition-transform disabled:opacity-50"
        >
          {submit.isPending ? 'Saving...' : 'Next Project'}
        </button>

        {/* Sign out link */}
        <button
          onClick={() => signOut({ callbackUrl: '/' })}
          className="text-gray-600 text-sm py-4"
        >
          Sign out
        </button>
      </main>
    </div>
  );
}
