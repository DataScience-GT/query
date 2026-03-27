'use client';

import { useSession } from 'next-auth/react';
import { trpc } from '@/lib/trpc';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import Background from '@/components/portal/Background';
import { LiquidGlass } from '@/components/portal/LiquidGlass';
import { LoadingScreen } from '@/components/portal/LoadingScreen';
import { QRScannerModal } from '@/components/portal/QRScannerModal';
import { ScanResultModal } from '@/components/portal/ScanResultModal';
import { QRCodeSVG } from 'qrcode.react';
import Link from 'next/link';

type Tab = 'overview' | 'projects' | 'history' | 'status';

export default function ClubPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const utils = trpc.useUtils();

  const { data: userData } = trpc.user.me.useQuery(undefined, { enabled: !!session });
  const { data: memberStatus } = trpc.member.checkStatus.useQuery(undefined, { enabled: !!session });
  const { data: myStats } = trpc.events.myStats.useQuery(undefined, { enabled: !!session });
  const { data: myEvents } = trpc.events.myEvents.useQuery(undefined, { enabled: !!session });

  // Fetch active hackathon registration for QR code generation
  const { data: myRegs } = trpc.hackathon.myRegistrations.useQuery(undefined, { enabled: !!session });
  const activeReg = myRegs?.[0]; // Assuming the first one is the active one for the club portal view

  const projects = myRegs?.flatMap(reg => reg.team?.projects || []) || [];

  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [showScanner, setShowScanner] = useState(false);
  const [scanResult, setScanResult] = useState<{
    success: boolean;
    message: string;
    eventTitle?: string;
  } | null>(null);
  const [isPaused, setIsPaused] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [scannedCodes, setScannedCodes] = useState<Set<string>>(new Set());

  // Check-in mutation
  const checkInMutation = trpc.events.checkIn.useMutation({
    onSuccess: async (data) => {
      setScanResult({
        success: true,
        message: 'Check-in successful!',
        eventTitle: data.eventTitle,
      });
      setShowScanner(false);
      setIsProcessing(false);

      // Optimistically update stats before refetch
      utils.events.myStats.setData(undefined, (old) => {
        if (!old) return { totalEvents: 1 };
        return {
          totalEvents: old.totalEvents + 1,
        };
      });

      // Background refresh
      utils.events.myEvents.invalidate();
      utils.events.myStats.invalidate();
    },
    onError: (error) => {
      setScanResult({
        success: false,
        message: error.message || 'Check-in failed',
      });
      setShowScanner(false);
      setIsProcessing(false);
    },
  });

  // Auth & Member Guard
  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login');
    } else if (status === 'authenticated' && memberStatus && !memberStatus.isMember) {
      router.push('/dashboard');
    }
  }, [status, memberStatus, router]);

  // Reset scanned codes when scanner closes
  useEffect(() => {
    if (!showScanner) {
      setScannedCodes(new Set());
    }
  }, [showScanner]);

  const handleScan = async (detectedCodes: { rawValue: string }[]) => {
    if (isProcessing || !detectedCodes || detectedCodes.length === 0) return;

    const scannedData = detectedCodes[0]?.rawValue;
    if (!scannedData) return;

    if (scannedCodes.has(scannedData)) return;

    setScannedCodes(prev => new Set(prev).add(scannedData));
    setIsPaused(true);
    setIsProcessing(true);

    try {
      await checkInMutation.mutateAsync({ qrCode: scannedData });
    } catch (error) {
      console.error('Check-in error:', error);
    }
  };

  const handleError = (error: unknown) => {
    console.error('Scanner error:', error);
  };

  if (status === 'loading' || !memberStatus) {
    return <LoadingScreen message="Verifying Access..." />;
  }

  if (!session || !memberStatus.isMember) return null;

  const firstName = userData?.name?.split(' ')[0] || 'Member';

  const renderTabNavigation = () => (
    <div className="flex flex-wrap gap-2 mb-8 border-b border-white/10 pb-4 justify-center md:justify-start">
      {(['overview', 'history', 'projects', 'status'] as Tab[]).map((tab) => (
        <button
          key={tab}
          onClick={() => setActiveTab(tab)}
          className={`px-6 py-2 rounded-full text-xs font-mono font-black uppercase tracking-[0.2em] transition-all duration-300 ${activeTab === tab
            ? 'bg-[#00A8A8]/20 text-[#00A8A8] border border-[#00A8A8]/50 shadow-[0_0_20px_rgba(0,168,168,0.3)]'
            : 'text-gray-500 hover:text-white hover:bg-white/5 border border-transparent'
            }`}
        >
          {tab}
        </button>
      ))}
    </div>
  );

  return (
    <div className="relative min-h-screen bg-[#050505] text-gray-400 font-sans selection:bg-[#00A8A8]/30 overflow-x-hidden">
      <Background className="fixed inset-0 z-0 opacity-[0.03]" />

      {/* QR SCANNER MODAL */}
      {showScanner && (
        <QRScannerModal
          onClose={() => {
            setShowScanner(false);
            setIsPaused(false);
          }}
          onScan={handleScan}
          onError={handleError}
          isProcessing={isProcessing}
          isPaused={isPaused}
        />
      )}

      {/* SCAN RESULT MODAL */}
      {scanResult && (
        <ScanResultModal
          success={scanResult.success}
          message={scanResult.message}
          eventTitle={scanResult.eventTitle}
          onClose={() => setScanResult(null)}
        />
      )}

      <main className="relative z-10 max-w-5xl mx-auto px-6 py-24 min-h-screen flex flex-col items-center">
        <div className="w-full space-y-12">

          <div className="text-center md:text-left">
            <h1 className="text-5xl lg:text-7xl font-black text-white uppercase tracking-tighter leading-[0.85]">
              Welcome,<br />
              <span className="text-[#00A8A8] italic">
                {firstName}
              </span>
            </h1>
            <p className="mt-4 text-sm text-gray-500 font-mono uppercase tracking-widest leading-relaxed max-w-lg">
              Operational access to DSGT protocols is active. You are viewing your personal matrix.
            </p>
          </div>

          {renderTabNavigation()}

          <div className="transition-all duration-500 min-h-[400px]">
            {activeTab === 'overview' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-start">
                <LiquidGlass className="p-8 rounded-3xl shadow-[0_20px_50px_rgba(0,0,0,0.5)] group hover:border-[#00A8A8]/20 transition-all duration-500">
                  <button
                    onClick={() => setShowScanner(true)}
                    disabled={showScanner}
                    className="w-full px-8 py-4 mb-8 border border-[#00A8A8]/30 text-[#00A8A8] font-black text-sm uppercase tracking-[0.2em] hover:bg-[#00A8A8]/10 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl"
                  >
                    SCAN ROOM CODE (CAMERA)
                  </button>

                  <div className="mb-6 relative flex justify-center">
                    <div className="absolute inset-0 bg-white blur-xl opacity-20 rounded-3xl" />
                    {activeReg ? (
                      <div className="relative p-6 bg-white rounded-3xl shadow-[0_0_40px_rgba(0,168,168,0.3)] inline-flex flex-col items-center">
                        <QRCodeSVG
                          value={JSON.stringify({ type: 'CHECK_IN', hackathonId: activeReg.hackathonId, participantId: activeReg.id })}
                          size={180}
                          level="H"
                          fgColor="#050505"
                          bgColor="#ffffff"
                        />
                      </div>
                    ) : (
                      <div className="relative w-full p-6 bg-white/5 border border-white/10 rounded-3xl h-[228px] flex flex-col items-center justify-center">
                        <p className="text-xs font-mono text-gray-500 uppercase text-center px-4">Register for an event to generate your check-in pass.</p>
                      </div>
                    )}
                  </div>

                  <div className="text-center mb-6">
                    <h2 className="text-xl font-black text-white uppercase tracking-tighter italic">Event Pass</h2>
                    <p className="text-[10px] text-[#00A8A8] uppercase tracking-[0.5em] font-mono">Present to Admin</p>
                  </div>
                </LiquidGlass>

                <div className="space-y-6">
                  <LiquidGlass className="p-6 rounded-2xl">
                    <div className="flex justify-between items-center">
                      <span className="text-[10px] font-mono text-gray-500 uppercase tracking-[0.4em]">LOGGED SESSIONS</span>
                      <div className="flex items-center gap-2">
                        <div className="w-1.5 h-1.5 rounded-full bg-[#00A8A8] animate-pulse" />
                        <span className="text-3xl font-black text-white tabular-nums">{myStats?.totalEvents ?? 0}</span>
                      </div>
                    </div>
                  </LiquidGlass>
                  <LiquidGlass className="p-6 rounded-2xl">
                    <div className="flex justify-between items-center">
                      <span className="text-[10px] font-mono text-gray-500 uppercase tracking-[0.4em]">ACTIVE REGISTRATIONS</span>
                      <span className="text-3xl font-black text-white tabular-nums">{myRegs?.length ?? 0}</span>
                    </div>
                  </LiquidGlass>

                  <button
                    onClick={() => router.push('/dashboard')}
                    className="w-full px-8 py-5 border border-white/10 text-gray-400 font-bold text-sm uppercase tracking-widest hover:bg-white/5 hover:text-white transition-all rounded-xl font-mono mt-4"
                  >
                    &lt; Return To Nexus
                  </button>
                </div>
              </div>
            )}

            {activeTab === 'history' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between mb-8">
                  <h3 className="text-[12px] font-black text-gray-400 uppercase tracking-[0.5em] font-mono">
                    Attendance History
                  </h3>
                  <div className="h-[1px] flex-1 mx-6 bg-white/5" />
                </div>

                {!myEvents || myEvents.length === 0 ? (
                  <div className="text-center py-12 border border-white/5 rounded-2xl bg-white/5">
                    <p className="font-mono text-sm text-gray-500 uppercase tracking-widest">No attendance records found.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {myEvents.map((checkIn) => (
                      <LiquidGlass
                        key={checkIn.id}
                        className="p-6 text-left rounded-2xl hover:border-[#00A8A8]/30 transition-all duration-300 group/item"
                      >
                        <h4 className="text-lg font-black text-white uppercase italic tracking-tight group-hover/item:text-[#00A8A8] transition-colors mb-2">{checkIn.event.title}</h4>
                        <div className="flex flex-col gap-2 mt-4 pt-4 border-t border-white/5">
                          <div className="flex items-center gap-2 text-gray-500">
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                            <span className="text-[10px] font-mono uppercase tracking-widest font-bold">
                              {new Date(checkIn.checkedInAt).toLocaleDateString()} {new Date(checkIn.checkedInAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>
                          {checkIn.event.location && (
                            <div className="flex items-center gap-2 text-gray-500">
                              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                              <span className="text-[10px] font-mono uppercase tracking-widest">{checkIn.event.location}</span>
                            </div>
                          )}
                        </div>
                      </LiquidGlass>
                    ))}
                  </div>
                )}
              </div>
            )}

            {activeTab === 'projects' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between mb-8">
                  <h3 className="text-[12px] font-black text-gray-400 uppercase tracking-[0.5em] font-mono">
                    My Projects
                  </h3>
                  <div className="h-[1px] flex-1 mx-6 bg-white/5" />
                </div>

                {projects.length === 0 ? (
                  <div className="text-center py-12 border border-white/5 rounded-2xl bg-white/5">
                    <p className="font-mono text-sm text-gray-500 uppercase tracking-widest">No projects submitted yet.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {projects.map((project) => (
                      <LiquidGlass key={project.id} className="p-6 rounded-2xl group transition-all duration-300 hover:border-[#00A8A8]/30">
                        <div className="flex justify-between items-start mb-4">
                          <h4 className="text-xl font-black text-white italic group-hover:text-[#00A8A8] transition-colors">{project.name}</h4>
                          <span className={`px-2 py-1 text-[9px] font-mono uppercase tracking-widest rounded-md border ${project.status === 'winner' ? 'bg-yellow-500/10 text-yellow-500 border-yellow-500/30' :
                            project.status === 'judging' ? 'bg-blue-500/10 text-blue-500 border-blue-500/30' :
                              'bg-[#00A8A8]/10 text-[#00A8A8] border-[#00A8A8]/30'
                            }`}>
                            {project.status}
                          </span>
                        </div>
                        <p className="text-sm text-gray-500 line-clamp-3 mb-6">
                          {project.description}
                        </p>

                        <div className="flex flex-wrap gap-2 text-xs font-mono">
                          {project.githubUrl && (
                            <Link href={project.githubUrl} target="_blank" className="text-gray-400 hover:text-white transition-colors underline decoration-white/20 underline-offset-4">
                              GitHub Repository
                            </Link>
                          )}
                          {project.demoUrl && (
                            <Link href={project.demoUrl} target="_blank" className="text-gray-400 hover:text-white transition-colors underline decoration-white/20 underline-offset-4 ml-4">
                              Live Demo
                            </Link>
                          )}
                        </div>
                      </LiquidGlass>
                    ))}
                  </div>
                )}
              </div>
            )}

            {activeTab === 'status' && (
              <div className="space-y-4 max-w-2xl mx-auto">
                <div className="flex items-center justify-between mb-8">
                  <h3 className="text-[12px] font-black text-gray-400 uppercase tracking-[0.5em] font-mono">
                    Verification Matrix
                  </h3>
                  <div className="h-[1px] flex-1 mx-6 bg-white/5" />
                </div>

                <div className="space-y-4">
                  <LiquidGlass className="p-6 rounded-2xl flex items-center justify-between">
                    <div>
                      <h4 className="text-lg font-bold text-white mb-1">Club Membership</h4>
                      <p className="text-xs text-gray-500 font-mono">Core DSGT Network Access</p>
                    </div>
                    <div className="text-right">
                      {memberStatus?.isActive ? (
                        <>
                          <span className="text-[#00A8A8] font-black italic uppercase tracking-widest">Active</span>
                          <p className="text-[10px] text-gray-500 font-mono mt-1">Valid until {new Date(memberStatus.expiresAt!).toLocaleDateString()}</p>
                        </>
                      ) : (
                        <span className="text-red-500 font-black italic uppercase tracking-widest">Inactive</span>
                      )}
                    </div>
                  </LiquidGlass>

                  <LiquidGlass className="p-6 rounded-2xl flex items-center justify-between">
                    <div>
                      <h4 className="text-lg font-bold text-white mb-1">Account Level</h4>
                      <p className="text-xs text-gray-500 font-mono">System privilege tier</p>
                    </div>
                    <div className="text-right">
                      <span className="font-black italic uppercase tracking-widest text-gray-300">
                        {memberStatus?.isMember ? 'MEMBER' : 'USER'}
                      </span>
                    </div>
                  </LiquidGlass>

                  <LiquidGlass className="p-6 rounded-2xl">
                    <h4 className="text-lg font-bold text-white mb-4">Event Registrations</h4>
                    {myRegs && myRegs.length > 0 ? (
                      <div className="space-y-3">
                        {myRegs.map(reg => (
                          <div key={reg.id} className="flex justify-between items-center py-2 border-t border-white/5 first:border-0 first:pt-0">
                            <span className="text-gray-300 text-sm font-medium">{reg.hackathon.name}</span>
                            <span className={`px-2 py-1 text-[9px] font-mono uppercase tracking-widest rounded bg-white/5 border ${reg.registrationStatus === 'approved' ? 'text-[#00A8A8] border-[#00A8A8]/30' : 'text-yellow-500 border-yellow-500/30'
                              }`}>
                              {reg.registrationStatus}
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-gray-500 font-mono">No active event registrations found in the neural network.</p>
                    )}
                  </LiquidGlass>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}