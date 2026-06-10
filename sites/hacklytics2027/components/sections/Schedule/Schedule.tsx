"use client";
import React, { useState } from 'react';
import { scheduleData, categories } from './data';

export default function Schedule() {
  const [selectedDay, setSelectedDay] = useState('Friday');
  const [selectedCategory, setSelectedCategory] = useState('all');

  const days = ['Friday', 'Saturday', 'Sunday'];

  const filtered =
    selectedCategory === 'all'
      ? scheduleData[selectedDay]
      : scheduleData[selectedDay]?.filter(
          (e) => e.category === selectedCategory
        ) || [];

  return (
    <section id="schedule" className="section-anchor scroll-mt-24 text-white py-12 md:py-24 relative">
      <div className="container mx-auto px-6 md:px-12 xl:px-24 max-w-7xl">
        
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between mb-16 relative">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-bloom-lime/20 blur-[100px] pointer-events-none mix-blend-screen animate-pulse"></div>
          <h1 className="font-sans text-5xl md:text-8xl font-bold tracking-tighter uppercase relative z-10 drop-shadow-xl">
            Event<br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-bloom-lime to-white bloom-text-glow">Timeline</span>
          </h1>
          <div className="mt-8 md:mt-0 font-mono text-sm text-gray-300 uppercase tracking-widest max-w-sm border-l-2 border-bloom-lime pl-4 drop-shadow-md">
            36 hours of intense building, learning, and collaborating.
          </div>
        </div>

        <div className="flex flex-col lg:flex-row gap-8">
          
          {/* Controls Sidebar */}
          <div className="lg:w-1/4 flex flex-col gap-6">
            {/* Day Selector */}
            <div className="flex flex-col glass-panel p-6">
              <h3 className="font-sans text-xl font-bold uppercase mb-4 text-white drop-shadow-[0_0_5px_currentColor]">Select Day</h3>
              <div className="flex flex-col gap-2">
                {days.map(day => (
                  <button
                    key={day}
                    onClick={() => setSelectedDay(day)}
                    className={`text-left px-4 py-3 rounded-lg font-mono text-sm uppercase tracking-widest transition-all duration-300 ${
                      selectedDay === day
                        ? 'bg-bloom-lime/20 text-bloom-lime font-bold border border-bloom-lime/50 shadow-[0_0_15px_rgba(204,255,0,0.15)]'
                        : 'text-gray-400 hover:bg-white/10 hover:text-white border border-transparent'
                    }`}
                  >
                    {day}
                  </button>
                ))}
              </div>
            </div>

            {/* Filter */}
            <div className="flex flex-col glass-panel p-6">
              <h3 className="font-sans text-xl font-bold uppercase mb-4 text-white drop-shadow-[0_0_5px_currentColor]">Filters</h3>
              <div className="flex flex-col gap-2">
                <button
                  onClick={() => setSelectedCategory('all')}
                  className={`text-left px-4 py-3 rounded-lg font-mono text-sm uppercase tracking-widest transition-all duration-300 ${
                    selectedCategory === 'all'
                      ? 'bg-white/10 text-white font-bold border border-white/30 shadow-[0_0_15px_rgba(255,255,255,0.1)]'
                      : 'text-gray-500 hover:text-white hover:bg-white/5 border border-transparent'
                  }`}
                >
                  All Events
                </button>
                {categories.map((cat) => (
                  <button
                    key={cat.id}
                    onClick={() => setSelectedCategory(cat.id)}
                    className={`text-left px-4 py-3 rounded-lg font-mono text-sm uppercase tracking-widest transition-all duration-300 ${
                      selectedCategory === cat.id
                        ? `bg-${cat.color.replace('text-', '')}/20 ${cat.color} font-bold border border-${cat.color.replace('text-', '')}/50 shadow-[0_0_15px_currentColor]`
                        : `${cat.color} opacity-70 hover:opacity-100 hover:bg-white/5 border border-transparent`
                    }`}
                  >
                    {cat.name}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Schedule List */}
          <div className="lg:w-3/4 flex flex-col gap-4">
            {filtered.length > 0 ? (
              filtered.map((event, i) => {
                const catColorClass = categories.find((c) => c.id === event.category)?.color || 'text-white';
                
                return (
                  <div
                    key={i}
                    className={`group glass-panel p-6 transition-all duration-500 hover:-translate-y-1 hover:border-${catColorClass.replace('text-', '')}/50 flex flex-col md:flex-row gap-6 md:items-center relative overflow-hidden`}
                  >
                    {/* Glowing Left Border */}
                    <div className={`absolute top-0 left-0 w-1.5 h-full ${catColorClass.replace('text-', 'bg-')} shadow-[0_0_10px_currentColor] opacity-70 group-hover:opacity-100 transition-opacity`}></div>
                    
                    {/* Background Glow on Hover */}
                    <div className={`absolute top-1/2 -translate-y-1/2 left-0 w-32 h-32 ${catColorClass.replace('text-', 'bg-')}/10 blur-[40px] opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none`}></div>

                    {/* Time */}
                    <div className="w-48 flex-shrink-0 relative z-10">
                      <span className={`font-mono text-sm tracking-widest uppercase font-bold drop-shadow-[0_0_5px_currentColor] ${catColorClass}`}>
                        {event.time}
                      </span>
                    </div>

                    {/* Details */}
                    <div className="flex-grow relative z-10">
                      <h3 className="font-sans text-2xl font-bold uppercase tracking-tight text-white mb-2 drop-shadow-md">
                        {event.eventName}
                      </h3>
                      <div className="flex items-center gap-2 font-mono text-xs text-gray-300 uppercase tracking-widest">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="drop-shadow-[0_0_3px_currentColor]">
                          <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"></path>
                          <circle cx="12" cy="9" r="2.5"></circle>
                        </svg>
                        <span>{event.location}</span>
                      </div>
                    </div>

                    {/* Category Label */}
                    <div className="hidden md:block flex-shrink-0 relative z-10">
                      <span className={`px-4 py-2 rounded-full font-mono text-xs uppercase tracking-widest border border-white/10 bg-white/5 ${catColorClass}`}>
                        {event.category}
                      </span>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="p-12 text-center glass-panel">
                <div className="font-mono text-sm text-gray-400 uppercase tracking-widest mb-4">No Data Found</div>
                <h3 className="font-sans text-2xl font-bold text-white uppercase tracking-tight drop-shadow-md">Try adjusting filters</h3>
              </div>
            )}
          </div>
          
        </div>
      </div>
    </section>
  );
}
