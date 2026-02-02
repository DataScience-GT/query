'use client';

import { useState, useEffect } from 'react';
import { useSession, signOut } from 'next-auth/react';
import { trpc } from '@/lib/trpc';
import { useRouter } from 'next/navigation';
import { LiquidGlass } from '@/components/portal/LiquidGlass';

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
    if (status === 'unauthenticated') router.push('/portal');
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
    return (
      <div className="min-h-screen bg-[#050505] flex items-center justify-center font-mono text-[#00A8A8] animate-pulse uppercase tracking-[0.5em]">
        Syncing Identity...
      </div>
    );
  }

  if (!session) return null;

  if (!judgeStatus?.isJudge) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-6 text-center bg-[#050505] selection:bg-[#00A8A8]/30">
        <div className="w-16 h-16 rounded-full flex items-center justify-center mb-6 bg-red-500/10 border border-red-500/30">
          <svg className="w-8 h-8 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </div>
        <h1 className="text-2xl font-black text-white uppercase tracking-tight mb-2">Access Denied</h1>
        <p className="text-gray-500 font-mono text-sm mb-8">You're not registered as a judge.</p>
        <button
          onClick={() => signOut({ callbackUrl: '/portal' })}
          className="px-8 py-3 border border-red-500/20 text-red-500 font-mono text-[10px] uppercase tracking-[0.3em] hover:bg-red-500/10 transition-all"
        >
          Terminate Session
        </button>
      </div>
    );
  }

  if (!hackathonId) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-6 text-center bg-[#050505] selection:bg-[#00A8A8]/30">
        <div className="w-16 h-16 rounded-full flex items-center justify-center mb-6 bg-yellow-500/10 border border-yellow-500/30">
          <svg className="w-8 h-8 text-yellow-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <h1 className="text-2xl font-black text-white uppercase tracking-tight mb-2">Awaiting Assignment</h1>
        <p className="text-gray-500 font-mono text-sm mb-8">Please wait for event assignment.</p>
        <button
          onClick={() => signOut({ callbackUrl: '/portal' })}
          className="px-8 py-3 border border-white/10 text-gray-400 font-mono text-[10px] uppercase tracking-[0.3em] hover:bg-white/5 transition-all"
        >
          Terminate Session
        </button>
      </div>
    );
  }

  const project = nextTable?.project;
  const isDone = nextTable?.done;

  if (isDone) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-6 text-center bg-[#050505] selection:bg-[#00A8A8]/30">
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
          onClick={() => signOut({ callbackUrl: '/portal' })}
          className="px-12 py-5 bg-white text-black font-black text-[11px] uppercase tracking-[0.2em] rounded-sm hover:bg-[#00A8A8] hover:text-white transition-all active:scale-95 shadow-[0_0_30px_rgba(0,168,168,0.1)]"
        >
          Exit Terminal
        </button>
      </div>
    );
  }

  if (loadingNext || !project) {
    return (
      <div className="min-h-screen bg-[#050505] flex items-center justify-center font-mono text-[#00A8A8] animate-pulse uppercase tracking-[0.5em]">
        Loading Project...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#050505] flex flex-col selection:bg-[#00A8A8]/30">
      <div className="fixed inset-0 z-0 pointer-events-none">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(0,168,168,0.03)_0%,transparent_70%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808008_1px,transparent_1px),linear-gradient(to_bottom,#80808008_1px,transparent_1px)] bg-[size:40px_40px]" />
      </div>

      <div className="h-1 bg-white/5 relative z-10">
        <div
          className="h-full bg-gradient-to-r from-[#00A8A8] to-[#005a5a] transition-all duration-500 shadow-[0_0_10px_rgba(0,168,168,0.5)]"
          style={{ width: `${progress?.percentage || 0}%` }}
        />
      </div>

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
              <div key={criterion.key} className="space-y-2">
                <button
                  onClick={() => setExpandedCriteria(expandedCriteria === criterion.key ? null : criterion.key)}
                  className="w-full flex items-center justify-between text-left"
                >
                  <span className="text-xs font-semibold text-white">{criterion.label}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-lg font-black text-[#00A8A8] min-w-[2rem] text-right">
                      {scores[criterion.key]}
                    </span>
                    <svg
                      className={`w-4 h-4 text-gray-500 transition-transform ${expandedCriteria === criterion.key ? 'rotate-180' : ''}`}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </button>

                {expandedCriteria === criterion.key && (
                  <p className="text-[10px] text-gray-400 font-mono pl-1 pb-1">{criterion.description}</p>
                )}

                {/* Slider */}
                <div className="relative">
                  <input
                    type="range"
                    min="1"
                    max="10"
                    value={scores[criterion.key]}
                    onChange={(e) => updateScore(criterion.key, parseInt(e.target.value))}
                    className="w-full h-12 appearance-none bg-transparent cursor-pointer touch-pan-y"
                    style={{
                      background: `linear-gradient(to right, #00A8A8 0%, #00A8A8 ${(scores[criterion.key] - 1) * 11.11}%, rgba(255,255,255,0.1) ${(scores[criterion.key] - 1) * 11.11}%, rgba(255,255,255,0.1) 100%)`,
                      borderRadius: '8px',
                    }}
                  />
                  <div className="flex justify-between text-[8px] text-gray-600 font-mono px-1 -mt-1">
                    <span>1</span>
                    <span>5</span>
                    <span>10</span>
                  </div>
                </div>
              </div>
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
          onClick={() => signOut({ callbackUrl: '/portal' })}
          className="text-gray-600 text-[10px] font-mono py-4 uppercase tracking-[0.3em] hover:text-[#00A8A8] transition-colors"
        >
          Terminate Session
        </button>
      </main>

      {/* Custom slider styles */}
      <style jsx global>{`
        input[type="range"] {
          -webkit-appearance: none;
          appearance: none;
        }
        input[type="range"]::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 28px;
          height: 28px;
          background: white;
          border-radius: 50%;
          cursor: pointer;
          box-shadow: 0 0 20px rgba(0, 168, 168, 0.5), 0 2px 8px rgba(0,0,0,0.3);
          border: 3px solid #00A8A8;
        }
        input[type="range"]::-moz-range-thumb {
          width: 28px;
          height: 28px;
          background: white;
          border-radius: 50%;
          cursor: pointer;
          box-shadow: 0 0 20px rgba(0, 168, 168, 0.5), 0 2px 8px rgba(0,0,0,0.3);
          border: 3px solid #00A8A8;
        }
        input[type="range"]:active::-webkit-slider-thumb {
          transform: scale(1.1);
        }
        input[type="range"]:active::-moz-range-thumb {
          transform: scale(1.1);
        }
      `}</style>
    </div>
  );
}
