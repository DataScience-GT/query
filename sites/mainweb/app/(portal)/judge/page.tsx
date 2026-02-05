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

export default function JudgePage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
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

  return (
    <div className="min-h-screen bg-[#050505] flex flex-col selection:bg-[#00A8A8]/30">
      <div className="fixed inset-0 z-0 pointer-events-none">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(0,168,168,0.03)_0%,transparent_70%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808008_1px,transparent_1px),linear-gradient(to_bottom,#80808008_1px,transparent_1px)] bg-[size:40px_40px]" />
      </div>

      <ProgressBar percentage={progress?.percentage || 0} className="relative z-10" />

      <main className="flex-1 flex flex-col px-4 py-5 max-w-lg mx-auto w-full relative z-10">
        {/* Table Number Header */}
        <div className="text-center py-4">
          <p className="text-[9px] text-gray-500 uppercase tracking-[0.4em] font-mono mb-2">Table</p>
          <div className="relative inline-block">
            <div className="absolute inset-0 bg-[#00A8A8]/10 blur-[30px] rounded-full" />
            <p className="relative text-7xl font-black text-white leading-none tracking-tighter drop-shadow-[0_0_20px_rgba(0,168,168,0.3)]">
              {project.tableNumber}
            </p>
          </div>
          <p className="text-gray-600 text-[10px] font-mono mt-2 uppercase tracking-widest">
            {((progress?.completed || 0) + 1)}/{progress?.total}
          </p>
        </div>

        {/* Project Info */}
        <LiquidGlass className="p-4 mb-4 rounded-lg shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-[#00A8A8]/30 to-transparent" />
          <p className="text-[8px] text-gray-500 uppercase tracking-[0.3em] font-mono mb-1">Project</p>
          <h2 className="text-base font-bold text-white mb-1">{project.name}</h2>
          {project.teamMembers && (
            <p className="text-gray-500 text-xs font-mono">{project.teamMembers}</p>
          )}
        </LiquidGlass>

        {/* Rubric Sliders */}
        <LiquidGlass className="p-4 mb-4 rounded-lg shadow-2xl">
          <div className="flex items-center justify-between mb-4">
            <span className="text-[9px] text-gray-500 uppercase tracking-[0.3em] font-mono">Rubric Scoring</span>
            <span className="text-2xl font-black text-[#00A8A8] drop-shadow-[0_0_10px_rgba(0,168,168,0.5)]">
              {totalScore}<span className="text-sm text-gray-500 font-normal">/50</span>
            </span>
          </div>

          <div className="space-y-4">
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
          className="w-full bg-black/60 backdrop-blur-md border border-white/5 rounded-lg p-3 text-white placeholder-gray-600 resize-none mb-4 min-h-[60px] font-mono text-sm focus:border-[#00A8A8]/30 focus:outline-none transition-colors"
        />

        {/* Submit Button */}
        <button
          onClick={handleSubmit}
          disabled={submit.isPending}
          className="mt-auto px-10 py-5 bg-white text-black font-black text-sm uppercase tracking-[0.2em] rounded-xl hover:bg-[#00A8A8] hover:text-white transition-all active:scale-95 disabled:opacity-30 shadow-[0_0_40px_rgba(0,168,168,0.2)]"
        >
          {submit.isPending ? 'Submitting...' : 'Submit & Next'}
        </button>

        <button
          onClick={() => signOut({ callbackUrl: '/login' })}
          className="text-gray-600 text-[10px] font-mono py-4 uppercase tracking-[0.3em] hover:text-[#00A8A8] transition-colors"
        >
          Terminate Session
        </button>
      </main>

      <RubricSliderStyles />
    </div>
  );
}
