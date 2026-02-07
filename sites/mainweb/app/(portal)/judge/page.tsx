'use client';

import { useState, useEffect } from 'react';
import { useSession, signOut } from 'next-auth/react';
import { trpc } from '@/lib/trpc';
import { useRouter } from 'next/navigation';
import { LiquidGlass } from '@/components/portal/LiquidGlass';
import { LoadingScreen } from '@/components/portal/LoadingScreen';
import { StatusScreen } from '@/components/portal/StatusScreen';
import { RubricSlider } from '@/components/portal/judge/RubricSlider';

// Rubric criteria definitions
const RUBRIC_CRITERIA = [
  {
    key: 'creativity',
    label: 'Creativity',
    description: 'Unique approach & originality',
  },
  {
    key: 'impact',
    label: 'Impact',
    description: 'Benefits to society',
  },
  {
    key: 'scope',
    label: 'Technical Depth',
    description: 'Variety of tools & data',
  },
  {
    key: 'clarity',
    label: 'Clarity',
    description: 'Clear presentation',
  },
  {
    key: 'soundness',
    label: 'Soundness',
    description: 'Logical conclusions',
  },
] as const;

type RubricScores = {
  creativity: number;
  impact: number;
  scope: number;
  clarity: number;
  soundness: number;
};

type JudgingStep = 'viewing' | 'judging';

export default function JudgePage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [step, setStep] = useState<JudgingStep>('viewing');
  const [scores, setScores] = useState<RubricScores>({
    creativity: 5,
    impact: 5,
    scope: 5,
    clarity: 5,
    soundness: 5,
  });
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
      setScores({ creativity: 5, impact: 5, scope: 5, clarity: 5, soundness: 5 });
      setComment('');
      setStep('viewing');
      refetch();
      refetchProgress();
    },
  });

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/login');
  }, [status, router]);

  const totalScore = scores.creativity + scores.impact + scores.scope + scores.clarity + scores.soundness;

  const handleSubmit = () => {
    if (!nextTable?.queueId || !nextTable?.project) return;
    submit.mutate({
      queueId: nextTable.queueId,
      projectId: nextTable.project.id,
      scoreCreativity: scores.creativity,
      scoreImpact: scores.impact,
      scoreScope: scores.scope,
      scoreClarity: scores.clarity,
      scoreSoundness: scores.soundness,
      comment: comment || undefined,
    });
  };

  const updateScore = (key: keyof RubricScores, value: number) => {
    setScores(prev => ({ ...prev, [key]: value }));
  };

  if (!mounted || status === 'loading' || checkingJudge) {
    return <LoadingScreen message="Loading..." />;
  }

  if (!session) return null;

  if (!judgeStatus?.isJudge) {
    return (
      <StatusScreen
        variant="denied"
        title="Not a Judge"
        message="You're not registered as a judge."
        onAction={() => signOut({ callbackUrl: '/login' })}
        actionLabel="Sign Out"
        actionVariant="danger"
      />
    );
  }

  if (!hackathonId) {
    return (
      <StatusScreen
        variant="waiting"
        title="No Assignment"
        message="Please wait for event assignment."
        onAction={() => signOut({ callbackUrl: '/login' })}
        actionLabel="Sign Out"
        actionVariant="default"
      />
    );
  }

  const project = nextTable?.project;
  const isDone = nextTable?.done;

  if (isDone) {
    return (
      <StatusScreen
        variant="success"
        title="All Done!"
        message="You've judged all projects. Thank you!"
        onAction={() => signOut({ callbackUrl: '/login' })}
        actionLabel="Sign Out"
        actionVariant="primary"
      />
    );
  }

  if (loadingNext || !project) {
    return <LoadingScreen message="Loading..." />;
  }

  // Step 1: Viewing - Show table number
  if (step === 'viewing') {
    return (
      <div className="min-h-screen min-h-[100dvh] bg-[#050505] flex flex-col">
        {/* Progress bar */}
        <div className="h-1 bg-white/5">
          <div
            className="h-full bg-[#00A8A8] transition-all"
            style={{ width: `${progress?.percentage || 0}%` }}
          />
        </div>

        <main className="flex-1 flex flex-col items-center justify-center px-6 py-8 safe-area-inset">
          {/* Progress text */}
          <p className="text-gray-500 text-sm font-mono mb-6">
            {((progress?.completed || 0) + 1)} of {progress?.total}
          </p>

          {/* Large Table Number */}
          <div className="text-center mb-8">
            <p className="text-xs text-gray-500 uppercase tracking-widest font-mono mb-2">Go to Table</p>
            <p className="text-[140px] font-black text-white leading-none tracking-tighter">
              {project.tableNumber}
            </p>
          </div>

          {/* Project Name */}
          <div className="text-center mb-12">
            <p className="text-lg font-semibold text-white mb-1">{project.name}</p>
            {project.teamMembers && (
              <p className="text-gray-500 text-sm">{project.teamMembers}</p>
            )}
          </div>

          {/* Start Button - Big touch target */}
          <button
            onClick={() => setStep('judging')}
            className="w-full max-w-xs px-8 py-5 bg-[#00A8A8] text-black font-black text-lg uppercase tracking-wide rounded-2xl active:scale-[0.98] transition-transform"
          >
            Start Judging
          </button>

          <button
            onClick={() => signOut({ callbackUrl: '/login' })}
            className="mt-8 text-gray-600 text-xs font-mono py-3 uppercase tracking-widest"
          >
            Sign Out
          </button>
        </main>
      </div>
    );
  }

  // Step 2: Judging - Scoring interface
  return (
    <div className="min-h-screen min-h-[100dvh] bg-[#050505] flex flex-col">
      {/* Progress bar */}
      <div className="h-1 bg-white/5 sticky top-0 z-20">
        <div
          className="h-full bg-[#00A8A8] transition-all"
          style={{ width: `${progress?.percentage || 0}%` }}
        />
      </div>

      {/* Header - Sticky */}
      <header className="sticky top-1 z-10 bg-[#050505]/95 backdrop-blur-md border-b border-white/5 px-4 py-3">
        <div className="flex items-center justify-between">
          <button
            onClick={() => setStep('viewing')}
            className="flex items-center gap-1 text-gray-400 py-2 pr-4 -ml-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            <span className="text-sm">Back</span>
          </button>

          <div className="flex items-center gap-4">
            <div className="text-right">
              <p className="text-[10px] text-gray-500 uppercase tracking-wide">Table</p>
              <p className="text-2xl font-black text-white leading-none">{project.tableNumber}</p>
            </div>
            <div className="text-right">
              <p className="text-[10px] text-gray-500 uppercase tracking-wide">Score</p>
              <p className="text-2xl font-black text-[#00A8A8] leading-none">{totalScore}</p>
            </div>
          </div>
        </div>
      </header>

      {/* Scrollable Content */}
      <main className="flex-1 overflow-y-auto px-4 py-4 pb-[env(safe-area-inset-bottom)]">
        {/* Project Info */}
        <div className="mb-6">
          <h1 className="text-lg font-bold text-white">{project.name}</h1>
          {project.teamMembers && (
            <p className="text-gray-500 text-sm">{project.teamMembers}</p>
          )}
        </div>

        {/* Rubric Scoring */}
        <div className="space-y-6 mb-6">
          {RUBRIC_CRITERIA.map((criterion) => (
            <RubricSlider
              key={criterion.key}
              label={criterion.label}
              description={criterion.description}
              value={scores[criterion.key]}
              onChange={(value) => updateScore(criterion.key, value)}
            />
          ))}
        </div>

        {/* Comment */}
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="Notes (optional)..."
          className="w-full bg-white/5 border border-white/10 rounded-xl p-4 text-white placeholder-gray-600 resize-none min-h-[80px] text-sm focus:border-[#00A8A8]/50 focus:outline-none mb-6"
        />

        {/* Submit Button */}
        <button
          onClick={handleSubmit}
          disabled={submit.isPending}
          className="w-full px-8 py-5 bg-[#00A8A8] text-black font-black text-lg uppercase tracking-wide rounded-2xl active:scale-[0.98] transition-transform disabled:opacity-50 mb-4"
        >
          {submit.isPending ? 'Submitting...' : 'Submit & Next'}
        </button>

        <button
          onClick={() => signOut({ callbackUrl: '/login' })}
          className="w-full text-gray-600 text-xs font-mono py-3 uppercase tracking-widest text-center"
        >
          Sign Out
        </button>
      </main>
    </div>
  );
}
