"use client";
import React from 'react';
import Image from 'next/image';
import { Truculenta } from 'next/font/google';

const truculenta = Truculenta({
  subsets: ['latin'],
  weight: ['400', '700', '900'],
});

const FloatingCandy: React.FC<{ src: string; delay: string; className?: string }> = ({ src, delay, className }) => (
  <div 
    className={`absolute pointer-events-none animate-float ${className}`} 
    style={{ animationDelay: delay }}
  >
    <Image src={src} alt="Candy" width={60} height={60} className="object-contain drop-shadow-lg" />
  </div>
);

// Vector Prize Icon Component
const VectorTicket: React.FC<{ type: 'gold' | 'silver' | 'bronze'; rank: string; delay: string; rotate: string }> = ({ type, rank, delay, rotate }) => {
  const colors = {
    gold: { bg: '#FCD34D', border: '#B45309', accent: '#F59E0B', text: '#92400E' },
    silver: { bg: '#E5E7EB', border: '#4B5563', accent: '#9CA3AF', text: '#374151' },
    bronze: { bg: '#FDBA74', border: '#78350F', accent: '#D97706', text: '#78350F' }
  };
  
  const color = colors[type];

  return (
    <div 
      className={`flex flex-col items-center w-full max-w-[280px] animate-fade-in-up group`}
      style={{ animationDelay: delay }}
    >
      <div className={`relative w-full aspect-[1.8/1] transition-all duration-500 hover:scale-105 hover:z-10 ${rotate} hover:rotate-0 drop-shadow-xl`}>
        <svg viewBox="0 0 300 160" className="w-full h-full">
          <defs>
            <filter id={`glow-${type}`} x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>
          </defs>
          
          {/* Ticket Body with Cutouts */}
          <path 
            d="M10 10 L290 10 L290 60 A 15 15 0 0 0 290 100 L290 150 L10 150 L10 100 A 15 15 0 0 0 10 60 L10 10 Z" 
            fill={color.bg} 
            stroke={color.border} 
            strokeWidth="4"
          />
          
          {/* Inner Border */}
          <path 
            d="M25 25 L275 25 L275 55 A 25 25 0 0 0 275 105 L275 135 L25 135 L25 105 A 25 25 0 0 0 25 55 L25 25 Z" 
            fill="none" 
            stroke={color.border} 
            strokeWidth="2" 
            strokeDasharray="8 4"
            opacity="0.6"
          />

          {/* Center Design */}
          <circle cx="150" cy="80" r="45" fill="none" stroke={color.border} strokeWidth="3" opacity="0.5" />
          <circle cx="150" cy="80" r="38" fill={color.accent} opacity="0.15" />
          
          {/* Shine Effect */}
          <path d="M20 140 L60 20 L80 20 L40 140 Z" fill="white" opacity="0.2" />
          <path d="M50 140 L90 20 L100 20 L60 140 Z" fill="white" opacity="0.1" />
        </svg>

        {/* Rank Number Inside Ticket */}
        <div className="absolute inset-0 flex items-center justify-center z-10 pt-1">
            <div className={`${truculenta.className} text-7xl font-black leading-none drop-shadow-sm transform -rotate-2`} style={{ color: color.text }}>
                {rank}
            </div>
        </div>
      </div>
      
      {/* Prize TBD Text Below */}
      <div 
        className={`${truculenta.className} text-2xl font-black uppercase tracking-widest mt-6 drop-shadow-sm`}
        style={{ color: color.text }}
      >
          Prize TBD
      </div>
    </div>
  );
};

// Speaker Card Component
const SpeakerCard: React.FC<{ name: string; title: string; company: string; image: string; color: string; delay: string; rotate: string }> = ({ 
  name, 
  title, 
  company, 
  image, 
  color,
  delay,
  rotate 
}) => (
  <div className={`group relative w-full animate-fade-in-up ${rotate} hover:rotate-0 transition-all duration-300 hover:z-10`} style={{ animationDelay: delay }}>
    {/* Shadow Layer */}
    <div className={`absolute inset-0 ${color} rounded-[2rem] transform translate-y-2 translate-x-2 transition-transform group-hover:translate-x-3 group-hover:translate-y-3`}></div>
    
    {/* Card Body */}
    <div className="relative bg-white rounded-[2rem] border-[4px] border-gray-100 p-6 flex flex-col items-center text-center shadow-lg overflow-hidden group-hover:shadow-xl transition-all">
      
      {/* Image Container */}
      <div className={`relative w-28 h-28 mb-4 rounded-full border-[4px] border-${color.replace('bg-', '')} overflow-hidden shadow-md group-hover:scale-105 transition-transform duration-300`}>
        <Image src={image} alt={name} fill className="object-cover" />
      </div>
      
      {/* Info */}
      <h3 className={`${truculenta.className} text-2xl font-black text-gray-800 mb-1 group-hover:text-${color.replace('bg-', '')} transition-colors`}>
        {name}
      </h3>
      <p className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-1">{title}</p>
      <p className="text-sm font-medium text-gray-400">{company}</p>
    </div>
  </div>
);

export default function PrizeAndSpeakerSection() {
  const speakers = [
    {
      id: 1,
      name: 'TBD',
      title: 'Keynote Speaker',
      company: 'Coming Soon',
      image: '/wonka/wonka.png',
      color: 'bg-purple-400',
      rotate: '-rotate-2'
    },
    {
      id: 2,
      name: 'TBD',
      title: 'Guest Speaker',
      company: 'Coming Soon',
      image: '/wonka/wonka.png',
      color: 'bg-pink-400',
      rotate: 'rotate-1'
    },
    {
      id: 3,
      name: 'TBD',
      title: 'Workshop Lead',
      company: 'Coming Soon',
      image: '/wonka/wonka.png',
      color: 'bg-emerald-400',
      rotate: '-rotate-1'
    },
    {
      id: 4,
      name: 'TBD',
      title: 'Guest Speaker',
      company: 'Coming Soon',
      image: '/wonka/wonka.png',
      color: 'bg-orange-400',
      rotate: 'rotate-2'
    }
  ];

  return (
    <section id="prizes" className="section-anchor scroll-mt-28 min-h-screen bg-sky relative overflow-hidden py-24">
      {/* Decorations */}
      <div className="absolute top-20 left-[-60px] w-56 h-36 opacity-30 animate-drift" style={{ animationDelay: '0s' }}>
        <Image src="/cloud-main/largecloud.png" alt="" fill className="object-contain" />
      </div>
      <div className="absolute bottom-40 right-[-50px] w-64 h-40 opacity-40 animate-drift" style={{ animationDelay: '2s' }}>
        <Image src="/cloud-main/midCloud.png" alt="" fill className="object-contain" />
      </div>
      
      <FloatingCandy src="/small-candy/green.png" delay="0s" className="top-32 left-[10%] rotate-12" />
      <FloatingCandy src="/small-candy/yellow.png" delay="2s" className="bottom-20 right-[15%] -rotate-12" />

      <div className="container mx-auto px-4 relative z-10 max-w-6xl">
        
        {/* Prizes Section */}
        <div className="mb-32">
          <div className="text-center mb-28 relative">
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-white/30 blur-3xl rounded-full -z-10"></div>
            <h1 
              className="font-willywonka text-7xl md:text-9xl text-wonka-yellow mb-4 drop-shadow-[0_4px_0_rgba(133,77,14,0.6)] animate-fade-in-up transform hover:scale-105 transition-transform duration-300"
              style={{ WebkitTextStroke: "2px #854d0e" }}
            >
              Prizes
            </h1>
          </div>

          <div className="flex flex-col md:flex-row items-center justify-center gap-8 md:gap-12 perspective-1000">
            {/* Reordering for visual hierarchy: Silver, Gold, Bronze */}
            <div className="order-2 md:order-1 w-full flex justify-center">
               <VectorTicket type="silver" rank="2" delay="0.4s" rotate="-rotate-2" />
            </div>
            <div className="order-1 md:order-2 w-full flex justify-center transform scale-125 md:-translate-y-12 z-20">
               <VectorTicket type="gold" rank="1" delay="0.5s" rotate="rotate-0" />
            </div>
            <div className="order-3 w-full flex justify-center">
               <VectorTicket type="bronze" rank="3" delay="0.6s" rotate="rotate-1" />
            </div>
          </div>
        </div>

        {/* Speakers Section */}
        <div>
          <div className="text-center mb-16 relative">
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-white/30 blur-3xl rounded-full -z-10"></div>
            <h1 
              className="font-willywonka text-7xl md:text-9xl text-wonka-yellow mb-4 drop-shadow-[0_4px_0_rgba(133,77,14,0.6)] animate-fade-in-up transform hover:scale-105 transition-transform duration-300"
              style={{ WebkitTextStroke: "2px #854d0e" }}
            >
              Speakers
            </h1>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 md:gap-6 perspective-1000">
            {speakers.map((speaker, index) => (
              <SpeakerCard 
                key={speaker.id}
                {...speaker}
                delay={`${0.4 + (index * 0.1)}s`}
              />
            ))}
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
