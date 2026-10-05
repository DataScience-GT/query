"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import { LogOut, Menu, X, Sun, Moon, PanelLeftClose } from "lucide-react";
import { useTheme } from "next-themes";
import { usePortalContext } from "@/lib/use-portal-context";
import { useIsClient } from "@/lib/use-is-client";
import { isPortalNavActive, portalNavSections } from "@/lib/portal-nav";
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
  const mounted = useIsClient();

  const { data: portalContext } = usePortalContext();
  const sections = portalNavSections(portalContext);

  // Prevent scrolling when mobile menu is open
  useEffect(() => {
    if (isMobileOpen) document.body.style.overflow = "hidden";
    else document.body.style.overflow = "unset";
    return () => {
      document.body.style.overflow = "unset";
    };
  }, [isMobileOpen]);

  if (pathname === "/login" || pathname === "/verify") return null;

  const themeLabel = theme === "dark" ? "Paper edition" : "Night edition";
  const ThemeIcon = theme === "dark" ? Sun : Moon;

  const wordmark = (
    <span className="font-[family-name:var(--font-display)] text-[26px] font-semibold leading-none tracking-[-0.01em] text-[var(--text-primary)]">
      Query<span className="text-accent">.</span>
    </span>
  );

  const textButton =
    "flex w-full items-center gap-3 rounded-[var(--radius-sm)] px-3 py-2 text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-secondary)] transition-colors";

  return (
    <>
      {/* Mobile top bar */}
      <div className="md:hidden fixed top-0 left-0 right-0 h-16 bg-[var(--bg-primary)] border-b border-[var(--border-subtle)] z-40 flex items-center justify-between px-4">
        <Link href="/dashboard" className="flex items-center gap-2.5">
          <Image src={logo} alt="" className="h-6 w-6" width={24} height={24} />
          {wordmark}
        </Link>
        <button
          type="button"
          onClick={() => setIsMobileOpen(true)}
          aria-label="Open menu"
          className="p-2.5 rounded-[var(--radius-sm)] hover:bg-[var(--bg-secondary)] transition-colors"
        >
          <Menu className="h-5 w-5 text-[var(--text-primary)]" strokeWidth={1.75} />
        </button>
      </div>

      {/* Mobile menu */}
      {isMobileOpen && (
        <div className="md:hidden fixed inset-0 z-50 bg-[var(--bg-primary)] flex flex-col px-6 pt-4 pb-8 overflow-y-auto">
          <div className="flex h-12 items-center justify-between">
            {wordmark}
            <button
              type="button"
              onClick={() => setIsMobileOpen(false)}
              aria-label="Close menu"
              className="p-2.5 rounded-[var(--radius-sm)] hover:bg-[var(--bg-secondary)] transition-colors"
            >
              <X className="w-5 h-5 text-[var(--text-primary)]" strokeWidth={1.75} />
            </button>
          </div>

          <nav className="mt-8 flex flex-col gap-8">
            {sections.map((section) => (
              <div key={section.id}>
                <h3 className="text-xs text-[var(--text-subtle)] mb-2">
                  {section.label}
                </h3>
                <div className="flex flex-col border-t border-[var(--border-subtle)]">
                  {section.items.map((route) => {
                    const isActive = isPortalNavActive(pathname, route.href);
                    return (
                      <Link
                        key={route.href}
                        href={route.href}
                        onClick={() => setIsMobileOpen(false)}
                        aria-current={isActive ? "page" : undefined}
                        className={`flex items-center justify-between py-3.5 border-b border-[var(--border-subtle)] font-[family-name:var(--font-display)] text-2xl tracking-[-0.01em] ${
                          isActive
                            ? "text-[var(--text-primary)] font-semibold"
                            : "text-[var(--text-muted)]"
                        }`}
                      >
                        {route.name}
                        {isActive && (
                          <span className="h-2 w-2 rounded-full bg-accent" aria-hidden="true" />
                        )}
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}
          </nav>

          <div className="mt-auto pt-10 flex flex-col gap-1">
            <div className="flex items-center gap-3 pb-4">
              <img
                src={session?.user?.image || "/avatars/default.svg"}
                alt=""
                className="h-9 w-9 rounded-full object-cover"
              />
              <div className="min-w-0">
                <p className="text-sm font-semibold text-[var(--text-primary)] truncate">
                  {session?.user?.name || "Guest"}
                </p>
                <p className="text-xs text-[var(--text-subtle)] truncate">
                  {session?.user?.email}
                </p>
              </div>
            </div>
            {mounted && (
              <button
                type="button"
                onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                className={textButton}
              >
                <ThemeIcon className="w-4 h-4" strokeWidth={1.75} />
                {themeLabel}
              </button>
            )}
            <button
              type="button"
              onClick={() => signOut({ callbackUrl: "/login" })}
              className={textButton}
            >
              <LogOut className="w-4 h-4" strokeWidth={1.75} /> Sign out
            </button>
          </div>
        </div>
      )}

      {/* Desktop sidebar */}
      <div
        className={`hidden md:flex flex-col fixed left-0 top-0 z-40 h-screen border-r border-[var(--border-subtle)] bg-[var(--bg-primary)] transition-[width] duration-200 ${isOpen ? "w-60" : "w-[72px]"}`}
      >
        <div
          className={`flex h-20 items-center ${isOpen ? "justify-between px-6" : "justify-center"}`}
        >
          {isOpen ? (
            <Link href="/dashboard" className="flex items-center gap-2.5">
              <Image src={logo} alt="" className="h-6 w-6" width={24} height={24} />
              {wordmark}
            </Link>
          ) : (
            <button
              type="button"
              onClick={() => setIsOpen(true)}
              aria-label="Expand sidebar"
              title="Expand sidebar"
              className="p-2 rounded-[var(--radius-sm)] hover:bg-[var(--bg-secondary)] transition-colors"
            >
              <Image src={logo} alt="" className="h-6 w-6" width={24} height={24} />
            </button>
          )}
          {isOpen && (
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              aria-label="Collapse sidebar"
              title="Collapse sidebar"
              className="p-2 -mr-2 rounded-[var(--radius-sm)] hover:bg-[var(--bg-secondary)] transition-colors"
            >
              <PanelLeftClose className="h-4 w-4 text-[var(--text-subtle)]" strokeWidth={1.75} />
            </button>
          )}
        </div>

        <nav className={`flex-1 overflow-y-auto pb-6 ${isOpen ? "px-3" : "px-2"}`}>
          {sections.map((section, index) => (
            <div key={section.id} className={index > 0 ? "mt-7" : "mt-1"}>
              {isOpen ? (
                <div className="px-3 pb-1.5 text-xs text-[var(--text-subtle)]">
                  {section.label}
                </div>
              ) : (
                index > 0 && (
                  <div className="mx-auto mb-3 h-px w-6 bg-[var(--border-medium)]" />
                )
              )}
              <div className="flex flex-col gap-px">
                {section.items.map((route) => {
                  const isActive = isPortalNavActive(pathname, route.href);
                  return (
                    <Link
                      key={route.href}
                      href={route.href}
                      title={!isOpen ? route.name : undefined}
                      aria-current={isActive ? "page" : undefined}
                      className={`group relative flex items-center gap-3 rounded-[var(--radius-sm)] text-sm transition-colors ${
                        isOpen ? "px-3 py-2" : "justify-center py-2.5"
                      } ${
                        isActive
                          ? "text-[var(--text-primary)] font-semibold bg-[var(--bg-secondary)]"
                          : "text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-secondary)]"
                      }`}
                    >
                      {isActive && (
                        <span
                          aria-hidden="true"
                          className="absolute left-0 top-2 bottom-2 w-[2px] rounded-full bg-accent"
                        />
                      )}
                      <route.icon
                        strokeWidth={1.75}
                        className={`h-4 w-4 flex-shrink-0 ${isActive ? "text-accent" : "text-[var(--text-subtle)] group-hover:text-[var(--text-primary)]"}`}
                      />
                      {isOpen && <span className="truncate">{route.name}</span>}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        <div className={`border-t border-[var(--border-subtle)] py-4 ${isOpen ? "px-3" : "px-2"}`}>
          <div className={`flex items-center gap-3 ${isOpen ? "px-3 pb-3" : "justify-center pb-2"}`}>
            <img
              src={session?.user?.image || "/avatars/default.svg"}
              alt=""
              className={`${isOpen ? "h-8 w-8" : "h-7 w-7"} rounded-full object-cover flex-shrink-0`}
            />
            {isOpen && (
              <div className="min-w-0">
                <p className="text-sm font-semibold text-[var(--text-primary)] truncate">
                  {session?.user?.name || "Guest"}
                </p>
                <p className="text-xs text-[var(--text-subtle)] truncate">
                  {session?.user?.email}
                </p>
              </div>
            )}
          </div>
          {isOpen && (
            <div className="flex flex-col">
              {mounted && (
                <button
                  type="button"
                  onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                  className={textButton}
                >
                  <ThemeIcon className="h-4 w-4" strokeWidth={1.75} />
                  {themeLabel}
                </button>
              )}
              <button
                type="button"
                onClick={() => signOut({ callbackUrl: "/login" })}
                className={textButton}
              >
                <LogOut className="h-4 w-4" strokeWidth={1.75} />
                Sign out
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
