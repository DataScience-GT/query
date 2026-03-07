'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';

type DocSection = 'overview' | 'architecture' | 'api' | 'database' | 'frontend' | 'deployment';

const NAV_ITEMS: { id: DocSection; label: string; icon: string }[] = [
    { id: 'overview', label: 'Overview', icon: '◈' },
    { id: 'architecture', label: 'Architecture', icon: '⬡' },
    { id: 'api', label: 'API Reference', icon: '⟐' },
    { id: 'database', label: 'Database', icon: '⊡' },
    { id: 'frontend', label: 'Frontend', icon: '◇' },
    { id: 'deployment', label: 'Deployment', icon: '▲' },
];

function CodeBlock({ title, code, language = 'bash' }: { title?: string; code: string; language?: string }) {
    return (
        <div className="rounded-xl border border-white/5 overflow-hidden bg-black/40 mb-6">
            {title && (
                <div className="px-4 py-2 border-b border-white/5 flex items-center gap-2">
                    <div className="flex gap-1.5">
                        <div className="w-2.5 h-2.5 rounded-full bg-red-500/60" />
                        <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/60" />
                        <div className="w-2.5 h-2.5 rounded-full bg-green-500/60" />
                    </div>
                    <span className="text-[10px] text-gray-500 font-mono uppercase tracking-widest ml-2">{title}</span>
                </div>
            )}
            <pre className="p-4 overflow-x-auto text-sm font-mono text-gray-300 leading-relaxed">
                <code>{code}</code>
            </pre>
        </div>
    );
}

function InfoCard({ title, description, items, accent = '#00A8A8' }: { title: string; description?: string; items?: string[]; accent?: string }) {
    return (
        <div
            className="p-6 rounded-2xl border border-white/5 bg-white/[0.02] hover:border-white/10 transition-all duration-500 group"
            style={{ borderTopColor: `${accent}30` }}
        >
            <h4 className="text-lg font-black text-white mb-1 group-hover:text-[#00A8A8] transition-colors">{title}</h4>
            {description && <p className="text-xs text-gray-500 font-mono mb-4">{description}</p>}
            {items && (
                <ul className="space-y-2">
                    {items.map((item, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm text-gray-400">
                            <span className="text-[#00A8A8] mt-0.5 text-xs">▸</span>
                            <span>{item}</span>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}

function ApiEndpoint({ method, route, description, auth }: { method: string; route: string; description: string; auth?: string }) {
    const methodColors: Record<string, string> = {
        QUERY: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
        MUTATION: 'text-orange-400 bg-orange-500/10 border-orange-500/20',
    };
    return (
        <div className="p-4 rounded-xl border border-white/5 bg-white/[0.01] hover:bg-white/[0.03] transition-all mb-3">
            <div className="flex flex-wrap items-center gap-3 mb-2">
                <span className={`px-2 py-0.5 rounded text-[9px] font-mono font-black uppercase tracking-widest border ${methodColors[method] || 'text-gray-400 bg-white/5 border-white/10'}`}>
                    {method}
                </span>
                <code className="text-sm text-[#00A8A8] font-mono font-bold">{route}</code>
                {auth && (
                    <span className="text-[9px] font-mono text-yellow-500/70 bg-yellow-500/5 border border-yellow-500/20 px-1.5 py-0.5 rounded uppercase tracking-widest">{auth}</span>
                )}
            </div>
            <p className="text-xs text-gray-500 font-mono pl-1">{description}</p>
        </div>
    );
}

function SchemaTable({ name, columns }: { name: string; columns: { field: string; type: string; notes?: string }[] }) {
    return (
        <div className="rounded-xl border border-white/5 overflow-hidden bg-white/[0.01] mb-6">
            <div className="px-5 py-3 border-b border-white/5 bg-white/[0.02]">
                <h4 className="text-sm font-black text-white font-mono uppercase tracking-wider flex items-center gap-2">
                    <span className="text-[#00A8A8]">⊡</span> {name}
                </h4>
            </div>
            <div className="overflow-x-auto">
                <table className="w-full text-xs">
                    <thead>
                        <tr className="text-gray-600 uppercase tracking-widest border-b border-white/5">
                            <th className="text-left py-2.5 px-5 font-mono font-bold">Field</th>
                            <th className="text-left py-2.5 px-5 font-mono font-bold">Type</th>
                            <th className="text-left py-2.5 px-5 font-mono font-bold">Notes</th>
                        </tr>
                    </thead>
                    <tbody>
                        {columns.map((col, i) => (
                            <tr key={i} className="border-t border-white/[0.03] hover:bg-white/[0.02] transition-colors">
                                <td className="py-2.5 px-5 text-white font-mono font-bold">{col.field}</td>
                                <td className="py-2.5 px-5 text-[#00A8A8] font-mono">{col.type}</td>
                                <td className="py-2.5 px-5 text-gray-500 font-mono">{col.notes || '—'}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

export default function DocsPage() {
    const { status } = useSession();
    const router = useRouter();
    const [activeSection, setActiveSection] = useState<DocSection>('overview');

    useEffect(() => {
        if (status === 'unauthenticated') {
            router.push('/login');
        }
    }, [status, router]);

    if (status === 'loading' || status === 'unauthenticated') {
        return <div className="min-h-screen bg-[#050505] flex items-center justify-center text-gray-400 font-mono">Authenticating...</div>;
    }

    return (
        <div className="min-h-screen bg-[#050505] text-gray-400 font-sans selection:bg-[#00A8A8]/30">
            {/* Subtle grid background */}
            <div className="fixed inset-0 z-0 opacity-[0.03]" style={{
                backgroundImage: 'linear-gradient(rgba(255,255,255,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.05) 1px, transparent 1px)',
                backgroundSize: '60px 60px'
            }} />

            <div className="relative z-10 flex min-h-screen">

                {/* SIDEBAR */}
                <aside className="fixed inset-y-0 left-0 w-64 border-r border-white/5 bg-black/40 backdrop-blur-xl p-6 flex flex-col z-50 hidden lg:flex">
                    <Link href="/" className="block mb-10">
                        <h2 className="text-xl font-black text-white uppercase tracking-tighter">
                            QUERY<span className="text-[#00A8A8] italic">DOCS</span>
                        </h2>
                        <p className="text-[9px] font-mono text-gray-600 uppercase tracking-[0.5em] mt-1">v1.0.0 // Internal</p>
                    </Link>

                    <nav className="space-y-1 flex-1">
                        {NAV_ITEMS.map((item) => (
                            <button
                                key={item.id}
                                onClick={() => setActiveSection(item.id)}
                                className={`w-full text-left px-4 py-3 rounded-xl text-xs font-mono uppercase tracking-widest transition-all duration-300 flex items-center gap-3 ${activeSection === item.id
                                    ? 'bg-[#00A8A8]/10 text-[#00A8A8] border border-[#00A8A8]/20 font-black shadow-[0_0_20px_rgba(0,168,168,0.1)]'
                                    : 'text-gray-500 border border-transparent hover:text-white hover:bg-white/5'
                                    }`}
                            >
                                <span className="text-sm">{item.icon}</span>
                                {item.label}
                            </button>
                        ))}
                    </nav>

                    <div className="pt-6 border-t border-white/5 mt-auto">
                        <Link
                            href="/dashboard"
                            className="flex items-center gap-2 text-gray-500 hover:text-white transition-colors text-xs font-mono uppercase tracking-widest"
                        >
                            <span>←</span> Dashboard
                        </Link>
                    </div>
                </aside>

                {/* MOBILE NAV */}
                <div className="lg:hidden fixed top-0 left-0 right-0 z-50 bg-black/80 backdrop-blur-xl border-b border-white/5 px-4 py-3">
                    <div className="flex items-center justify-between mb-3">
                        <h2 className="text-lg font-black text-white uppercase tracking-tighter">
                            QUERY<span className="text-[#00A8A8] italic">DOCS</span>
                        </h2>
                        <Link href="/dashboard" className="text-[10px] font-mono text-gray-500 uppercase tracking-widest">← Back</Link>
                    </div>
                    <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1">
                        {NAV_ITEMS.map((item) => (
                            <button
                                key={item.id}
                                onClick={() => setActiveSection(item.id)}
                                className={`whitespace-nowrap px-3 py-1.5 rounded-full text-[10px] font-mono uppercase tracking-wider transition-all shrink-0 ${activeSection === item.id
                                    ? 'bg-[#00A8A8]/15 text-[#00A8A8] border border-[#00A8A8]/30 font-black'
                                    : 'text-gray-500 hover:text-white'
                                    }`}
                            >
                                {item.label}
                            </button>
                        ))}
                    </div>
                </div>

                {/* MAIN CONTENT */}
                <main className="flex-1 lg:ml-64 px-6 md:px-12 lg:px-16 py-24 lg:py-16 max-w-4xl">

                    {/* ===== OVERVIEW ===== */}
                    {activeSection === 'overview' && (
                        <div className="space-y-12">
                            <div>
                                <div className="inline-block px-4 py-1.5 border border-[#00A8A8]/20 rounded-full bg-[#00A8A8]/5 mb-6">
                                    <p className="text-[10px] font-mono text-[#00A8A8] uppercase tracking-[0.5em] font-black flex items-center gap-2">
                                        <span className="w-1.5 h-1.5 bg-[#00A8A8] rounded-full animate-pulse" />
                                        System Manual
                                    </p>
                                </div>
                                <h1 className="text-5xl lg:text-7xl font-black text-white uppercase tracking-tighter leading-[0.85] mb-6">
                                    Query<br />
                                    <span className="text-[#00A8A8] italic">Platform</span>
                                </h1>
                                <p className="text-gray-400 font-mono text-sm leading-relaxed max-w-2xl">
                                    Query is the full-stack monorepo powering the DSGT (Data Science @ Georgia Tech) portal. It handles
                                    member management, hackathon orchestration, event check-ins, judging workflows, team formation,
                                    project submission, and Stripe-based payments — all within a modern Next.js + tRPC architecture.
                                </p>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                                <InfoCard title="Next.js 16" description="App Router · RSC · Middleware" items={['Server/Client Components', 'File-system routing', 'Edge middleware']} />
                                <InfoCard title="tRPC v11" description="End-to-end type safety" items={['Procedure-based routing', 'Zod input validation', 'React Query integration']} />
                                <InfoCard title="Drizzle ORM" description="PostgreSQL · Type-safe queries" items={['Schema-first design', 'Relational queries', 'Migration support']} />
                                <InfoCard title="NextAuth" description="OAuth · Email magic links" items={['Google & GitHub providers', 'Session management', 'RBAC via middleware']} />
                                <InfoCard title="Stripe" description="Payments & membership" items={['Payment intents', 'Webhook handling', 'Membership tiers']} />
                                <InfoCard title="Turborepo" description="Monorepo build system" items={['Parallel builds', 'Cached pipelines', 'Workspace packages']} />
                            </div>

                            <div>
                                <h3 className="text-sm font-black text-gray-300 uppercase tracking-[0.3em] mb-6 font-mono">Quick Start</h3>
                                <CodeBlock title="terminal" code={`# 1. Install dependencies
pnpm install

# 2. Set up environment variables
cp .env.example .env
# Fill in DATABASE_URL, NEXTAUTH_SECRET, STRIPE_SECRET_KEY, etc.

# 3. Push DB schema
pnpm db:push

# 4. Run development server
pnpm dev:mainweb     # → http://localhost:3000`} />
                            </div>
                        </div>
                    )}

                    {/* ===== ARCHITECTURE ===== */}
                    {activeSection === 'architecture' && (
                        <div className="space-y-12">
                            <div>
                                <h1 className="text-4xl font-black text-white uppercase tracking-tighter mb-4">
                                    System <span className="text-[#00A8A8] italic">Architecture</span>
                                </h1>
                                <p className="text-gray-500 font-mono text-sm">Turborepo monorepo with workspace packages.</p>
                            </div>

                            <CodeBlock title="project structure" code={`query/
├── packages/
│   ├── api/          # tRPC routers, middleware, procedures
│   ├── auth/         # NextAuth configuration & providers
│   ├── db/           # Drizzle ORM schemas & connection
│   ├── consts/       # Shared constants & enums
│   └── ui/           # Shared UI component library
│
├── sites/
│   └── mainweb/      # Next.js 16 web application
│       ├── app/
│       │   ├── (portal)/     # Protected portal routes
│       │   ├── bootcamp/     # Public curriculum page
│       │   ├── docs/         # This documentation page
│       │   └── page.tsx      # Landing page
│       └── components/
│           ├── portal/       # LiquidGlass, QR scanner, etc.
│           ├── hackathon/    # Hackathon detail components
│           └── ...           # Navbar, Footer, Hero, etc.
│
├── tooling/          # ESLint, Prettier, Tailwind, TSConfig
└── turbo.json        # Turborepo pipeline configuration`} />

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <InfoCard
                                    title="@query/api"
                                    description="Backend logic layer"
                                    items={['11 tRPC routers', 'Protected procedures', 'Redis caching layer', 'Rate limiting middleware']}
                                />
                                <InfoCard
                                    title="@query/db"
                                    description="Data persistence"
                                    items={['9 schema modules', 'Drizzle ORM with PostgreSQL', 'Relational mapping', 'Index optimization']}
                                />
                                <InfoCard
                                    title="@query/auth"
                                    description="Authentication & authorization"
                                    items={['NextAuth v5 adapter', 'Email OTP verification', 'Session-based auth', 'Role-based middleware']}
                                />
                                <InfoCard
                                    title="sites/mainweb"
                                    description="Frontend application"
                                    items={['Next.js 16 App Router', '13+ portal pages', 'Glassmorphism UI system', 'QR-based event check-ins']}
                                />
                            </div>
                        </div>
                    )}

                    {/* ===== API REFERENCE ===== */}
                    {activeSection === 'api' && (
                        <div className="space-y-12">
                            <div>
                                <h1 className="text-4xl font-black text-white uppercase tracking-tighter mb-4">
                                    API <span className="text-[#00A8A8] italic">Reference</span>
                                </h1>
                                <p className="text-gray-500 font-mono text-sm">tRPC procedures organized by domain router. All routes use Zod validation.</p>
                            </div>

                            {/* User Router */}
                            <div>
                                <h3 className="text-xl font-black text-white uppercase tracking-tight mb-4 flex items-center gap-3">
                                    <span className="w-2.5 h-2.5 rounded-full bg-[#00A8A8]" /> User Router
                                </h3>
                                <ApiEndpoint method="QUERY" route="user.me" description="Get current authenticated user profile (name, email, image, bio, website, location)" auth="Protected" />
                                <ApiEndpoint method="MUTATION" route="user.updateProfile" description="Update user name, image, bio, website, or location" auth="Protected" />
                                <ApiEndpoint method="MUTATION" route="user.updateProfileImage" description="Upload and validate a base64 profile image (max 2000x2000, 2MB)" auth="Upload" />
                            </div>

                            {/* Events Router */}
                            <div>
                                <h3 className="text-xl font-black text-white uppercase tracking-tight mb-4 flex items-center gap-3">
                                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" /> Events Router
                                </h3>
                                <ApiEndpoint method="QUERY" route="events.myEvents" description="Get user's event check-in history" auth="Protected" />
                                <ApiEndpoint method="QUERY" route="events.myStats" description="Get total events attended count" auth="Protected" />
                                <ApiEndpoint method="MUTATION" route="events.checkIn" description="Process a QR-code-based event check-in" auth="Protected" />
                            </div>

                            {/* Hackathon Router */}
                            <div>
                                <h3 className="text-xl font-black text-white uppercase tracking-tight mb-4 flex items-center gap-3">
                                    <span className="w-2.5 h-2.5 rounded-full bg-purple-500" /> Hackathon Router
                                </h3>
                                <ApiEndpoint method="QUERY" route="hackathon.list" description="List hackathons with optional status filter" auth="Public" />
                                <ApiEndpoint method="QUERY" route="hackathon.getActive" description="Get the currently active hackathon" auth="Public" />
                                <ApiEndpoint method="QUERY" route="hackathon.myRegistrations" description="Get user's registrations with team and project data" auth="Protected" />
                                <ApiEndpoint method="QUERY" route="hackathon.getPublicProjects" description="Get public project gallery for a hackathon" auth="Public" />
                                <ApiEndpoint method="MUTATION" route="hackathon.register" description="Register for a hackathon" auth="Protected" />
                            </div>

                            {/* Team Router */}
                            <div>
                                <h3 className="text-xl font-black text-white uppercase tracking-tight mb-4 flex items-center gap-3">
                                    <span className="w-2.5 h-2.5 rounded-full bg-blue-500" /> Team Router
                                </h3>
                                <ApiEndpoint method="MUTATION" route="team.createTeam" description="Create a new team for a hackathon" auth="Protected" />
                                <ApiEndpoint method="MUTATION" route="team.joinTeam" description="Join an existing team by team ID" auth="Protected" />
                                <ApiEndpoint method="MUTATION" route="team.leaveTeam" description="Leave a team (captain cannot leave)" auth="Protected" />
                                <ApiEndpoint method="MUTATION" route="team.submitProject" description="Submit or update a project for judging" auth="Protected" />
                            </div>

                            {/* Member Router */}
                            <div>
                                <h3 className="text-xl font-black text-white uppercase tracking-tight mb-4 flex items-center gap-3">
                                    <span className="w-2.5 h-2.5 rounded-full bg-yellow-500" /> Member Router
                                </h3>
                                <ApiEndpoint method="QUERY" route="member.checkStatus" description="Check if user has active DSGT membership" auth="Protected" />
                                <ApiEndpoint method="QUERY" route="member.history" description="Get membership payment and status history" auth="Protected" />
                            </div>



                            {/* Stripe Router */}
                            <div>
                                <h3 className="text-xl font-black text-white uppercase tracking-tight mb-4 flex items-center gap-3">
                                    <span className="w-2.5 h-2.5 rounded-full bg-indigo-500" /> Stripe Router
                                </h3>
                                <ApiEndpoint method="MUTATION" route="stripe.createCheckoutSession" description="Create a Stripe checkout session for memberships" auth="Protected" />
                                <ApiEndpoint method="QUERY" route="stripe.getPaymentStatus" description="Check payment status of a session" auth="Protected" />
                            </div>
                        </div>
                    )}

                    {/* ===== DATABASE ===== */}
                    {activeSection === 'database' && (
                        <div className="space-y-12">
                            <div>
                                <h1 className="text-4xl font-black text-white uppercase tracking-tighter mb-4">
                                    Database <span className="text-[#00A8A8] italic">Schemas</span>
                                </h1>
                                <p className="text-gray-500 font-mono text-sm">PostgreSQL via Drizzle ORM. Located in <code className="text-[#00A8A8]">packages/db/src/schemas/</code></p>
                            </div>

                            <SchemaTable name="users" columns={[
                                { field: 'id', type: 'text', notes: 'Primary key' },
                                { field: 'name', type: 'text', notes: 'nullable' },
                                { field: 'email', type: 'text', notes: 'not null, indexed' },
                                { field: 'emailVerified', type: 'timestamp', notes: 'nullable' },
                                { field: 'image', type: 'text', notes: 'nullable, base64 or URL' },
                            ]} />

                            <SchemaTable name="hackathons" columns={[
                                { field: 'id', type: 'uuid', notes: 'Primary key, auto-generated' },
                                { field: 'name', type: 'text', notes: 'not null' },
                                { field: 'status', type: 'text', notes: 'draft | active | judging | completed' },
                                { field: 'startDate', type: 'timestamp', notes: 'not null' },
                                { field: 'endDate', type: 'timestamp', notes: 'not null' },
                                { field: 'tracks', type: 'json', notes: 'Array of track names' },
                                { field: 'challenges', type: 'json', notes: 'Array of challenge names' },
                                { field: 'registrationOpen', type: 'boolean', notes: 'default true' },
                            ]} />

                            <SchemaTable name="events" columns={[
                                { field: 'id', type: 'uuid', notes: 'Primary key' },
                                { field: 'title', type: 'text', notes: 'not null' },
                                { field: 'description', type: 'text', notes: 'nullable' },
                                { field: 'location', type: 'text', notes: 'nullable' },
                                { field: 'eventDate', type: 'timestamp', notes: 'not null' },
                                { field: 'qrCode', type: 'text', notes: 'UUID for check-in scanning' },
                                { field: 'checkInEnabled', type: 'boolean', notes: 'default false' },
                            ]} />

                            <SchemaTable name="members" columns={[
                                { field: 'id', type: 'uuid', notes: 'Primary key' },
                                { field: 'userId', type: 'text', notes: 'FK → users.id' },
                                { field: 'membershipType', type: 'text', notes: 'free | paid | premium' },
                                { field: 'isActive', type: 'boolean', notes: 'Computed from expiry' },
                                { field: 'expiresAt', type: 'timestamp', notes: 'Membership end date' },
                                { field: 'stripePaymentId', type: 'text', notes: 'nullable, Stripe ref' },
                            ]} />

                            <SchemaTable name="teams" columns={[
                                { field: 'id', type: 'uuid', notes: 'Primary key' },
                                { field: 'name', type: 'text', notes: 'not null' },
                                { field: 'hackathonId', type: 'uuid', notes: 'FK → hackathons.id' },
                                { field: 'captainId', type: 'text', notes: 'FK → users.id' },
                                { field: 'maxMembers', type: 'integer', notes: 'default 4' },
                            ]} />

                            <SchemaTable name="projects" columns={[
                                { field: 'id', type: 'uuid', notes: 'Primary key' },
                                { field: 'name', type: 'text', notes: 'not null' },
                                { field: 'description', type: 'text', notes: 'nullable' },
                                { field: 'githubUrl', type: 'text', notes: 'nullable' },
                                { field: 'demoUrl', type: 'text', notes: 'nullable' },
                                { field: 'videoUrl', type: 'text', notes: 'nullable' },
                                { field: 'teamId', type: 'uuid', notes: 'FK → teams.id' },
                                { field: 'status', type: 'text', notes: 'submitted | judging | winner' },
                            ]} />


                        </div>
                    )}

                    {/* ===== FRONTEND ===== */}
                    {activeSection === 'frontend' && (
                        <div className="space-y-12">
                            <div>
                                <h1 className="text-4xl font-black text-white uppercase tracking-tighter mb-4">
                                    Frontend <span className="text-[#00A8A8] italic">Guide</span>
                                </h1>
                                <p className="text-gray-500 font-mono text-sm">UI components, design system, and page structure.</p>
                            </div>

                            <div>
                                <h3 className="text-sm font-black text-gray-300 uppercase tracking-[0.3em] mb-6 font-mono">Design System</h3>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className="p-6 rounded-2xl border border-white/5 bg-white/[0.02]">
                                        <h4 className="text-lg font-black text-white mb-4">Color Palette</h4>
                                        <div className="space-y-3">
                                            {[
                                                { name: 'Primary', value: '#00A8A8', css: 'bg-[#00A8A8]' },
                                                { name: 'Background', value: '#050505', css: 'bg-[#050505] border border-white/10' },
                                                { name: 'Surface', value: 'white/5', css: 'bg-white/5 border border-white/10' },
                                                { name: 'Text Primary', value: '#FFFFFF', css: 'bg-white' },
                                                { name: 'Text Secondary', value: '#6B7280', css: 'bg-gray-500' },
                                            ].map((color) => (
                                                <div key={color.name} className="flex items-center gap-3">
                                                    <div className={`w-8 h-8 rounded-lg ${color.css}`} />
                                                    <div>
                                                        <p className="text-xs text-white font-bold">{color.name}</p>
                                                        <p className="text-[10px] text-gray-500 font-mono">{color.value}</p>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    <div className="p-6 rounded-2xl border border-white/5 bg-white/[0.02]">
                                        <h4 className="text-lg font-black text-white mb-4">Typography</h4>
                                        <div className="space-y-4">
                                            <div>
                                                <p className="text-3xl font-black text-white uppercase tracking-tighter italic">Heading</p>
                                                <p className="text-[10px] text-gray-500 font-mono">font-black, uppercase, tracking-tighter, italic</p>
                                            </div>
                                            <div>
                                                <p className="text-sm font-mono text-gray-400 uppercase tracking-widest">Subtitle</p>
                                                <p className="text-[10px] text-gray-500 font-mono">font-mono, uppercase, tracking-widest</p>
                                            </div>
                                            <div>
                                                <p className="text-sm text-gray-400">Body text for descriptions and content</p>
                                                <p className="text-[10px] text-gray-500 font-mono">text-sm, text-gray-400</p>
                                            </div>
                                            <div>
                                                <p className="text-xs font-mono text-[#00A8A8] uppercase tracking-[0.3em]">Label / Badge</p>
                                                <p className="text-[10px] text-gray-500 font-mono">text-xs, font-mono, tracking-[0.3em]</p>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div>
                                <h3 className="text-sm font-black text-gray-300 uppercase tracking-[0.3em] mb-6 font-mono">Portal Pages</h3>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <InfoCard title="/login" description="DO NOT MODIFY" items={['Email magic link authentication', 'Google OAuth provider', 'Session initialization']} accent="#ef4444" />
                                    <InfoCard title="/verify" description="OTP code verification" items={['6-digit code input with LiquidGlass', 'Auto-advance & paste support', 'Session binding on success']} />
                                    <InfoCard title="/dashboard" description="Central portal hub" items={['User profile card', 'Quick navigation grid', 'Active hackathon display']} />
                                    <InfoCard title="/club" description="Member dashboard" items={['Tabbed interface (Overview, History, Projects, Status)', 'QR scanner for event check-ins', 'Membership verification matrix']} />
                                    <InfoCard title="/hackathons" description="Hackathon detail view" items={['Auto-loads active hackathon', 'Info, Teams, Projects, Schedule tabs', 'Registration flow']} />
                                    <InfoCard title="/submit" description="Project submission terminal" items={['Team create/join flow', 'Project form with external links', 'Captain-only submission']} />
                                </div>
                            </div>

                            <div>
                                <h3 className="text-sm font-black text-gray-300 uppercase tracking-[0.3em] mb-6 font-mono">Core Components</h3>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <InfoCard title="LiquidGlass" description="components/portal/LiquidGlass" items={['Glassmorphism container', 'Backdrop blur + translucent borders', 'Used across all portal pages']} />
                                    <InfoCard title="Background" description="components/portal/Background" items={['Animated grid pattern', 'Fixed, low-opacity overlay', 'Consistent dark aesthetic']} />
                                    <InfoCard title="QRScannerModal" description="components/portal/QRScannerModal" items={['Camera-based QR reader', 'Debounced scan processing', 'Pause/resume controls']} />
                                </div>
                            </div>
                        </div>
                    )}

                    {/* ===== DEPLOYMENT ===== */}
                    {activeSection === 'deployment' && (
                        <div className="space-y-12">
                            <div>
                                <h1 className="text-4xl font-black text-white uppercase tracking-tighter mb-4">
                                    Deployment <span className="text-[#00A8A8] italic">Guide</span>
                                </h1>
                                <p className="text-gray-500 font-mono text-sm">CI/CD pipeline and hosting configuration.</p>
                            </div>

                            <InfoCard
                                title="Firebase App Hosting"
                                description="Primary hosting platform"
                                items={[
                                    'Configured via apphosting.yaml',
                                    'Auto-deploy on push to main branch',
                                    'Next.js SSR support via Cloud Functions',
                                    'Environment variables managed via Firebase Console',
                                ]}
                            />

                            <div>
                                <h3 className="text-sm font-black text-gray-300 uppercase tracking-[0.3em] mb-6 font-mono">Environment Variables</h3>
                                <CodeBlock title=".env" code={`# Database
DATABASE_URL=[REDACTED]

# Auth
NEXTAUTH_URL=[REDACTED]
NEXTAUTH_SECRET=[REDACTED]

# OAuth Providers
GOOGLE_CLIENT_ID=[REDACTED]
GOOGLE_CLIENT_SECRET=[REDACTED]
GITHUB_CLIENT_ID=[REDACTED]
GITHUB_CLIENT_SECRET=[REDACTED]

# Stripe
STRIPE_SECRET_KEY=[REDACTED]
STRIPE_WEBHOOK_SECRET=[REDACTED]
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=[REDACTED]

# Email (Resend)
RESEND_API_KEY=[REDACTED]

# Redis
REDIS_URL=[REDACTED]`} />
                            </div>

                            <div>
                                <h3 className="text-sm font-black text-gray-300 uppercase tracking-[0.3em] mb-6 font-mono">CI/CD Pipeline</h3>
                                <CodeBlock title="github actions" code={`# .github/workflows/deploy.yml
# Triggers on push to main branch
# Steps:
#   1. Install pnpm & Node.js 20
#   2. Install dependencies
#   3. Run type checks (tsc --noEmit)
#   4. Build application (turbo build --filter=web)
#   5. Deploy to Firebase App Hosting`} />
                            </div>

                            <div>
                                <h3 className="text-sm font-black text-gray-300 uppercase tracking-[0.3em] mb-6 font-mono">Useful Commands</h3>
                                <CodeBlock title="terminal" code={`# Development
pnpm dev:mainweb          # Start Next.js dev server
pnpm dev                  # Start all workspaces in parallel

# Building
pnpm build:mainweb        # Build the web application
pnpm build                # Build all packages

# Database
pnpm db:push              # Push schema changes to DB
pnpm db:studio            # Open Drizzle Studio (DB GUI)

# Quality
pnpm lint                 # Run ESLint across all packages
pnpm typecheck            # Run TypeScript type-checking`} />
                            </div>
                        </div>
                    )}

                </main>
            </div>
        </div>
    );
}
