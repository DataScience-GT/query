"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";

type DocSection =
  | "overview"
  | "architecture"
  | "api"
  | "database"
  | "frontend"
  | "deployment";

const NAV_ITEMS: { id: DocSection; label: string; icon: string }[] = [
  { id: "overview", label: "Overview", icon: "-" },
  { id: "architecture", label: "Architecture", icon: "-" },
  { id: "api", label: "API Reference", icon: "-" },
  { id: "database", label: "Database", icon: "-" },
  { id: "frontend", label: "Frontend", icon: "-" },
  { id: "deployment", label: "Deployment", icon: "^" },
];

function CodeBlock({ title, code }: { title?: string; code: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="group mb-8 transform-gpu overflow-hidden rounded-2xl border border-white/5 bg-black/60 shadow-[0_10px_40px_rgba(0,0,0,0.5)] transition-all duration-300 hover:border-white/10">
      <div className="flex items-center justify-between border-b border-white/5 bg-white/[0.01] px-5 py-3">
        <div className="flex items-center gap-4">
          <div className="flex gap-2">
            <div className="h-3 w-3 rounded-full bg-red-500/80 shadow-[0_0_10px_rgba(239,68,68,0.2)]" />
            <div className="h-3 w-3 rounded-full bg-yellow-500/80 shadow-[0_0_10px_rgba(234,179,8,0.2)]" />
            <div className="h-3 w-3 rounded-full bg-green-500/80 shadow-[0_0_10px_rgba(34,197,94,0.2)]" />
          </div>
          {title && (
            <span className="font-mono text-[11px] tracking-widest text-gray-500 uppercase">
              {title}
            </span>
          )}
        </div>
        <button
          onClick={() => {
            navigator.clipboard.writeText(code);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          }}
          className="rounded-md p-1.5 text-gray-500 transition-colors hover:bg-white/5 hover:text-white"
          title="Copy to clipboard"
        >
          {copied ? (
            <svg
              className="h-4 w-4 text-green-500"
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
          ) : (
            <svg
              className="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
              />
            </svg>
          )}
        </button>
      </div>
      <pre className="scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent overflow-x-auto p-6 font-mono text-[13px] leading-relaxed text-gray-300/90">
        <code>{code}</code>
      </pre>
    </div>
  );
}

function InfoCard({
  title,
  description,
  items,
  accent = "#00A8A8",
}: {
  title: string;
  description?: string;
  items?: string[];
  accent?: string;
}) {
  return (
    <div
      className="group relative flex h-full flex-col overflow-hidden rounded-3xl border border-white/5 bg-black/40 p-6 backdrop-blur-sm transition-all duration-500 hover:-translate-y-1 hover:border-white/10 hover:bg-[#050505] hover:shadow-[0_20px_40px_rgba(0,0,0,0.4)] md:p-8"
      style={{ borderTopColor: `${accent}40`, borderTopWidth: "2px" }}
    >
      <div className="absolute top-0 right-0 transform p-6 opacity-0 transition-all duration-700 group-hover:scale-110 group-hover:-rotate-3 group-hover:opacity-5">
        <svg
          className="h-24 w-24 text-white"
          viewBox="0 0 24 24"
          fill="currentColor"
        >
          <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
        </svg>
      </div>

      <h4 className="relative z-10 mb-2 text-xl font-black text-white transition-colors group-hover:text-[#00A8A8]">
        {title}
      </h4>
      {description && (
        <p className="relative z-10 mb-6 font-mono text-xs tracking-wider text-[#00A8A8] uppercase opacity-80 group-hover:opacity-100">
          {description}
        </p>
      )}

      <div className="relative z-10 mt-auto">
        {items && (
          <ul className="space-y-4">
            {items.map((item, i) => (
              <li
                key={i}
                className="flex items-start gap-3 text-sm text-gray-400 transition-colors group-hover:text-gray-300"
              >
                <span className="mt-0.5 text-[10px]" style={{ color: accent }}>
                  *
                </span>
                <span className="leading-relaxed">{item}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function ApiEndpoint({
  method,
  route,
  description,
  auth,
}: {
  method: string;
  route: string;
  description: string;
  auth?: string;
}) {
  const methodColors: Record<string, string> = {
    QUERY: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
    MUTATION: "text-orange-400 bg-orange-500/10 border-orange-500/20",
  };
  return (
    <div className="group relative mb-4 overflow-hidden rounded-2xl border border-white/5 bg-black/40 p-5 transition-all duration-300 hover:border-white/10 hover:bg-white/[0.02] hover:shadow-xl md:p-6">
      <div className="absolute top-0 left-0 h-full w-1 bg-white/5 transition-colors duration-500 group-hover:bg-[#00A8A8]" />

      <div className="mb-3 flex flex-col justify-between gap-4 pl-3 sm:flex-row sm:items-center">
        <div className="flex items-center gap-3">
          <span
            className={`rounded border px-2.5 py-1 font-mono text-[10px] font-black tracking-widest uppercase ${methodColors[method] || "border-white/10 bg-white/5 text-gray-400"}`}
          >
            {method}
          </span>
          <code className="relative font-mono text-sm font-bold text-gray-200 transition-colors group-hover:text-[#00A8A8] md:text-base">
            {route}
          </code>
        </div>
        {auth && (
          <span
            className={`flex items-center gap-1.5 self-start rounded border px-2 py-1 font-mono text-[10px] tracking-widest uppercase sm:self-auto ${auth === "Public" ? "border-green-500/20 bg-green-500/10 text-green-400" : "border-yellow-500/20 bg-yellow-500/10 text-yellow-500"}`}
          >
            {auth === "Protected" && (
              <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 20 20">
                <path
                  fillRule="evenodd"
                  d="M10 2a5 5 0 00-5 5v2a2 2 0 00-2 2v5a2 2 0 002 2h10a2 2 0 002-2v-5a2 2 0 00-2-2H7V7a3 3 0 015.905-.75 1 1 0 001.937-.5A5.002 5.002 0 0010 2z"
                  clipRule="evenodd"
                />
              </svg>
            )}
            {auth}
          </span>
        )}
      </div>
      <p className="mt-2 pl-3 text-sm leading-relaxed text-gray-400">
        {description}
      </p>
    </div>
  );
}

function SchemaTable({
  name,
  columns,
}: {
  name: string;
  columns: { field: string; type: string; notes?: string }[];
}) {
  return (
    <div className="group mt-4 mb-8 overflow-hidden rounded-2xl border border-white/5 bg-black/20 shadow-lg backdrop-blur-md transition-all duration-500 hover:border-[#00A8A8]/20">
      <div className="flex items-center justify-between border-b border-white/5 bg-gradient-to-r from-[#00A8A8]/10 to-transparent px-6 py-4">
        <h4 className="flex items-center gap-3 font-mono text-sm font-black tracking-widest text-white uppercase">
          <span className="text-lg leading-none text-[#00A8A8] transition-transform duration-700 group-hover:rotate-180">
            -
          </span>{" "}
          {name}
        </h4>
        <span className="font-mono text-[10px] tracking-[0.3em] text-[#00A8A8] uppercase opacity-50">
          Table
        </span>
      </div>
      <div className="p-0">
        {columns.map((col, i) => (
          <div
            key={i}
            className={`flex flex-col justify-between border-b border-white/5 p-4 px-6 transition-colors last:border-0 hover:bg-white/[0.03] sm:flex-row sm:items-center ${i % 2 === 0 ? "bg-transparent" : "bg-white/[0.01]"}`}
          >
            <div className="mb-2 flex items-center gap-4 sm:mb-0">
              <span className="min-w-[140px] font-mono text-sm font-bold tracking-tight text-white">
                {col.field}
              </span>
              <span
                className={`rounded px-2 py-0.5 font-mono text-[10px] tracking-wider uppercase ${
                  col.type.includes("uuid")
                    ? "border border-purple-500/20 bg-purple-500/10 text-purple-400 shadow-[0_0_10px_rgba(168,85,247,0.1)]"
                    : col.type.includes("timestamp")
                      ? "border border-blue-500/20 bg-blue-500/10 text-blue-400 shadow-[0_0_10px_rgba(59,130,246,0.1)]"
                      : col.type.includes("json")
                        ? "border border-yellow-500/20 bg-yellow-500/10 text-yellow-400 shadow-[0_0_10px_rgba(234,179,8,0.1)]"
                        : col.type.includes("boolean")
                          ? "border border-emerald-500/20 bg-emerald-500/10 text-emerald-400 shadow-[0_0_10px_rgba(16,185,129,0.1)]"
                          : "border border-white/10 bg-white/5 text-gray-400"
                }`}
              >
                {col.type}
              </span>
            </div>
            <span className="font-mono text-xs text-gray-500 italic sm:text-right">
              {col.notes || "—"}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function DocsPageClient() {
  const { status } = useSession();
  const router = useRouter();
  const [activeSection, setActiveSection] = useState<DocSection>("overview");

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login");
    }
  }, [status, router]);

  if (status === "loading" || status === "unauthenticated") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[#050505] font-mono text-gray-400">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#00A8A8] border-t-transparent" />
        <p className="text-xs tracking-[0.3em] uppercase">Authenticating...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#050505] font-sans text-gray-400 selection:bg-[#00A8A8]/30">
      {/* Subtle grid background */}
      <div
        className="fixed inset-0 z-0 opacity-[0.03]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.05) 1px, transparent 1px)",
          backgroundSize: "60px 60px",
        }}
      />

      {/* Top faded gradient line */}
      <div className="fixed top-0 right-0 left-0 z-50 h-[2px] bg-gradient-to-r from-transparent via-[#00A8A8]/30 to-transparent lg:hidden" />

      <div className="relative z-10 flex min-h-screen items-start">
        {/* SIDEBAR */}
        <aside className="sticky top-0 z-50 hidden h-screen w-72 flex-col border-r border-white/5 bg-[#050505]/80 p-8 shadow-[20px_0_40px_rgba(0,0,0,0.5)] backdrop-blur-2xl lg:flex">
          <Link href="/" className="group mb-12 block">
            <h2 className="origin-left text-2xl font-black tracking-tighter text-white uppercase transition-transform group-hover:scale-[1.02]">
              QUERY<span className="text-[#00A8A8] italic">DOCS</span>
            </h2>
            <div className="mt-2 flex items-center gap-2">
              <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-green-500" />
              <p className="font-mono text-[9px] tracking-[0.4em] text-gray-500 uppercase">
                v1.0.0 // Active
              </p>
            </div>
          </Link>

          <nav className="flex-1 space-y-2">
            {NAV_ITEMS.map((item) => (
              <button
                key={item.id}
                onClick={() => setActiveSection(item.id)}
                className={`flex w-full items-center gap-4 rounded-xl px-5 py-3.5 text-left font-mono text-xs tracking-widest uppercase transition-all duration-300 ${
                  activeSection === item.id
                    ? "translate-x-1 border border-[#00A8A8]/20 bg-[#00A8A8]/10 font-black text-[#00A8A8] shadow-[inset_0_0_20px_rgba(0,168,168,0.05)]"
                    : "border border-transparent text-gray-500 hover:translate-x-1 hover:bg-white/5 hover:text-white"
                }`}
              >
                <span
                  className={`text-base transition-transform duration-300 ${activeSection === item.id ? "scale-110" : ""}`}
                >
                  {item.icon}
                </span>
                {item.label}
              </button>
            ))}
          </nav>

          <div className="mt-auto space-y-4 border-t border-white/5 pt-8">
            <Link
              href="/dashboard"
              className="group flex w-full items-center justify-center gap-3 rounded-xl border border-white/5 bg-white/[0.02] px-4 py-3 font-mono text-[10px] tracking-[0.2em] text-gray-500 uppercase transition-all hover:border-white/10 hover:bg-white/5 hover:text-white"
            >
              <svg
                className="h-4 w-4 transform transition-transform group-hover:-translate-x-1"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M10 19l-7-7m0 0l7-7m-7 7h18"
                />
              </svg>
              Return to Nexus
            </Link>
          </div>
        </aside>

        {/* MOBILE NAV */}
        <div className="sticky top-0 right-0 left-0 z-50 border-b border-white/5 bg-[#050505]/90 px-4 py-4 shadow-xl backdrop-blur-2xl lg:hidden">
          <div className="mb-4 flex items-center justify-between px-2">
            <h2 className="text-xl font-black tracking-tighter text-white uppercase">
              QUERY<span className="text-[#00A8A8] italic">DOCS</span>
            </h2>
            <Link
              href="/dashboard"
              className="flex h-11 w-11 sm:h-8 sm:w-8 items-center justify-center rounded-full border border-white/10 bg-white/5 text-gray-400 transition-colors hover:bg-white/10 hover:text-white"
            >
              <svg
                className="h-4 w-4"
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
            </Link>
          </div>
          <div className="scrollbar-none mask-linear-fade flex gap-2 overflow-x-auto px-2 pb-2">
            {NAV_ITEMS.map((item) => (
              <button
                key={item.id}
                onClick={() => setActiveSection(item.id)}
                className={`flex shrink-0 items-center gap-2 rounded-full px-4 py-2.5 font-mono text-[10px] tracking-widest whitespace-nowrap uppercase transition-all ${
                  activeSection === item.id
                    ? "border border-[#00A8A8]/30 bg-[#00A8A8]/15 font-black text-[#00A8A8] shadow-[0_0_15px_rgba(0,168,168,0.2)]"
                    : "border border-white/5 bg-white/[0.02] text-gray-500 hover:bg-white/10 hover:text-white"
                }`}
              >
                <span>{item.icon}</span>
                {item.label}
              </button>
            ))}
          </div>
        </div>

        {/* MAIN CONTENT */}
        <main className="flex w-full flex-1 justify-center px-6 py-12 md:px-12 lg:px-20 lg:py-24">
          <div className="w-full max-w-4xl">
            {/* Mock Search Bar Header for Desktop */}
            <div className="mb-20 hidden items-center justify-between border-b border-white/5 pb-8 lg:flex">
              <div className="group relative max-w-sm flex-1 cursor-pointer">
                <div className="pointer-events-none absolute inset-y-0 left-4 flex items-center">
                  <svg
                    className="h-4 w-4 text-gray-500 transition-colors group-hover:text-[#00A8A8]"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                    />
                  </svg>
                </div>
                <div className="flex w-full items-center justify-between rounded-full border border-white/10 bg-white/[0.02] py-2.5 pr-4 pl-11 font-mono text-sm text-gray-500 transition-all group-hover:border-white/20 group-hover:bg-white/5">
                  Quick Search...
                  <span className="flex items-center gap-1 rounded border border-white/10 bg-white/5 px-2 py-0.5 font-sans text-xs text-gray-400">
                    <kbd></kbd> <kbd>K</kbd>
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <Link
                  href="#"
                  className="text-gray-500 transition-colors hover:text-white"
                >
                  <svg
                    className="h-5 w-5"
                    fill="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      fillRule="evenodd"
                      d="M12 2C6.477 2 2 6.477 2 12c0 4.42 2.865 8.166 6.839 9.489.5.092.682-.217.682-.482 0-.237-.008-.866-.013-1.7-2.782.603-3.369-1.34-3.369-1.34-.454-1.156-1.11-1.463-1.11-1.463-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.831.092-.646.35-1.086.636-1.336-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.578 9.578 0 0112 6.836c.85.004 1.705.114 2.504.336 1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.203 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.578.688.48C19.138 20.161 22 16.418 22 12c0-5.523-4.477-10-10-10z"
                      clipRule="evenodd"
                    />
                  </svg>
                </Link>
              </div>
            </div>

            {/* ===== OVERVIEW ===== */}
            {activeSection === "overview" && (
              <div className="animate-in fade-in slide-in-from-bottom-8 space-y-16 duration-700">
                <div className="relative">
                  <div className="pointer-events-none absolute -top-10 -left-10 h-40 w-40 rounded-full bg-[#00A8A8]/20 blur-[100px]" />

                  <div className="mb-8 inline-block rounded-full border border-[#00A8A8]/20 bg-[#00A8A8]/5 px-4 py-1.5 shadow-[0_0_20px_rgba(0,168,168,0.15)]">
                    <p className="flex items-center gap-2 font-mono text-[10px] font-black tracking-[0.5em] text-[#00A8A8] uppercase">
                      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#00A8A8]" />
                      System Manual
                    </p>
                  </div>
                  <h1 className="relative z-10 mb-8 text-5xl leading-[0.9] font-black tracking-tighter text-white uppercase md:text-6xl lg:text-7xl">
                    Query
                    <br />
                    <span className="text-[#00A8A8] italic">Platform</span>
                  </h1>
                  <p className="relative z-10 max-w-2xl font-mono text-base leading-relaxed text-gray-400 opacity-90 md:text-lg">
                    Query is the full-stack monorepo powering the DSGT (Data
                    Science @ Georgia Tech) portal. It handles member
                    management, hackathon orchestration, event check-ins,
                    judging workflows, team formation, project submission, and
                    Stripe-based payments — all within a modern Next.js + tRPC
                    architecture.
                  </p>
                </div>

                <div className="grid grid-cols-1 gap-6 border-t border-white/5 pt-8 md:grid-cols-2 lg:grid-cols-3">
                  <InfoCard
                    title="Next.js 16"
                    description="App Router · RSC · Middleware"
                    items={[
                      "Server/Client Components",
                      "File-system routing",
                      "Edge middleware",
                    ]}
                  />
                  <InfoCard
                    title="tRPC v11"
                    description="End-to-end type safety"
                    items={[
                      "Procedure-based routing",
                      "Zod input validation",
                      "React Query integration",
                    ]}
                  />
                  <InfoCard
                    title="Drizzle ORM"
                    description="PostgreSQL · Type-safe queries"
                    items={[
                      "Schema-first design",
                      "Relational queries",
                      "Migration support",
                    ]}
                  />
                  <InfoCard
                    title="NextAuth"
                    description="OAuth · Email magic links"
                    items={[
                      "Google & GitHub providers",
                      "Session management",
                      "RBAC via middleware",
                    ]}
                  />
                  <InfoCard
                    title="Stripe"
                    description="Payments & membership"
                    items={[
                      "Payment intents",
                      "Webhook handling",
                      "Membership tiers",
                    ]}
                  />
                  <InfoCard
                    title="Turborepo"
                    description="Monorepo build system"
                    items={[
                      "Parallel builds",
                      "Cached pipelines",
                      "Workspace packages",
                    ]}
                  />
                </div>

                <div className="border-t border-white/5 pt-8">
                  <h3 className="mb-8 flex items-center gap-3 font-mono text-sm font-black tracking-[0.3em] text-white uppercase">
                    <span className="text-[#00A8A8]">&gt;&gt;</span> Quick Start
                  </h3>
                  <CodeBlock
                    title="terminal"
                    code={`# 1. Install dependencies\npnpm install\n\n# 2. Set up environment variables\ncp .env.example .env\n# Fill in DATABASE_URL, NEXTAUTH_SECRET, STRIPE_SECRET_KEY, etc.\n\n# 3. Push DB schema\npnpm db:push\n\n# 4. Run development server\npnpm dev:mainweb     # -> http://localhost:3000`}
                  />
                </div>
              </div>
            )}

            {/* ===== ARCHITECTURE ===== */}
            {activeSection === "architecture" && (
              <div className="animate-in fade-in slide-in-from-bottom-8 space-y-16 duration-700">
                <div className="relative">
                  <div className="pointer-events-none absolute top-0 right-0 h-64 w-64 rounded-full bg-purple-500/10 blur-[100px]" />
                  <h1 className="relative z-10 mb-4 text-4xl font-black tracking-tighter text-white uppercase md:text-5xl">
                    System{" "}
                    <span className="text-purple-400 italic">Architecture</span>
                  </h1>
                  <p className="relative z-10 font-mono text-sm text-gray-500">
                    Turborepo monorepo with workspace packages.
                  </p>
                </div>

                <CodeBlock
                  title="project structure"
                  code={`query/\n├── packages/\n│   ├── api/          # tRPC routers, middleware, procedures\n│   ├── auth/         # NextAuth configuration & providers\n│   ├── db/           # Drizzle ORM schemas & connection\n│   ├── consts/       # Shared constants & enums\n│   └── ui/           # Shared UI component library\n│\n├── sites/\n│   └── mainweb/      # Next.js 16 web application\n│       ├── app/\n│       │   ├── (portal)/     # Protected portal routes\n│       │   ├── bootcamp/     # Public curriculum page\n│       │   ├── docs/         # This documentation page\n│       │   └── page.tsx      # Landing page\n│       └── components/\n│           ├── portal/       # LiquidGlass, QR scanner, etc.\n│           ├── hackathon/    # Hackathon detail components\n│           └── ...           # Navbar, Footer, Hero, etc.\n│\n├── tooling/          # ESLint, Prettier, Tailwind, TSConfig\n└── turbo.json        # Turborepo pipeline configuration`}
                />

                <div className="grid grid-cols-1 gap-6 border-t border-white/5 pt-8 md:grid-cols-2">
                  <InfoCard
                    title="@query/api"
                    description="Backend logic layer"
                    accent="#a855f7"
                    items={[
                      "11 tRPC routers",
                      "Protected procedures",
                      "Redis caching layer",
                      "Rate limiting middleware",
                    ]}
                  />
                  <InfoCard
                    title="@query/db"
                    description="Data persistence"
                    accent="#a855f7"
                    items={[
                      "9 schema modules",
                      "Drizzle ORM with PostgreSQL",
                      "Relational mapping",
                      "Index optimization",
                    ]}
                  />
                  <InfoCard
                    title="@query/auth"
                    description="Authentication & authorization"
                    accent="#a855f7"
                    items={[
                      "NextAuth v5 adapter",
                      "Email OTP verification",
                      "Session-based auth",
                      "Role-based middleware",
                    ]}
                  />
                  <InfoCard
                    title="sites/mainweb"
                    description="Frontend application"
                    accent="#a855f7"
                    items={[
                      "Next.js 16 App Router",
                      "13+ portal pages",
                      "Glassmorphism UI system",
                      "QR-based event check-ins",
                    ]}
                  />
                </div>
              </div>
            )}

            {/* ===== API REFERENCE ===== */}
            {activeSection === "api" && (
              <div className="animate-in fade-in slide-in-from-bottom-8 space-y-16 duration-700">
                <div>
                  <div className="pointer-events-none absolute top-0 right-0 h-64 w-64 rounded-full bg-emerald-500/10 blur-[100px]" />
                  <h1 className="mb-4 text-4xl font-black tracking-tighter text-white uppercase md:text-5xl">
                    API{" "}
                    <span className="text-emerald-400 italic">Reference</span>
                  </h1>
                  <p className="font-mono text-sm text-gray-500">
                    tRPC procedures organized by domain router. All routes use
                    Zod validation.
                  </p>
                </div>

                {/* User Router */}
                <div className="border-t border-white/5 pt-8">
                  <h3 className="mb-6 flex items-center gap-3 text-xl font-black tracking-tight text-white uppercase">
                    <span className="h-2 w-2 rounded-full bg-[#00A8A8] shadow-[0_0_10px_rgba(0,168,168,0.5)]" />{" "}
                    User Router
                  </h3>
                  <ApiEndpoint
                    method="QUERY"
                    route="user.me"
                    description="Get current authenticated user profile (name, email, image, bio, website, location)"
                    auth="Protected"
                  />
                  <ApiEndpoint
                    method="MUTATION"
                    route="user.updateProfile"
                    description="Update user name, image, bio, website, or location"
                    auth="Protected"
                  />
                  <ApiEndpoint
                    method="MUTATION"
                    route="user.updateProfileImage"
                    description="Upload and validate a base64 profile image (max 2000x2000, 2MB)"
                    auth="Upload"
                  />
                </div>

                {/* Events Router */}
                <div className="border-t border-white/5 pt-8">
                  <h3 className="mb-6 flex items-center gap-3 text-xl font-black tracking-tight text-white uppercase">
                    <span className="h-2 w-2 rounded-full bg-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.5)]" />{" "}
                    Events Router
                  </h3>
                  <ApiEndpoint
                    method="QUERY"
                    route="events.myEvents"
                    description="Get user's event check-in history"
                    auth="Protected"
                  />
                  <ApiEndpoint
                    method="QUERY"
                    route="events.myStats"
                    description="Get total events attended count"
                    auth="Protected"
                  />
                  <ApiEndpoint
                    method="MUTATION"
                    route="events.checkIn"
                    description="Process a QR-code-based event check-in"
                    auth="Protected"
                  />
                </div>

                {/* Hackathon Router */}
                <div className="border-t border-white/5 pt-8">
                  <h3 className="mb-6 flex items-center gap-3 text-xl font-black tracking-tight text-white uppercase">
                    <span className="h-2 w-2 rounded-full bg-purple-500 shadow-[0_0_10px_rgba(168,85,247,0.5)]" />{" "}
                    Hackathon Router
                  </h3>
                  <ApiEndpoint
                    method="QUERY"
                    route="hackathon.list"
                    description="List hackathons with optional status filter"
                    auth="Public"
                  />
                  <ApiEndpoint
                    method="QUERY"
                    route="hackathon.getUpcoming"
                    description="The announced edition behind the interest form"
                    auth="Public"
                  />
                  <ApiEndpoint
                    method="QUERY"
                    route="hackathon.getResults"
                    description="Published placings, once results are released"
                    auth="Public"
                  />
                  <ApiEndpoint
                    method="QUERY"
                    route="hackathon.myRegistrations"
                    description="Get user's registrations with team and project data"
                    auth="Protected"
                  />
                  <ApiEndpoint
                    method="QUERY"
                    route="hackathon.getPublicProjects"
                    description="Get public project gallery for a hackathon"
                    auth="Public"
                  />
                  <ApiEndpoint
                    method="MUTATION"
                    route="hackathon.register"
                    description="Register for a hackathon"
                    auth="Protected"
                  />
                </div>

                {/* Team Router */}
                <div className="border-t border-white/5 pt-8">
                  <h3 className="mb-6 flex items-center gap-3 text-xl font-black tracking-tight text-white uppercase">
                    <span className="h-2 w-2 rounded-full bg-orange-500 shadow-[0_0_10px_rgba(249,115,22,0.5)]" />{" "}
                    Team Router
                  </h3>
                  <ApiEndpoint
                    method="MUTATION"
                    route="team.createTeam"
                    description="Create a new team for a hackathon"
                    auth="Protected"
                  />
                  <ApiEndpoint
                    method="MUTATION"
                    route="team.joinTeam"
                    description="Join an existing team by team ID"
                    auth="Protected"
                  />
                  <ApiEndpoint
                    method="MUTATION"
                    route="team.leaveTeam"
                    description="Leave a team (captain cannot leave)"
                    auth="Protected"
                  />
                  <ApiEndpoint
                    method="MUTATION"
                    route="team.submitProject"
                    description="Submit or update a project for judging"
                    auth="Protected"
                  />
                </div>

                {/* Member Router */}
                <div className="border-t border-white/5 pt-8">
                  <h3 className="mb-6 flex items-center gap-3 text-xl font-black tracking-tight text-white uppercase">
                    <span className="h-2 w-2 rounded-full bg-yellow-500 shadow-[0_0_10px_rgba(234,179,8,0.5)]" />{" "}
                    Member Router
                  </h3>
                  <ApiEndpoint
                    method="QUERY"
                    route="member.checkStatus"
                    description="Check if user has active DSGT membership"
                    auth="Protected"
                  />
                  <ApiEndpoint
                    method="QUERY"
                    route="member.history"
                    description="Get membership payment and status history"
                    auth="Protected"
                  />
                </div>

                {/* Stripe Router */}
                <div className="border-t border-white/5 pt-8">
                  <h3 className="mb-6 flex items-center gap-3 text-xl font-black tracking-tight text-white uppercase">
                    <span className="h-2 w-2 rounded-full bg-indigo-500 shadow-[0_0_10px_rgba(99,102,241,0.5)]" />{" "}
                    Stripe Router
                  </h3>
                  <ApiEndpoint
                    method="MUTATION"
                    route="stripe.createCheckoutSession"
                    description="Create a Stripe checkout session for memberships"
                    auth="Protected"
                  />
                  <ApiEndpoint
                    method="QUERY"
                    route="stripe.checkPendingPayment"
                    description="Check for a payment awaiting confirmation"
                    auth="Protected"
                  />
                  <ApiEndpoint
                    method="QUERY"
                    route="stripe.getLinkedPayment"
                    description="The payment linked to this account, if any"
                    auth="Protected"
                  />
                </div>
              </div>
            )}

            {/* ===== DATABASE ===== */}
            {activeSection === "database" && (
              <div className="animate-in fade-in slide-in-from-bottom-8 space-y-16 duration-700">
                <div className="relative">
                  <div className="pointer-events-none absolute top-0 right-0 h-64 w-64 rounded-full bg-[#00A8A8]/10 blur-[100px]" />
                  <h1 className="relative z-10 mb-4 text-4xl font-black tracking-tighter text-white uppercase md:text-5xl">
                    Database{" "}
                    <span className="text-[#00A8A8] italic">Schemas</span>
                  </h1>
                  <p className="relative z-10 font-mono text-sm text-gray-500">
                    PostgreSQL via Drizzle ORM. Located in{" "}
                    <code className="rounded bg-[#00A8A8]/10 px-1 py-0.5 text-[#00A8A8]">
                      packages/db/src/schemas/
                    </code>
                  </p>
                </div>

                <div className="space-y-8 pt-6">
                  <SchemaTable
                    name="users"
                    columns={[
                      { field: "id", type: "text", notes: "Primary key" },
                      { field: "name", type: "text", notes: "nullable" },
                      {
                        field: "email",
                        type: "text",
                        notes: "not null, indexed",
                      },
                      {
                        field: "emailVerified",
                        type: "timestamp",
                        notes: "nullable",
                      },
                      {
                        field: "image",
                        type: "text",
                        notes: "nullable, base64 or URL",
                      },
                    ]}
                  />

                  <SchemaTable
                    name="hackathons"
                    columns={[
                      {
                        field: "id",
                        type: "uuid",
                        notes: "Primary key, auto-generated",
                      },
                      { field: "name", type: "text", notes: "not null" },
                      {
                        field: "status",
                        type: "text",
                        notes: "draft | active | judging | completed",
                      },
                      {
                        field: "startDate",
                        type: "timestamp",
                        notes: "not null",
                      },
                      {
                        field: "endDate",
                        type: "timestamp",
                        notes: "not null",
                      },
                      {
                        field: "tracks",
                        type: "json",
                        notes: "Array of track names",
                      },
                      {
                        field: "challenges",
                        type: "json",
                        notes: "Array of challenge names",
                      },
                      {
                        field: "registrationOpen",
                        type: "boolean",
                        notes: "default true",
                      },
                    ]}
                  />

                  <SchemaTable
                    name="events"
                    columns={[
                      { field: "id", type: "uuid", notes: "Primary key" },
                      { field: "title", type: "text", notes: "not null" },
                      { field: "description", type: "text", notes: "nullable" },
                      { field: "location", type: "text", notes: "nullable" },
                      {
                        field: "eventDate",
                        type: "timestamp",
                        notes: "not null",
                      },
                      {
                        field: "qrCode",
                        type: "text",
                        notes: "UUID for check-in scanning",
                      },
                      {
                        field: "checkInEnabled",
                        type: "boolean",
                        notes: "default false",
                      },
                    ]}
                  />

                  <SchemaTable
                    name="members"
                    columns={[
                      { field: "id", type: "uuid", notes: "Primary key" },
                      {
                        field: "userId",
                        type: "text",
                        notes: "FK -> users.id",
                      },
                      {
                        field: "membershipType",
                        type: "text",
                        notes: "free | paid | premium",
                      },
                      {
                        field: "isActive",
                        type: "boolean",
                        notes: "Computed from expiry",
                      },
                      {
                        field: "expiresAt",
                        type: "timestamp",
                        notes: "Membership end date",
                      },
                      {
                        field: "stripePaymentId",
                        type: "text",
                        notes: "nullable, Stripe ref",
                      },
                    ]}
                  />

                  <SchemaTable
                    name="teams"
                    columns={[
                      { field: "id", type: "uuid", notes: "Primary key" },
                      { field: "name", type: "text", notes: "not null" },
                      {
                        field: "hackathonId",
                        type: "uuid",
                        notes: "FK -> hackathons.id",
                      },
                      {
                        field: "captainId",
                        type: "text",
                        notes: "FK -> users.id",
                      },
                      {
                        field: "maxMembers",
                        type: "integer",
                        notes: "default 4",
                      },
                    ]}
                  />

                  <SchemaTable
                    name="projects"
                    columns={[
                      { field: "id", type: "uuid", notes: "Primary key" },
                      { field: "name", type: "text", notes: "not null" },
                      { field: "description", type: "text", notes: "nullable" },
                      { field: "githubUrl", type: "text", notes: "nullable" },
                      { field: "demoUrl", type: "text", notes: "nullable" },
                      { field: "videoUrl", type: "text", notes: "nullable" },
                      {
                        field: "teamId",
                        type: "uuid",
                        notes: "FK -> teams.id",
                      },
                      {
                        field: "status",
                        type: "text",
                        notes: "submitted | judging | winner",
                      },
                    ]}
                  />
                </div>
              </div>
            )}

            {/* ===== FRONTEND ===== */}
            {activeSection === "frontend" && (
              <div className="animate-in fade-in slide-in-from-bottom-8 space-y-16 duration-700">
                <div>
                  <div className="pointer-events-none absolute top-0 right-0 h-64 w-64 rounded-full bg-yellow-500/10 blur-[100px]" />
                  <h1 className="relative z-10 mb-4 text-4xl font-black tracking-tighter text-white uppercase md:text-5xl">
                    Frontend{" "}
                    <span className="text-yellow-500 italic">Guide</span>
                  </h1>
                  <p className="font-mono text-sm text-gray-500">
                    UI components, design system, and page structure.
                  </p>
                </div>

                <div className="border-t border-white/5 pt-8">
                  <h3 className="mb-8 flex items-center gap-3 font-mono text-sm font-black tracking-[0.3em] text-white uppercase">
                    <span className="text-yellow-500">&gt;&gt;</span> Design
                    System
                  </h3>
                  <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                    <div className="rounded-3xl border border-t-2 border-white/5 border-t-yellow-500/30 bg-black/40 p-8 shadow-lg transition-colors hover:bg-[#050505]">
                      <h4 className="mb-6 text-xl font-black text-white">
                        Color Palette
                      </h4>
                      <div className="space-y-4">
                        {[
                          {
                            name: "Primary",
                            value: "#00A8A8",
                            css: "bg-[#00A8A8] shadow-[0_0_15px_rgba(0,168,168,0.5)]",
                          },
                          {
                            name: "Background",
                            value: "#050505",
                            css: "bg-[#050505] border border-white/10",
                          },
                          {
                            name: "Surface",
                            value: "white/5",
                            css: "bg-white/5 border border-white/10",
                          },
                          {
                            name: "Text Primary",
                            value: "#FFFFFF",
                            css: "bg-white",
                          },
                          {
                            name: "Text Secondary",
                            value: "#6B7280",
                            css: "bg-gray-500",
                          },
                        ].map((color) => (
                          <div
                            key={color.name}
                            className="flex items-center gap-4"
                          >
                            <div
                              className={`h-10 w-10 rounded-xl ${color.css}`}
                            />
                            <div>
                              <p className="text-sm font-bold text-white">
                                {color.name}
                              </p>
                              <p className="font-mono text-[10px] tracking-wider text-gray-400">
                                {color.value}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="rounded-3xl border border-t-2 border-white/5 border-t-yellow-500/30 bg-black/40 p-8 shadow-lg transition-colors hover:bg-[#050505]">
                      <h4 className="mb-6 text-xl font-black text-white">
                        Typography
                      </h4>
                      <div className="space-y-6">
                        <div className="rounded-xl border border-white/5 bg-white/[0.02] p-4">
                          <p className="mb-2 text-3xl font-black tracking-tighter text-white uppercase italic">
                            Heading
                          </p>
                          <p className="font-mono text-[10px] text-gray-500">
                            font-black, uppercase, italic
                          </p>
                        </div>
                        <div className="rounded-xl border border-white/5 bg-white/[0.02] p-4">
                          <p className="mb-2 font-mono text-sm font-bold tracking-widest text-gray-300 uppercase">
                            Subtitle
                          </p>
                          <p className="font-mono text-[10px] text-gray-500">
                            font-mono, uppercase, tracking-widest
                          </p>
                        </div>
                        <div className="flex flex-col items-start gap-2 rounded-xl border border-white/5 bg-white/[0.02] p-4">
                          <span className="rounded bg-[#00A8A8]/10 px-2 py-1 font-mono text-xs tracking-[0.3em] text-[#00A8A8] uppercase">
                            Label
                          </span>
                          <p className="font-mono text-[10px] text-gray-500">
                            text-xs, font-mono, tracking-[0.3em]
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="border-t border-white/5 pt-8">
                  <h3 className="mb-8 flex items-center gap-3 font-mono text-sm font-black tracking-[0.3em] text-white uppercase">
                    <span className="text-yellow-500">&gt;&gt;</span> Portal
                    Pages
                  </h3>
                  <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                    <InfoCard
                      title="/login"
                      description="DO NOT MODIFY"
                      items={[
                        "Email magic link authentication",
                        "Google OAuth provider",
                        "Session initialization",
                      ]}
                      accent="#ef4444"
                    />
                    <InfoCard
                      title="/verify"
                      description="OTP code verification"
                      items={[
                        "6-digit code input with LiquidGlass",
                        "Auto-advance & paste support",
                        "Session binding on success",
                      ]}
                      accent="#eab308"
                    />
                    <InfoCard
                      title="/dashboard"
                      description="Central portal hub"
                      items={[
                        "User profile card",
                        "Quick navigation grid",
                        "Active hackathon display",
                      ]}
                      accent="#eab308"
                    />
                    <InfoCard
                      title="/club"
                      description="Member dashboard"
                      items={[
                        "Tabbed interface (Overview, History, Projects, Status)",
                        "QR scanner for event check-ins",
                        "Membership verification matrix",
                      ]}
                      accent="#eab308"
                    />
                    <InfoCard
                      title="/hackathons"
                      description="Hackathon detail view"
                      items={[
                        "Auto-loads active hackathon",
                        "Info, Teams, Projects, Schedule tabs",
                        "Registration flow",
                      ]}
                      accent="#eab308"
                    />
                    <InfoCard
                      title="/submit"
                      description="Project submission terminal"
                      items={[
                        "Team create/join flow",
                        "Project form with external links",
                        "Captain-only submission",
                      ]}
                      accent="#eab308"
                    />
                  </div>
                </div>

                <div className="border-t border-white/5 pt-8">
                  <h3 className="mb-8 flex items-center gap-3 font-mono text-sm font-black tracking-[0.3em] text-white uppercase">
                    <span className="text-yellow-500">&gt;&gt;</span> Core
                    Components
                  </h3>
                  <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                    <InfoCard
                      title="LiquidGlass"
                      description="components/portal/LiquidGlass"
                      items={[
                        "Glassmorphism container",
                        "Backdrop blur + translucent borders",
                        "Used across all portal pages",
                      ]}
                      accent="#3b82f6"
                    />
                    <InfoCard
                      title="Background"
                      description="components/portal/Background"
                      items={[
                        "Animated grid pattern",
                        "Fixed, low-opacity overlay",
                        "Consistent dark aesthetic",
                      ]}
                      accent="#3b82f6"
                    />
                    <InfoCard
                      title="QRScannerModal"
                      description="components/portal/QRScannerModal"
                      items={[
                        "Camera-based QR reader",
                        "Debounced scan processing",
                        "Pause/resume controls",
                      ]}
                      accent="#3b82f6"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* ===== DEPLOYMENT ===== */}
            {activeSection === "deployment" && (
              <div className="animate-in fade-in slide-in-from-bottom-8 space-y-16 duration-700">
                <div>
                  <div className="pointer-events-none absolute top-0 right-0 h-64 w-64 rounded-full bg-red-500/10 blur-[100px]" />
                  <h1 className="relative z-10 mb-4 text-4xl font-black tracking-tighter text-white uppercase md:text-5xl">
                    Deployment{" "}
                    <span className="text-red-500 italic">Guide</span>
                  </h1>
                  <p className="relative z-10 font-mono text-sm text-gray-500">
                    CI/CD pipeline and hosting configuration.
                  </p>
                </div>

                <div className="border-t border-white/5 pt-8">
                  <InfoCard
                    title="Firebase App Hosting"
                    description="Primary hosting platform"
                    accent="#ef4444"
                    items={[
                      "Configured via apphosting.yaml",
                      "Auto-deploy on push to main branch",
                      "Next.js SSR support via Cloud Functions",
                      "Environment variables managed via Firebase Console",
                    ]}
                  />
                </div>

                <div className="border-t border-white/5 pt-8">
                  <h3 className="mb-8 flex items-center gap-3 font-mono text-sm font-black tracking-[0.3em] text-white uppercase">
                    <span className="text-red-500">&gt;&gt;</span> Environment
                    Variables
                  </h3>
                  <CodeBlock
                    title=".env"
                    code={`# Database\nDATABASE_URL=[REDACTED]\n\n# Auth\nNEXTAUTH_URL=[REDACTED]\nNEXTAUTH_SECRET=[REDACTED]\n\n# OAuth Providers\nGOOGLE_CLIENT_ID=[REDACTED]\nGOOGLE_CLIENT_SECRET=[REDACTED]\nGITHUB_CLIENT_ID=[REDACTED]\nGITHUB_CLIENT_SECRET=[REDACTED]\n\n# Stripe\nSTRIPE_SECRET_KEY=[REDACTED]\nSTRIPE_WEBHOOK_SECRET=[REDACTED]\nNEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=[REDACTED]\n\n# Email (SMTP - any provider)\nEMAIL_SERVER_HOST=[REDACTED]\nEMAIL_SERVER_PORT=587\nEMAIL_SERVER_USER=[REDACTED]\nEMAIL_SERVER_PASSWORD=[REDACTED]\nEMAIL_FROM=[REDACTED]`}
                  />
                </div>

                <div className="border-t border-white/5 pt-8">
                  <h3 className="mb-8 flex items-center gap-3 font-mono text-sm font-black tracking-[0.3em] text-white uppercase">
                    <span className="text-red-500">&gt;&gt;</span> CI/CD
                    Pipeline
                  </h3>
                  <CodeBlock
                    title="github actions"
                    code={`# .github/workflows/deploy.yml\n# Triggers on push to main branch\n# Steps:\n#   1. Install pnpm & Node.js 20\n#   2. Install dependencies\n#   3. Run type checks (tsc --noEmit)\n#   4. Build application (turbo build --filter=web)\n#   5. Deploy to Firebase App Hosting`}
                  />
                </div>

                <div className="border-t border-white/5 pt-8">
                  <h3 className="mb-8 flex items-center gap-3 font-mono text-sm font-black tracking-[0.3em] text-white uppercase">
                    <span className="text-red-500">&gt;&gt;</span> Useful
                    Commands
                  </h3>
                  <CodeBlock
                    title="terminal"
                    code={`# Development\npnpm dev:mainweb          # Start Next.js dev server\npnpm dev                  # Start all workspaces in parallel\n\n# Building\npnpm build:mainweb        # Build the web application\npnpm build                # Build all packages\n\n# Database\npnpm db:push              # Push schema changes to DB\npnpm db:studio            # Open Drizzle Studio (DB GUI)\n\n# Quality\npnpm lint                 # Run ESLint across all packages\npnpm typecheck            # Run TypeScript type-checking`}
                  />
                </div>
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
