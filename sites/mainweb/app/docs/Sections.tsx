"use client";

import { useState } from "react";
import type { ReactNode } from "react";
import { ExternalLink } from "lucide-react";
import {
  BUILD_STEPS,
  CI,
  DB_COMMANDS,
  DESIGN,
  HOSTING,
  PACKAGES,
  PORTAL_ROUTES,
  PROCEDURE_KINDS,
  PUBLIC_ROUTES,
  QUICK_START,
  READ_NEXT,
  REPO_URL,
  REQUEST_PATH,
  ROUTERS,
  SCHEMA_FILES,
  SCRIPTS,
  STACK,
  TREE,
  repoLink,
} from "./content";
import type { DocSection, Row } from "./content";

function C({ children }: { children: ReactNode }) {
  return (
    <code className="rounded-sm bg-white/10 px-1.5 py-0.5 font-mono text-[0.85em] text-gray-200">
      {children}
    </code>
  );
}

// Renders `code` spans inside plain strings, so copy can stay in content.ts.
function Inline({ text }: { text: string }) {
  return (
    <>
      {text
        .split("`")
        .map((part, i) => (i % 2 === 1 ? <C key={i}>{part}</C> : part))}
    </>
  );
}

function GithubLink({ path, children }: { path: string; children: ReactNode }) {
  return (
    <a
      href={repoLink(path)}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1.5 text-[#00A8A8] underline decoration-[#00A8A8]/40 underline-offset-4 transition-colors hover:decoration-[#00A8A8]"
    >
      {children}
      <ExternalLink size={14} aria-hidden />
      <span className="sr-only">(opens GitHub)</span>
    </a>
  );
}

function Heading({ children }: { children: ReactNode }) {
  return (
    <h2 className="mt-16 mb-2 text-2xl font-bold tracking-tight text-white">
      {children}
    </h2>
  );
}

function Prose({ children }: { children: ReactNode }) {
  return <p className="mt-4 max-w-prose leading-7 text-gray-300">{children}</p>;
}

// Term and description pairs. Stacks on phones, two columns from sm up.
function Rows({ rows, mono = true }: { rows: Row[]; mono?: boolean }) {
  return (
    <dl className="mt-5 border-b border-white/10">
      {rows.map((row) => (
        <div
          key={row.term}
          className="grid gap-x-8 gap-y-1 border-t border-white/10 py-3.5 sm:grid-cols-[13rem_minmax(0,1fr)]"
        >
          <dt
            className={`text-white ${mono ? "font-mono text-sm break-words" : "font-semibold"}`}
          >
            {row.term}
          </dt>
          <dd className="leading-7 text-gray-300">
            <Inline text={row.body} />
            {row.href && (
              <>
                {" "}
                <GithubLink path={row.href}>Read more</GithubLink>
              </>
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function CodeBlock({ label, code }: { label: string; code: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <figure className="mt-5 rounded-sm border border-white/10 bg-white/[0.03]">
      <figcaption className="flex items-center justify-between border-b border-white/10 pr-1 pl-4">
        <span className="font-mono text-[11px] tracking-[0.2em] text-gray-400 uppercase">
          {label}
        </span>
        <button
          type="button"
          onClick={() => {
            // Clipboard is unavailable on insecure origins and in some
            // embedded browsers; the text stays selectable either way.
            navigator.clipboard
              ?.writeText(code)
              .then(() => {
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              })
              .catch(() => {});
          }}
          className="inline-flex min-h-11 items-center px-3 font-mono text-[11px] tracking-[0.2em] text-gray-300 uppercase transition-colors hover:text-[#00A8A8]"
        >
          {copied ? "Copied" : "Copy"}
          <span className="sr-only"> {label}</span>
        </button>
      </figcaption>
      <pre
        tabIndex={0}
        className="overflow-x-auto p-4 font-mono text-[13px] leading-6 text-gray-200"
      >
        <code>{code}</code>
      </pre>
    </figure>
  );
}

function Steps({ items }: { items: string[] }) {
  return (
    <ol className="mt-5 max-w-prose list-decimal space-y-2 pl-5 leading-7 text-gray-300 marker:font-mono marker:text-gray-400">
      {items.map((item) => (
        <li key={item} className="pl-2">
          <Inline text={item} />
        </li>
      ))}
    </ol>
  );
}

function Overview() {
  return (
    <>
      <Prose>
        Query is the monorepo behind datasciencegt.org: the public club site,
        the member portal and the hackathon tools. Two Next.js sites share four
        internal packages and one Postgres database.
      </Prose>
      <Heading>Stack</Heading>
      <Rows rows={STACK} mono={false} />
      <Heading>Run it locally</Heading>
      <CodeBlock label="terminal" code={QUICK_START} />
      <Prose>
        Google sign-in, email codes and Stripe need their own credentials;
        public pages do not. The full walkthrough, including the first admin
        account, is in{" "}
        <GithubLink path="docs/getting-started.md">Getting started</GithubLink>.
      </Prose>
      <Heading>Read next</Heading>
      <Rows rows={READ_NEXT} mono={false} />
    </>
  );
}

function Architecture() {
  return (
    <>
      <Prose>
        A pnpm and Turborepo monorepo. Two Next.js sites sit on four internal
        packages. Only the main site talks to the database.
      </Prose>
      <CodeBlock label="layout" code={TREE} />
      <Heading>Two products, one database</Heading>
      <Prose>
        The club side is year-round: membership, events, bootcamp, initiatives
        and payments. It is not tied to any hackathon. The hackathon side is
        scoped to an edition: registration, teams, submissions, check-in, points
        and judging. Hackathon registration is open to non-members. They share
        Postgres but are modeled apart, so drafting next year&apos;s edition
        cannot change who counts as a member.
      </Prose>
      <Heading>Packages</Heading>
      <Rows rows={PACKAGES} />
      <Heading>Request path</Heading>
      <Steps items={REQUEST_PATH} />
      <Prose>
        The cache is in-memory and per server instance, not Redis. Pricing is
        defined once in <C>@query/api</C>. Auth, payments and caching are
        covered in{" "}
        <GithubLink path="docs/architecture.md">Architecture</GithubLink>.
      </Prose>
    </>
  );
}

function Api() {
  return (
    <>
      <Prose>
        The server API is tRPC, mounted at <C>/api/trpc</C> and composed in{" "}
        <C>packages/api/src/root.ts</C>. Every input is validated with Zod. The
        site is its only client.
      </Prose>
      <Heading>Routers</Heading>
      <Rows rows={ROUTERS} />
      <Prose>
        <C>hackathon</C> and <C>judge</C> merge several files, so names stay
        flat, for example <C>hackathon.register</C>.
      </Prose>
      <Heading>Procedure kinds</Heading>
      <Rows rows={PROCEDURE_KINDS} />
      <Prose>
        There is deliberately no <C>adminProcedure</C> that skips a role check.
        Procedure lists, gates and notes per feature are in{" "}
        <GithubLink path="docs/packages/api.md">the API reference</GithubLink>{" "}
        and <GithubLink path="docs/operations/security.md">Security</GithubLink>
        .
      </Prose>
    </>
  );
}

function Database() {
  return (
    <>
      <Prose>
        Postgres through Drizzle ORM. Schema files live in{" "}
        <C>packages/db/src/schemas/</C>. Production runs on Neon; local
        development uses Docker Postgres.
      </Prose>
      <Heading>Schema files</Heading>
      <Rows rows={SCHEMA_FILES} />
      <Heading>Rules worth knowing</Heading>
      <Prose>
        Club tables are not keyed by a hackathon. A person is a member only
        while their membership is active and unexpired. Nearly every foreign key
        cascades, so deleting a user or an edition removes what hangs off it.
        Hackathon editions move through <C>draft</C>, <C>announced</C>,{" "}
        <C>open</C>, <C>closed</C>, <C>in_progress</C> and <C>completed</C>, or{" "}
        <C>cancelled</C>.
      </Prose>
      <Heading>Changing the schema</Heading>
      <Prose>
        Schema work is push-based; there is no committed SQL migration history.
        Production applies additive changes at build time and fails the build
        when a declared column is missing.
      </Prose>
      <CodeBlock label="terminal" code={DB_COMMANDS} />
      <Prose>
        Table-by-table detail and diagrams are in{" "}
        <GithubLink path="docs/packages/db.md">
          the database reference
        </GithubLink>
        .
      </Prose>
    </>
  );
}

function Frontend() {
  return (
    <>
      <Prose>
        The public site and the portal are one Next.js App Router app in{" "}
        <C>sites/mainweb</C>. Portal routes live in the <C>(portal)</C> route
        group and are served without caching.
      </Prose>
      <Heading>Public routes</Heading>
      <Rows rows={PUBLIC_ROUTES} />
      <Heading>Portal routes</Heading>
      <Rows rows={PORTAL_ROUTES} />
      <Heading>Look and feel</Heading>
      <Rows rows={DESIGN} mono={false} />
      <Prose>
        The full route list and client data helpers are in{" "}
        <GithubLink path="docs/sites/mainweb.md">Main website</GithubLink>.
      </Prose>
    </>
  );
}

function Deployment() {
  return (
    <>
      <Prose>
        Two surfaces, two platforms. Secrets are never committed; the
        environment variable names the app reads are listed in the repo docs.
      </Prose>
      <Heading>Hosting</Heading>
      <Rows rows={HOSTING} mono={false} />
      <Heading>mainweb build</Heading>
      <Steps items={BUILD_STEPS} />
      <Heading>CI</Heading>
      <Rows rows={CI} mono={false} />
      <Heading>Scripts</Heading>
      <CodeBlock label="terminal" code={SCRIPTS} />
      <Prose>
        Source of record:{" "}
        <a
          href={REPO_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[#00A8A8] underline decoration-[#00A8A8]/40 underline-offset-4 hover:decoration-[#00A8A8]"
        >
          the repository on GitHub
          <span className="sr-only"> (opens GitHub)</span>
        </a>
        .
      </Prose>
    </>
  );
}

export const SECTION_BODY: Record<DocSection, () => ReactNode> = {
  overview: Overview,
  architecture: Architecture,
  api: Api,
  database: Database,
  frontend: Frontend,
  deployment: Deployment,
};
