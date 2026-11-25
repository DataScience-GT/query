"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { isHacklyticsPath } from "@/lib/hackathon-slug";
import PortalSidebar from "./PortalSidebar";
import type { PortalSidebarSection } from "./PortalSidebar";

export default function PortalWrapper({
  sections,
  children,
}: {
  sections: PortalSidebarSection[];
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  // Pages inside (portal) that a signed-out stranger is meant to see. They need
  // the tRPC and session providers this group mounts, but a portal sidebar full
  // of links they cannot use is the wrong first impression. Guest judges come
  // in through a room's QR code with no account at all.
  const isAuthPage =
    pathname === "/hacklytics" ||
    pathname.startsWith("/judge/guest") ||
    pathname.startsWith("/judge/activate");

  // A Hacklytics edition wears the Digital Bloom look from edge to edge: the
  // sidebar and top bar read the same tokens as the page, so one class on the
  // shell is all it takes. It is always dark, so the theme switch has nothing
  // to switch there.
  const bloom = isHacklyticsPath(pathname);

  // Open by default: collapsed, the rail is a column of unlabeled icons.
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  return (
    <div
      className={`${bloom ? "hl-theme " : ""}bg-[var(--bg-primary)] text-[var(--text-primary)] min-h-screen flex flex-col md:flex-row`}
    >
      {!isAuthPage && (
        <PortalSidebar
          isOpen={isSidebarOpen}
          setIsOpen={setIsSidebarOpen}
          sections={sections}
          fixedTheme={bloom}
        />
      )}
      <div
        className={`flex-1 w-full transition-[padding] duration-200 ${isAuthPage ? "" : isSidebarOpen ? "md:pl-60 pt-16 md:pt-0" : "md:pl-[72px] pt-16 md:pt-0"}`}
      >
        {children}
      </div>
    </div>
  );
}
