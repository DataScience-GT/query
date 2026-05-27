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
<<<<<<< HEAD
    <section id="schedule" className="section-anchor scroll-mt-24 text-white py-12 md:py-24 relative">
=======
    <section id="schedule" className="section-anchor scroll-mt-20 border-b border-gridline bg-[#0b0c10] text-white py-12 md:py-24">
>>>>>>> 2be96d1c5816dc174837901901112274b3cfe4c7
      <div className="container mx-auto px-6 md:px-12 xl:px-24 max-w-7xl">
        
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between mb-16 relative">
<<<<<<< HEAD
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-bloom-lime/20 blur-[100px] pointer-events-none mix-blend-screen animate-pulse"></div>
          <h1 className="font-sans text-5xl md:text-8xl font-bold tracking-tighter uppercase relative z-10 drop-shadow-xl">
            Event<br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-bloom-lime to-white bloom-text-glow">Timeline</span>
          </h1>
          <div className="mt-8 md:mt-0 font-mono text-sm text-gray-300 uppercase tracking-widest max-w-sm border-l-2 border-bloom-lime pl-4 drop-shadow-md">
=======
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-bloom-lime/5 blur-[100px] pointer-events-none"></div>
          <h1 className="font-sans text-5xl md:text-8xl font-bold tracking-tighter uppercase relative z-10">
            Event<br />
            <span className="text-bloom-lime">Timeline</span>
          </h1>
          <div className="mt-8 md:mt-0 font-mono text-sm text-gray-400 uppercase tracking-widest max-w-sm border-l border-bloom-lime pl-4">
>>>>>>> 2be96d1c5816dc174837901901112274b3cfe4c7
            36 hours of intense building, learning, and collaborating.
          </div>
        </div>

        <div className="flex flex-col lg:flex-row gap-8">
          
          {/* Controls Sidebar */}
<<<<<<< HEAD
          <div className="lg:w-1/4 flex flex-col gap-6">
            {/* Day Selector */}
            <div className="flex flex-col glass-panel p-6">
              <h3 className="font-sans text-xl font-bold uppercase mb-4 text-white drop-shadow-[0_0_5px_currentColor]">Select Day</h3>
=======
          <div className="lg:w-1/4 flex flex-col gap-8">
            {/* Day Selector */}
            <div className="flex flex-col border border-gridline bg-black/50 p-6">
              <h3 className="font-sans text-xl font-bold uppercase mb-4 text-white">Select Day</h3>
>>>>>>> 2be96d1c5816dc174837901901112274b3cfe4c7
              <div className="flex flex-col gap-2">
                {days.map(day => (
                  <button
                    key={day}
                    onClick={() => setSelectedDay(day)}
<<<<<<< HEAD
                    className={`text-left px-4 py-3 rounded-lg font-mono text-sm uppercase tracking-widest transition-all duration-300 ${
                      selectedDay === day
                        ? 'bg-bloom-lime/20 text-bloom-lime font-bold border border-bloom-lime/50 shadow-[0_0_15px_rgba(204,255,0,0.15)]'
                        : 'text-gray-400 hover:bg-white/10 hover:text-white border border-transparent'
=======
                    className={`text-left px-4 py-2 font-mono text-sm uppercase tracking-widest transition-colors ${
                      selectedDay === day
                        ? 'bg-bloom-lime text-black font-bold'
                        : 'text-gray-400 hover:bg-white/[0.05] hover:text-white'
>>>>>>> 2be96d1c5816dc174837901901112274b3cfe4c7
                    }`}
                  >
                    {day}
                  </button>
                ))}
              </div>
            </div>

            {/* Filter */}
<<<<<<< HEAD
            <div className="flex flex-col glass-panel p-6">
              <h3 className="font-sans text-xl font-bold uppercase mb-4 text-white drop-shadow-[0_0_5px_currentColor]">Filters</h3>
              <div className="flex flex-col gap-2">
                <button
                  onClick={() => setSelectedCategory('all')}
                  className={`text-left px-4 py-3 rounded-lg font-mono text-sm uppercase tracking-widest transition-all duration-300 ${
                    selectedCategory === 'all'
                      ? 'bg-white/10 text-white font-bold border border-white/30 shadow-[0_0_15px_rgba(255,255,255,0.1)]'
                      : 'text-gray-500 hover:text-white hover:bg-white/5 border border-transparent'
=======
            <div className="flex flex-col border border-gridline bg-black/50 p-6">
              <h3 className="font-sans text-xl font-bold uppercase mb-4 text-white">Filters</h3>
              <div className="flex flex-col gap-2">
                <button
                  onClick={() => setSelectedCategory('all')}
                  className={`text-left px-4 py-2 font-mono text-sm uppercase tracking-widest transition-colors ${
                    selectedCategory === 'all'
                      ? 'bg-white/10 text-white font-bold border-l-2 border-white'
                      : 'text-gray-500 hover:text-gray-300 border-l-2 border-transparent'
>>>>>>> 2be96d1c5816dc174837901901112274b3cfe4c7
                  }`}
                >
                  All Events
                </button>
                {categories.map((cat: any) => (
                  <button
                    key={cat.id}
                    onClick={() => setSelectedCategory(cat.id)}
<<<<<<< HEAD
                    className={`text-left px-4 py-3 rounded-lg font-mono text-sm uppercase tracking-widest transition-all duration-300 ${
                      selectedCategory === cat.id
                        ? `bg-${cat.color.replace('text-', '')}/20 ${cat.color} font-bold border border-${cat.color.replace('text-', '')}/50 shadow-[0_0_15px_currentColor]`
                        : `${cat.color} opacity-70 hover:opacity-100 hover:bg-white/5 border border-transparent`
=======
                    className={`text-left px-4 py-2 font-mono text-sm uppercase tracking-widest transition-colors ${
                      selectedCategory === cat.id
                        ? `bg-white/10 ${cat.color} font-bold border-l-2 border-current`
                        : `${cat.color} opacity-70 hover:opacity-100 border-l-2 border-transparent`
>>>>>>> 2be96d1c5816dc174837901901112274b3cfe4c7
                    }`}
                  >
                    {cat.name}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Schedule List */}
<<<<<<< HEAD
          <div className="lg:w-3/4 flex flex-col gap-4">
            {filtered.length > 0 ? (
              filtered.map((event, i) => {
                const catColorClass = categories.find((c: any) => c.id === event.category)?.color || 'text-white';
                
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
=======
          <div className="lg:w-3/4 flex flex-col">
            <div className="border border-gridline border-b-0">
              {filtered.length > 0 ? (
                filtered.map((event, i) => {
                  const catColorClass = categories.find((c: any) => c.id === event.category)?.color || 'text-white';
                  
                  return (
                    <div
                      key={i}
                      className="group border-b border-gridline bg-[#0b0c10] p-6 hover:bg-white/[0.02] transition-colors flex flex-col md:flex-row gap-6 md:items-center relative overflow-hidden"
                    >
                      <div className={`absolute top-0 left-0 w-1 h-full ${catColorClass.replace('text-', 'bg-')} opacity-50 group-hover:opacity-100 transition-opacity`}></div>
                      
                      {/* Time */}
                      <div className="w-48 flex-shrink-0">
                        <span className={`font-mono text-sm tracking-widest uppercase ${catColorClass}`}>
                          {event.time}
                        </span>
                      </div>

                      {/* Details */}
                      <div className="flex-grow">
                        <h3 className="font-sans text-2xl font-bold uppercase tracking-tight text-white mb-2 group-hover:text-gray-200 transition-colors">
                          {event.eventName}
                        </h3>
                        <div className="flex items-center gap-2 font-mono text-xs text-gray-500 uppercase tracking-widest">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"></path>
                            <circle cx="12" cy="9" r="2.5"></circle>
                          </svg>
                          <span>{event.location}</span>
                        </div>
                      </div>

                      {/* Category Label */}
                      <div className="hidden md:block flex-shrink-0">
                        <span className={`px-3 py-1 font-mono text-xs uppercase tracking-widest border border-gridline ${catColorClass}`}>
                          {event.category}
                        </span>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="p-12 text-center border-b border-gridline">
                  <div className="font-mono text-sm text-gray-500 uppercase tracking-widest mb-4">No Data Found</div>
                  <h3 className="font-sans text-2xl font-bold text-white uppercase tracking-tight">Try adjusting filters</h3>
                </div>
              )}
            </div>
>>>>>>> 2be96d1c5816dc174837901901112274b3cfe4c7
          </div>
          
        </div>
      </div>
    </section>
  );
}
