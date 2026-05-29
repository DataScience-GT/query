"use client";

import { trpc } from "@/lib/trpc";
import Card from "./Card";

export default function EventsList() {
  const { data: events, isLoading, error } = trpc.events.list.useQuery();

  if (isLoading) {
    return <div className="text-gray-500 font-mono text-sm uppercase tracking-widest text-center py-20">Loading events...</div>;
  }

  if (error) {
    return <div className="text-red-500 font-mono text-sm uppercase tracking-widest text-center py-20">Failed to load events.</div>;
  }

  if (!events || events.length === 0) {
    return <div className="text-gray-500 font-mono text-sm uppercase tracking-widest text-center py-20">No events found.</div>;
  }

  const openEvents = events.filter(e => e.status === "open");
  const closedEvents = events.filter(e => e.status === "closed");

  return (
    <div className="space-y-16">
      {/* OPEN EVENTS */}
      <div>
        <h3 className="text-white text-3xl font-bold mb-8 italic uppercase border-b border-white/10 pb-4">Open Events</h3>
        {openEvents.length === 0 ? (
          <p className="text-gray-500 font-mono text-xs uppercase tracking-widest">No open events right now.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {openEvents.map(event => (
              <Card key={event.id} className="flex flex-col justify-between h-full bg-[#0a0a0a] border border-white/5 p-8 rounded-xl hover:border-[#00A8A8]/40 transition-all shadow-2xl">
                <div className="flex justify-between items-start mb-4">
                  <h4 className="text-white text-xl font-bold">{event.title}</h4>
                  <span className="px-2 py-0.5 text-[9px] font-mono rounded bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 uppercase tracking-widest">Open</span>
                </div>
                <p className="text-sm text-gray-400 mb-6 leading-relaxed italic">{event.description}</p>
                <div className="mt-auto space-y-2 font-mono text-[10px] text-gray-500 tracking-widest">
                  <p>Date: {new Date(event.eventDate).toLocaleDateString()}</p>
                  {event.location && <p>Location: {event.location}</p>}
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* CLOSED EVENTS */}
      <div>
        <h3 className="text-white text-3xl font-bold mb-8 italic uppercase border-b border-white/10 pb-4">Past Events</h3>
        {closedEvents.length === 0 ? (
          <p className="text-gray-500 font-mono text-xs uppercase tracking-widest">No past events found.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {closedEvents.map(event => (
              <Card key={event.id} className="flex flex-col justify-between h-full bg-[#0a0a0a] border border-white/5 p-8 rounded-xl opacity-60 hover:opacity-100 transition-all shadow-xl">
                <div className="flex justify-between items-start mb-4">
                  <h4 className="text-white text-xl font-bold">{event.title}</h4>
                  <span className="px-2 py-0.5 text-[9px] font-mono rounded bg-red-500/10 text-red-400 border border-red-500/20 uppercase tracking-widest">Closed</span>
                </div>
                <p className="text-sm text-gray-400 mb-6 leading-relaxed italic line-clamp-3">{event.description}</p>
                <div className="mt-auto space-y-2 font-mono text-[10px] text-gray-500 tracking-widest">
                  <p>Date: {new Date(event.eventDate).toLocaleDateString()}</p>
                  {event.location && <p>Location: {event.location}</p>}
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
