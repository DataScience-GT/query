"use client";
import React from 'react';
import Image from 'next/image';
import { Press_Start_2P } from 'next/font/google';

const pixel = Press_Start_2P({
  subsets: ['latin'],
  weight: ['400'],
});

const FloatingCandy: React.FC<{ src: string; delay: string; className?: string }> = ({ src, delay, className }) => (
  <div
    className={`absolute pointer-events-none animate-float ${className}`}
    style={{ animationDelay: delay }}
  >
    <Image src={src} alt="Candy" width={60} height={60} className="object-contain drop-shadow-lg drop-shadow-[0_0_10px_var(--neon-pink)]" />
  </div>
);

// Custom Vector Icons for About Section - 1980s Arcade Style
const Icons = {
  Build: () => (
    <svg viewBox="0 0 100 100" className="w-full h-full drop-shadow-sm">
      {/* Monitor Stand */}
      <path d="M20 85 L80 85 L85 95 L15 95 Z" fill="#9CA3AF" stroke="#4B5563" strokeWidth="3" />
      <rect x="45" y="65" width="10" height="20" fill="#D1D5DB" stroke="#4B5563" strokeWidth="3" />

      {/* Monitor Body */}
      <rect x="10" y="15" width="80" height="50" rx="4" fill="#60A5FA" stroke="#1D4ED8" strokeWidth="4" />

      {/* Screen Content */}
      <rect x="18" y="23" width="64" height="34" fill="#EFF6FF" />
      <rect x="25" y="30" width="20" height="4" rx="1" fill="#3B82F6" />
      <rect x="25" y="38" width="35" height="4" rx="1" fill="#93C5FD" />
      <rect x="25" y="46" width="30" height="4" rx="1" fill="#93C5FD" />

      {/* Floating Code Elements */}
      <circle cx="70" cy="35" r="6" fill="#FCD34D" stroke="#F59E0B" strokeWidth="2" />
      <path d="M65 48 L75 48 L70 55 Z" fill="#F87171" stroke="#DC2626" strokeWidth="2" />
    </svg>
  ),
  Community: () => (
    <svg viewBox="0 0 100 100" className="w-full h-full drop-shadow-sm">
      {/* Person 1 (Back) */}
      <circle cx="68" cy="38" r="14" fill="#60A5FA" stroke="#1D4ED8" strokeWidth="3" />
      <path d="M68 52 C85 52 92 85 92 95 L44 95 C44 85 51 52 68 52" fill="#93C5FD" stroke="#1D4ED8" strokeWidth="3" />

      {/* Person 2 (Front) */}
      <circle cx="38" cy="45" r="14" fill="#34D399" stroke="#047857" strokeWidth="3" />
      <path d="M38 59 C55 59 62 92 62 95 L14 95 C14 92 21 59 38 59" fill="#6EE7B7" stroke="#047857" strokeWidth="3" />
    </svg>
  ),
  Gift: () => (
    <svg viewBox="0 0 100 100" className="w-full h-full drop-shadow-sm">
      {/* Box */}
      <rect x="20" y="45" width="60" height="45" rx="4" fill="#EF4444" stroke="#B91C1C" strokeWidth="4" />

      {/* Vertical Ribbon */}
      <rect x="45" y="45" width="10" height="45" fill="#FCD34D" stroke="#D97706" strokeWidth="2" />

      {/* Lid */}
      <rect x="15" y="30" width="70" height="15" rx="2" fill="#F87171" stroke="#B91C1C" strokeWidth="4" />
      <rect x="45" y="30" width="10" height="15" fill="#FCD34D" stroke="#D97706" strokeWidth="2" />

      {/* Bow */}
      <path d="M50 30 C50 30 25 5 20 20 C15 30 45 32 50 30" fill="#FCD34D" stroke="#D97706" strokeWidth="2" />
      <path d="M50 30 C50 30 75 5 80 20 C85 30 55 32 50 30" fill="#FCD34D" stroke="#D97706" strokeWidth="2" />
    </svg>
  )
};

const AboutSection: React.FC = () => {
  return (
    <section id="about" className="section-anchor scroll-mt-28 min-h-screen bg-retro-gradient relative overflow-hidden py-20">
      {/* Retro CRT-style background decoration */}
      <div className="absolute inset-0 bg-gradient-to-b from-neon-pink/10 via-neon-cyan/5 to-transparent pointer-events-none"></div>

      {/* Drifting cloud decorations - Background - Retro style */}
      <div className="absolute top-10 left-[-50px] w-48 h-32 opacity-40 animate-drift" style={{ animationDelay: '0s' }}>
        <Image src="/cloud-main/smallCloud.png" alt="" fill className="object-contain drop-shadow-[0_0_15px_var(--neon-cyan)]" />
      </div>
      <div className="absolute top-40 right-[-60px] w-40 h-28 opacity-50 animate-drift" style={{ animationDelay: '5s' }}>
        <Image src="/cloud-main/midCloud.png" alt="" fill className="object-contain drop-shadow-[0_0_15px_var(--neon-pink)]" />
      </div>
      <div className="absolute bottom-20 left-1/4 w-56 h-36 opacity-30 animate-drift" style={{ animationDelay: '2s' }}>
        <Image src="/cloud-main/largecloud.png" alt="" fill className="object-contain drop-shadow-[0_0_20px_var(--neon-purple)]" />
      </div>

      {/* Floating Candies - Retro styled */}
      <FloatingCandy src="/small-candy/pink.png" delay="0s" className="top-20 right-[15%] rotate-12" />
      <FloatingCandy src="/small-candy/blue.png" delay="1.5s" className="bottom-32 left-[10%] -rotate-12" />
      <FloatingCandy src="/small-candy/yellow.png" delay="3s" className="top-1/2 right-[5%] rotate-45" />
      <FloatingCandy src="/small-candy/green.png" delay="4.5s" className="bottom-10 right-[20%] -rotate-6" />

      <div className="container mx-auto px-4 relative z-10 max-w-6xl">

        {/* Section Header */}
        <div className="text-center mb-12 relative">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-neon-pink/20 blur-3xl rounded-full -z-10"></div>
          <h1
            className="font-pixel text-7xl md:text-9xl text-neon-cyan mb-2 drop-shadow-[0_0_20px_var(--neon-cyan)] animate-fade-in-up transform hover:scale-105 transition-transform duration-300"
          >
            ABOUT
          </h1>
          <div className={`${pixel.className} text-2xl md:text-4xl text-neon-pink font-bold tracking-wide drop-shadow-[0_0_10px_var(--neon-pink)] animate-fade-in-up`} style={{ animationDelay: '0.2s' }}>
            THE ARCADE
          </div>
        </div>

        {/* Dense 2-Column Layout */}
        <div className="grid lg:grid-cols-12 gap-6 md:gap-8 items-start">

          {/* Left Column: Main Story Card */}
          <div className="lg:col-span-7 animate-fade-in-up h-full" style={{ animationDelay: '0.4s' }}>
            <div className="relative group transform transition-transform hover:scale-[1.01] duration-300 h-full">
              {/* Background Layer - Neon pink glow */}
              <div className="absolute inset-0 bg-neon-pink rounded-[2.5rem] transform translate-y-2 translate-x-2 md:translate-y-4 md:translate-x-4 shadow-[0_0_30px_var(--neon-pink)]"></div>

              {/* Card Content */}
              <div className="relative bg-white rounded-[2.5rem] p-8 md:p-10 border-[6px] border-neon-pink shadow-[0_0_20px_var(--neon-pink)] overflow-hidden h-full flex flex-col justify-center">
                {/* Corner Decoration */}
                <div className="absolute top-0 right-0 w-40 h-40 bg-neon-pink/20 rounded-bl-full -mr-10 -mt-10 z-0 opacity-50"></div>

                <div className="relative z-10">
                  <h2 className={`${pixel.className} text-4xl md:text-5xl font-bold text-neon-pink mb-6 drop-shadow-[0_0_10px_var(--neon-pink)]`}>
                    A World of Pure Imagination
                  </h2>

                  <div className="space-y-5 text-gray-800 text-lg md:text-xl leading-relaxed font-medium">
                    <p>
                      <span className="font-bold text-neon-pink">Hacklytics</span> is a <span className="font-bold bg-neon-pink/20 text-neon-pink px-2 py-0.5 rounded-md whitespace-nowrap">36-hour data science hackathon</span> hosted by Data Science @ GT.
                    </p>
                    <p>
                      Inspired by the whimsical world of <span className="font-pixel text-2xl text-neon-cyan drop-shadow-sm" style={{ WebkitTextStroke: "1px #00ffff" }}>Willy Wonka</span>, we invite hackers from across the globe to grab their <span className="text-yellow-400 font-bold drop-shadow-[0_0_5px_#fbbf24]">Golden Ticket</span> to innovation.
                    </p>
                    <p>
                      Tackle challenges across <span className="font-bold border-b-4 border-neon-pink/50">5 exciting tracks</span>, fuel your curiosity, and uncover the sweet rewards of solving complex problems with code.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Stacked Info Cards */}
          <div className="lg:col-span-5 flex flex-col gap-6 md:gap-8">

            {/* Where & When Card */}
            <div className="animate-fade-in-up" style={{ animationDelay: '0.6s' }}>
              <div className="relative group transform transition-transform hover:scale-[1.02] duration-300">
                <div className="absolute inset-0 bg-neon-yellow rounded-[2rem] transform translate-y-2 translate-x-2 md:translate-y-3 md:translate-x-3 shadow-[0_0_20px_#fbbf24]"></div>
                <div className="relative bg-white rounded-[2rem] p-6 md:p-8 border-[5px] border-neon-yellow shadow-lg flex items-center gap-6">
                  <div className="hidden md:flex w-16 h-16 bg-neon-yellow/20 rounded-full items-center justify-center flex-shrink-0 border-4 border-neon-yellow/50">
                    <Image src="/small-candy/yellow.png" alt="Candy" width={40} height={40} className="object-contain animate-spin-slow" />
                  </div>

                  <div className="flex-grow text-left">
                    <h3 className={`${pixel.className} text-2xl md:text-3xl font-bold text-amber-500 mb-2 drop-shadow-[0_0_8px_#f59e0b]`}>
                      Where & When?
                    </h3>
                    <div className="text-gray-700 font-medium">
                      <div className="font-bold text-lg">Feb. 20 - 22, 2026</div>
                      <div className="text-base leading-tight">Klaus Advanced Computing Building</div>
                      <div className="text-amber-500 text-sm font-mono mt-1">Georgia Tech Campus</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Why Join Us Card */}
            <div className="animate-fade-in-up" style={{ animationDelay: '0.8s' }}>
              <div className="relative group transform transition-transform hover:scale-[1.02] duration-300">
                <div className="absolute inset-0 bg-neon-yellow rounded-[2rem] transform translate-y-2 translate-x-2 md:translate-y-3 md:translate-x-3 shadow-[0_0_20px_#fbbf24]"></div>
                <div className="relative bg-white rounded-[2rem] p-6 md:p-8 border-[5px] border-neon-yellow shadow-lg">
                   <div className="absolute -top-4 -right-4 w-12 h-12 md:w-16 md:h-16 animate-spin-slow" style={{ animationDirection: 'reverse' }}>
                    <Image src="/small-candy/yellow.png" alt="Candy" fill className="object-contain drop-shadow-[0_0_10px_#fbbf24]" />
                  </div>

                  <h3 className={`${pixel.className} text-2xl md:text-3xl font-bold text-amber-500 mb-4 pr-8 drop-shadow-[0_0_8px_#f59e0b]`}>
                    Why Join Us?
                  </h3>

                  <div className="space-y-3 text-gray-700">
                    <div className="flex items-center gap-3 bg-neon-yellow/20 p-2 rounded-lg border border-neon-yellow/30">
                      <div className="w-10 h-10 flex-shrink-0">
                        <Icons.Build />
                      </div>
                      <p className="font-bold text-sm md:text-base text-gray-800">Build projects that matter</p>
                    </div>
                    <div className="flex items-center gap-3 bg-neon-yellow/20 p-2 rounded-lg border border-neon-yellow/30">
                      <div className="w-10 h-10 flex-shrink-0">
                        <Icons.Community />
                      </div>
                      <p className="font-bold text-sm md:text-base text-gray-800">Connect with hackers</p>
                    </div>
                    <div className="flex items-center gap-3 bg-neon-yellow/20 p-2 rounded-lg border border-neon-yellow/30">
                      <div className="w-10 h-10 flex-shrink-0">
                        <Icons.Gift />
                      </div>
                      <p className="font-bold text-sm md:text-base text-gray-800">Free food, swag, & prizes!</p>
                    </div>
                  </div>
                </div>
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
};

export default AboutSection;
