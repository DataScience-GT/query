'use client';

import { useState } from 'react';
import { RubricSlider, RubricSliderStyles } from '@/components/portal/judge/RubricSlider';

const RUBRIC_CRITERIA = [
    { key: 'creativity', label: 'Creativity', description: 'Unique approach & originality' },
    { key: 'impact', label: 'Impact', description: 'Benefits to society & relevance' },
    { key: 'scope', label: 'Technical Depth', description: 'Variety of tools & complexity' },
    { key: 'clarity', label: 'Clarity', description: 'Clear presentation & engagement' },
    { key: 'soundness', label: 'Soundness', description: 'Logical & accurate conclusions' },
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
];

type RubricScores = {
    creativity: number;
    impact: number;
    scope: number;
    clarity: number;
    soundness: number;
};

const MOCK_PROJECTS = [
    { id: '1', name: 'AI Health Assistant', tableNumber: 101, teamMembers: 'Team Alpha' },
    { id: '2', name: 'Crypto Portfolio Tracker', tableNumber: 102, teamMembers: 'Team Beta' },
    { id: '3', name: 'Climate Data Viz', tableNumber: 103, teamMembers: 'Team Gamma' },
];

type JudgingStep = 'viewing' | 'judging';

export default function JudgeTestPage() {
    const [step, setStep] = useState<JudgingStep>('viewing');
    const [showHelp, setShowHelp] = useState(false);
    const [currentProjectIndex, setCurrentProjectIndex] = useState(0);
    const [scores, setScores] = useState<RubricScores>({
        creativity: 5, impact: 5, scope: 5, clarity: 5, soundness: 5,
    });
    const [comment, setComment] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    const project = MOCK_PROJECTS[currentProjectIndex];
    const progress = {
        completed: currentProjectIndex,
        total: MOCK_PROJECTS.length,
        percentage: (currentProjectIndex / MOCK_PROJECTS.length) * 100,
    };

    const totalScore = scores.creativity + scores.impact + scores.scope + scores.clarity + scores.soundness;

    const updateScore = (key: keyof RubricScores, value: number) => {
        setScores(prev => ({ ...prev, [key]: value }));
    };

    const handleSubmit = () => {
        setIsSubmitting(true);
        setTimeout(() => {
            console.log('Submitted:', { project: project.name, scores, totalScore });
            if (currentProjectIndex < MOCK_PROJECTS.length - 1) {
                setCurrentProjectIndex(prev => prev + 1);
                setScores({ creativity: 5, impact: 5, scope: 5, clarity: 5, soundness: 5 });
                setComment('');
                setStep('viewing');
            } else {
                alert('All done!');
                setCurrentProjectIndex(0);
                setStep('viewing');
            }
            setIsSubmitting(false);
        }, 500);
    };

    const getScoreColor = () => {
        if (totalScore <= 15) return 'text-red-400';
        if (totalScore <= 30) return 'text-yellow-400';
        return 'text-emerald-400';
    };

    // Help Modal
    const HelpModal = () => (
        <div
            className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-8 bg-black/90 backdrop-blur-xl overflow-y-auto animate-fadeIn"
            onClick={() => setShowHelp(false)}
        >
            <div
                className="bg-gradient-to-b from-gray-900 to-black border border-white/10 rounded-3xl max-w-2xl w-full my-4 shadow-2xl shadow-black/50 animate-slideUp"
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
                    {RUBRIC_GUIDE.map((criterion, idx) => (
                        <div key={criterion.name} className="relative">
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
                        className="w-full py-4 bg-gradient-to-r from-teal-500 to-emerald-500 text-white font-bold rounded-2xl text-base shadow-lg shadow-teal-500/25 active:scale-[0.98] transition-transform"
                    >
                        Got it
                    </button>
                </div>
            </div>
            <style jsx>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-fadeIn { animation: fadeIn 0.2s ease-out; }
        .animate-slideUp { animation: slideUp 0.3s ease-out; }
      `}</style>
        </div>
    );

    // Step 1: Viewing
    if (step === 'viewing') {
        return (
            <div className="min-h-screen min-h-[100dvh] bg-black flex flex-col overflow-hidden">
                {/* Ambient background */}
                <div className="fixed inset-0 z-0 pointer-events-none">
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-teal-500/10 rounded-full blur-[150px]" />
                    <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff03_1px,transparent_1px),linear-gradient(to_bottom,#ffffff03_1px,transparent_1px)] bg-[size:60px_60px]" />
                </div>

                {/* Progress */}
                <div className="h-1.5 bg-white/5 relative z-10">
                    <div
                        className="h-full bg-gradient-to-r from-teal-500 to-emerald-500 transition-all duration-500"
                        style={{ width: `${progress.percentage}%` }}
                    />
                </div>

                <main className="flex-1 flex flex-col items-center justify-center px-6 py-8 relative z-10">
                    {/* Progress badge */}
                    <div className="bg-white/5 backdrop-blur-sm px-4 py-2 rounded-full mb-8">
                        <span className="text-sm font-medium text-gray-400">
                            <span className="text-white font-bold">{progress.completed + 1}</span> of {progress.total} projects
                        </span>
                    </div>

                    {/* Table Number - Hero */}
                    <div className="text-center mb-8">
                        <p className="text-xs text-gray-500 uppercase tracking-[0.5em] font-medium mb-4">Go to Table</p>
                        <div className="relative">
                            <div className="absolute inset-0 bg-gradient-to-b from-teal-500/20 to-transparent blur-[80px] scale-150" />
                            <p className="relative text-[160px] font-black text-white leading-none tracking-tight" style={{ fontFamily: 'system-ui' }}>
                                {project.tableNumber}
                            </p>
                        </div>
                    </div>

                    {/* Project Card */}
                    <div className="w-full max-w-sm bg-white/[0.03] backdrop-blur-xl border border-white/10 rounded-2xl p-6 mb-8 shadow-xl">
                        <div className="flex items-center gap-3 mb-3">
                            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-teal-500 to-emerald-600 flex items-center justify-center">
                                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                                </svg>
                            </div>
                            <div>
                                <h2 className="text-lg font-bold text-white">{project.name}</h2>
                                <p className="text-gray-500 text-sm">{project.teamMembers}</p>
                            </div>
                        </div>
                    </div>

                    {/* Start Button */}
                    <button
                        onClick={() => setStep('judging')}
                        className="w-full max-w-sm px-8 py-5 bg-gradient-to-r from-teal-500 to-emerald-500 text-white font-bold text-lg rounded-2xl active:scale-[0.98] transition-transform shadow-xl shadow-teal-500/30"
                    >
                        Start Judging
                    </button>
                </main>
            </div>
        );
    }

    // Step 2: Judging
    return (
        <div className="min-h-screen min-h-[100dvh] bg-black flex flex-col">
            {showHelp && <HelpModal />}

            {/* Ambient background */}
            <div className="fixed inset-0 z-0 pointer-events-none">
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[500px] h-[300px] bg-teal-500/5 rounded-full blur-[100px]" />
            </div>

            {/* Progress */}
            <div className="h-1.5 bg-white/5 sticky top-0 z-20">
                <div
                    className="h-full bg-gradient-to-r from-teal-500 to-emerald-500 transition-all duration-500"
                    style={{ width: `${progress.percentage}%` }}
                />
            </div>

            {/* Header */}
            <header className="sticky top-1.5 z-10 bg-black/80 backdrop-blur-2xl border-b border-white/5 px-4 py-3">
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
                            className="w-9 h-9 rounded-full bg-white/5 text-gray-400 hover:bg-white/10 hover:text-white flex items-center justify-center text-sm font-bold transition-colors"
                        >
                            ?
                        </button>
                        <div className="bg-white/5 rounded-xl px-3 py-1.5 flex items-center gap-3">
                            <div className="text-center">
                                <p className="text-[9px] text-gray-500 uppercase tracking-widest">Table</p>
                                <p className="text-lg font-black text-white leading-tight">{project.tableNumber}</p>
                            </div>
                            <div className="w-px h-8 bg-white/10" />
                            <div className="text-center">
                                <p className="text-[9px] text-gray-500 uppercase tracking-widest">Score</p>
                                <p className={`text-lg font-black leading-tight ${getScoreColor()}`}>{totalScore}</p>
                            </div>
                        </div>
                    </div>
                </div>
            </header>

            {/* Content */}
            <main className="flex-1 overflow-y-auto px-4 py-5 relative z-10">
                <div className="max-w-lg mx-auto">
                    {/* Project Info */}
                    <div className="flex items-center gap-3 mb-6 p-4 bg-white/[0.02] border border-white/5 rounded-2xl">
                        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-teal-500 to-emerald-600 flex items-center justify-center shrink-0">
                            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                            </svg>
                        </div>
                        <div>
                            <h1 className="text-lg font-bold text-white">{project.name}</h1>
                            <p className="text-gray-500 text-sm">{project.teamMembers}</p>
                        </div>
                    </div>

                    {/* Rubric Card */}
                    <div className="bg-white/[0.02] border border-white/5 rounded-2xl p-5 mb-5">
                        <div className="flex items-center justify-between mb-5">
                            <h2 className="text-sm font-semibold text-white">Evaluation Rubric</h2>
                            <button
                                onClick={() => setShowHelp(true)}
                                className="text-xs text-teal-400 hover:text-teal-300 font-medium transition-colors"
                            >
                                View Guide →
                            </button>
                        </div>
                        <div className="space-y-6">
                            {RUBRIC_CRITERIA.map((c) => (
                                <RubricSlider
                                    key={c.key}
                                    label={c.label}
                                    description={c.description}
                                    value={scores[c.key]}
                                    onChange={(v) => updateScore(c.key, v)}
                                />
                            ))}
                        </div>
                    </div>

                    {/* Comment */}
                    <div className="mb-5">
                        <label className="text-sm font-medium text-gray-400 mb-2 block">Notes</label>
                        <textarea
                            value={comment}
                            onChange={(e) => setComment(e.target.value)}
                            placeholder="Optional feedback for this project..."
                            className="w-full bg-white/[0.02] border border-white/10 rounded-xl p-4 text-white placeholder-gray-600 resize-none min-h-[100px] text-sm focus:border-teal-500/50 focus:outline-none focus:ring-1 focus:ring-teal-500/20 transition-all"
                        />
                    </div>

                    {/* Submit */}
                    <button
                        onClick={handleSubmit}
                        disabled={isSubmitting}
                        className="w-full px-8 py-5 bg-gradient-to-r from-teal-500 to-emerald-500 text-white font-bold text-lg rounded-2xl active:scale-[0.98] transition-transform disabled:opacity-50 shadow-xl shadow-teal-500/20 mb-8"
                    >
                        {isSubmitting ? (
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

            <RubricSliderStyles />
        </div>
    );
}
