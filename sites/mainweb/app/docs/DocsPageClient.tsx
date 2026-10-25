"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import type { MouseEvent } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { ChevronDown } from "lucide-react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { loginHref } from "@/lib/safe-callback";
import { SECTIONS } from "./content";
import type { DocSection } from "./content";
import { SECTION_BODY } from "./Sections";

// The active section lives in the URL hash (/docs#api), so a section can be
// linked to and the back button steps through them.
function subscribeToHash(onChange: () => void) {
  window.addEventListener("hashchange", onChange);
  return () => window.removeEventListener("hashchange", onChange);
}

const readHash = () => window.location.hash.slice(1);

function toSection(hash: string): DocSection {
  return SECTIONS.find((s) => s.id === hash)?.id ?? "overview";
}

export default function DocsPageClient() {
  const { status } = useSession();
  const router = useRouter();
  const hash = useSyncExternalStore(subscribeToHash, readHash, () => "");
  const active = toSection(hash);
  const articleRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push(loginHref());
    }
  }, [status, router]);

  if (status === "loading" || status === "unauthenticated") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[#050505] font-mono text-gray-400">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#00A8A8] border-t-transparent" />
        <p className="text-xs tracking-[0.3em] uppercase">Checking sign-in</p>
      </div>
    );
  }

  const go = (id: DocSection) => {
    window.location.assign(`#${id}`);
    window.scrollTo({ top: 0 });
    // Move focus so keyboard and screen reader users land on the new section.
    articleRef.current?.focus({ preventScroll: true });
  };

  const onNavClick = (e: MouseEvent, id: DocSection) => {
    e.preventDefault();
    go(id);
  };

  const current = SECTIONS.find((s) => s.id === active) ?? SECTIONS[0];
  const Body = SECTION_BODY[active];

  return (
    <div className="relative min-h-screen bg-[#050505] pt-20 text-white">
      <Navbar screen_width={1024} page="docs" />

      {/* Phones: a native select is the most usable switcher for six items. */}
      <div className="sticky top-20 z-40 border-b border-white/10 bg-[#050505]/95 px-6 py-2 backdrop-blur lg:hidden">
        <label htmlFor="docs-section" className="sr-only">
          Documentation section
        </label>
        <div className="relative">
          <select
            id="docs-section"
            value={active}
            onChange={(e) => go(e.target.value as DocSection)}
            className="min-h-11 w-full appearance-none rounded-sm border border-white/10 bg-[#0a0a0a] pr-10 pl-4 font-mono text-xs tracking-[0.2em] text-white uppercase"
          >
            {SECTIONS.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
          <ChevronDown
            size={16}
            aria-hidden
            className="pointer-events-none absolute top-1/2 right-4 -translate-y-1/2 text-gray-400"
          />
        </div>
      </div>

      <main className="mx-auto max-w-7xl px-6 pt-12 pb-24 lg:grid lg:grid-cols-[13rem_minmax(0,1fr)] lg:gap-16 lg:px-12 lg:pt-16">
        <aside className="hidden lg:block">
          <nav aria-label="Documentation sections" className="sticky top-32">
            <p className="font-mono text-[11px] tracking-[0.3em] text-[#00A8A8] uppercase">
              Documentation
            </p>
            <ul className="mt-4 border-l border-white/10">
              {SECTIONS.map((s) => {
                const on = s.id === active;
                return (
                  <li key={s.id}>
                    <a
                      href={`#${s.id}`}
                      onClick={(e) => onNavClick(e, s.id)}
                      aria-current={on ? "page" : undefined}
                      className={`-ml-px flex min-h-11 items-center border-l-2 pl-4 text-sm transition-colors ${
                        on
                          ? "border-[#00A8A8] font-semibold text-white"
                          : "border-transparent text-gray-400 hover:text-white"
                      }`}
                    >
                      {s.label}
                    </a>
                  </li>
                );
              })}
            </ul>
          </nav>
        </aside>

        <article
          ref={articleRef}
          tabIndex={-1}
          className="min-w-0 max-w-3xl outline-none"
        >
          <p className="font-mono text-xs tracking-[0.3em] text-[#00A8A8] uppercase">
            Developer docs
          </p>
          <h1 className="mt-4 text-5xl font-bold tracking-tighter sm:text-6xl">
            {current.id === "overview" ? "Query" : current.label}
          </h1>
          <Body />
        </article>
      </main>

      <Footer />
    </div>
  );
}
