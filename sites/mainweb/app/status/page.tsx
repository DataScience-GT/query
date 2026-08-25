"use client";

import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import Section from "@/components/Section";

export default function StatusPage() {
  return (
    <div className="site-shell">
      <Navbar screen_width={1024} page="status" />
      <main className="pt-20">
        <Section className="py-24">
          <div className="max-w-4xl mx-auto px-6">
            <p className="page-kicker mb-4">Club systems</p>
            <h1 className="page-title text-5xl mb-6">Status</h1>
            <p className="page-lede mb-12">
              Whether membership, events, and sign-in are up.
            </p>
            <div className="figure-card p-8 mb-6 space-y-4">
              {[
                "Database",
                "API",
                "Sign-in",
              ].map((name) => (
                <div
                  key={name}
                  className="flex items-center justify-between"
                >
                  <span className="text-gray-300">{name}</span>
                  <span className="px-3 py-1 text-xs font-mono text-[#00A8A8] border border-[#00A8A8]/30">
                    Operational
                  </span>
                </div>
              ))}
            </div>
            <div className="figure-card p-8">
              <h2 className="text-xl font-display text-white mb-2">
                Last checked
              </h2>
              <p className="text-gray-500">Systems responded normally.</p>
            </div>
          </div>
        </Section>
      </main>
      <Footer />
    </div>
  );
}
