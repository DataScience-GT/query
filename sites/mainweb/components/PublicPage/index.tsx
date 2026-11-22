import type { ReactNode } from "react";
import Footer from "@/components/Footer";
import Navbar from "@/components/Navbar";

interface PublicPageProps {
  /** Small teal line above the title, such as a term or a year range. */
  eyebrow?: ReactNode;
  title: string;
  lede?: ReactNode;
  /** A link or button under the lede. */
  action?: ReactNode;
  children: ReactNode;
}

/**
 * The frame every public page shares: nav, one content column whose left
 * edge lines up with the logo, the page header, and the footer.
 */
export default function PublicPage({
  eyebrow,
  title,
  lede,
  action,
  children,
}: PublicPageProps) {
  return (
    <div className="selection:bg-dsgt-teal/30 relative min-h-screen overflow-x-hidden bg-[#050505] font-sans text-gray-400">
      <Navbar />
      <main className="relative z-10 mx-auto max-w-7xl px-6 pt-36 pb-32 md:pt-44 lg:px-12">
        <header className="mb-20 max-w-3xl space-y-6 md:mb-24">
          {eyebrow && (
            <p className="text-dsgt-teal font-mono text-xs tracking-[0.2em] uppercase">
              {eyebrow}
            </p>
          )}
          <h1 className="text-5xl leading-none font-bold tracking-tighter text-white md:text-7xl">
            {title}
          </h1>
          {lede && (
            <p className="max-w-xl text-lg leading-relaxed text-gray-300">
              {lede}
            </p>
          )}
          {action}
        </header>
        {children}
      </main>
      <Footer className="relative z-10 border-t border-white/5" />
    </div>
  );
}

/** Section title with the fading rule, as on /projects and /team. */
export function SectionHeading({
  children,
  id,
}: {
  children: ReactNode;
  id?: string;
}) {
  return (
    <div className="mb-12 flex items-center gap-4">
      <h2
        id={id}
        className="text-3xl font-bold tracking-tight text-balance text-white"
      >
        {children}
      </h2>
      <div className="from-dsgt-teal/20 h-px min-w-12 flex-1 bg-gradient-to-r to-transparent" />
    </div>
  );
}
