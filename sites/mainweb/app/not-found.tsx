"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import PublicFrame from "@/components/PublicFrame";

export default function NotFound() {
  const [windowWidth, setWindowWidth] = useState<number>(1024);

  useEffect(() => {
    setWindowWidth(window.innerWidth);
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  return (
    <PublicFrame note="404">
      <div className="relative min-h-screen flex flex-col">
        <Navbar screen_width={windowWidth} page="other" />

        <main className="relative z-10 flex-grow pt-40 pb-32 flex items-center justify-center px-6">
          <div className="public-card p-12 max-w-2xl w-full space-y-8">
            <p className="public-kicker">Page not found</p>
            <h1 className="public-display text-5xl md:text-6xl">
              This path is not on the map.
            </h1>
            <p className="public-lede max-w-sm">
              That URL does not exist. Head home, or look at what members are
              building.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 pt-2">
              <Link href="/" className="public-btn">
                Back to home
              </Link>
              <Link
                href="/projects"
                className="public-btn-ghost text-[var(--ink)]"
              >
                View projects
              </Link>
            </div>
          </div>
        </main>

        <Footer screen_width={windowWidth} />
      </div>
    </PublicFrame>
  );
}
