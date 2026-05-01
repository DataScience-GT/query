"use client";

import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import Section from "@/components/Section";

export default function EventsPage() {
  return (
    <div className="relative min-h-screen bg-[#050505] text-white">
      <Navbar screen_width={1024} page="events" />
      <main className="pt-20">
        <Section className="py-32">
          <div className="max-w-4xl mx-auto px-6">
            <h1 className="text-5xl font-black uppercase tracking-tight mb-8">Events</h1>
            <p className="text-lg text-gray-400 leading-relaxed mb-12 italic">
              Track upcoming hackathons, workshops, and community gatherings.
            </p>
            <div className="bg-[#0a0a0a]/50 border border-white/5 rounded-2xl p-8">
              <h2 className="text-xl font-bold uppercase mb-4">Upcoming Events</h2>
              <p className="text-gray-500 italic">
                No upcoming events scheduled. Check back soon!
              </p>
            </div>
          </div>
        </Section>
      </main>
      <Footer />
    </div>
  );
}
