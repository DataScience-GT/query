"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Background from "@/components/portal/Background";
import { LiquidGlass } from "@/components/portal/LiquidGlass";
import { LoadingScreen } from "@/components/portal/LoadingScreen";
import { QRScannerModal } from "@/components/portal/QRScannerModal";
import { ScanResultModal } from "@/components/portal/ScanResultModal";
import { trpc } from "@/lib/trpc";
import { useSession } from "next-auth/react";
import { QRCodeSVG } from "qrcode.react";

type Tab = "overview" | "projects" | "history" | "status";

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

  // Fetch active hackathon registration for QR code generation
  const { data: myRegs } = trpc.hackathon.myRegistrations.useQuery(undefined, {
    enabled: !!session,
  });
  const activeReg = myRegs?.[0]; // Assuming the first one is the active one for the club portal view

  const projects = myRegs?.flatMap((reg) => reg.team?.projects || []) || [];

  const [activeTab, setActiveTab] = useState<Tab>("overview");
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
        message: "Check-in successful!",
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
        message: error.message || "Check-in failed",
      });
      setShowScanner(false);
      setIsProcessing(false);
    },
  });

  // Auth & Member Guard
  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login");
    } else if (
      status === "authenticated" &&
      memberStatus &&
      !memberStatus.isMember
    ) {
      router.push("/dashboard");
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

  const tabLabels: Record<Tab, string> = {
    overview: "OVERVIEW",
    history: "EVENT HISTORY",
    projects: "MY PROJECTS",
    status: "MEMBERSHIP STATUS",
  };

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-[#050505] font-sans text-gray-400 selection:bg-[#00A8A8]/30">
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

      <main className="relative z-10 mx-auto grid min-h-screen max-w-7xl gap-8 px-6 py-20 lg:grid-cols-12">
        {/* SIDEBAR */}
        <div className="space-y-4 lg:col-span-4">
          <LiquidGlass className="relative flex h-full flex-col overflow-visible p-6">
            {/* User Profile Header */}
            <div className="mb-8 flex items-center gap-5 border-b border-white/5 pb-8">
              <div className="group relative shrink-0">
                <div className="absolute -inset-0.5 rounded-full bg-gradient-to-r from-[#00A8A8] to-blue-600 opacity-50 blur transition duration-1000 group-hover:opacity-75 group-hover:duration-200"></div>
                {userData?.image ? (
                  <Image
                    src={userData.image}
                    alt="Avatar"
                    width={56}
                    height={56}
                    className="relative h-14 w-14 rounded-full border border-black bg-black object-cover transition-all duration-300"
                  />
                ) : (
                  <div className="relative flex h-14 w-14 items-center justify-center rounded-full border border-black bg-black font-mono font-bold text-white transition-all duration-300">
                    {firstName.charAt(0)}
                  </div>
                )}
              </div>
              <div className="space-y-1">
                <p className="truncate font-mono text-base font-bold tracking-tight text-white uppercase">
                  {userData?.name || "GUEST"}
                </p>
                <div className="flex items-center gap-2">
                  <div className="h-2 w-2 rounded-full bg-[#00A8A8] shadow-[0_0_8px_rgba(0,168,168,0.5)]"></div>
                  <p className="text-xs font-bold tracking-widest text-gray-500 uppercase">
                    CLUB MEMBER
                  </p>
                </div>
              </div>
            </div>

            {/* Navigation */}
            <nav className="flex-1 space-y-2">
              {(Object.keys(tabLabels) as Tab[]).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`group flex w-full items-center justify-between rounded-xl border border-transparent px-6 py-4 text-sm font-bold tracking-widest transition-all duration-200 ${
                    activeTab === tab
                      ? "border-[#00A8A8]/20 bg-white/[0.03] text-[#00A8A8] shadow-[inset_0_0_20px_rgba(0,168,168,0.05)]"
                      : "text-gray-500 hover:bg-white/[0.02] hover:text-white"
                  }`}
                >
                  <span>{tabLabels[tab]}</span>
                  <span
                    className={`h-2 w-2 rounded-full transition-all ${activeTab === tab ? "bg-[#00A8A8] shadow-[0_0_8px_rgba(0,168,168,0.5)]" : "bg-transparent group-hover:bg-white/20"}`}
                  ></span>
                </button>
              ))}
            </nav>

            <div className="mt-8 border-t border-white/5 pt-8">
              <button
                onClick={() => router.push("/dashboard")}
                className="group flex w-full items-center justify-center gap-3 rounded-xl border border-white/5 bg-white/[0.02] px-6 py-4 font-mono text-xs tracking-[0.2em] text-gray-400 uppercase transition-all hover:border-white/10 hover:bg-white/5 hover:text-white"
              >
                <svg
                  className="h-4 w-4 transform transition-transform group-hover:-translate-x-1"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M10 19l-7-7m0 0l7-7m-7 7h18"
                  />
                </svg>
                Return To Nexus
              </button>
            </div>
          </LiquidGlass>
        </div>

        {/* MAIN CONTENT */}
        <div className="flex flex-col lg:col-span-8">
          <LiquidGlass className="relative flex h-full min-h-[600px] flex-col overflow-hidden p-8">
            {/* Decorative Top Line */}
            <div className="absolute top-0 left-0 h-[1px] w-full bg-gradient-to-r from-transparent via-[#00A8A8]/20 to-transparent"></div>

            <div className="relative z-10 mb-12 flex items-end justify-between border-b border-white/5 pb-8">
              <div>
                <p className="mb-2 font-mono text-xs tracking-[0.4em] text-gray-600 uppercase">
                  Club Portal
                </p>
                <h2 className="text-3xl font-black tracking-tighter text-white uppercase italic md:text-4xl">
                  {tabLabels[activeTab]}
                </h2>
              </div>
              <div className="hidden items-center gap-2 rounded-full border border-white/5 bg-white/[0.03] px-3 py-1 sm:flex">
                <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#00A8A8]" />
                <span className="font-mono text-[9px] tracking-wider text-gray-400 uppercase">
                  SYNCED
                </span>
              </div>
            </div>

            <div className="relative z-10 flex flex-1 flex-col">
              <div className="w-full transition-all duration-500">
                {activeTab === "overview" && (
                  <div className="animate-in fade-in slide-in-from-bottom-4 grid grid-cols-1 items-start gap-8 duration-500 md:grid-cols-2">
                    <div className="group relative flex flex-col items-center rounded-3xl border border-[#00A8A8]/10 bg-black/40 p-8 transition-all duration-500 hover:border-[#00A8A8]/30">
                      <div className="transition-duration-500 absolute inset-0 rounded-3xl bg-gradient-to-br from-[#00A8A8]/5 via-transparent to-transparent opacity-0 group-hover:opacity-100" />

                      <button
                        onClick={() => setShowScanner(true)}
                        disabled={showScanner}
                        className="relative z-10 mb-8 w-full rounded-xl border border-[#00A8A8]/30 px-8 py-4 text-xs font-black tracking-[0.2em] text-[#00A8A8] uppercase transition-all hover:bg-[#00A8A8]/10 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        SCAN ROOM CODE (CAMERA)
                      </button>

                      <div className="relative mb-6 flex w-full justify-center">
                        <div className="absolute inset-0 rounded-3xl bg-white opacity-10 blur-xl transition-opacity group-hover:opacity-20" />
                        {activeReg ? (
                          <div className="relative inline-flex transform flex-col items-center rounded-3xl bg-white p-6 shadow-[0_0_40px_rgba(0,168,168,0.1)] transition-shadow duration-500 group-hover:-translate-y-1 group-hover:shadow-[0_0_40px_rgba(0,168,168,0.3)]">
                            <QRCodeSVG
                              value={JSON.stringify({
                                type: "CHECK_IN",
                                hackathonId: activeReg.hackathonId,
                                participantId: activeReg.id,
                              })}
                              size={180}
                              level="H"
                              fgColor="#050505"
                              bgColor="#ffffff"
                            />
                          </div>
                        ) : (
                          <div className="relative flex h-[228px] w-full flex-col items-center justify-center rounded-3xl border border-white/10 bg-white/5 p-6 px-8 text-center">
                            <svg
                              className="mb-4 h-12 w-12 text-gray-600"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={1}
                                d="M12 4v16m8-8H4"
                              />
                            </svg>
                            <p className="font-mono text-xs text-gray-500 uppercase">
                              Register for an event to generate your check-in
                              pass.
                            </p>
                          </div>
                        )}
                      </div>

                      <div className="relative z-10 w-full border-t border-white/5 pt-4 text-center">
                        <h2 className="text-lg font-black tracking-tighter text-white uppercase italic">
                          Personal Event Pass
                        </h2>
                        <p className="mt-1 font-mono text-[10px] tracking-[0.4em] text-gray-500 uppercase">
                          Present to Admin directly
                        </p>
                      </div>
                    </div>

                    <div className="space-y-6">
                      <div className="group relative flex items-center justify-between rounded-2xl border border-white/5 bg-black/40 p-6 transition-colors hover:border-white/10">
                        <div>
                          <span className="mb-1 block font-mono text-[10px] tracking-[0.4em] text-gray-500 uppercase">
                            LOGGED SESSIONS
                          </span>
                          <span className="font-mono text-xs text-gray-400">
                            Total events attended
                          </span>
                        </div>
                        <div className="flex items-center gap-3 rounded-xl bg-white/5 px-4 py-2">
                          <div className="h-2 w-2 animate-pulse rounded-full bg-[#00A8A8] shadow-[0_0_10px_rgba(0,168,168,0.5)]" />
                          <span className="text-3xl font-black text-white tabular-nums">
                            {myStats?.totalEvents ?? 0}
                          </span>
                        </div>
                      </div>

                      <div className="group relative flex items-center justify-between rounded-2xl border border-white/5 bg-black/40 p-6 transition-colors hover:border-white/10">
                        <div>
                          <span className="mb-1 block font-mono text-[10px] tracking-[0.4em] text-gray-500 uppercase">
                            ACTIVE REGISTRATIONS
                          </span>
                          <span className="font-mono text-xs text-gray-400">
                            Current hackathons
                          </span>
                        </div>
                        <div className="flex items-center gap-3 rounded-xl bg-white/5 px-4 py-2">
                          <span className="text-3xl font-black text-white tabular-nums">
                            {myRegs?.length ?? 0}
                          </span>
                        </div>
                      </div>

                      <div className="mt-8 rounded-2xl border border-[#00A8A8]/10 bg-[#00A8A8]/5 p-6">
                        <h4 className="mb-2 font-mono text-sm font-bold tracking-widest text-[#00A8A8] uppercase">
                          Quick Actions
                        </h4>
                        <ul className="space-y-2 text-sm text-gray-400">
                          <li className="flex items-center gap-2">
                            <span className="text-lg leading-none text-[#00A8A8]">
                              &rsaquo;
                            </span>
                            <span>Find local club members easily</span>
                          </li>
                          <li className="flex items-center gap-2">
                            <span className="text-lg leading-none text-[#00A8A8]">
                              &rsaquo;
                            </span>
                            <span>Join upcoming internal events</span>
                          </li>
                        </ul>
                      </div>
                    </div>
                  </div>
                )}

                {activeTab === "history" && (
                  <div className="animate-in fade-in slide-in-from-bottom-4 space-y-6 duration-500">
                    {!myEvents || myEvents.length === 0 ? (
                      <div className="flex flex-col items-center rounded-2xl border border-white/5 bg-black/40 py-16 text-center">
                        <svg
                          className="mb-4 h-12 w-12 text-gray-600"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={1}
                            d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                          />
                        </svg>
                        <p className="font-mono text-sm tracking-widest text-gray-500 uppercase">
                          No attendance records found.
                        </p>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                        {myEvents.map((checkIn) => (
                          <div
                            key={checkIn.id}
                            className="group/item relative overflow-hidden rounded-2xl border border-white/5 bg-black/40 p-6 text-left transition-all duration-300 hover:border-[#00A8A8]/30"
                          >
                            <div className="absolute top-0 right-0 p-4 opacity-5 transition-opacity group-hover:opacity-10">
                              <svg
                                className="h-12 w-12 text-[#00A8A8]"
                                viewBox="0 0 24 24"
                                fill="currentColor"
                              >
                                <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z" />
                              </svg>
                            </div>
                            <h4 className="relative z-10 mb-2 text-lg font-black tracking-tight text-white uppercase italic transition-colors group-hover/item:text-[#00A8A8]">
                              {checkIn.event.title}
                            </h4>
                            <div className="relative z-10 mt-4 flex flex-col gap-2 border-t border-white/5 pt-4">
                              <div className="flex items-center gap-2 text-gray-500">
                                <svg
                                  className="h-3 w-3 text-gray-400"
                                  fill="none"
                                  stroke="currentColor"
                                  viewBox="0 0 24 24"
                                >
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                                  />
                                </svg>
                                <span className="font-mono text-[10px] font-bold tracking-widest text-gray-400 uppercase">
                                  {new Date(
                                    checkIn.checkedInAt,
                                  ).toLocaleDateString()}{" "}
                                  {new Date(
                                    checkIn.checkedInAt,
                                  ).toLocaleTimeString([], {
                                    hour: "2-digit",
                                    minute: "2-digit",
                                  })}
                                </span>
                              </div>
                              {checkIn.event.location && (
                                <div className="flex items-center gap-2 text-gray-500">
                                  <svg
                                    className="h-3 w-3 text-gray-400"
                                    fill="none"
                                    stroke="currentColor"
                                    viewBox="0 0 24 24"
                                  >
                                    <path
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      strokeWidth={2}
                                      d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
                                    />
                                    <path
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      strokeWidth={2}
                                      d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
                                    />
                                  </svg>
                                  <span className="font-mono text-[10px] tracking-widest text-gray-400 uppercase">
                                    {checkIn.event.location}
                                  </span>
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {activeTab === "projects" && (
                  <div className="animate-in fade-in slide-in-from-bottom-4 space-y-6 duration-500">
                    {projects.length === 0 ? (
                      <div className="flex flex-col items-center rounded-2xl border border-white/5 bg-black/40 py-16 text-center">
                        <svg
                          className="mb-4 h-12 w-12 text-gray-600"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={1}
                            d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                          />
                        </svg>
                        <p className="font-mono text-sm tracking-widest text-gray-500 uppercase">
                          No projects submitted yet.
                        </p>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                        {projects.map((project) => (
                          <div
                            key={project.id}
                            className="group flex flex-col rounded-2xl border border-white/5 bg-black/40 p-6 transition-all duration-300 hover:border-[#00A8A8]/30"
                          >
                            <div className="mb-4 flex items-start justify-between">
                              <h4 className="text-xl font-black text-white italic transition-colors group-hover:text-[#00A8A8]">
                                {project.name}
                              </h4>
                              <span
                                className={`rounded-md border px-2 py-1 font-mono text-[9px] tracking-widest uppercase ${
                                  project.status === "winner"
                                    ? "border-yellow-500/30 bg-yellow-500/10 text-yellow-500"
                                    : project.status === "judging"
                                      ? "border-blue-500/30 bg-blue-500/10 text-blue-500"
                                      : "border-[#00A8A8]/30 bg-[#00A8A8]/10 text-[#00A8A8]"
                                }`}
                              >
                                {project.status}
                              </span>
                            </div>
                            <p className="mb-6 line-clamp-3 flex-1 text-sm text-gray-500">
                              {project.description}
                            </p>

                            <div className="flex flex-wrap gap-4 border-t border-white/5 pt-4 font-mono text-xs">
                              {project.githubUrl && (
                                <Link
                                  href={project.githubUrl}
                                  target="_blank"
                                  className="flex items-center gap-1.5 text-gray-400 transition-colors hover:text-white"
                                >
                                  <svg
                                    className="h-4 w-4"
                                    viewBox="0 0 24 24"
                                    fill="currentColor"
                                  >
                                    <path
                                      fillRule="evenodd"
                                      clipRule="evenodd"
                                      d="M12 2C6.477 2 2 6.477 2 12c0 4.42 2.865 8.166 6.839 9.489.5.092.682-.217.682-.482 0-.237-.008-.866-.013-1.7-2.782.603-3.369-1.34-3.369-1.34-.454-1.156-1.11-1.463-1.11-1.463-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.831.092-.646.35-1.086.636-1.336-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.578 9.578 0 0112 6.836c.85.004 1.705.114 2.504.336 1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.203 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.578.688.48C19.138 20.161 22 16.418 22 12c0-5.523-4.477-10-10-10z"
                                    />
                                  </svg>
                                  Repository
                                </Link>
                              )}
                              {project.demoUrl && (
                                <Link
                                  href={project.demoUrl}
                                  target="_blank"
                                  className="flex items-center gap-1.5 text-gray-400 transition-colors hover:text-white"
                                >
                                  <svg
                                    className="h-4 w-4"
                                    fill="none"
                                    stroke="currentColor"
                                    viewBox="0 0 24 24"
                                  >
                                    <path
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      strokeWidth={2}
                                      d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                                    />
                                  </svg>
                                  Live Demo
                                </Link>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {activeTab === "status" && (
                  <div className="animate-in fade-in slide-in-from-bottom-4 max-w-3xl space-y-6 duration-500">
                    <div className="flex items-center justify-between rounded-2xl border border-white/5 bg-black/40 p-6 transition-colors hover:border-white/10">
                      <div>
                        <h4 className="mb-1 text-lg font-bold text-white">
                          Club Membership Status
                        </h4>
                        <p className="font-mono text-xs text-gray-500">
                          Access to core events and resources
                        </p>
                      </div>
                      <div className="flex items-center gap-4 text-right">
                        {memberStatus?.isActive ? (
                          <>
                            <div className="text-right">
                              <span className="text-lg font-black tracking-widest text-[#00A8A8] uppercase italic">
                                Active
                              </span>
                              <p className="mt-1 font-mono text-[10px] text-gray-400">
                                Valid thru{" "}
                                {new Date(
                                  memberStatus.expiresAt!,
                                ).toLocaleDateString()}
                              </p>
                            </div>
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[#00A8A8]/30 bg-[#00A8A8]/10">
                              <svg
                                className="h-5 w-5 text-[#00A8A8]"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M5 13l4 4L19 7"
                                />
                              </svg>
                            </div>
                          </>
                        ) : (
                          <>
                            <div className="text-right">
                              <span className="text-lg font-black tracking-widest text-red-500 uppercase italic">
                                Inactive
                              </span>
                            </div>
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-red-500/30 bg-red-500/10">
                              <svg
                                className="h-5 w-5 text-red-500"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M6 18L18 6M6 6l12 12"
                                />
                              </svg>
                            </div>
                          </>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center justify-between rounded-2xl border border-white/5 bg-black/40 p-6 transition-colors hover:border-white/10">
                      <div>
                        <h4 className="mb-1 text-lg font-bold text-white">
                          Account Permission Level
                        </h4>
                        <p className="font-mono text-xs text-gray-500">
                          Current system privilege tier
                        </p>
                      </div>
                      <div className="text-right">
                        <span className="rounded-lg border border-white/10 bg-white/5 px-4 py-2 font-black tracking-widest text-gray-300 uppercase italic">
                          {memberStatus?.isMember ? "VERIFIED MEMBER" : "USER"}
                        </span>
                      </div>
                    </div>

                    <div className="flex flex-col rounded-2xl border border-white/5 bg-black/40 p-6 transition-colors hover:border-white/10">
                      <div className="mb-6 flex items-center justify-between">
                        <div>
                          <h4 className="mb-1 text-lg font-bold text-white">
                            Event Registrations
                          </h4>
                          <p className="font-mono text-xs text-gray-500">
                            Current hackathons applied to
                          </p>
                        </div>
                      </div>

                      {myRegs && myRegs.length > 0 ? (
                        <div className="space-y-3">
                          {myRegs.map((reg) => (
                            <div
                              key={reg.id}
                              className="flex items-center justify-between border-t border-white/5 py-3 first:border-0 first:pt-0"
                            >
                              <div className="flex items-center gap-3">
                                <div
                                  className={`h-2 w-2 rounded-full ${reg.registrationStatus === "approved" ? "bg-[#00A8A8]" : "bg-yellow-500"}`}
                                />
                                <span className="text-sm font-bold text-gray-300">
                                  {reg.hackathon.name}
                                </span>
                              </div>
                              <span
                                className={`rounded border bg-black/50 px-3 py-1 font-mono text-[10px] font-bold tracking-widest uppercase ${
                                  reg.registrationStatus === "approved"
                                    ? "border-[#00A8A8]/30 text-[#00A8A8]"
                                    : "border-yellow-500/30 text-yellow-500"
                                }`}
                              >
                                {reg.registrationStatus}
                              </span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="rounded-xl border border-white/5 bg-white/5 py-8 text-center">
                          <p className="font-mono text-xs tracking-widest text-gray-500 uppercase">
                            No active event registrations found.
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </LiquidGlass>
        </div>
      </main>
    </div>
  );
}
