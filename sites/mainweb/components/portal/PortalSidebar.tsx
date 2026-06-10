"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import {
  LayoutDashboard,
  Code,
  ClipboardList,
  Users,
  BarChart3,
  Settings,
  LogOut,
  Menu,
  QrCode,
  Zap,
  X,
  Sun,
  Moon,
  Home,
  ShieldAlert,
} from "lucide-react";
import { useTheme } from "next-themes";
import { trpc } from "@/lib/trpc";
import logo from "../../assets/images/dsgt/apple-touch-icon.png";

interface PortalSidebarProps {
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
}

export default function PortalSidebar({
  isOpen,
  setIsOpen,
}: PortalSidebarProps) {
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const pathname = usePathname();
  const { data: session } = useSession();
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  const { data: adminStatus } = trpc.admin.isAdmin.useQuery(undefined, {
    enabled: !!session,
  });
  const { data: judgeStatus } = trpc.judge.isJudge.useQuery(undefined, {
    enabled: !!session,
  });
  const { data: memberStatus } = trpc.member.checkStatus.useQuery(undefined, {
    enabled: !!session,
  });

  useEffect(() => {
    setMounted(true);
  }, []);

  // Prevent scrolling when mobile menu is open
  useEffect(() => {
    if (isMobileOpen) document.body.style.overflow = "hidden";
    else document.body.style.overflow = "unset";
    return () => {
      document.body.style.overflow = "unset";
    };
  }, [isMobileOpen]);

  if (pathname === "/login" || pathname === "/verify") return null;

  const mainRoutes = [
    {
      name: "Dashboard",
      href: "/dashboard",
      icon: Home,
      show: !adminStatus?.isAdmin,
    },
    {
      name: "Hackathons",
      href: "/hackathons",
      icon: Zap,
      show: !adminStatus?.isAdmin,
    },
    {
      name: "Club Portal",
      href: "/club",
      icon: QrCode,
      show: memberStatus?.isMember && !adminStatus?.isAdmin,
    },
    {
      name: "Judge Portal",
      href: "/judge",
      icon: ClipboardList,
      show: judgeStatus?.isJudge && !adminStatus?.isAdmin,
    },
  ].filter((r) => r.show);

  const adminRoutes = [
    { name: "Club Hub", href: "/admin", icon: LayoutDashboard },
    { name: "Hackathons", href: "/admin/hackathons", icon: Code },
    { name: "Judging", href: "/admin/judging", icon: ClipboardList },
    { name: "Attendees", href: "/admin/attendees", icon: Users },
    { name: "Analytics", href: "/admin/analytics", icon: BarChart3 },
    { name: "Settings", href: "/admin/settings", icon: Settings },
  ];

  return (
    <>
      {/* Mobile Top Bar */}
      <div className="md:hidden fixed top-0 left-0 right-0 h-16 bg-[var(--bg-primary)]/95 backdrop-blur-xl border-b border-[var(--border-subtle)] z-40 flex items-center justify-between px-4">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-none bg-gradient-to-br from-[#00A8A8]/20 to-transparent">
            <Image
              src={logo}
              alt="DSGT Logo"
              className="h-6 w-auto"
              width={24}
              height={24}
            />
          </div>
          <span className="text-lg font-black text-[var(--text-primary)] tracking-tight">
            DSGT Portal
          </span>
        </div>
        <button
          onClick={() => setIsMobileOpen(true)}
          className="p-2 hover:bg-white/5 rounded-none transition-colors"
        >
          <Menu className="h-6 w-6 text-[var(--text-muted)]" />
        </button>
      </div>

      {/* MOBILE FULLSCREEN MENU (Centered) */}
      {isMobileOpen && (
        <div className="md:hidden fixed inset-0 z-50 bg-[var(--bg-primary)]/98 backdrop-blur-3xl flex flex-col items-center pt-20 pb-10 px-6 overflow-y-auto animate-in fade-in zoom-in-95 duration-200">
          <button
            onClick={() => setIsMobileOpen(false)}
            className="absolute top-4 right-4 p-3 bg-white/5 rounded-sm hover:bg-white/10 transition-colors"
          >
            <X className="w-6 h-6 text-[var(--text-primary)]" />
          </button>

          <div className="w-full max-w-sm flex flex-col items-center gap-10 mt-4">
            {mainRoutes.length > 0 && (
              <div className="w-full text-center">
                <h3 className="text-xs uppercase tracking-widest text-accent font-bold mb-6 flex flex-col items-center gap-2">
                  <Code className="w-6 h-6 opacity-50" />
                  Main Navigation
                </h3>
                <div className="flex flex-col gap-3">
                  {mainRoutes.map((route) => {
                    const isActive =
                      pathname === route.href ||
                      (route.href !== "/dashboard" &&
                        pathname.startsWith(route.href + "/"));
                    return (
                      <Link
                        key={route.href}
                        href={route.href}
                        onClick={() => setIsMobileOpen(false)}
                        className={`flex items-center justify-center gap-3 py-4 rounded-none transition-all ${
                          isActive
                            ? "bg-accent/10 text-accent border border-accent/20 font-bold"
                            : "text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-white/5"
                        }`}
                      >
                        <route.icon className="w-5 h-5" />
                        <span className="text-lg">{route.name}</span>
                      </Link>
                    );
                  })}
                </div>
              </div>
            )}

            {adminStatus?.isAdmin && (
              <>
                <div className="w-full h-px bg-white/10" />
                <div className="w-full text-center">
                  <h3 className="text-xs uppercase tracking-widest text-red-500 font-bold mb-6 flex flex-col items-center gap-2">
                    <ShieldAlert className="w-6 h-6 opacity-50" />
                    Admin Area
                  </h3>
                  <div className="flex flex-col gap-3">
                    {adminRoutes.map((route) => {
                      const isActive =
                        pathname === route.href ||
                        (route.href !== "/admin" &&
                          pathname.startsWith(route.href + "/"));
                      return (
                        <Link
                          key={route.href}
                          href={route.href}
                          onClick={() => setIsMobileOpen(false)}
                          className={`flex items-center justify-center gap-3 py-4 rounded-none transition-all ${
                            isActive
                              ? "bg-red-500/10 text-red-500 border border-red-500/20 font-bold"
                              : "text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-white/5"
                          }`}
                        >
                          <route.icon className="w-5 h-5" />
                          <span className="text-lg">{route.name}</span>
                        </Link>
                      );
                    })}
                  </div>
                </div>
              </>
            )}

            {/* Mobile User Section */}
            <div className="mt-auto w-full pt-8 flex flex-col items-center gap-4">
              <div className="flex items-center gap-3 bg-white/5 px-6 py-4 rounded-sm border border-[var(--border-subtle)]">
                <img
                  src={session?.user?.image || "/avatars/default.png"}
                  alt=""
                  className="h-10 w-10 rounded-sm border border-[var(--border-subtle)] object-cover"
                />
                <div className="text-left max-w-[150px]">
                  <p className="text-sm font-bold text-[var(--text-primary)] truncate">
                    {session?.user?.name || "Guest"}
                  </p>
                </div>
              </div>
              <button
                onClick={() => signOut({ callbackUrl: "/login" })}
                className="flex items-center gap-2 text-red-400 hover:text-red-300 font-bold uppercase tracking-wider text-sm py-2"
              >
                <LogOut className="w-4 h-4" /> Sign Out
              </button>

              {mounted && (
                <button
                  onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                  className="flex items-center gap-2 text-[var(--text-muted)] hover:text-[var(--text-primary)] font-bold uppercase tracking-wider text-sm py-2"
                >
                  {theme === "dark" ? (
                    <Sun className="w-4 h-4" />
                  ) : (
                    <Moon className="w-4 h-4" />
                  )}
                  {theme === "dark" ? "Light Mode" : "Dark Mode"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* DESKTOP SIDEBAR */}
      <div
        className={`hidden md:flex flex-col fixed left-0 top-0 z-40 h-screen border-r border-[var(--border-subtle)] bg-[var(--bg-primary)] dark:bg-darkBlue/80 backdrop-blur-3xl transition-all duration-300 ${isOpen ? "w-64" : "w-20"}`}
      >
        {/* Header */}
        <div className="flex h-16 items-center justify-between border-b border-[var(--border-subtle)] px-4">
          {isOpen && (
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-none bg-gradient-to-br from-[#00A8A8]/10 to-transparent">
                <Image
                  src={logo}
                  alt="DSGT Logo"
                  className="h-6 w-auto transition-transform duration-500 hover:rotate-180"
                  width={24}
                  height={24}
                />
              </div>
              <span className="text-lg font-black text-[var(--text-primary)] tracking-tight">
                DSGT Portal
              </span>
            </div>
          )}
          {!isOpen && (
            <div className="flex h-10 w-10 items-center justify-center rounded-none bg-gradient-to-br from-[#00A8A8]/10 to-transparent mx-auto">
              <Image
                src={logo}
                alt="DSGT Logo"
                className="h-5 w-auto transition-transform duration-500 hover:rotate-180"
                width={20}
                height={20}
              />
            </div>
          )}
          {isOpen && (
            <button
              onClick={() => setIsOpen(false)}
              className="p-2 hover:bg-white/5 rounded-none transition-colors"
            >
              <Menu className="h-5 w-5 text-[var(--text-muted)] hover:text-[var(--text-primary)]" />
            </button>
          )}
        </div>

        {!isOpen && (
          <div className="flex justify-center pt-2">
            <button
              onClick={() => setIsOpen(true)}
              className="p-2 hover:bg-white/5 rounded-none transition-colors"
            >
              <Menu className="h-5 w-5 text-[var(--text-muted)] hover:text-[var(--text-primary)]" />
            </button>
          </div>
        )}

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
          {/* Main Navigation Section */}
          {mainRoutes.length > 0 && (
            <div className="mb-1">
              {isOpen && (
                <div className="flex items-center gap-2 px-3 pb-2 mb-1">
                  <Code className="h-3 w-3 text-accent/60 flex-shrink-0" />
                  <span className="text-[10px] font-mono text-accent/60 uppercase tracking-[0.2em]">
                    Portal
                  </span>
                </div>
              )}
              {!isOpen && (
                <div className="w-8 h-px bg-accent/20 mx-auto mb-3" />
              )}
              <div className="space-y-1">
                {mainRoutes.map((route) => {
                  const isActive =
                    pathname === route.href ||
                    (route.href !== "/dashboard" &&
                      pathname.startsWith(route.href + "/"));
                  return (
                    <Link
                      key={route.href}
                      href={route.href}
                      title={!isOpen ? route.name : undefined}
                      className={`group flex items-center gap-3 rounded-none px-3 py-3 transition-all ${
                        isActive
                          ? "bg-gradient-to-r from-accent/10 to-transparent text-accent font-medium border-l-2 border-accent"
                          : "text-[var(--text-muted)] hover:bg-white/5 hover:text-[var(--text-primary)]"
                      }`}
                    >
                      <route.icon
                        className={`h-5 w-5 flex-shrink-0 transition-colors ${isActive ? "text-accent" : "text-[var(--text-subtle)] group-hover:text-[var(--text-primary)]"}`}
                      />
                      {isOpen && (
                        <span className="text-sm truncate">{route.name}</span>
                      )}
                    </Link>
                  );
                })}
              </div>
            </div>
          )}

          {adminStatus?.isAdmin && (
            <>
              <div
                className={`my-3 ${isOpen ? "border-t border-[var(--border-subtle)]" : "w-8 h-px bg-white/10 mx-auto"}`}
              />

              <div className="mb-4">
                {isOpen && (
                  <div className="flex items-center gap-2 px-3 pb-2 mb-1">
                    <ShieldAlert className="h-3 w-3 text-red-500/60 flex-shrink-0" />
                    <span className="text-[10px] font-mono text-red-500/60 uppercase tracking-[0.2em]">
                      Admin Area
                    </span>
                  </div>
                )}
                {!isOpen && (
                  <div className="w-8 h-px bg-red-500/20 mx-auto mb-3" />
                )}
                <div className="space-y-1">
                  {adminRoutes.map((route) => {
                    const isActive =
                      pathname === route.href ||
                      (route.href !== "/admin" &&
                        pathname.startsWith(route.href + "/"));
                    return (
                      <Link
                        key={route.href}
                        href={route.href}
                        title={!isOpen ? route.name : undefined}
                        className={`group flex items-center gap-3 rounded-none px-3 py-3 transition-all ${
                          isActive
                            ? "bg-gradient-to-r from-red-500/10 to-transparent text-red-500 font-medium border-l-2 border-red-500"
                            : "text-[var(--text-muted)] hover:bg-white/5 hover:text-[var(--text-primary)]"
                        }`}
                      >
                        <route.icon
                          className={`h-5 w-5 flex-shrink-0 transition-colors ${isActive ? "text-red-500" : "text-[var(--text-subtle)] group-hover:text-[var(--text-primary)]"}`}
                        />
                        {isOpen && (
                          <span className="text-sm truncate">{route.name}</span>
                        )}
                      </Link>
                    );
                  })}
                </div>
              </div>
            </>
          )}
        </nav>

        {/* User section */}
        <div className="border-t border-[var(--border-subtle)] px-3 py-4">
          <div className="flex items-center gap-3 rounded-none bg-white/5 p-3">
            {isOpen && (
              <>
                <img
                  src={session?.user?.image || "/avatars/default.png"}
                  alt=""
                  className="h-10 w-10 rounded-sm border border-[var(--border-subtle)] object-cover"
                />
                <div className="flex-1 overflow-hidden">
                  <p className="text-sm font-medium text-[var(--text-primary)] truncate">
                    {session?.user?.name || "Guest"}
                  </p>
                  <p className="text-xs text-[var(--text-subtle)] truncate">
                    {session?.user?.email || "User"}
                  </p>
                </div>
              </>
            )}
            {!isOpen && (
              <img
                src={session?.user?.image || "/avatars/default.png"}
                alt=""
                className="h-8 w-8 rounded-sm border border-[var(--border-subtle)] object-cover mx-auto"
              />
            )}
          </div>
          {isOpen && (
            <div className="mt-3 flex flex-col gap-2 w-full">
              {mounted && (
                <button
                  onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                  className="flex w-full items-center gap-3 rounded-none px-3 py-3 text-[var(--text-subtle)] hover:bg-white/5 hover:text-[var(--text-primary)] transition-colors"
                >
                  {theme === "dark" ? (
                    <Sun className="h-5 w-5" />
                  ) : (
                    <Moon className="h-5 w-5" />
                  )}
                  <span className="text-sm font-semibold">
                    {theme === "dark" ? "Light Mode" : "Dark Mode"}
                  </span>
                </button>
              )}
              <button
                onClick={() => signOut({ callbackUrl: "/login" })}
                className="flex w-full items-center gap-3 rounded-none px-3 py-3 text-[var(--text-subtle)] hover:bg-red-500/10 hover:text-red-400 transition-colors"
              >
                <LogOut className="h-5 w-5" />
                <span className="text-sm font-semibold">Log out</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
