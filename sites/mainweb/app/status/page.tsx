"use client";

import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import Section from "@/components/Section";
import PublicFrame from "@/components/PublicFrame";

const SYSTEMS = [
  { name: "Database", state: "Operational" },
  { name: "API", state: "Operational" },
  { name: "Auth", state: "Operational" },
];

export default function StatusPage() {
  return (
    <PublicFrame note="all systems">
      <div className="relative min-h-screen">
        <Navbar screen_width={1024} page="status" />
        <main className="pt-20">
          <Section className="py-32">
            <div className="max-w-4xl mx-auto px-6">
              <p className="public-kicker mb-4">Operations</p>
              <h1 className="public-display text-5xl md:text-6xl mb-6">
                Status of the club site.
              </h1>
              <p className="public-lede mb-12">
                What is up, in plain language. If something is down, this page
                should say so.
              </p>
              <div className="public-card p-8 mb-8 divide-y divide-[var(--rule)]">
                {SYSTEMS.map((system) => (
                  <div
                    key={system.name}
                    className="flex items-center justify-between py-4 first:pt-0 last:pb-0"
                  >
                    <span className="public-ui text-[var(--ink)]">
                      {system.name}
                    </span>
                    <span className="public-chip bg-[var(--navy)] text-[var(--buzz)] border-[var(--navy)]">
                      {system.state}
                    </span>
                  </div>
                ))}
              </div>
              <div className="public-card p-8">
                <h2 className="public-display text-xl mb-3">Last check</h2>
                <p className="text-[var(--ink-soft)]">
                  System check completed successfully.
                </p>
              </div>
            </div>
          </Section>
        </main>
        <Footer />
      </div>
    </PublicFrame>
  );
}
