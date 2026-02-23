'use client';

import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import Image from 'next/image';

const TRACKS = [
    { id: 'GEN-AI', label: 'Generative AI' },
    { id: 'SPORTS', label: 'Sports' },
    { id: 'FINANCE', label: 'Finance' },
    { id: 'HEALTH', label: 'Healthcare' },
    { id: 'CYBER', label: 'Cybersecurity' },
    { id: 'NONE', label: 'None' },
];

const CHALLENGES = [
    { id: 'AGG', label: 'AggEquo' },
    { id: 'ASSURANT', label: 'Assurant' },
    { id: 'AWS', label: 'AWS' },
    { id: 'CAPONE', label: 'Capital One' },
    { id: 'GROWTH', label: 'GrowthFactor' },
    { id: 'MLH_MONGODB', label: 'MLH MongoDB' },
    { id: 'MLH_STREAMLIT', label: 'MLH Streamlit' },
    { id: 'MLH_TECH', label: 'MLH .TECH' },
    { id: 'MLH_CLOUDFLARE', label: 'MLH Cloudflare' },
    { id: 'MLH_REACH_CAPITAL', label: 'MLH Reach Capital' },
];

export default function SubmitProjectForm({ hackathonId }: { hackathonId: string }) {
    const router = useRouter();
    const { data: session } = useSession();
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const [formData, setFormData] = useState({
        name: '',
        description: '',
        devpostUrl: '',
        githubUrl: '',
        videoUrl: '',
        track1: '',
        track2: '',
        challenges: [] as string[],
        isCreateX: false,
        teamMember1Name: '',
        teamMember1Email: '',
        teamMember2Name: '',
        teamMember2Email: '',
        teamMember3Name: '',
        teamMember3Email: '',
    });

    const submitProject = trpc.hackathon.submitProject.useMutation({
        onSuccess: () => {
            setLoading(false);
            router.push('/dashboard');
        },
        onError: (err) => {
            setLoading(false);
            setError(err.message);
        },
    });

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError('');

        const tracks = [formData.track1, formData.track2].filter(t => t && t !== 'NONE');

        // Collect manual team members
        const teamMembers = [];
        if (formData.teamMember1Name) teamMembers.push(`${formData.teamMember1Name} (${formData.teamMember1Email})`);
        if (formData.teamMember2Name) teamMembers.push(`${formData.teamMember2Name} (${formData.teamMember2Email})`);
        if (formData.teamMember3Name) teamMembers.push(`${formData.teamMember3Name} (${formData.teamMember3Email})`);

        submitProject.mutate({
            hackathonId,
            name: formData.name,
            description: formData.description, // User form didn't explicitly ask for description but schema requires it. We might need to add it or fake it.
            // Wait, user form has "Team/Project Name". It doesn't explicitly show description in the copy/paste.
            // But `hackathonProjects` schema requires description. I'll add a field for it or use name if not provided (though description is typically longer).
            // Let's add a description field to valid schema requirements.
            devpostUrl: formData.devpostUrl,
            tracks,
            challenges: formData.challenges,
            isCreateX: formData.isCreateX,
            teamMembers,
        });
    };

    const toggleChallenge = (id: string) => {
        setFormData(prev => {
            if (prev.challenges.includes(id)) {
                return { ...prev, challenges: prev.challenges.filter(c => c !== id) };
            }
            return { ...prev, challenges: [...prev.challenges, id] };
        });
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-8 text-white">
            <div className="space-y-4">
                <div>
                    <label className="block text-xs uppercase tracking-wider text-gray-400 mb-2">Team/Project Name *</label>
                    <input
                        required
                        type="text"
                        value={formData.name}
                        onChange={e => setFormData({ ...formData, name: e.target.value })}
                        className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 focus:border-[#00A8A8] outline-none transition-colors"
                        placeholder="Enter project name"
                    />
                </div>

                <div>
                    <label className="block text-xs uppercase tracking-wider text-gray-400 mb-2">Project Description *</label>
                    <textarea
                        required
                        value={formData.description}
                        onChange={e => setFormData({ ...formData, description: e.target.value })}
                        className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 focus:border-[#00A8A8] outline-none transition-colors h-32"
                        placeholder="Briefly describe your project..."
                    />
                </div>

                <div>
                    <label className="block text-xs uppercase tracking-wider text-gray-400 mb-2">Submitter Name</label>
                    <input
                        disabled
                        value={session?.user?.name || ''}
                        className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 opacity-50 cursor-not-allowed"
                    />
                </div>

                <div>
                    <label className="block text-xs uppercase tracking-wider text-gray-400 mb-2">Submitter Email</label>
                    <input
                        disabled
                        value={session?.user?.email || ''}
                        className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 opacity-50 cursor-not-allowed"
                    />
                </div>

                <div>
                    <label className="block text-xs uppercase tracking-wider text-gray-400 mb-2">Devpost Link *</label>
                    <input
                        required
                        type="url"
                        value={formData.devpostUrl}
                        onChange={e => setFormData({ ...formData, devpostUrl: e.target.value })}
                        className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 focus:border-[#00A8A8] outline-none transition-colors"
                        placeholder="https://devpost.com/software/..."
                    />
                    <p className="text-xs text-gray-500 mt-1">You can continue making changes until hacking stops.</p>
                </div>
            </div>

            <div className="grid md:grid-cols-2 gap-6">
                <div>
                    <label className="block text-xs uppercase tracking-wider text-gray-400 mb-2">Chosen Track #1 *</label>
                    <select
                        required
                        value={formData.track1}
                        onChange={e => setFormData({ ...formData, track1: e.target.value })}
                        className="w-full bg-black border border-white/10 rounded-lg px-4 py-3 focus:border-[#00A8A8] outline-none transition-colors appearance-none"
                    >
                        <option value="">Select a track...</option>
                        {TRACKS.map(t => (
                            <option key={t.id} value={t.id}>{t.label}</option>
                        ))}
                    </select>
                </div>

                <div>
                    <label className="block text-xs uppercase tracking-wider text-gray-400 mb-2">Chosen Track #2 *</label>
                    <select
                        required
                        value={formData.track2}
                        onChange={e => setFormData({ ...formData, track2: e.target.value })}
                        className="w-full bg-black border border-white/10 rounded-lg px-4 py-3 focus:border-[#00A8A8] outline-none transition-colors appearance-none"
                    >
                        <option value="">Select a track...</option>
                        {TRACKS.map(t => (
                            <option key={t.id} value={t.id}>{t.label}</option>
                        ))}
                    </select>
                </div>
            </div>

            <div>
                <label className="block text-xs uppercase tracking-wider text-gray-400 mb-4">Chosen Challenges</label>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    {CHALLENGES.map(c => (
                        <button
                            key={c.id}
                            type="button"
                            onClick={() => toggleChallenge(c.id)}
                            className={`px-4 py-3 rounded-lg text-sm text-left transition-all border ${formData.challenges.includes(c.id)
                                    ? 'bg-[#00A8A8]/20 border-[#00A8A8] text-[#00A8A8]'
                                    : 'bg-white/5 border-white/10 hover:bg-white/10 text-gray-400'
                                }`}
                        >
                            {c.label}
                        </button>
                    ))}
                </div>
            </div>

            <div className="bg-white/5 border border-white/10 rounded-lg p-6">
                <label className="flex items-start gap-4 cursor-pointer group">
                    <div className={`mt-1 w-5 h-5 rounded border flex items-center justify-center transition-colors ${formData.isCreateX ? 'bg-[#00A8A8] border-[#00A8A8]' : 'border-gray-500 group-hover:border-gray-400'
                        }`}>
                        {formData.isCreateX && <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
                    </div>
                    <input
                        type="checkbox"
                        className="hidden"
                        checked={formData.isCreateX}
                        onChange={e => setFormData({ ...formData, isCreateX: e.target.checked })}
                    />
                    <span className="text-sm text-gray-300">
                        I am interested in taking my project ideas to <strong>CREATE-X Startup Launch</strong>.
                    </span>
                </label>
            </div>

            <div className="space-y-4 border-t border-white/10 pt-8">
                <h3 className="text-lg font-bold text-white">Team Members</h3>
                <p className="text-sm text-gray-500">Please fill out for all other team members (not yourself).</p>

                {[1, 2, 3].map(num => (
                    <div key={num} className="grid md:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs uppercase tracking-wider text-gray-400 mb-2">Member {num} Name</label>
                            <input
                                type="text"
                                value={(formData as any)[`teamMember${num}Name`]}
                                onChange={e => setFormData({ ...formData, [`teamMember${num}Name`]: e.target.value })}
                                className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 focus:border-[#00A8A8] outline-none transition-colors"
                            />
                        </div>
                        <div>
                            <label className="block text-xs uppercase tracking-wider text-gray-400 mb-2">Member {num} Email</label>
                            <input
                                type="email"
                                value={(formData as any)[`teamMember${num}Email`]}
                                onChange={e => setFormData({ ...formData, [`teamMember${num}Email`]: e.target.value })}
                                className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 focus:border-[#00A8A8] outline-none transition-colors"
                            />
                        </div>
                    </div>
                ))}
            </div>

            {error && (
                <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-lg text-red-500 text-sm">
                    {error}
                </div>
            )}

            <button
                type="submit"
                disabled={loading}
                className="w-full py-4 bg-[#00A8A8] hover:bg-[#008a8a] text-white font-bold uppercase tracking-widest rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
                {loading ? 'Submitting...' : 'Submit Project'}
            </button>
        </form>
    );
}
