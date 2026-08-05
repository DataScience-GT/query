"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import PortalSidebar from "./PortalSidebar";

export default function PortalWrapper({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  // Pages inside (portal) that a signed-out stranger is meant to see. They need
  // the tRPC and session providers this group mounts, but a portal sidebar full
  // of links they cannot use is the wrong first impression.
  const isAuthPage =
    pathname === "/login" ||
    pathname === "/verify" ||
    pathname === "/hacklytics";

  // Default to minimized state
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  return (
    <div className="font-mono bg-[var(--bg-primary)] text-[var(--text-primary)] min-h-screen flex flex-col md:flex-row">
      {!isAuthPage && (
        <PortalSidebar isOpen={isSidebarOpen} setIsOpen={setIsSidebarOpen} />
      )}
      <div
        className={`flex-1 w-full transition-ui duration-300 ${isAuthPage ? "" : isSidebarOpen ? "md:pl-64 pt-16 md:pt-0" : "md:pl-20 pt-16 md:pt-0"}`}
      >
        {children}
      </div>
    </div>
  );
}
