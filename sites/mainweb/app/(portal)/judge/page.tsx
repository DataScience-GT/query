'use client';

import { useState, useEffect } from 'react';
import { useSession, signOut } from 'next-auth/react';
import { trpc } from '@/lib/trpc';
import { useRouter } from 'next/navigation';
import { LiquidGlass } from '@/components/portal/LiquidGlass';
import { LoadingScreen } from '@/components/portal/LoadingScreen';
import { StatusScreen } from '@/components/portal/StatusScreen';
import { ProgressBar } from '@/components/portal/ProgressBar';
import { RubricSlider, RubricSliderStyles } from '@/components/portal/judge/RubricSlider';

// Rubric criteria definitions
const RUBRIC_CRITERIA = [
  {
    key: 'creativity',
    label: 'Creativity & Originality',
    description: 'Unique approach to data analysis and/or solution development',
  },
  {
    key: 'impact',
    label: 'Impact & Relevance',
    description: 'Benefits to society, alignment with competition goals',
  },
  {
    key: 'scope',
    label: 'Scope & Technical Depth',
    description: 'Variety of data/tools, appropriate usage in analysis',
  },
  {
    key: 'clarity',
    label: 'Clarity & Engagement',
    description: 'Clear description, engaging video pitch presentation',
  },
  {
    key: 'soundness',
    label: 'Soundness & Accuracy',
    description: 'Consistent techniques, logical conclusions from analysis',
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
  const [expandedCriteria, setExpandedCriteria] = useState<string | null>(null);

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
      setExpandedCriteria(null);
      setStep('viewing'); // Reset to viewing step for next project
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
    return <LoadingScreen message="Syncing Identity..." />;
  }

  if (!session) return null;

  if (!judgeStatus?.isJudge) {
    return (
      <StatusScreen
        variant="denied"
        title="Access Denied"
        message="You're not registered as a judge."
        onAction={() => signOut({ callbackUrl: '/login' })}
        actionLabel="Terminate Session"
        actionVariant="danger"
      />
    );
  }

  if (!hackathonId) {
    return (
      <StatusScreen
        variant="waiting"
        title="Awaiting Assignment"
        message="Please wait for event assignment."
        onAction={() => signOut({ callbackUrl: '/login' })}
        actionLabel="Terminate Session"
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
        title="Mission Complete"
        message="All projects evaluated. Thank you for judging."
        onAction={() => signOut({ callbackUrl: '/login' })}
        actionLabel="Exit Terminal"
        actionVariant="primary"
      />
    );
  }

  if (loadingNext || !project) {
    return <LoadingScreen message="Loading Project..." />;
  }

  // Step 1: Viewing - Show table number with Start Judging button
  if (step === 'viewing') {
    return (
      <div className="min-h-screen bg-[#050505] flex flex-col selection:bg-[#00A8A8]/30">
        <div className="fixed inset-0 z-0 pointer-events-none">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(0,168,168,0.03)_0%,transparent_70%)]" />
          <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808008_1px,transparent_1px),linear-gradient(to_bottom,#80808008_1px,transparent_1px)] bg-[size:40px_40px]" />
        </div>

        <ProgressBar percentage={progress?.percentage || 0} className="relative z-10" />

        <main className="flex-1 flex flex-col items-center justify-center px-6 py-8 relative z-10">
          {/* Progress indicator */}
          <p className="text-gray-500 text-xs font-mono uppercase tracking-widest mb-8">
            {((progress?.completed || 0) + 1)} of {progress?.total}
          </p>

          {/* Large Table Number */}
          <div className="text-center mb-8">
            <p className="text-[10px] text-gray-500 uppercase tracking-[0.5em] font-mono mb-4">Go to Table</p>
            <div className="relative inline-block">
              <div className="absolute inset-0 bg-[#00A8A8]/15 blur-[60px] rounded-full scale-150" />
              <p className="relative text-[120px] sm:text-[160px] font-black text-white leading-none tracking-tighter drop-shadow-[0_0_40px_rgba(0,168,168,0.4)]">
                {project.tableNumber}
              </p>
            </div>
          </div>

          {/* Project Preview */}
          <LiquidGlass className="w-full max-w-sm p-5 rounded-2xl shadow-2xl relative overflow-hidden mb-8">
            <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-[#00A8A8]/30 to-transparent" />
            <p className="text-[9px] text-gray-500 uppercase tracking-[0.3em] font-mono mb-2">Project</p>
            <h2 className="text-lg font-bold text-white mb-1">{project.name}</h2>
            {project.teamMembers && (
              <p className="text-gray-500 text-sm font-mono">{project.teamMembers}</p>
            )}
          </LiquidGlass>

          {/* Start Judging Button - Large touch target */}
          <button
            onClick={() => setStep('judging')}
            className="w-full max-w-sm px-8 py-6 bg-white text-black font-black text-base uppercase tracking-[0.15em] rounded-2xl hover:bg-[#00A8A8] hover:text-white transition-all active:scale-[0.98] shadow-[0_0_60px_rgba(0,168,168,0.25)] mb-4"
          >
            I'm at Table {project.tableNumber}
          </button>

          <p className="text-gray-600 text-[10px] font-mono uppercase tracking-widest mb-8">
            Tap when ready to judge
          </p>

          <button
            onClick={() => signOut({ callbackUrl: '/login' })}
            className="text-gray-600 text-[10px] font-mono py-4 uppercase tracking-[0.3em] hover:text-[#00A8A8] transition-colors"
          >
            Terminate Session
          </button>
        </main>
      </div>
    );
  }

  // Step 2: Judging - Show scoring interface
  return (
    <div className="min-h-screen bg-[#050505] flex flex-col selection:bg-[#00A8A8]/30">
      <div className="fixed inset-0 z-0 pointer-events-none">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(0,168,168,0.03)_0%,transparent_70%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808008_1px,transparent_1px),linear-gradient(to_bottom,#80808008_1px,transparent_1px)] bg-[size:40px_40px]" />
      </div>

      <ProgressBar percentage={progress?.percentage || 0} className="relative z-10" />

      <main className="flex-1 flex flex-col px-4 py-4 max-w-lg mx-auto w-full relative z-10">
        {/* Back Button + Table Header */}
        <div className="flex items-center justify-between mb-4">
          <button
            onClick={() => setStep('viewing')}
            className="flex items-center gap-2 text-gray-500 hover:text-[#00A8A8] transition-colors py-2 pr-4"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            <span className="text-xs font-mono uppercase tracking-wider">Back</span>
          </button>

          <div className="text-right">
            <p className="text-[8px] text-gray-600 uppercase tracking-[0.3em] font-mono">Table</p>
            <p className="text-3xl font-black text-white leading-none drop-shadow-[0_0_10px_rgba(0,168,168,0.3)]">
              {project.tableNumber}
            </p>
          </div>
        </div>

        {/* Project Info - Compact */}
        <LiquidGlass className="p-4 mb-4 rounded-xl shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-[#00A8A8]/30 to-transparent" />
          <div className="flex items-start justify-between">
            <div className="flex-1 min-w-0">
              <p className="text-[8px] text-gray-500 uppercase tracking-[0.3em] font-mono mb-1">Project</p>
              <h2 className="text-base font-bold text-white truncate">{project.name}</h2>
              {project.teamMembers && (
                <p className="text-gray-500 text-xs font-mono truncate">{project.teamMembers}</p>
              )}
            </div>
            <div className="text-right ml-4">
              <p className="text-[8px] text-gray-500 uppercase tracking-[0.2em] font-mono mb-1">Progress</p>
              <p className="text-sm font-mono text-gray-400">
                {((progress?.completed || 0) + 1)}/{progress?.total}
              </p>
            </div>
          </div>
        </LiquidGlass>

        {/* Rubric Sliders */}
        <LiquidGlass className="p-4 mb-4 rounded-xl shadow-2xl flex-1 overflow-y-auto">
          <div className="flex items-center justify-between mb-4 sticky top-0 bg-black/20 backdrop-blur-sm -mx-4 px-4 py-2 -mt-4">
            <span className="text-[9px] text-gray-500 uppercase tracking-[0.3em] font-mono">Rubric Scoring</span>
            <span className="text-2xl font-black text-[#00A8A8] drop-shadow-[0_0_10px_rgba(0,168,168,0.5)]">
              {totalScore}<span className="text-sm text-gray-500 font-normal">/50</span>
            </span>
          </div>

          <div className="space-y-5">
            {RUBRIC_CRITERIA.map((criterion) => (
              <RubricSlider
                key={criterion.key}
                label={criterion.label}
                description={criterion.description}
                value={scores[criterion.key]}
                onChange={(value) => updateScore(criterion.key, value)}
                isExpanded={expandedCriteria === criterion.key}
                onToggleExpand={() => setExpandedCriteria(expandedCriteria === criterion.key ? null : criterion.key)}
              />
            ))}
          </div>
        </LiquidGlass>

        {/* Comment */}
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="Additional notes (optional)..."
          className="w-full bg-black/60 backdrop-blur-md border border-white/5 rounded-xl p-4 text-white placeholder-gray-600 resize-none mb-4 min-h-[70px] font-mono text-sm focus:border-[#00A8A8]/30 focus:outline-none transition-colors"
        />

        {/* Submit Button - Large touch target */}
        <button
          onClick={handleSubmit}
          disabled={submit.isPending}
          className="w-full px-8 py-5 bg-white text-black font-black text-base uppercase tracking-[0.15em] rounded-xl hover:bg-[#00A8A8] hover:text-white transition-all active:scale-[0.98] disabled:opacity-30 shadow-[0_0_40px_rgba(0,168,168,0.2)]"
        >
          {submit.isPending ? 'Submitting...' : 'Submit & Next Table'}
        </button>

        <button
          onClick={() => signOut({ callbackUrl: '/login' })}
          className="text-gray-600 text-[10px] font-mono py-4 uppercase tracking-[0.3em] hover:text-[#00A8A8] transition-colors text-center"
        >
          Terminate Session
        </button>
      </main>

      <RubricSliderStyles />
    </div>
  );
}
