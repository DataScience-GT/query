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

  // --- STATE ---
  const [hasEntered, setHasEntered] = useState(false);
  const [mode, setMode] = useState<DashboardMode>('CLUB');
  const [isEditing, setIsEditing] = useState(false);
  const [editTab, setEditTab] = useState<'basic' | 'member'>('basic');
  const [isCheckingIn, setIsCheckingIn] = useState(false);

  // --- DATA ---
  const { data: userData } = trpc.user.me.useQuery(undefined, { enabled: !!session });
  const { data: memberData } = trpc.member.me.useQuery(undefined, { enabled: !!session });
  const { data: memberStatus } = trpc.member.checkStatus.useQuery(undefined, { enabled: !!session });
  const { data: adminStatus } = trpc.admin.isAdmin.useQuery(undefined, { enabled: !!session });

  const accessLevel = useMemo(() => {
    if (adminStatus?.isAdmin) return `ADMIN_${adminStatus.role?.toUpperCase()}`;
    if (memberStatus?.isMember) return `MEMBER_${memberStatus.memberType?.toUpperCase()}`;
    return 'GUEST_NODE';
  }, [adminStatus, memberStatus]);

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/');
  }, [status, router]);

  if (status === 'loading') return (
    <div className="min-h-screen bg-[#050505] flex items-center justify-center font-mono text-[#00A8A8] animate-pulse uppercase tracking-[0.5em]">
      Syncing_Identity...
    </div>
  );

  if (!session) return null;

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
              <button
                onClick={() => setEditTab('basic')}
                className={`pb-2 text-[10px] uppercase tracking-widest transition-all ${editTab === 'basic' ? 'text-[#00A8A8] border-b border-[#00A8A8]' : 'text-gray-600'}`}
              >
                Basic_Identity
              </button>
              <button
                onClick={() => setEditTab('member')}
                className={`pb-2 text-[10px] uppercase tracking-widest transition-all ${!memberStatus?.isMember ? 'opacity-40' : ''} ${editTab === 'member' ? 'text-[#00A8A8] border-b border-[#00A8A8]' : 'text-gray-600'}`}
              >
                Advanced_Logs {!memberStatus?.isMember && '(Members Only)'}
              </button>
            </div>

            {editTab === 'basic' && userData && (
              <div className="space-y-6">
                <ProfileForm user={userData as any} />

                {/* Guest Profile Editor for interests/skills */}
                {!memberStatus?.isMember && (
                  <div className="border-t border-white/10 pt-6 mt-6">
                    <div className="bg-amber-500/5 border border-amber-500/20 rounded-lg p-4 mb-4">
                      <p className="text-amber-500 text-[10px] uppercase tracking-widest mb-2">💡 Limited Profile Access</p>
                      <p className="text-gray-400 text-xs">
                        As a guest, you can edit basic info. To unlock advanced member features (academic info, detailed portfolio), please register as a member.
                      </p>
                      <button
                        onClick={() => {
                          setIsEditing(false);
                          router.push('/member/register');
                        }}
                        className="mt-3 px-4 py-2 bg-amber-500/10 border border-amber-500/30 text-amber-500 text-[9px] uppercase tracking-widest hover:bg-amber-500 hover:text-black transition-all"
                      >
                        Register_As_Member →
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {editTab === 'member' && (
              memberStatus?.isMember ? (
                <MemberForm member={memberData as any} />
              ) : (
                <div className="text-center py-12 space-y-4">
                  <div className="text-6xl mb-4">🔒</div>
                  <p className="text-amber-500 text-xs uppercase tracking-widest">Members_Only_Section</p>
                  <p className="text-gray-500 text-[10px] max-w-md mx-auto">
                    Advanced member logs include academic records, detailed skill tracking, and official membership credentials. Register to unlock full access.
                  </p>
                  <button
                    onClick={() => {
                      setIsEditing(false);
                      router.push('/member/register');
                    }}
                    className="mt-6 px-6 py-3 bg-amber-500/10 border border-amber-500/30 text-amber-500 text-[10px] uppercase tracking-widest hover:bg-amber-500 hover:text-black transition-all"
                  >
                    Complete_Registration →
                  </button>
                </div>
              )
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

            {/* --- PROFILE MODE (Tiered Guest/Member View) --- */}
            {mode === 'PROFILE' && (
              <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4">
                <div className="grid md:grid-cols-2 gap-6">
                  <MembershipCard memberStatus={memberStatus as any} memberData={memberData} />

                  {/* Public Bio Section (For Everyone) */}
                  <div className="bg-black/40 border border-white/5 p-6 rounded-xl space-y-4">
                    <p className="text-[9px] text-gray-500 uppercase tracking-widest">Public_Data_Node</p>
                    <p className="text-xs text-white leading-relaxed italic font-mono min-h-[40px]">
                      "{userData?.bio || "No public bio transmission found."}"
                    </p>
                    <button onClick={() => { setEditTab('basic'); setIsEditing(true); }} className="text-[#00A8A8] text-[9px] uppercase tracking-widest hover:underline pt-2">Modify_Identity →</button>
                  </div>
                </div>

                {/* Advanced Section: Only for Members */}
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
                        {memberData?.githubUrl && <a href={memberData.githubUrl} target="_blank" className="text-white border border-white/10 px-3 py-1 text-[9px] hover:bg-white hover:text-black transition-all">GITHUB</a>}
                        {memberData?.linkedinUrl && <a href={memberData.linkedinUrl} target="_blank" className="text-white border border-white/10 px-3 py-1 text-[9px] hover:bg-white hover:text-black transition-all">LINKEDIN</a>}
                        {memberData?.portfolioUrl && <a href={memberData.portfolioUrl} target="_blank" className="text-white border border-white/10 px-3 py-1 text-[9px] hover:bg-white hover:text-black transition-all">PORTFOLIO</a>}
                      </div>
                    </div>
                    <div className="md:col-span-2">
                      <p className="text-[9px] text-gray-600 uppercase tracking-widest font-mono italic mb-3">/Skills_&_Interests</p>
                      <div className="flex flex-wrap gap-2">
                        {memberData?.skills?.map((skill: string, i: number) => (
                          <span key={i} className="px-2 py-1 bg-[#00A8A8]/10 border border-[#00A8A8]/30 text-[#00A8A8] text-[9px] uppercase">{skill}</span>
                        ))}
                        {memberData?.interests?.map((interest: string, i: number) => (
                          <span key={i} className="px-2 py-1 bg-white/5 border border-white/10 text-white text-[9px] uppercase">{interest}</span>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="p-10 border border-white/5 bg-white/[0.01] rounded-xl text-center space-y-4">
                    <p className="text-gray-700 font-mono text-[9px] uppercase tracking-[0.4em]">Advanced_Dossier_Encrypted</p>
                    <p className="text-[8px] text-gray-800 mt-2 uppercase">Complete Membership Registration to Unlock Verified Logs</p>
                    <button
                      onClick={() => router.push('/member/register')}
                      className="mt-4 px-6 py-2 border border-amber-500/30 text-amber-500 text-[10px] uppercase tracking-widest hover:bg-amber-500 hover:text-black transition-all"
                    >
                      Register_Member →
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* --- CLUB MODE --- */}
            {mode === 'CLUB' && (
              <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4">
                {memberStatus?.isMember ? (
                  <div className="space-y-6 text-center py-10">
                    <p className="text-[#00A8A8] font-mono text-[10px] tracking-widest animate-pulse">SYSTEMS_NOMINAL</p>
                    <button onClick={() => setIsCheckingIn(true)} className="px-10 py-4 bg-white text-black font-black text-[11px] uppercase tracking-widest italic">Execute_Handshake</button>
                  </div>
                ) : (
                  <div className="py-12 border border-amber-500/20 bg-amber-500/5 rounded-xl text-center space-y-4">
                    <p className="text-amber-500 font-mono text-xs uppercase tracking-widest">ERR: Unregistered_Node</p>
                    <p className="text-gray-500 text-[10px] max-w-md mx-auto">Club operations require active membership. Register to access events, check-ins, and member benefits.</p>
                    <button onClick={() => router.push('/member/register')} className="px-8 py-2 border border-amber-500/30 text-amber-500 text-[10px] uppercase tracking-widest hover:bg-amber-500 hover:text-black transition-all">Register_Member</button>
                  </div>
                )}
              </div>
            )}

            {/* --- HACKLYTICS MODE --- */}
            {mode === 'HACKLYTICS' && (
              <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4">
                <div className="text-center py-10 space-y-4">
                  <p className="text-amber-500 font-mono text-[10px] tracking-widest">Hackathon_Portal_Active</p>
                  <p className="text-gray-500 text-xs max-w-md mx-auto">Browse hackathons, register for events, and submit projects. All users (members and guests) can participate.</p>
                  <button onClick={() => router.push('/hackathons')} className="px-8 py-3 bg-amber-500/10 border border-amber-500/30 text-amber-500 text-[10px] uppercase tracking-widest hover:bg-amber-500 hover:text-black transition-all">
                    View_Hackathons →
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}