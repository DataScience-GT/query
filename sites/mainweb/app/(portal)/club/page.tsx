"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LoadingScreen } from "@/components/portal/LoadingScreen";
import { QRScannerModal } from "@/components/portal/QRScannerModal";
import { ScanResultModal } from "@/components/portal/ScanResultModal";
import { trpc } from "@/lib/trpc";
import { useSession } from "next-auth/react";
import {
  QrCode, Calendar, Clock, ShieldCheck,
  ChevronRight, LayoutDashboard, Search, Zap
} from "lucide-react";

type Tab = "general" | "history" | "status";

export default function ClubPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const utils = trpc.useUtils();

  const { data: userData } = trpc.user.me.useQuery(undefined, {
    enabled: !!session,
  });
  const { data: memberStatus } = trpc.member.checkStatus.useQuery(undefined, {
    enabled: !!session,
  });
  const { data: myStats } = trpc.events.myStats.useQuery(undefined, {
    enabled: !!session,
  });
  const { data: myEvents } = trpc.events.myEvents.useQuery(undefined, {
    enabled: !!session,
  });

  const [activeTab, setActiveTab] = useState<Tab>("general");

  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.replace('#', '') as Tab;
      if (["general", "history", "status"].includes(hash)) {
        setActiveTab(hash);
      }
    };
    handleHashChange();
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  const [showScanner, setShowScanner] = useState(false);
  const [scanResult, setScanResult] = useState<{
    success: boolean;
    message: string;
    eventTitle?: string;
  } | null>(null);
  const [isPaused, setIsPaused] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [scannedCodes, setScannedCodes] = useState<Set<string>>(new Set());

  const checkInMutation = trpc.events.checkIn.useMutation({
    onSuccess: async (data) => {
      setScanResult({
        success: true,
        message: "Check-in successful!",
        eventTitle: data.eventTitle,
      });
      setShowScanner(false);
      setIsProcessing(false);

      utils.events.myStats.setData(undefined, (old) => {
        if (!old) return { totalEvents: 1 };
        return { totalEvents: old.totalEvents + 1 };
      });

      utils.events.myEvents.invalidate();
      utils.events.myStats.invalidate();
    },
    onError: (error) => {
      setScanResult({
        success: false,
        message: error.message || "Check-in failed",
      });
      setShowScanner(false);
      setIsProcessing(false);
    },
  });

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login");
    } else if (status === "authenticated" && memberStatus && !memberStatus.isMember) {
      router.push("/dashboard");
    }
  }, [status, memberStatus, router]);

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
    setScannedCodes((prev) => new Set(prev).add(scannedData));
    setIsPaused(true);
    setIsProcessing(true);
    try {
      await checkInMutation.mutateAsync({ qrCode: scannedData });
    } catch (error) {
      console.error("Check-in error:", error);
    }
  };

  const handleError = (error: unknown) => {
    console.error("Scanner error:", error);
  };

  if (status === "loading" || !memberStatus) {
    return <LoadingScreen message="Verifying Access..." />;
  }

  if (!session || !memberStatus.isMember) return null;

  const firstName = userData?.name?.split(" ")[0] || "Member";

  const tabs = [
    { id: "general", label: "Event Check-In", icon: QrCode },
    { id: "history", label: "Attendance History", icon: Clock },
    { id: "status", label: "Membership Status", icon: ShieldCheck },
  ];

  return (
    <div className="min-h-screen bg-[#000000] text-gray-400 font-sans selection:bg-[#EAFF2B]/30 overflow-x-hidden relative pb-20">

      {/* Background Ambience */}
      <div className="fixed inset-0 pointer-events-none z-0">
        <div className="absolute top-[-10%] left-[-10%] w-[600px] h-[600px] bg-[#EAFF2B]/5 blur-[200px] rounded-sm animate-[float_20s_ease-in-out_infinite]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[600px] h-[600px] bg-[#6366f1]/5 blur-[200px] rounded-sm animate-[float_25s_ease-in-out_infinite_reverse]" />
        <div className="absolute inset-0 bg-[linear-gradient(rgba(0,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(0,255,255,0.02)_1px,transparent_1px)] bg-[size:64px_64px] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_50%,#000_70%,transparent_100%)]" />
      </div>

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

      {scanResult && (
        <ScanResultModal
          success={scanResult.success}
          message={scanResult.message}
          eventTitle={scanResult.eventTitle}
          onClose={() => setScanResult(null)}
        />
      )}

      <main className="relative z-10 max-w-7xl mx-auto px-6 pt-12 md:pt-20 lg:pt-24 animate-in fade-in slide-in-from-bottom-8 duration-700">

        {/* Profile Header */}
        <div className="relative overflow-hidden rounded-none border border-white/10 bg-[#000000]/80 backdrop-blur-xl shadow-2xl p-8 md:p-12 mb-8 md:mb-12">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-[#EAFF2B] via-[#6366f1] to-[#EAFF2B]" />

          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-8">
            <div className="flex items-center gap-6">
              <div className="relative group shrink-0">
                <div className="absolute -inset-1 rounded-sm bg-gradient-to-r from-[#EAFF2B] to-purple-500 opacity-50 blur-lg transition-all duration-500 group-hover:opacity-100 group-hover:scale-110" />
                {userData?.image ? (
                  <Image
                    src={userData.image}
                    alt="Avatar"
                    width={80}
                    height={80}
                    className="relative w-20 h-20 rounded-sm border-2 border-[#EAFF2B] object-cover"
                  />
                ) : (
                  <div className="relative flex w-20 h-20 items-center justify-center rounded-sm border-2 border-[#EAFF2B] bg-black text-2xl font-bold text-white">
                    {firstName.charAt(0)}
                  </div>
                )}
              </div>
              <div>
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-sm bg-white/5 border border-white/10 mb-3">
                  <div className="w-1.5 h-1.5 rounded-sm bg-[#EAFF2B] animate-pulse" />
                  <span className="text-[10px] font-mono text-[#EAFF2B] uppercase tracking-widest">Active Member</span>
                </div>
                <h1 className="text-3xl md:text-5xl font-black text-white tracking-tight uppercase italic">
                  {userData?.name || "Member"}
                </h1>
                <p className="text-gray-500 font-mono text-xs uppercase tracking-widest mt-1">Club Events Portal</p>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-center gap-4 w-full md:w-auto">
              <Link
                href="/dashboard"
                className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-3 rounded-none border border-white/10 bg-white/5 text-sm font-bold text-white transition-all hover:bg-white/10 hover:border-white/20 active:scale-95"
              >
                <LayoutDashboard className="w-4 h-4 text-gray-400" />
                Main Dashboard
              </Link>
            </div>
          </div>
        </div>

        {/* Hackathon Hub Banner */}
        <Link
          href="/hackathons"
          className="group relative overflow-hidden flex items-center justify-between gap-4 w-full rounded-none border border-[#EAFF2B]/20 bg-[#EAFF2B]/5 hover:bg-[#EAFF2B]/10 hover:border-[#EAFF2B]/40 transition-all duration-300 p-5 md:p-6 mb-8 md:mb-10"
        >
          <div className="absolute inset-0 bg-gradient-to-r from-[#EAFF2B]/5 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />
          <div className="flex items-center gap-4 relative z-10">
            <div className="w-10 h-10 rounded-none bg-[#EAFF2B]/10 border border-[#EAFF2B]/30 flex items-center justify-center shrink-0">
              <Zap className="w-5 h-5 text-[#EAFF2B]" />
            </div>
            <div>
              <p className="text-white font-bold text-sm">Looking for Hackathons?</p>
              <p className="text-gray-500 text-xs mt-0.5">Browse events, view your registrations, and manage your projects in the Hackathon Hub.</p>
            </div>
          </div>
          <ChevronRight className="w-5 h-5 text-[#EAFF2B] shrink-0 group-hover:translate-x-1 transition-transform relative z-10" />
        </Link>

        {/* Tab Navigation */}
        <div className="mb-10 w-full overflow-x-auto scrollbar-none border-b border-white/10 pb-4">
          <div className="flex items-center gap-3 w-max min-w-full">
            {tabs.map((tab) => (
              <Link
                key={tab.id}
                href={`#${tab.id}`}
                className={`flex items-center gap-2 px-5 py-3 rounded-none font-bold text-sm tracking-wide transition-all duration-300 ${activeTab === tab.id
                  ? 'bg-gradient-to-r from-[#EAFF2B]/10 to-transparent border border-[#EAFF2B]/30 text-[#EAFF2B] shadow-[0_0_20px_rgba(0,168,168,0.15)]'
                  : 'text-gray-400 hover:text-white hover:bg-white/5 border border-transparent'
                  }`}
                onClick={() => setActiveTab(tab.id as Tab)}
              >
                <tab.icon className={`w-4 h-4 ${activeTab === tab.id ? 'text-[#EAFF2B]' : 'text-gray-500'}`} />
                {tab.label}
              </Link>
            ))}
          </div>
        </div>

        {/* Tab Content */}
        <div className="relative min-h-[400px]">

          {/* General Check-In */}
          {activeTab === "general" && (
            <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 grid grid-cols-1 lg:grid-cols-3 gap-8">
              <div className="lg:col-span-2 group relative overflow-hidden rounded-none border border-white/10 bg-[#000000] shadow-2xl transition-all duration-500 hover:border-[#EAFF2B]/30 p-8 md:p-12">
                <div className="absolute inset-0 bg-gradient-to-br from-[#EAFF2B]/5 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

                <div className="relative z-10 flex flex-col items-center justify-center text-center h-full min-h-[300px]">
                  <div className="w-24 h-24 mb-6 rounded-none bg-[#EAFF2B]/10 border border-[#EAFF2B]/20 flex items-center justify-center relative">
                    <div className="absolute inset-0 bg-[#EAFF2B]/20 blur-xl rounded-sm" />
                    <QrCode className="w-10 h-10 text-[#EAFF2B] relative z-10" />
                  </div>
                  <h2 className="text-3xl font-black text-white tracking-tighter uppercase italic mb-4">Event Check-In</h2>
                  <p className="text-gray-400 max-w-sm mb-8 text-sm">Scan the QR code displayed at the entrance of general club meetings to record your attendance.</p>

                  <button
                    onClick={() => setShowScanner(true)}
                    disabled={showScanner}
                    className="px-8 py-4 bg-gradient-to-r from-[#EAFF2B] to-[#EAFF2B] rounded-none text-white font-bold tracking-widest text-sm uppercase transition-all hover:scale-105 active:scale-95 shadow-[0_0_30px_rgba(0,168,168,0.4)] disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-3"
                  >
                    <Search className="w-4 h-4" />
                    Launch Scanner
                  </button>
                </div>
              </div>

              <div className="lg:col-span-1 space-y-6">
                <div className="rounded-none border border-white/10 bg-[#000000] p-8 shadow-xl">
                  <h3 className="text-gray-500 font-mono text-xs uppercase tracking-widest mb-2">Total Check-Ins</h3>
                  <div className="flex items-end gap-4">
                    <span className="text-6xl font-black text-white leading-none">{myStats?.totalEvents ?? 0}</span>
                    <span className="text-[#EAFF2B] font-bold mb-1">Sessions</span>
                  </div>
                </div>

                <div className="rounded-none border border-white/10 bg-[#000000] p-8 shadow-xl">
                  <h3 className="text-white font-bold flex items-center gap-2 mb-4">
                    <ShieldCheck className="w-4 h-4 text-[#EAFF2B]" />
                    Quick Guide
                  </h3>
                  <ul className="space-y-4 text-sm text-gray-400">
                    <li className="flex items-start gap-3">
                      <div className="w-1.5 h-1.5 rounded-sm bg-[#EAFF2B] mt-1.5 shrink-0" />
                      General gatherings require QR check-ins for attendance.
                    </li>
                    <li className="flex items-start gap-3">
                      <div className="w-1.5 h-1.5 rounded-sm bg-[#EAFF2B] mt-1.5 shrink-0" />
                      Hackathons have their own separate hub with registration and team tools.
                    </li>
                  </ul>
                </div>
              </div>
            </div>
          )}

          {/* Attendance History */}
          {activeTab === "history" && (
            <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 max-w-4xl">
              {!myEvents || myEvents.length === 0 ? (
                <div className="flex flex-col items-center justify-center p-16 md:p-24 text-center border border-white/10 rounded-none bg-[#000000] shadow-2xl">
                  <div className="w-20 h-20 rounded-sm bg-white/5 border border-white/10 flex items-center justify-center mb-6">
                    <Clock className="w-8 h-8 text-gray-500" />
                  </div>
                  <h3 className="text-2xl font-black text-white mb-3 italic">No history yet</h3>
                  <p className="text-gray-400 max-w-sm">You haven't checked into any events yet. When you do, they will appear here.</p>
                </div>
              ) : (
                <div className="relative border-l-2 border-white/10 ml-4 md:ml-6 space-y-8 pb-4">
                  {myEvents.map((checkIn) => (
                    <div key={checkIn.id} className="relative pl-8 md:pl-12 group">
                      <div className="absolute -left-[9px] top-1/2 -translate-y-1/2 w-4 h-4 rounded-sm border-2 border-[#EAFF2B] bg-black group-hover:bg-[#EAFF2B] group-hover:scale-125 transition-all shadow-[0_0_10px_rgba(0,168,168,0.5)]" />
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between p-6 md:p-8 rounded-none border border-white/10 bg-gradient-to-r from-[#000000] to-black group-hover:border-[#EAFF2B]/30 group-hover:shadow-[0_0_30px_rgba(0,168,168,0.1)] transition-all gap-4">
                        <div>
                          <h4 className="text-xl font-bold text-white mb-3 group-hover:text-[#EAFF2B] transition-colors">{checkIn.event.title}</h4>
                          <div className="flex flex-wrap items-center gap-4 text-xs font-mono text-gray-500">
                            <span className="flex items-center gap-1.5 bg-white/5 px-3 py-1 rounded-md border border-white/5"><Calendar className="w-3.5 h-3.5 text-gray-400" /> {new Date(checkIn.checkedInAt).toLocaleDateString()}</span>
                            {checkIn.event.location && <span className="flex items-center gap-1.5 bg-white/5 px-3 py-1 rounded-md border border-white/5"><QrCode className="w-3.5 h-3.5 text-gray-400" /> {checkIn.event.location}</span>}
                          </div>
                        </div>
                        <div className="px-5 py-2.5 rounded-none bg-[#EAFF2B]/10 text-[#EAFF2B] text-xs font-bold tracking-widest uppercase border border-[#EAFF2B]/20 flex items-center gap-2 w-max shadow-[0_0_15px_rgba(16,185,129,0.15)]">
                          <ShieldCheck className="w-4 h-4" /> Verified
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Membership Status */}
          {activeTab === "status" && (
            <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 max-w-4xl space-y-6">
              <div className="relative overflow-hidden p-8 md:p-10 rounded-none border border-[#EAFF2B]/30 bg-[#EAFF2B]/10 flex flex-col sm:flex-row sm:items-center justify-between gap-8 shadow-[0_0_50px_rgba(16,185,129,0.15)]">
                <div className="absolute -right-20 -top-20 w-64 h-64 bg-[#EAFF2B]/20 blur-[80px] rounded-sm pointer-events-none" />
                <div className="relative z-10">
                  <div className="inline-flex items-center gap-2 px-3 py-1 rounded-sm bg-[#EAFF2B]/20 border border-[#EAFF2B]/30 mb-4">
                    <div className="w-1.5 h-1.5 rounded-sm bg-emerald-400 animate-pulse" />
                    <span className="text-[10px] font-mono text-emerald-400 uppercase tracking-widest font-bold">System Status: Nominal</span>
                  </div>
                  <h4 className="text-3xl md:text-4xl font-black text-white italic mb-2 tracking-tight">Membership Valid</h4>
                  <p className="text-emerald-100/70 text-sm max-w-md leading-relaxed">You have full, unrestricted access to the club portal, hackathons, and exclusive resources.</p>
                </div>
                <div className="relative z-10 flex items-center justify-center w-20 h-20 shrink-0 rounded-sm bg-[#EAFF2B]/20 border border-[#EAFF2B]/40 text-emerald-400 shadow-[0_0_30px_rgba(16,185,129,0.3)] backdrop-blur-md">
                  <ShieldCheck className="w-10 h-10" />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="p-8 rounded-none border border-white/10 bg-[#000000] hover:border-[#EAFF2B]/30 transition-colors shadow-xl">
                  <div className="w-12 h-12 rounded-none bg-white/5 border border-white/10 flex items-center justify-center mb-6">
                    <LayoutDashboard className="w-6 h-6 text-gray-400" />
                  </div>
                  <h4 className="text-xl font-bold text-white mb-2">Account Tier</h4>
                  <p className="text-gray-500 text-sm mb-6 leading-relaxed">Your current privilege level within the query engine ecosystem.</p>
                  <div className="inline-block px-5 py-2.5 rounded-none bg-white/5 border border-white/10 text-white font-black tracking-widest text-sm uppercase shadow-inner">
                    Verified Member
                  </div>
                </div>

                <div className="p-8 rounded-none border border-white/10 bg-[#000000] hover:border-[#EAFF2B]/30 transition-colors shadow-xl">
                  <div className="w-12 h-12 rounded-none bg-white/5 border border-white/10 flex items-center justify-center mb-6">
                    <Clock className="w-6 h-6 text-gray-400" />
                  </div>
                  <h4 className="text-xl font-bold text-white mb-2">Valid Through</h4>
                  <p className="text-gray-500 text-sm mb-6 leading-relaxed">The date your current member profile requires a renewal check.</p>
                  <div className="inline-block px-5 py-2.5 rounded-none bg-[#EAFF2B]/10 border border-[#EAFF2B]/30 text-[#EAFF2B] font-mono tracking-widest text-sm shadow-[0_0_15px_rgba(0,168,168,0.1)]">
                    {/* @ts-ignore */}
                    {memberStatus?.expiresAt ? new Date(memberStatus.expiresAt).toLocaleDateString() : 'N/A'}
                  </div>
                </div>
              </div>
            </div>
          )}

        </div>
      </main>
    </div>
  );
}
