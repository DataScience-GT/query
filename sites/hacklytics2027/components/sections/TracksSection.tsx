"use client";

import React, { useState } from "react";
import Image from "next/image";
import { Press_Start_2P } from 'next/font/google';

const pixel = Press_Start_2P({
  subsets: ['latin'],
  weight: ['400', '700', '900'],
});

const FloatingCandy: React.FC<{ src: string; delay: string; className?: string }> = ({ src, delay, className }) => (
  <div
    className={`absolute pointer-events-none animate-float ${className}`}
    style={{ animationDelay: delay }}
  >
    <Image src={src} alt="Candy" width={60} height={60} className="object-contain drop-shadow-lg drop-shadow-[0_0_10px_var(--neon-pink)]" />
  </div>
);

const FAQCard: React.FC<{ title: string; content: string; delay: string; color: string; rotate: string }> = ({
  title,
  content,
  delay,
  color,
  rotate
}) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div
      className={`group relative w-full animate-fade-in-up ${rotate} hover:rotate-0 transition-all duration-300 hover:z-10 cursor-pointer h-fit`}
      style={{ animationDelay: delay }}
      onClick={() => setIsOpen(!isOpen)}
    >
      {/* Shadow Layer */}
      <div className={`absolute inset-0 ${color} rounded-[2rem] transform translate-y-2 translate-x-2 transition-transform group-hover:translate-x-3 group-hover:translate-y-3 drop-shadow-[0_0_15px_currentColor]`}></div>

      {/* Card Body */}
      <div className="relative bg-white rounded-[2rem] border-[4px] border-neon-pink p-8 flex flex-col shadow-[0_0_20px_currentColor] overflow-hidden group-hover:shadow-[0_0_30px_currentColor] transition-all">
        <div className="flex justify-between items-start gap-4">
          <h3 className={`${pixel.className} text-2xl md:text-3xl font-bold text-gray-800 leading-tight group-hover:text-neon-pink transition-colors select-none drop-shadow-[0_0_5px_currentColor]`}>
            {title}
          </h3>

          {/* Expand/Collapse Icon */}
          <div className={`flex-shrink-0 transform transition-transform duration-300 ${isOpen ? 'rotate-180' : ''} mt-1`}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M6 9L12 15L18 9" stroke={color === "bg-neon-pink/40" || color === "bg-pink-400" ? "#DC2626" : "#4B5563"} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
        </div>

        <div className={`grid transition-all duration-300 ease-in-out ${isOpen ? 'grid-rows-[1fr] opacity-100 mt-4' : 'grid-rows-[0fr] opacity-0 mt-0'}`}>
          <div className="overflow-hidden">
            <p className="text-gray-600 font-medium leading-relaxed text-lg select-none">
              {content}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

// Track Card Component - 1980s Arcade Style
const TrackCard: React.FC<{ title: string; description: string; icon: React.ReactNode; color: string; rotate: string; delay: string }> = ({
  title,
  description,
  icon,
  color,
  rotate,
  delay
}) => (
  <div className="group relative w-full animate-fade-in-up" style={{ animationDelay: delay }}>
    {/* Card Container with 3D Hover Effect */}
    <div className={`relative h-full transform transition-all duration-500 hover:scale-105 hover:z-10 ${rotate} hover:rotate-0`}>

      {/* Shadow Layer - Neon glow */}
      <div className={`absolute inset-0 ${color} rounded-[2.5rem] transform translate-y-3 translate-x-3 transition-transform group-hover:translate-x-4 group-hover:translate-y-4 drop-shadow-[0_0_20px_currentColor]`}></div>

      {/* Card Body */}
      <div className={`relative h-full bg-white rounded-[2.5rem] border-[5px] border-neon-pink p-8 flex flex-col items-center text-center shadow-[0_0_20px_currentColor] overflow-hidden group-hover:shadow-[0_0_30px_currentColor] transition-all`}>

        {/* Top Decoration */}
        <div className={`absolute top-0 inset-x-0 h-4 bg-neon-pink/20`}></div>

        <div className={`w-24 h-24 rounded-full bg-neon-pink/10 flex items-center justify-center mb-6 border-4 border-neon-pink/30 group-hover:scale-110 transition-transform duration-500`}>
          <span className="w-16 h-16">{icon}</span>
        </div>

        {/* Content */}
        <h3 className={`${pixel.className} text-3xl md:text-4xl font-bold text-gray-800 mb-4 drop-shadow-[0_0_5px_currentColor]`}>
          {title}
        </h3>

        <p className="text-gray-600 font-medium text-lg leading-relaxed">
          {description}
        </p>

        {/* Bottom Decoration */}
        <div className={`absolute bottom-0 inset-x-0 h-2 bg-neon-pink`}></div>
      </div>
    </div>
  </div>
);

// Custom Themed Icons - 1980s Arcade Style
const Icons = {
  Finance: () => (
    <svg viewBox="0 0 100 100" className="w-full h-full drop-shadow-sm">
      <path d="M10 90 L90 90" stroke="#065F46" strokeWidth="8" strokeLinecap="round" />
      <path d="M10 90 L10 10" stroke="#065F46" strokeWidth="8" strokeLinecap="round" />
      <path d="M20 70 L40 50 L60 60 L85 20" stroke="#10B981" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="85" cy="20" r="6" fill="#34D399" />
    </svg>
  ),
  Sports: () => (
    <svg viewBox="0 0 100 100" className="w-full h-full drop-shadow-sm">
      <circle cx="50" cy="50" r="42" fill="#F97316" stroke="#7C2D12" strokeWidth="5" />
      <path d="M10 50 C10 50 50 65 90 50" stroke="#7C2D12" strokeWidth="5" fill="none" />
      <path d="M50 8 C50 8 50 92 50 92" stroke="#7C2D12" strokeWidth="5" fill="none" />
      <path d="M18 20 C35 35 35 65 18 80" stroke="#7C2D12" strokeWidth="5" fill="none" />
      <path d="M82 20 C65 35 65 65 82 80" stroke="#7C2D12" strokeWidth="5" fill="none" />
      <circle cx="70" cy="30" r="10" fill="#FFEDD5" fillOpacity="0.4" />
    </svg>
  ),
  Healthcare: () => (
    <svg viewBox="0 0 100 100" className="w-full h-full drop-shadow-sm">
      {/* Handle */}
      <path d="M32 30 L32 22 C32 12 68 12 68 22 L68 30" stroke="#BE185D" strokeWidth="6" fill="none" strokeLinecap="round" />

      {/* Bag Body */}
      <rect x="15" y="30" width="70" height="55" rx="12" fill="#F472B6" stroke="#BE185D" strokeWidth="4" />

      {/* Cross Circle */}
      <circle cx="50" cy="58" r="18" fill="white" />

      {/* Medical Cross */}
      <rect x="46" y="47" width="8" height="22" fill="#BE185D" rx="2" />
      <rect x="39" y="54" width="22" height="8" fill="#BE185D" rx="2" />

      {/* Reflection */}
      <path d="M22 36 Q28 36 28 42" stroke="white" strokeWidth="3" opacity="0.6" strokeLinecap="round" />
    </svg>
  ),
  Imagination: () => (
    <svg viewBox="0 0 100 100" className="w-full h-full drop-shadow-sm">
      <path d="M50 10 L60 40 L90 50 L60 60 L50 90 L40 60 L10 50 L40 40 Z" fill="#A855F7" stroke="#7E22CE" strokeWidth="4" />
      <circle cx="50" cy="50" r="5" fill="#E9D5FF" />
      <path d="M80 10 L85 25 L100 30 L85 35 L80 50 L75 35 L60 30 L75 25 Z" fill="#C084FC" />
      <path d="M20 70 L25 80 L40 85 L25 90 L20 100 L15 90 L0 85 L15 80 Z" fill="#C084FC" />
    </svg>
  ),
  Entertainment: () => (
    <svg viewBox="0 0 100 100" className="w-full h-full drop-shadow-sm">
      {/* Clapperboard Body */}
      <rect x="15" y="35" width="70" height="50" rx="4" fill="#3B82F6" stroke="#1E3A8A" strokeWidth="4" />

      {/* Clapper Top */}
      <path d="M15 35 L85 35 L85 15 L15 25 Z" fill="#1E3A8A" />

      {/* Clapper Stripes */}
      <path d="M25 33 L35 19" stroke="white" strokeWidth="4" strokeLinecap="round" />
      <path d="M45 34 L55 20" stroke="white" strokeWidth="4" strokeLinecap="round" />
      <path d="M65 35 L75 21" stroke="white" strokeWidth="4" strokeLinecap="round" />

      {/* Play Button Circle */}
      <circle cx="50" cy="60" r="15" fill="white" />
      <path d="M46 52 L58 60 L46 68 Z" fill="#3B82F6" stroke="#1E3A8A" strokeWidth="2" strokeLinejoin="round" />
    </svg>
  )
};

export default function TracksSection() {
  return (
    <section id="tracks" className="section-anchor scroll-mt-28 min-h-screen bg-retro-gradient relative overflow-hidden py-24">
      {/* Background Decorations - Retro style */}
      <div className="absolute top-10 right-[-50px] w-64 h-40 opacity-40 animate-drift drop-shadow-[0_0_25px_#ec4899]" style={{ animationDelay: '2s' }}>
        <Image src="/cloud-main/midCloud.png" alt="" fill className="object-contain drop-shadow-[0_0_25px_#ec4899]" />
      </div>
      <div className="absolute bottom-20 left-[-60px] w-56 h-36 opacity-30 animate-drift drop-shadow-[0_0_25px_#3b82f6]" style={{ animationDelay: '0s' }}>
        <Image src="/cloud-main/largecloud.png" alt="" fill className="object-contain drop-shadow-[0_0_25px_#3b82f6]" />
      </div>

      <FloatingCandy src="/small-candy/pink.png" delay="0s" className="top-40 left-[10%] rotate-12" />
      <FloatingCandy src="/small-candy/blue.png" delay="2s" className="bottom-40 right-[5%] -rotate-12" />
      <FloatingCandy src="/small-candy/yellow.png" delay="4s" className="top-20 right-[20%] rotate-45" />

      <div className="container mx-auto px-4 relative z-10 max-w-7xl">

        {/* Header Area with Pinned Note */}
        <div className="relative mb-20">
          {/* Title Centered */}
          <div className="text-center relative z-10">
             <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-neon-purple/20 blur-3xl rounded-full -z-10"></div>
             <h1
                className="font-pixel text-7xl md:text-9xl text-neon-cyan drop-shadow-[0_0_30px_var(--neon-cyan)] animate-fade-in-up transform hover:scale-105 transition-transform duration-300"
                style={{ WebkitTextStroke: "2px #00ffff" }}
              >
                TRACKS
              </h1>
          </div>

          {/* Pinned Note - Absolute Positioned on Desktop */}
          <div className="relative mt-8 lg:mt-0 lg:absolute lg:right-0 lg:top-1/2 lg:-translate-y-1/2 z-20 animate-fade-in-up flex justify-center lg:justify-end" style={{ animationDelay: '0.2s' }}>
              <div className="group transform rotate-3 hover:rotate-0 transition-transform duration-300 w-64">
                  {/* The Pin */}
                  <div className="absolute -top-5 left-1/2 -translate-x-1/2 z-30 filter drop-shadow-sm">
                    <svg width="40" height="40" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M20 38L20 12" stroke="#9CA3AF" strokeWidth="3" strokeLinecap="round"/>
                      <circle cx="20" cy="10" r="8" fill="#DC2626" stroke="#991B1B" strokeWidth="2"/>
                      <circle cx="22" cy="8" r="3" fill="#FECACA" fillOpacity="0.5"/>
                    </svg>
                  </div>

                  {/* Note Body */}
                  <div className="bg-neon-yellow/20 text-gray-800 p-6 pt-8 rounded-sm shadow-lg border border-neon-yellow/30 relative">
                    {/* Folded Corner Effect */}
                    <div className="absolute bottom-0 right-0 border-t-[24px] border-t-neon-yellow border-r-[24px] border-r-transparent shadow-sm"></div>

                    <p className="font-medium text-lg leading-relaxed font-handwriting transform -rotate-1 text-center">
                      Explore our <span className="text-neon-pink font-bold drop-shadow-[0_0_8px_#ec4899]">5 magical tracks</span>. Win overall or track-specific prizes!
                    </p>
                  </div>
              </div>
          </div>
        </div>

        {/* Tracks Grid - Staggered Layout */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 md:gap-12 lg:gap-y-16 items-stretch perspective-1000">

          <TrackCard
            title="Finance"
            description="Analyze market trends, predict stock movements, and build fintech solutions."
            icon={<Icons.Finance />}
            color="bg-emerald-400"
            rotate="md:-rotate-2"
            delay="0.4s"
          />

          <TrackCard
            title="Sports Analytics"
            description="Dive into player performance, game strategy, and the future of sports data."
            icon={<Icons.Sports />}
            color="bg-orange-400"
            rotate="md:rotate-2"
            delay="0.5s"
          />

          <TrackCard
            title="Healthcare"
            description="Innovate in bioinformatics, patient care, and personal health technology."
            icon={<Icons.Healthcare />}
            color="bg-pink-400"
            rotate="md:-rotate-1"
            delay="0.6s"
          >
          </TrackCard>

          <div className="lg:col-span-3 flex flex-col md:flex-row gap-8 md:gap-12 justify-center">
            <div className="w-full md:w-[calc(50%-1.5rem)] lg:w-[calc(33.33%-2rem)]">
              <TrackCard
                title="Pure Imagination"
                description="Unleash your creativity, explore unconventional ideas, and use data to build the coolest, most unique project."
                icon={<Icons.Imagination />}
                color="bg-purple-400"
                rotate="md:rotate-2"
                delay="0.7s"
              />
            </div>

            <div className="w-full md:w-[calc(50%-1.5rem)] lg:w-[calc(33.33%-2rem)]">
              <TrackCard
                title="Entertainment"
                description="See how AI is transforming movies, gaming, and interactive experiences."
                icon={<Icons.Entertainment />}
                color="bg-blue-500"
                rotate="md:-rotate-2"
                delay="0.8s"
              />
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

        .perspective-1000 {
          perspective: 1000px;
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
