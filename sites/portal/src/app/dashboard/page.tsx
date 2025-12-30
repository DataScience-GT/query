'use client';

import { useSession, signOut } from 'next-auth/react';
import { trpc } from '@/lib/trpc';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useMemo } from 'react';
import Image from 'next/image';
import Background from '@/components/Background';
import MembershipCard from '@/components/profile/MembershipCard';
import ProfileForm from '@/components/profile/ProfileForm';
import MemberForm from '@/components/profile/MemberForm';

type DashboardMode = 'CLUB' | 'HACKLYTICS' | 'PROFILE';

export default function Dashboard() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const utils = trpc.useUtils();

  // --- STATE ---
  const [mode, setMode] = useState<DashboardMode>('CLUB');
  const [isEditing, setIsEditing] = useState(false);
  const [editTab, setEditTab] = useState<'basic' | 'member'>('basic');

  // Registration form state
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    phoneNumber: '',
    school: 'Georgia Institute of Technology', // Defaulted as requested
    major: '',
    graduationYear: new Date().getFullYear() + 4,
    skills: [] as string[],
    interests: [] as string[],
    linkedinUrl: '',
    githubUrl: '',
    portfolioUrl: '',
  });
  const [skillInput, setSkillInput] = useState('');
  const [interestInput, setInterestInput] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // --- DATA ---
  const { data: userData } = trpc.user.me.useQuery(undefined, { enabled: !!session });
  const { data: memberData } = trpc.member.me.useQuery(undefined, { enabled: !!session });
  const { data: memberStatus } = trpc.member.checkStatus.useQuery(undefined, { enabled: !!session });
  const { data: adminStatus } = trpc.admin.isAdmin.useQuery(undefined, { enabled: !!session });

  // --- EFFECTS ---

  // Auth Guard
  useEffect(() => {
    if (status === 'unauthenticated') router.push('/');
  }, [status, router]);

  // Club Auto-Redirect Logic
  useEffect(() => {
    if (mode === 'CLUB' && memberStatus?.isMember) {
      router.push('/club');
    }
  }, [mode, memberStatus, router]);

  const registerMutation = trpc.member.register.useMutation({
    onSuccess: () => {
      utils.member.me.invalidate();
      utils.member.checkStatus.invalidate();
      router.push('/club'); // Go straight to club page after successful reg
    },
    onError: (error) => {
      setError(error.message);
      setIsSubmitting(false);
    },
  });

  const accessLevel = useMemo(() => {
    if (adminStatus?.isAdmin) return `ADMIN_${adminStatus.role?.toUpperCase()}`;
    if (memberStatus?.isMember) return `MEMBER_${memberStatus.memberType?.toUpperCase()}`;
    return 'GUEST_NODE';
  }, [adminStatus, memberStatus]);

  const handleAddSkill = () => {
    if (skillInput.trim() && formData.skills.length < 20) {
      setFormData({ ...formData, skills: [...formData.skills, skillInput.trim()] });
      setSkillInput('');
    }
  };

  const handleRemoveSkill = (index: number) => {
    setFormData({ ...formData, skills: formData.skills.filter((_, i) => i !== index) });
  };

  const handleAddInterest = () => {
    if (interestInput.trim() && formData.interests.length < 20) {
      setFormData({ ...formData, interests: [...formData.interests, interestInput.trim()] });
      setInterestInput('');
    }
  };

  const handleRemoveInterest = (index: number) => {
    setFormData({ ...formData, interests: formData.interests.filter((_, i) => i !== index) });
  };

  const handleSubmit = () => {
    setIsSubmitting(true);
    setError(null);

    registerMutation.mutate({
      firstName: formData.firstName,
      lastName: formData.lastName,
      phoneNumber: formData.phoneNumber || undefined,
      school: formData.school || undefined,
      major: formData.major || undefined,
      graduationYear: formData.graduationYear || undefined,
      skills: formData.skills.length > 0 ? formData.skills : undefined,
      interests: formData.interests.length > 0 ? formData.interests : undefined,
      linkedinUrl: formData.linkedinUrl || undefined,
      githubUrl: formData.githubUrl || undefined,
      portfolioUrl: formData.portfolioUrl || undefined,
    });
  };

  if (status === 'loading') return (
    <div className="min-h-screen bg-[#050505] flex items-center justify-center font-mono text-[#00A8A8] animate-pulse uppercase tracking-[0.5em]">
      Syncing_Identity...
    </div>
  );

  if (!session) return null;

  const totalSteps = 3;
  const progress = (step / totalSteps) * 100;

  return (
    <div className="relative min-h-screen bg-[#050505] text-gray-400 font-sans selection:bg-[#00A8A8]/30 overflow-x-hidden">
      <Background className="fixed inset-0 z-0 opacity-[0.03]" />

      {/* --- RECONFIGURATION MODAL --- */}
      {isEditing && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6">
          <div className="absolute inset-0 bg-black/95 backdrop-blur-md animate-in fade-in duration-300" onClick={() => setIsEditing(false)} />
          <div className="relative w-full max-w-2xl bg-[#0a0a0a] border border-white/10 rounded-2xl p-6 sm:p-8 shadow-[0_0_50px_rgba(0,0,0,0.8)] overflow-y-auto max-h-[90vh] animate-in zoom-in-95 duration-300">
            <div className="flex justify-between items-center mb-8">
              <div>
                <h3 className="text-2xl font-black text-white italic uppercase tracking-tighter">System_Update</h3>
                <p className="text-[9px] font-mono text-[#00A8A8] uppercase tracking-widest">Reconfiguring_Node_Parameters</p>
              </div>
              <button onClick={() => setIsEditing(false)} className="text-gray-500 hover:text-white transition-colors text-[10px] uppercase tracking-widest">[ Close ]</button>
            </div>

            <div className="flex gap-4 border-b border-white/5 mb-6">
              <button onClick={() => setEditTab('basic')} className={`pb-2 text-[10px] uppercase tracking-widest transition-all ${editTab === 'basic' ? 'text-[#00A8A8] border-b border-[#00A8A8]' : 'text-gray-600'}`}>Basic_Identity</button>
              <button
                onClick={() => memberStatus?.isMember && setEditTab('member')}
                className={`pb-2 text-[10px] uppercase tracking-widest transition-all ${!memberStatus?.isMember ? 'opacity-20 cursor-not-allowed' : ''} ${editTab === 'member' ? 'text-[#00A8A8] border-b border-[#00A8A8]' : 'text-gray-600'}`}
              >
                Member_Dossier {!memberStatus?.isMember && '🔒'}
              </button>
            </div>

            {editTab === 'basic' && userData && <ProfileForm user={userData as any} />}
            {editTab === 'member' && (
              memberStatus?.isMember ? <MemberForm member={memberData as any} /> : <p className="text-center py-10 text-[10px] uppercase text-amber-500">Membership_Required_For_Advanced_Logs</p>
            )}
          </div>
        </div>
      )}

      {/* --- MAIN DASHBOARD UI --- */}
      <main className={`relative z-10 max-w-6xl mx-auto grid lg:grid-cols-12 gap-8 py-20 px-6 transition-all duration-500 ${isEditing ? 'blur-md scale-95 opacity-50 pointer-events-none' : ''}`}>

        {/* SIDEBAR NAVIGATION */}
        <div className="lg:col-span-4 space-y-6">
          <div className="bg-black/60 border border-white/5 rounded-xl p-6 font-mono text-[11px] space-y-6 backdrop-blur-md border-b-2 border-b-[#00A8A8]/20">
            <div className="flex items-center gap-4 border-b border-white/5 pb-6">
              <Image
                src={userData?.image || '/avatar-placeholder.png'}
                alt="P" width={48} height={48}
                className="rounded-full border border-[#00A8A8]/30 grayscale object-cover h-12 w-12"
              />
              <div>
                <p className="text-white font-bold uppercase tracking-tight text-sm">{userData?.name || 'GUEST'}</p>
                <p className="text-[#00A8A8] text-[9px] uppercase tracking-widest italic">{accessLevel}</p>
              </div>
            </div>

            <nav className="space-y-2">
              <button onClick={() => setMode('CLUB')} className={`w-full px-4 py-3 border text-left transition-all text-[9px] font-bold tracking-widest ${mode === 'CLUB' ? 'bg-[#00A8A8]/10 border-[#00A8A8] text-[#00A8A8]' : 'border-white/5 hover:bg-white/5'}`}>{">"} CLUB_OPERATIONS</button>
              <button onClick={() => setMode('PROFILE')} className={`w-full px-4 py-3 border text-left transition-all text-[9px] font-bold tracking-widest ${mode === 'PROFILE' ? 'bg-white/10 border-white text-white' : 'border-white/5 hover:bg-white/5'}`}>{">"} VIEW_DOSSIER</button>
              <button onClick={() => setMode('HACKLYTICS')} className={`w-full px-4 py-3 border text-left transition-all text-[9px] font-bold tracking-widest ${mode === 'HACKLYTICS' ? 'bg-amber-500/10 border-amber-500 text-amber-500' : 'border-white/5 hover:bg-white/5'}`}>{">"} LAB_RESEARCH</button>
            </nav>

            <button onClick={() => { setEditTab('basic'); setIsEditing(true); }} className="w-full px-4 py-3 border border-[#00A8A8]/20 text-[#00A8A8]/70 hover:text-[#00A8A8] hover:border-[#00A8A8] transition-all text-left uppercase text-[9px] tracking-widest italic">{">"} Modify_Identity</button>
          </div>
          <button onClick={() => signOut({ callbackUrl: '/' })} className="w-full py-4 border border-red-500/10 text-red-500/40 hover:bg-red-900/20 hover:text-red-500 transition-all font-mono text-[9px] uppercase tracking-[0.3em]">Terminate_Session</button>
        </div>

        {/* DATA DISPLAY AREA */}
        <div className="lg:col-span-8 space-y-6">
          <div className={`p-8 rounded-xl border backdrop-blur-md relative transition-all duration-500 ${mode === 'CLUB' ? 'border-[#00A8A8]/20 bg-[#00A8A8]/[0.02]' : mode === 'PROFILE' ? 'border-white/10 bg-white/[0.01]' : 'border-amber-500/20 bg-amber-500/[0.02]'}`}>

            <div className="flex justify-between items-start mb-12">
              <h2 className="text-4xl font-black text-white italic uppercase tracking-tighter">{mode}</h2>
              <div className={`h-2 w-2 rounded-full animate-pulse ${mode === 'CLUB' ? 'bg-[#00A8A8]' : mode === 'PROFILE' ? 'bg-white' : 'bg-amber-500'}`} />
            </div>

            {/* --- PROFILE MODE --- */}
            {mode === 'PROFILE' && (
              <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4">
                <div className="grid md:grid-cols-2 gap-6">
                  <MembershipCard memberStatus={memberStatus as any} memberData={memberData} />

                  <div className="bg-black/40 border border-white/5 p-6 rounded-xl space-y-4">
                    <p className="text-[9px] text-gray-500 uppercase tracking-widest">Public_Data_Node</p>
                    <p className="text-xs text-white leading-relaxed italic font-mono min-h-[40px]">
                      "{userData?.bio || "No public bio transmission found."}"
                    </p>
                    <button onClick={() => setIsEditing(true)} className="text-[#00A8A8] text-[9px] uppercase tracking-widest hover:underline pt-2">Modify_Identity →</button>
                  </div>
                </div>

                {memberStatus?.isMember ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 border-t border-white/5 pt-8 animate-in fade-in">
                    <div className="space-y-4">
                      <p className="text-[9px] text-gray-600 uppercase tracking-widest font-mono italic">/Academic_Logs</p>
                      <div className="text-[10px] font-mono space-y-2">
                        <p><span className="text-gray-700">INSTITUTION:</span> {memberData?.school || 'N/A'}</p>
                        <p><span className="text-gray-700">PROGRAM:</span> {memberData?.major || 'N/A'}</p>
                        <p><span className="text-gray-700">CYCLE_END:</span> {memberData?.graduationYear || 'N/A'}</p>
                      </div>
                    </div>
                    <div>
                      <p className="text-[9px] text-gray-600 uppercase tracking-widest font-mono italic">/Neural_Links</p>
                      <div className="flex flex-wrap gap-3 mt-3">
                        {memberData?.githubUrl && <a href={memberData.githubUrl} target="_blank" rel="noopener noreferrer" className="text-white border border-white/10 px-3 py-1 text-[9px] hover:bg-white hover:text-black transition-all">GITHUB</a>}
                        {memberData?.linkedinUrl && <a href={memberData.linkedinUrl} target="_blank" rel="noopener noreferrer" className="text-white border border-white/10 px-3 py-1 text-[9px] hover:bg-white hover:text-black transition-all">LINKEDIN</a>}
                        {memberData?.portfolioUrl && <a href={memberData.portfolioUrl} target="_blank" rel="noopener noreferrer" className="text-white border border-white/10 px-3 py-1 text-[9px] hover:bg-white hover:text-black transition-all">PORTFOLIO</a>}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="p-10 border border-white/5 bg-white/[0.01] rounded-xl text-center">
                    <p className="text-gray-700 font-mono text-[9px] uppercase tracking-[0.4em]">Advanced_Dossier_Encrypted</p>
                    <p className="text-[8px] text-gray-800 mt-2 uppercase">Complete Club Registration to Unlock Verified Logs</p>
                  </div>
                )}
              </div>
            )}

            {/* --- CLUB MODE --- */}
            {mode === 'CLUB' && (
              <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4">
                {memberStatus?.isMember ? (
                  <div className="py-20 text-center">
                    <p className="text-[#00A8A8] font-mono text-[10px] tracking-widest animate-pulse">ESTABLISHING_SECURE_LINK...</p>
                    <p className="text-gray-600 text-[9px] mt-2 uppercase">Redirecting to Club Terminal</p>
                  </div>
                ) : (
                  <div>
                    <div className="mb-8">
                      <div className="bg-black/40 border border-white/10 rounded-full h-2 overflow-hidden">
                        <div className="h-full bg-[#00A8A8] transition-all duration-300" style={{ width: `${progress}%` }} />
                      </div>
                      <p className="text-[9px] font-mono text-gray-600 uppercase tracking-widest mt-2">
                        Registration_Step_{step}_of_{totalSteps}
                      </p>
                    </div>

                    {error && (
                      <div className="mb-6 p-4 bg-red-500/10 border border-red-500/30 rounded-lg">
                        <p className="text-red-500 text-[10px] uppercase tracking-widest">{error}</p>
                      </div>
                    )}

                    {step === 1 && (
                      <div className="space-y-6">
                        <h3 className="text-xl font-bold text-white uppercase tracking-tight">Personal_Information</h3>
                        <div className="grid md:grid-cols-2 gap-6">
                          <div className="space-y-2">
                            <label className="text-[9px] text-gray-500 uppercase tracking-widest font-mono">First_Name *</label>
                            <input
                              type="text"
                              value={formData.firstName}
                              onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                              className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-3 text-white text-sm focus:border-[#00A8A8] focus:outline-none transition-all"
                            />
                          </div>
                          <div className="space-y-2">
                            <label className="text-[9px] text-gray-500 uppercase tracking-widest font-mono">Last_Name *</label>
                            <input
                              type="text"
                              value={formData.lastName}
                              onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                              className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-3 text-white text-sm focus:border-[#00A8A8] focus:outline-none transition-all"
                            />
                          </div>
                        </div>
                        <div className="space-y-2">
                          <label className="text-[9px] text-gray-500 uppercase tracking-widest font-mono">Phone_Number</label>
                          <input
                            type="tel"
                            value={formData.phoneNumber}
                            onChange={(e) => setFormData({ ...formData, phoneNumber: e.target.value })}
                            placeholder="+1234567890"
                            className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-3 text-white text-sm focus:border-[#00A8A8] focus:outline-none transition-all font-mono"
                          />
                        </div>
                        <div className="flex justify-end pt-4">
                          <button
                            onClick={() => setStep(2)}
                            disabled={!formData.firstName || !formData.lastName}
                            className="px-8 py-3 bg-[#00A8A8] text-black font-bold uppercase text-[10px] tracking-widest disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            Next_Step →
                          </button>
                        </div>
                      </div>
                    )}

                    {step === 2 && (
                      <div className="space-y-6">
                        <h3 className="text-xl font-bold text-white uppercase tracking-tight">Academic_Profile</h3>
                        <div className="space-y-2">
                          <label className="text-[9px] text-gray-500 uppercase tracking-widest font-mono">Institution</label>
                          <input
                            type="text"
                            value={formData.school}
                            onChange={(e) => setFormData({ ...formData, school: e.target.value })}
                            placeholder="e.g., Georgia Tech"
                            className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-3 text-white text-sm focus:border-[#00A8A8] focus:outline-none transition-all"
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="text-[9px] text-gray-500 uppercase tracking-widest font-mono">Major/Program</label>
                          <input
                            type="text"
                            value={formData.major}
                            onChange={(e) => setFormData({ ...formData, major: e.target.value })}
                            placeholder="e.g., Computer Science"
                            className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-3 text-white text-sm focus:border-[#00A8A8] focus:outline-none transition-all"
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="text-[9px] text-gray-500 uppercase tracking-widest font-mono">Graduation_Year</label>
                          <input
                            type="number"
                            value={formData.graduationYear}
                            onChange={(e) => setFormData({ ...formData, graduationYear: parseInt(e.target.value) })}
                            min={2024}
                            max={2035}
                            className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-3 text-white text-sm focus:border-[#00A8A8] focus:outline-none transition-all font-mono"
                          />
                        </div>
                        <div className="flex gap-3 pt-4">
                          <button onClick={() => setStep(1)} className="px-8 py-3 border border-white/10 text-gray-400 font-bold uppercase text-[10px] tracking-widest hover:bg-white/5">← Previous</button>
                          <button onClick={() => setStep(3)} className="flex-1 px-8 py-3 bg-[#00A8A8] text-black font-bold uppercase text-[10px] tracking-widest">Next_Step →</button>
                        </div>
                      </div>
                    )}

                    {step === 3 && (
                      <div className="space-y-6">
                        <h3 className="text-xl font-bold text-white uppercase tracking-tight">Skills_&_Network</h3>
                        <div className="space-y-2">
                          <label className="text-[9px] text-gray-500 uppercase tracking-widest font-mono">Technical_Skills</label>
                          <div className="flex gap-2">
                            <input
                              type="text"
                              value={skillInput}
                              onChange={(e) => setSkillInput(e.target.value)}
                              onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddSkill())}
                              placeholder="e.g., Python, React"
                              className="flex-1 bg-black/40 border border-white/10 rounded-lg px-4 py-3 text-white text-sm focus:border-[#00A8A8] focus:outline-none transition-all"
                              maxLength={50}
                            />
                            <button onClick={handleAddSkill} className="px-6 py-3 bg-white/5 border border-white/10 text-white text-[10px] uppercase tracking-widest hover:bg-white/10">Add</button>
                          </div>
                          <div className="flex flex-wrap gap-2 mt-3">
                            {formData.skills.map((skill, i) => (
                              <span key={i} className="px-3 py-1 bg-[#00A8A8]/10 border border-[#00A8A8]/30 text-[#00A8A8] text-[9px] uppercase flex items-center gap-2">
                                {skill}
                                <button onClick={() => handleRemoveSkill(i)} className="hover:text-white">×</button>
                              </span>
                            ))}
                          </div>
                        </div>

                        <div className="space-y-2">
                          <label className="text-[9px] text-gray-500 uppercase tracking-widest font-mono">Interests</label>
                          <div className="flex gap-2">
                            <input
                              type="text"
                              value={interestInput}
                              onChange={(e) => setInterestInput(e.target.value)}
                              onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddInterest())}
                              placeholder="e.g., AI, Blockchain"
                              className="flex-1 bg-black/40 border border-white/10 rounded-lg px-4 py-3 text-white text-sm focus:border-[#00A8A8] focus:outline-none transition-all"
                              maxLength={50}
                            />
                            <button onClick={handleAddInterest} className="px-6 py-3 bg-white/5 border border-white/10 text-white text-[10px] uppercase tracking-widest hover:bg-white/10">Add</button>
                          </div>
                          <div className="flex flex-wrap gap-2 mt-3">
                            {formData.interests.map((interest, i) => (
                              <span key={i} className="px-3 py-1 bg-white/5 border border-white/10 text-white text-[9px] uppercase flex items-center gap-2">
                                {interest}
                                <button onClick={() => handleRemoveInterest(i)} className="hover:text-[#00A8A8]">×</button>
                              </span>
                            ))}
                          </div>
                        </div>

                        <div className="space-y-4 pt-4 border-t border-white/5">
                          <div className="space-y-2">
                            <label className="text-[9px] text-gray-500 uppercase tracking-widest font-mono">LinkedIn_URL</label>
                            <input
                              type="url"
                              value={formData.linkedinUrl}
                              onChange={(e) => setFormData({ ...formData, linkedinUrl: e.target.value })}
                              placeholder="https://linkedin.com/in/username"
                              className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-3 text-white text-sm focus:border-[#00A8A8] focus:outline-none transition-all font-mono"
                            />
                          </div>
                          <div className="space-y-2">
                            <label className="text-[9px] text-gray-500 uppercase tracking-widest font-mono">GitHub_URL</label>
                            <input
                              type="url"
                              value={formData.githubUrl}
                              onChange={(e) => setFormData({ ...formData, githubUrl: e.target.value })}
                              placeholder="https://github.com/username"
                              className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-3 text-white text-sm focus:border-[#00A8A8] focus:outline-none transition-all font-mono"
                            />
                          </div>
                          <div className="space-y-2">
                            <label className="text-[9px] text-gray-500 uppercase tracking-widest font-mono">Portfolio_URL</label>
                            <input
                              type="url"
                              value={formData.portfolioUrl}
                              onChange={(e) => setFormData({ ...formData, portfolioUrl: e.target.value })}
                              placeholder="https://yourportfolio.com"
                              className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-3 text-white text-sm focus:border-[#00A8A8] focus:outline-none transition-all font-mono"
                            />
                          </div>
                        </div>

                        <div className="flex gap-3 pt-6">
                          <button onClick={() => setStep(2)} className="px-8 py-3 border border-white/10 text-gray-400 font-bold uppercase text-[10px] tracking-widest hover:bg-white/5">← Previous</button>
                          <button
                            onClick={handleSubmit}
                            disabled={isSubmitting}
                            className="flex-1 px-8 py-3 bg-[#00A8A8] text-black font-bold uppercase text-[10px] tracking-widest disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {isSubmitting ? 'Registering...' : 'Complete_Registration'}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* --- HACKLYTICS MODE --- */}
            {mode === 'HACKLYTICS' && (
              <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4">
                <div className="text-center py-20">
                  <p className="text-amber-500 font-mono text-sm uppercase tracking-widest mb-4">Hackathon_System_Coming_Soon</p>
                  <p className="text-gray-600 text-xs">Browse hackathons, register, form teams, and submit projects.</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}