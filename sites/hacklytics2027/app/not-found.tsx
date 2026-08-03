import Link from "next/link";

export default function NotFound() {
  return (
    <main className="relative flex min-h-[100svh] flex-col bg-paper pt-[var(--navbar-height)]">
      <div className="gridlines" />

      <div className="wrap relative z-10 flex flex-1 flex-col justify-center py-20">
        <div className="mono-label rule-b flex justify-between pb-3 text-ink-soft">
          <span>Error</span>
          <span>HTTP 404</span>
        </div>

        <h1 className="display mt-8 text-[clamp(5rem,26vw,20rem)] leading-[0.78]">
          404
        </h1>

        <div className="rule-heavy-t mt-8 grid gap-8 pt-8 md:grid-cols-12">
          <p className="lede md:col-span-6">
            This page was never written, or it was — and then it was deleted by
            someone at 3 AM during a merge.
          </p>
          <div className="md:col-span-4 md:col-start-9">
            <Link
              href="/"
              className="mono-label invert-hover flex items-center justify-between border border-ink px-6 py-5"
            >
              Back to Hacklytics <span>→</span>
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
