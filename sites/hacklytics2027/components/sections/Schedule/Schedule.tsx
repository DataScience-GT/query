"use client";
import React, { useState } from 'react';
import Image from 'next/image';
import { Press_Start_2P } from 'next/font/google';
import { scheduleData, categories } from './data';

const pixel = Press_Start_2P({
  subsets: ['latin'],
  weight: ['400'],
});

const FloatingCandy: React.FC<{ src: string; delay: string; className?: string }> = ({ src, delay, className }) => (
  <div
    className={`absolute pointer-events-none animate-float ${className}`}
    style={{ animationDelay: delay }}
  >
    <Image src={src} alt="Candy" width={50} height={50} className="object-contain drop-shadow-md drop-shadow-[0_0_10px_var(--neon-pink)]" />
  </div>
);

const getCategoryIcon = (categoryId: string) => {
  const cat = categories.find((c: { id: string }) => c.id === categoryId);
  return cat ? cat.icon : '/small-candy/blue.png';
};

export default function Schedule() {
  const SHOW_SCHEDULE = true;
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
    <section
      id="schedule"
      className="section-anchor scroll-mt-28 min-h-0 bg-retro-gradient relative overflow-hidden py-12"
    >
      {/* Background Decorations */}
      <div className="absolute top-20 left-[-50px] w-48 h-32 opacity-40 animate-drift drop-shadow-[0_0_25px_#8b5cf6]" style={{ animationDelay: '0s' }}>
        <Image src="/cloud-main/smallCloud.png" alt="" fill className="object-contain drop-shadow-[0_0_25px_#8b5cf6]" />
      </div>
      <div className="absolute bottom-40 right-[-60px] w-40 h-28 opacity-50 animate-drift drop-shadow-[0_0_25px_#06b6d4]" style={{ animationDelay: '5s' }}>
        <Image src="/cloud-main/midCloud.png" alt="" fill className="object-contain drop-shadow-[0_0_25px_#06b6d4]" />
      </div>

      <FloatingCandy src="/small-candy/pink.png" delay="0s" className="top-32 right-[10%] rotate-12" />
      <FloatingCandy src="/small-candy/blue.png" delay="1.5s" className="bottom-20 left-[5%] -rotate-12" />
      <FloatingCandy src="/small-candy/yellow.png" delay="3s" className="top-1/2 left-[8%] rotate-45" />

      <div className="container mx-auto px-4 relative z-10 max-w-4xl">

        {/* Header */}
        <div className="text-center mb-8 relative">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-neon-cyan/20 blur-3xl rounded-full -z-10"></div>
          <h1
            className="font-pixel text-7xl md:text-8xl text-neon-cyan mb-2 drop-shadow-[0_0_30px_var(--neon-cyan)] animate-fade-in-up transform hover:scale-105 transition-transform duration-300"
            style={{ WebkitTextStroke: "2px #00ffff" }}
          >
            SCHEDULE
          </h1>
          <div className={`${pixel.className} text-2xl md:text-3xl text-neon-pink font-bold tracking-wide drop-shadow-[0_0_15px_var(--neon-pink)] animate-fade-in-up`} style={{ animationDelay: '0.2s' }}>
            THE ARCADE TIMELINE
          </div>
        </div>

        {/* Main Content Card - Coming Soon State */}
        <div className={`animate-fade-in-up ${SHOW_SCHEDULE ? 'hidden' : 'block'}`} style={{ animationDelay: '0.4s' }}>
          <div className="relative group">
            {/* Card Shadow Layer */}
            <div className="absolute inset-0 bg-neon-cyan/30 rounded-[2.5rem] transform translate-y-3 translate-x-3 drop-shadow-[0_0_30px_#06b6d4]"></div>

            {/* Card Body */}
            <div className="relative bg-white/90 backdrop-blur-md rounded-[2.5rem] border-[6px] border-neon-cyan shadow-[0_0_40px_#06b6d4] overflow-hidden p-12 md:p-16 text-center flex flex-col items-center justify-center gap-6">

              <div className="space-y-4">
                <h2 className={`${pixel.className} text-4xl md:text-5xl font-bold text-neon-cyan drop-shadow-[0_0_15px_#06b6d4]`}>
                  In The Works!
                </h2>
                <p className="text-gray-600 text-lg md:text-xl font-medium max-w-lg mx-auto leading-relaxed">
                  Our Oompa Loompas are busy organizing the timeline. <br />
                  Check back soon for the official schedule!
                </p>
              </div>

              {/* Decorative "Construction" Elements */}
              <div className="flex gap-4 mt-4 opacity-60">
                <svg className="w-8 h-8 text-neon-cyan animate-spin-slow" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                <svg className="w-8 h-8 text-neon-pink animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 4a2 2 0 114 0v1a1 1 0 001 1h3a1 1 0 011 1v3a1 1 0 01-1 1h-1a2 2 0 100 4h1a1 1 0 011 1v3a1 1 0 01-1 1h-3a1 1 0 01-1-1v-1a2 2 0 10-4 0v1a1 1 0 01-1 1H7a1 1 0 01-1-1v-3a1 1 0 00-1-1H4a2 2 0 110-4h1a1 1 0 001-1V7a1 1 0 011-1h3a1 1 0 001-1V4z" />
                </svg>
                <svg className="w-8 h-8 text-neon-cyan animate-spin-slow" style={{ animationDirection: 'reverse' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </div>

            </div>
          </div>
        </div>

        {/* Actual Schedule */}
        <div className={`animate-fade-in-up ${SHOW_SCHEDULE ? 'block' : 'hidden'}`} style={{ animationDelay: '0.4s' }}>
          <div className="relative group">
            <div className="absolute inset-0 bg-neon-cyan/30 rounded-[2.5rem] transform translate-y-3 translate-x-3 drop-shadow-[0_0_30px_#06b6d4]"></div>
            <div className="relative bg-white/90 backdrop-blur-md rounded-[2.5rem] border-[6px] border-neon-cyan shadow-[0_0_40px_#06b6d4] overflow-hidden">

              <div className="flex flex-wrap justify-center gap-2 p-4 border-b-4 border-neon-cyan bg-neon-cyan/10">
                {days.map(day => (
                  <button
                    key={day}
                    onClick={() => setSelectedDay(day)}
                    className={`${pixel.className} px-6 py-2 rounded-xl text-lg md:text-xl font-bold transition-all duration-300 transform hover:scale-105 border-b-4 ${selectedDay === day
                        ? 'bg-neon-pink text-white border-red-800 shadow-[0_0_20px_#ec4899] translate-y-[-2px]'
                        : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'
                        }`}
                  >
                    {day}
                  </button>
                ))}
              </div>

              <div className="flex flex-wrap justify-center gap-3 p-4 bg-neon-cyan/5">
                <button
                  onClick={() => setSelectedCategory('all')}
                  className={`px-4 py-1.5 rounded-full text-sm font-bold transition-colors border-2 ${selectedCategory === 'all'
                    ? 'bg-neon-cyan text-white border-neon-cyan drop-shadow-[0_0_8px_#06b6d4]'
                    : 'bg-transparent text-gray-500 border-gray-300 hover:border-neon-cyan'
                    }`}
                >
                  All Events
                </button>
                {categories.map(cat => (
                  <button
                    key={cat.id}
                    onClick={() => setSelectedCategory(cat.id)}
                    className={`flex items-center gap-2 px-4 py-1.5 rounded-full text-sm font-bold transition-colors border-2 ${selectedCategory === cat.id
                      ? 'bg-neon-cyan/20 text-neon-cyan border-neon-cyan/50'
                      : 'bg-transparent text-gray-500 border-gray-300 hover:border-neon-cyan'
                      }`}
                  >
                    <span className="w-4 h-4 relative">
                      <Image src={cat.icon} alt="" fill className="object-contain" />
                    </span>
                    {cat.name}
                  </button>
                ))}
              </div>

              <div className="p-4 md:p-6 min-h-[300px]">
                {filtered.length > 0 ? (
                  <div className="space-y-3">
                    {filtered.map((event, i) => (
                      <div
                        key={i}
                        className="group relative bg-white rounded-2xl border-2 border-neon-cyan/30 p-3 md:p-4 transition-all hover:border-neon-cyan hover:shadow-md hover:shadow-[0_0_15px_#06b6d4] flex flex-col md:flex-row gap-3 md:items-center"
                      >
                        <div className="flex-shrink-0">
                          <div className={`${pixel.className} bg-neon-cyan/20 text-neon-cyan px-4 py-2 rounded-xl text-xl font-bold text-center min-w-[100px] drop-shadow-[0_0_8px_#06b6d4]`}>
                            {event.time}
                          </div>
                        </div>

                        <div className="flex-grow">
                          <h3 className={`${pixel.className} text-2xl font-bold text-gray-800 mb-1 group-hover:text-neon-cyan transition-colors drop-shadow-[0_0_5px_currentColor]`}>
                            {event.eventName}
                          </h3>
                          <div className="flex items-center gap-2 text-gray-500 font-medium">
                            <svg className="w-4 h-4 text-neon-cyan flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                            </svg>
                            <span>{event.location}</span>
                          </div>
                        </div>

                        <div className="flex-shrink-0 self-start md:self-center">
                          <div className="w-10 h-10 relative opacity-80 group-hover:opacity-100 group-hover:scale-110 transition-all">
                            <Image
                              src={getCategoryIcon(event.category)}
                              alt={event.category}
                              fill
                              className="object-contain drop-shadow-[0_0_5px_currentColor]"
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-20 text-gray-400">
                    <svg className="w-16 h-16 mx-auto text-neon-cyan/40 mb-4 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    <p className="text-xl font-medium">No events scheduled for this category yet!</p>
                  </div>
                )}
              </div>

            </div>
          </div>
        </div>

      </div>

      <style jsx>{`
        @keyframes spin-slow {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }

        @keyframes drift {
          0%, 100% { transform: translateX(0px) translateY(0px); }
          50% { transform: translateX(20px) translateY(-10px); }
        }

        @keyframes float {
          0%, 100% { transform: translateY(0) rotate(var(--tw-rotate)); }
          50% { transform: translateY(-20px) rotate(calc(var(--tw-rotate) + 5deg)); }
        }

        @keyframes fade-in-up {
          from {
            opacity: 0;
            transform: translateY(30px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .animate-spin-slow {
          animation: spin-slow 8s linear infinite;
        }

        .animate-drift {
          animation: drift 10s ease-in-out infinite;
        }

        .animate-float {
          animation: float 6s ease-in-out infinite;
        }

        .animate-fade-in-up {
          animation: fade-in-up 0.8s ease-out forwards;
          opacity: 0;
        }
      `}</style>
    </section>
  );
}
