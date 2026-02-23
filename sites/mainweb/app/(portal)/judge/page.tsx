'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { trpc } from '@/lib/trpc';
import { useRouter } from 'next/navigation';
import { RubricSlider, RubricSliderStyles } from '@/components/portal/judge/RubricSlider';
import { ZoneMapModal, ViewMapButton } from '@/components/portal/judge/ZoneMapModal';
import Background from '@/components/portal/Background';
import { LiquidGlass } from '@/components/portal/LiquidGlass';

const RUBRIC_CRITERIA = [
  { key: 'creativity', label: 'Creativity', description: 'Unique approach & originality' },
  { key: 'impact', label: 'Impact', description: 'Benefits to society & relevance' },
  { key: 'scope', label: 'Technical Depth', description: 'Variety of tools & complexity' },
  { key: 'clarity', label: 'Clarity', description: 'Clear presentation & engagement' },
  { key: 'soundness', label: 'Soundness', description: 'Logical & accurate conclusions' },
  { key: 'imagination', label: 'Pure Imagination', description: 'Wildly creative & out-of-the-box ideas' },
] as const;

const RUBRIC_GUIDE = [
  {
    name: 'Creativity & Originality',
    levels: [
      { range: '1-2', desc: 'No originality. Methods were copied from external sources without any unique approach.' },
      { range: '3-4', desc: 'Mostly imitative. Some original aspects exist, but largely formulaic.' },
      { range: '5-6', desc: 'Partially original. Most aspects show original thinking.' },
      { range: '7-8', desc: 'Original approach. Genuinely original data analysis or solution.' },
      { range: '9-10', desc: 'Highly innovative. Unique and unexpected approach that stands out.' },
    ]
  },
  {
    name: 'Impact & Relevance',
    levels: [
      { range: '1-2', desc: 'No benefit shown. No evidence of societal benefit or alignment with goals.' },
      { range: '3-4', desc: 'Limited benefit. Little evidence, slightly correlates to competition.' },
      { range: '5-6', desc: 'Some benefit evident. Shows potential and somewhat aligns.' },
      { range: '7-8', desc: 'Clear benefit. Adequate evidence, aligns well with themes.' },
      { range: '9-10', desc: 'Strong impact. Exceeds goals, shows exceptional relevance.' },
    ]
  },
  {
    name: 'Scope & Technical Depth',
    levels: [
      { range: '1-2', desc: 'Poor execution. Little variety AND inappropriate tool usage.' },
      { range: '3-4', desc: 'Limited scope. Lacked variety OR incorrect tool usage.' },
      { range: '5-6', desc: 'Adequate scope. Somewhat varied and correctly used.' },
      { range: '7-8', desc: 'Good complexity. Adequate variety, used correctly.' },
      { range: '9-10', desc: 'Excellent depth. Wide variety, correctly and consistently used.' },
    ]
  },
  {
    name: 'Clarity & Engagement',
    levels: [
      { range: '1-2', desc: 'Missing or unclear. No clear description or video.' },
      { range: '3-4', desc: 'Incomplete. Brief but unclear, video doesn\'t meet requirements.' },
      { range: '5-6', desc: 'Somewhat clear. Adequate description, somewhat engaging video.' },
      { range: '7-8', desc: 'Clear & engaging. Complete description, engaging video.' },
      { range: '9-10', desc: 'Excellent. Well-organized, high-quality video with enthusiasm.' },
    ]
  },
  {
    name: 'Soundness & Accuracy',
    levels: [
      { range: '1-2', desc: 'Highly flawed. Inconsistent techniques, inaccurate conclusions.' },
      { range: '3-4', desc: 'Somewhat flawed. Somewhat inconsistent, inaccurate.' },
      { range: '5-6', desc: 'Mostly sound. Consistent, somewhat logical conclusions.' },
      { range: '7-8', desc: 'Sound analysis. Correct techniques, logical conclusions.' },
      { range: '9-10', desc: 'Excellent. Consistent, correct, well-supported conclusions.' },
    ]
  },
  {
    name: 'Pure Imagination',
    levels: [
      { range: '1-2', desc: 'Standard. Follows conventional thinking.' },
      { range: '3-4', desc: 'Some spark. Slight deviation from the norm.' },
      { range: '5-6', desc: 'Creative. Shows good imagination.' },
      { range: '7-8', desc: 'Imaginative. Very creative and novel ideas.' },
      { range: '9-10', desc: 'Pure Imagination. Mind-blowing, boundary-pushing creativity.' },
    ]
  },
];

type RubricScores = {
  creativity: number;
  impact: number;
  scope: number;
  clarity: number;
  soundness: number;
  imagination?: number;
};

type JudgingStep = 'viewing' | 'judging';

export default function JudgePage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [step, setStep] = useState<JudgingStep>('viewing');
  const [showHelp, setShowHelp] = useState(false);
  const [showMap, setShowMap] = useState(false);
  const [scores, setScores] = useState<RubricScores>({
    creativity: 5, impact: 5, scope: 5, clarity: 5, soundness: 5, imagination: 5,
  });
  const [comment, setComment] = useState('');

  const { data: judgeStatus, isLoading: checkingJudge } = trpc.judge.isJudge.useQuery(undefined, {
    enabled: !!session,
  });

  const { data: assignments } = trpc.judge.getMyAssignments.useQuery(undefined, {
    enabled: !!session && !!judgeStatus?.isJudge,
  });

  const hackathonId = assignments?.[0]?.hackathon?.id;
  const assignmentTrack = assignments?.[0]?.track; // "Pure Imagination" or others
  const isPureImagination = assignmentTrack === 'Pure Imagination';

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
      setScores({ creativity: 5, impact: 5, scope: 5, clarity: 5, soundness: 5, imagination: 5 });
      setComment('');
      setStep('viewing');
      refetch();
      refetchProgress();
    },
  });

  const skip = trpc.judge.skipProject.useMutation({
    onSuccess: (data) => {
      if (data.skippedToEnd) {
        // Last project — can't skip, stay on it
        return;
      }
      refetch();
      refetchProgress();
    },
  });

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/login');
  }, [status, router]);

  const totalScore = scores.creativity + scores.impact + scores.scope + scores.clarity + scores.soundness + (isPureImagination ? (scores.imagination || 0) : 0);

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
      scoreImagination: isPureImagination ? scores.imagination : undefined,
      comment: comment || undefined,
    });
  };

  const updateScore = (key: keyof RubricScores, value: number) => {
    setScores(prev => ({ ...prev, [key]: value }));
  };

  const getScoreColor = () => {
    const max = isPureImagination ? 60 : 50;
    const pct = totalScore / max;
    if (pct <= 0.3) return 'text-red-400';
    if (pct <= 0.6) return 'text-yellow-400';
    return 'text-emerald-400';
  };

  const visibleCriteria = RUBRIC_CRITERIA.filter(c => {
    if (c.key === 'imagination') return isPureImagination;
    return true;
  });

  // Loading state
  if (!mounted || status === 'loading' || checkingJudge) {
    return (
      <div className="min-h-screen min-h-[100dvh] bg-[#050505] flex items-center justify-center">
        <Background className="fixed inset-0 z-0 opacity-[0.03]" />
        <div className="text-center relative z-10">
          <div className="w-12 h-12 border-4 border-[#00A8A8]/30 border-t-[#00A8A8] rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-500 text-sm font-mono uppercase tracking-widest">Syncing Identity...</p>
        </div>
      </div>
    );
  }

  if (!session) return null;

  // Not a judge
  if (!judgeStatus?.isJudge) {
    return (
      <div className="min-h-screen min-h-[100dvh] bg-[#050505] flex items-center justify-center p-6">
        <Background className="fixed inset-0 z-0 opacity-[0.03]" />
        <LiquidGlass className="text-center max-w-sm p-8 relative z-10">
          <div className="w-16 h-16 rounded-full bg-red-500/10 border border-red-500/30 flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h1 className="text-xl font-bold text-white mb-2 uppercase tracking-tight">Access Denied</h1>
          <p className="text-gray-500 font-mono text-sm">You&apos;re not registered as a judge for this event.</p>
        </LiquidGlass>
      </div>
    );
  }

  // No assignment
  if (!hackathonId) {
    return (
      <div className="min-h-screen min-h-[100dvh] bg-[#050505] flex items-center justify-center p-6">
        <Background className="fixed inset-0 z-0 opacity-[0.03]" />
        <LiquidGlass className="text-center max-w-sm p-8 relative z-10">
          <div className="w-16 h-16 rounded-full bg-yellow-500/10 border border-yellow-500/30 flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h1 className="text-xl font-bold text-white mb-2 uppercase tracking-tight">Awaiting Assignment</h1>
          <p className="text-gray-500 font-mono text-sm">Please wait for event assignment.</p>
        </LiquidGlass>
      </div>
    );
  }

  const project = nextTable?.project;
  const isDone = nextTable?.done;

  // All done
  if (isDone) {
    return (
      <div className="min-h-screen min-h-[100dvh] bg-[#050505] flex items-center justify-center p-6">
        <Background className="fixed inset-0 z-0 opacity-[0.03]" />
        <LiquidGlass className="text-center max-w-sm p-8 relative z-10">
          <div className="w-20 h-20 rounded-full bg-gradient-to-br from-[#00A8A8] to-emerald-600 flex items-center justify-center mx-auto mb-6 shadow-[0_0_30px_rgba(0,168,168,0.3)]">
            <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-white mb-2 uppercase tracking-tight">All <span className="text-[#00A8A8] italic">Done!</span></h1>
          <p className="text-gray-500 font-mono text-sm">You&apos;ve judged all assigned projects. Thank you!</p>
        </LiquidGlass>
      </div>
    );
  }

  // Loading project
  if (loadingNext || !project) {
    return (
      <div className="min-h-screen min-h-[100dvh] bg-[#050505] flex items-center justify-center">
        <Background className="fixed inset-0 z-0 opacity-[0.03]" />
        <div className="text-center relative z-10">
          <div className="w-12 h-12 border-4 border-[#00A8A8]/30 border-t-[#00A8A8] rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-500 text-sm font-mono uppercase tracking-widest">Loading project...</p>
        </div>
      </div>
    );
  }

  // Help Modal
  const HelpModal = () => (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-8 bg-black/90 backdrop-blur-xl overflow-y-auto"
      onClick={() => setShowHelp(false)}
    >
      <div
        className="bg-gradient-to-b from-gray-900 to-black border border-white/10 rounded-3xl max-w-2xl w-full my-4 shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-gray-900/95 backdrop-blur-xl border-b border-white/10 p-5 flex items-center justify-between rounded-t-3xl">
          <div>
            <h2 className="text-xl font-bold text-white">Scoring Guide</h2>
            <p className="text-xs text-gray-500 mt-0.5">Reference for each criterion</p>
          </div>
          <button onClick={() => setShowHelp(false)} className="w-10 h-10 rounded-full bg-white/5 text-gray-400 hover:bg-white/10 hover:text-white flex items-center justify-center transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="p-5 space-y-6">
          {RUBRIC_GUIDE.filter(g => isPureImagination || g.name !== 'Pure Imagination').map((criterion, idx) => (
            <div key={criterion.name}>
              <div className="flex items-center gap-3 mb-3">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-teal-500 to-emerald-600 flex items-center justify-center text-sm font-bold text-white">
                  {idx + 1}
                </div>
                <h3 className="text-base font-bold text-white">{criterion.name}</h3>
              </div>
              <div className="ml-11 space-y-2">
                {criterion.levels.map((level) => (
                  <div key={level.range} className="flex gap-3 items-start">
                    <span className="shrink-0 w-10 text-xs font-bold text-teal-400 font-mono bg-teal-500/10 px-2 py-1 rounded">{level.range}</span>
                    <p className="text-sm text-gray-400 leading-relaxed">{level.desc}</p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="sticky bottom-0 bg-gradient-to-t from-black via-black to-transparent pt-8 pb-5 px-5 rounded-b-3xl">
          <button
            onClick={() => setShowHelp(false)}
            className="w-full py-4 bg-gradient-to-r from-teal-500 to-emerald-500 text-white font-bold rounded-2xl shadow-lg shadow-teal-500/25 active:scale-[0.98] transition-transform"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );

  // Step 1: Viewing
  if (step === 'viewing') {
    return (
      <div className="min-h-screen min-h-[100dvh] bg-[#050505] flex flex-col overflow-hidden">
        <Background className="fixed inset-0 z-0 opacity-[0.03]" />

        <div className="h-1.5 bg-white/5 relative z-10">
          <div className="h-full bg-gradient-to-r from-[#00A8A8] to-emerald-500 transition-all duration-500" style={{ width: `${progress?.percentage || 0}%` }} />
        </div>

        <main className="flex-1 flex flex-col items-center justify-center px-6 py-8 relative z-10">
          <LiquidGlass className="px-4 py-2 rounded-full mb-8">
            <span className="text-sm font-medium text-gray-400">
              <span className="text-white font-bold">{(progress?.completed || 0) + 1}</span> of {progress?.total} projects
            </span>
          </LiquidGlass>

          <div className="text-center mb-8">
            <p className="text-xs text-gray-500 uppercase tracking-[0.5em] font-medium mb-4">Go to Table</p>
            <div className="relative">
              <div className="absolute inset-0 bg-gradient-to-b from-[#00A8A8]/20 to-transparent blur-[80px] scale-150" />
              <p className="relative text-[160px] font-black text-white leading-none tracking-tight">
                {project.zone}{project.tableNumber}
              </p>
            </div>
          </div>

          <LiquidGlass className="w-full max-w-sm p-6 mb-8 shadow-xl">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#00A8A8] to-emerald-600 flex items-center justify-center shadow-[0_0_15px_rgba(0,168,168,0.3)]">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
              </div>
              <div>
                {assignmentTrack && (
                  <div className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#00A8A8]/20 text-[#00A8A8] border border-[#00A8A8]/30 mb-2 uppercase tracking-wide">
                    Track: {assignmentTrack}
                  </div>
                )}
                <h2 className="text-lg font-bold text-white">{project.name}</h2>
                {project.teamMembers && <p className="text-gray-500 text-sm mb-2">{project.teamMembers}</p>}
                {project.projectUrl && (
                  <a href={project.projectUrl} target="_blank" rel="noopener noreferrer" className="text-[#00A8A8] hover:text-[#00A8A8]/80 text-sm font-medium transition-colors underline decoration-[#00A8A8]/30 underline-offset-2">
                    View on Devpost
                  </a>
                )}
              </div>
            </div>
          </LiquidGlass>

          <ViewMapButton onClick={() => setShowMap(true)} className="w-full max-w-sm mb-4" />

          <div className="w-full max-w-sm flex gap-3">
            <button
              onClick={() => {
                if (nextTable?.queueId) {
                  skip.mutate({ queueId: nextTable.queueId });
                }
              }}
              disabled={skip.isPending || (progress?.total !== undefined && progress.total - (progress?.completed || 0) <= 1)}
              className="flex-1 px-4 py-5 bg-white/5 border border-white/10 text-gray-400 font-bold text-sm rounded-2xl active:scale-[0.98] transition-all disabled:opacity-30 hover:bg-white/10 hover:text-white"
            >
              {skip.isPending ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Skipping...
                </span>
              ) : 'Skip Table'}
            </button>
            <button
              onClick={() => setStep('judging')}
              className="flex-[2] px-8 py-5 bg-gradient-to-r from-[#00A8A8] to-emerald-500 text-white font-bold text-lg rounded-2xl active:scale-[0.98] transition-transform shadow-xl shadow-[#00A8A8]/30"
            >
              Start Judging
            </button>
          </div>
        </main>

        <ZoneMapModal isOpen={showMap} onClose={() => setShowMap(false)} />
      </div>
    );
  }

  // Step 2: Judging
  return (
    <div className="min-h-screen min-h-[100dvh] bg-[#050505] flex flex-col">
      {showHelp && <HelpModal />}
      <Background className="fixed inset-0 z-0 opacity-[0.03]" />

      <div className="h-1.5 bg-white/5 sticky top-0 z-20">
        <div className="h-full bg-gradient-to-r from-[#00A8A8] to-emerald-500 transition-all duration-500" style={{ width: `${progress?.percentage || 0}%` }} />
      </div>

      <header className="sticky top-1.5 z-10 bg-[#050505]/80 backdrop-blur-2xl border-b border-white/5 px-4 py-3">
        <div className="flex items-center justify-between max-w-lg mx-auto">
          <button onClick={() => setStep('viewing')} className="flex items-center gap-2 text-gray-400 hover:text-white py-2 pr-4 transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            <span className="text-sm font-medium">Back</span>
          </button>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowHelp(true)}
              className="w-9 h-9 rounded-full bg-white/5 text-gray-400 hover:bg-white/10 hover:text-white flex items-center justify-center text-sm font-bold transition-colors border border-white/10"
            >
              ?
            </button>
            <LiquidGlass className="rounded-xl px-3 py-1.5 flex items-center gap-3">
              <div className="text-center">
                <p className="text-[9px] text-gray-500 uppercase tracking-widest">Table</p>
                <p className="text-lg font-black text-white leading-tight">{project.zone}{project.tableNumber}</p>
              </div>
              <div className="w-px h-8 bg-white/10" />
              <div className="text-center">
                <p className="text-[9px] text-gray-500 uppercase tracking-widest">Score</p>
                <p className={`text-lg font-black leading-tight ${getScoreColor()}`}>{totalScore}</p>
              </div>
            </LiquidGlass>
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto px-4 py-5 relative z-10">
        <div className="max-w-lg mx-auto">
          <LiquidGlass className="flex items-center gap-3 mb-6 p-4">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#00A8A8] to-emerald-600 flex items-center justify-center shrink-0 shadow-[0_0_15px_rgba(0,168,168,0.3)]">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
            </div>
            <div>
              <h1 className="text-lg font-bold text-white">{project.name}</h1>
              {project.teamMembers && <p className="text-gray-500 text-sm mb-2">{project.teamMembers}</p>}
              {project.projectUrl && (
                <a href={project.projectUrl} target="_blank" rel="noopener noreferrer" className="text-[#00A8A8] hover:text-[#00A8A8]/80 text-sm font-medium transition-colors underline decoration-[#00A8A8]/30 underline-offset-2">
                  View on Devpost
                </a>
              )}
            </div>
          </LiquidGlass>

          <LiquidGlass className="p-5 mb-5">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-sm font-semibold text-white">Evaluation Rubric {isPureImagination && <span className="text-[#00A8A8]">(+Imagination)</span>}</h2>
              <button onClick={() => setShowHelp(true)} className="text-xs text-[#00A8A8] hover:text-[#00A8A8]/80 font-medium transition-colors">
                View Guide →
              </button>
            </div>
            <div className="space-y-6">
              {visibleCriteria.map((c) => (
                <RubricSlider
                  key={c.key}
                  label={c.label}
                  description={c.description}
                  value={scores[c.key as keyof RubricScores] || 5}
                  onChange={(v) => updateScore(c.key as keyof RubricScores, v)}
                />
              ))}
            </div>
          </LiquidGlass>

          <div className="mb-5">
            <label className="text-sm font-medium text-gray-400 mb-2 block">Notes</label>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Optional feedback for this project..."
              className="w-full bg-white/5 border border-white/10 rounded-xl p-4 text-white placeholder-gray-600 resize-none min-h-[100px] text-sm focus:border-[#00A8A8]/50 focus:outline-none focus:ring-1 focus:ring-[#00A8A8]/20 transition-all backdrop-blur-sm"
            />
          </div>

          <button
            onClick={handleSubmit}
            disabled={submit.isPending}
            className="w-full px-8 py-5 bg-gradient-to-r from-[#00A8A8] to-emerald-500 text-white font-bold text-lg rounded-2xl active:scale-[0.98] transition-transform disabled:opacity-50 shadow-xl shadow-[#00A8A8]/20 mb-8"
          >
            {submit.isPending ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Submitting...
              </span>
            ) : 'Submit & Next Project'}
          </button>
        </div>
      </main>
    </div>
  );
}
