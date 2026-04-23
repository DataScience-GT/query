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
    <Image src={src} alt="Candy" width={50} height={50} className="object-contain drop-shadow-md drop-shadow-[0_0_10px_var(--neon-pink)]" />
  </div>
);

// Main Prize Ticket Component - 1980s Arcade Style
const PrizeTicket: React.FC<{
  type: 'gold' | 'silver' | 'bronze';
  prize: string;
  image: string;
  delay: string;
  rotate: string
  [key: string]: unknown;
}> = ({ type, prize, image, delay, rotate }) => {
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
      <div className={`relative w-full aspect-[1.8/1] transition-all duration-500 hover:scale-105 hover:z-10 ${rotate} hover:rotate-0 drop-shadow-xl drop-shadow-[0_0_20px_currentColor]`}>
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

        {/* Prize Image - Overlaying the ticket */}
        <div className="absolute inset-0 flex items-center justify-center z-20">
          <div className="w-28 h-28 md:w-36 md:h-36 relative group-hover:scale-110 transition-transform drop-shadow-2xl bg-white rounded-xl overflow-hidden border-2 border-neon-pink">
            <Image src={image} alt={prize} fill className="object-contain p-2" />
          </div>
        </div>
      </div>

      {/* Prize Text Below */}
      <div
        className={`${pixel.className} text-lg md:text-xl font-bold uppercase tracking-wide mt-4 drop-shadow-sm text-center px-2`}
        style={{ color: color.text }}
      >
        {prize}
      </div>
    </div>
  );
};

// Track Prize Card Component - 1980s Arcade Style
const TrackPrizeCard: React.FC<{
  trackName: string;
  description: string;
  prizes: { place: string; name: string; image: string }[];
  color: string;
  delay: string;
}> = ({ trackName, description, prizes, color, delay }) => (
  <div
    className="animate-fade-in-up bg-white/90 backdrop-blur-sm rounded-3xl p-6 shadow-[0_0_30px_#ec4899] border-4 border-neon-pink hover:shadow-[0_0_40px_#ec4899] transition-all duration-300 hover:-translate-y-2"
    style={{ animationDelay: delay }}
  >
    {/* Track Header */}
    <div className={`${color.replace('bg-', 'bg-neon-') || 'bg-neon-pink'} rounded-2xl px-4 py-3 mb-4 shadow-[0_0_15px_currentColor]`}>
      <h3 className={`${pixel.className} text-2xl md:text-3xl font-bold text-white text-center drop-shadow-sm`}>
        {trackName}
      </h3>
    </div>

    {/* Description */}
    <p className="text-sm text-center mb-6 leading-relaxed text-gray-600">
      {description}
    </p>

    {/* Prizes */}
    <div className="space-y-4">
      {prizes.map((prize, index) => (
        <div key={index} className="flex items-center gap-4 bg-neon-pink/10 rounded-xl p-3 border-2 border-neon-pink/30">
          <div className="w-14 h-14 relative rounded-lg overflow-hidden bg-white shadow-md flex-shrink-0 border-2 border-neon-cyan/30">
            <Image src={prize.image} alt={prize.name} fill className="object-contain p-1" />
          </div>
          <div className="flex-1 min-w-0">
            <span className={`${pixel.className} text-sm font-bold ${index === 0 ? 'text-yellow-600' : index === 1 ? 'text-gray-500' : 'text-orange-700'
              }`}>
              {prize.place}
            </span>
            <p className="text-gray-800 font-semibold text-sm truncate">{prize.name}</p>
          </div>
        </div>
      ))}
    </div>
  </div>
);

// Speaker Card Component - 1980s Arcade Style
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
    {/* Shadow Layer - Neon glow */}
    <div className={`absolute inset-0 ${color} rounded-[2rem] transform translate-y-2 translate-x-2 transition-transform group-hover:translate-x-3 group-hover:translate-y-3 drop-shadow-[0_0_20px_currentColor]`}></div>

    {/* Card Body */}
    <div className="relative bg-white rounded-[2rem] border-[4px] border-neon-pink p-6 flex flex-col items-center text-center shadow-[0_0_20px_currentColor] overflow-hidden group-hover:shadow-[0_0_30px_currentColor] transition-all">

      {/* Image Container */}
      <div className={`relative w-28 h-28 mb-4 rounded-full border-[4px] border-neon-pink overflow-hidden shadow-md group-hover:scale-105 transition-transform duration-300`}>
        <Image src={image} alt={name} fill className="object-cover drop-shadow-[0_0_5px_currentColor]" />
      </div>

      {/* Info */}
      <h3 className={`${pixel.className} text-2xl font-bold text-gray-800 mb-1 group-hover:text-neon-pink transition-colors drop-shadow-[0_0_5px_currentColor]`}>
        {name}
      </h3>
      <p className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-1">{title}</p>
      <p className="text-sm font-medium text-gray-400 drop-shadow-[0_0_3px_currentColor]">{company}</p>
    </div>
  </div>
);

export default function PrizeAndSpeakerSection() {
  const mainPrizes = [
    { type: 'silver' as const, rank: '2', prize: 'Apple AirPods Max', image: 'https://store.storeimages.cdn-apple.com/4982/as-images.apple.com/is/airpods-max-select-spacegray-202011?wid=400&hei=400&fmt=png-alpha' },
    { type: 'gold' as const, rank: '1', prize: 'Apple MacBook Air M4', image: 'https://store.storeimages.cdn-apple.com/4982/as-images.apple.com/is/macbook-air-midnight-select-20220606?wid=400&hei=400&fmt=png-alpha' },
    { type: 'bronze' as const, rank: '3', prize: 'Samsung Odyssey G5 Monitor', image: '/prizes/samsung-monitor.jpg' },
  ];

  const trackPrizes = [
    {
      trackName: 'Finance',
      description: 'Analyze market trends, predict stock movements, and build fintech solutions',
      color: 'bg-emerald-400',
      prizes: [
        { place: '1st Place', name: 'Nespresso Virtuo Next w/ Milk Frother', image: '/prizes/nespresso-new.jpg' },
        { place: '2nd Place', name: 'JBL Grip Speaker', image: '/prizes/jbl-flip.jpg' },
        { place: '3rd Place', name: 'Clay Poker Set', image: '/prizes/poker-set-new.jpg' },
      ]
    },
    {
      trackName: 'Sports Analytics',
      description: 'Dive into player performance, game strategy, and the future of sports data',
      color: 'bg-blue-400',
      prizes: [
        { place: '1st Place', name: 'Apple 40mm Watch SE 3', image: '/prizes/apple-watch.jpg' },
        { place: '2nd Place', name: 'JBL Grip Speaker', image: '/prizes/jbl-flip.jpg' },
        { place: '3rd Place', name: 'Pickleball Set + Backpack', image: '/prizes/pickleball-backpack.jpg' },
      ]
    },
    {
      trackName: 'Healthcare',
      description: 'Innovate in bioinformatics, patient care, and personal health technology',
      color: 'bg-pink-400',
      prizes: [
        { place: '1st Place', name: 'Theragun Mini Gen 3', image: '/prizes/theragun-mini.jpg' },
        { place: '2nd Place', name: 'Fitbit Inspire 3', image: '/prizes/fitbit.jpg' },
        { place: '3rd Place', name: 'Owala Waterbottle', image: '/prizes/owala.jpg' },
      ]
    },
    {
      trackName: 'Entertainment',
      description: 'See how AI is transforming movies, gaming, and interactive experiences',
      color: 'bg-purple-400',
      prizes: [
        { place: '1st Place', name: 'Projector', image: '/prizes/projector-new.jpg' },
        { place: '2nd Place', name: 'Karaoke Machine', image: '/prizes/karaoke-new.jpg' },
        { place: '3rd Place', name: 'Vinyl Record Turntable', image: '/prizes/turntable-new.jpg' },
      ]
    },
    {
      trackName: 'Pure Imagination',
      description: 'Unleash your creativity, explore unconventional ideas, and use data to build the coolest, most unique project',
      color: 'bg-gradient-to-r from-pink-400 to-yellow-400',
      prizes: [
        { place: '1st Place', name: 'Ninja Swirl by CREAMi Soft Serve and Ice Cream Maker', image: '/prizes/ninja-creami.jpg' },
      ]
    },
  ];

  const speakers = [
    {
      id: 1,
      name: 'TBD',
      title: 'Keynote Speaker',
      company: 'Coming Soon',
      image: '/wonka/wonka.jpg',
      color: 'bg-purple-400',
      rotate: '-rotate-2'
    },
    {
      id: 2,
      name: 'TBD',
      title: 'Guest Speaker',
      company: 'Coming Soon',
      image: '/wonka/wonka.jpg',
      color: 'bg-pink-400',
      rotate: 'rotate-1'
    },
    {
      id: 3,
      name: 'TBD',
      title: 'Workshop Lead',
      company: 'Coming Soon',
      image: '/wonka/wonka.jpg',
      color: 'bg-neon-green',
      rotate: '-rotate-1'
    },
    {
      id: 4,
      name: 'TBD',
      title: 'Guest Speaker',
      company: 'Coming Soon',
      image: '/wonka/wonka.jpg',
      color: 'bg-orange-400',
      rotate: 'rotate-2'
    }
  ];

  return (
    <section id="prizes" className="section-anchor scroll-mt-28 min-h-screen bg-retro-gradient relative overflow-hidden py-24">
      {/* Decorations */}
      <div className="absolute top-20 left-[-60px] w-56 h-36 opacity-30 animate-drift drop-shadow-[0_0_25px_#ec4899]" style={{ animationDelay: '0s' }}>
        <Image src="/cloud-main/largecloud.png" alt="" fill className="object-contain drop-shadow-[0_0_25px_#ec4899]" />
      </div>
      <div className="absolute bottom-40 right-[-50px] w-64 h-40 opacity-40 animate-drift drop-shadow-[0_0_25px_#06b6d4]" style={{ animationDelay: '2s' }}>
        <Image src="/cloud-main/midCloud.png" alt="" fill className="object-contain drop-shadow-[0_0_25px_#06b6d4]" />
      </div>

      <FloatingCandy src="/small-candy/green.png" delay="0s" className="top-32 left-[10%] rotate-12" />
      <FloatingCandy src="/small-candy/yellow.png" delay="2s" className="bottom-20 right-[15%] -rotate-12" />

      <div className="container mx-auto px-4 relative z-10 max-w-6xl">

        {/* Main Prizes Section */}
        <div className="mb-24">
          <div className="text-center mb-16 relative">
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-neon-cyan/20 blur-3xl rounded-full -z-10"></div>
            <h1
              className="font-pixel text-7xl md:text-9xl text-neon-cyan mb-4 drop-shadow-[0_0_30px_var(--neon-cyan)] animate-fade-in-up transform hover:scale-105 transition-transform duration-300"
              style={{ WebkitTextStroke: "2px #00ffff" }}
            >
              GRAND PRIZES
            </h1>
          </div>

          <div className="flex flex-col md:flex-row items-center justify-center gap-8 md:gap-12 perspective-1000">
            {/* Silver - 2nd Place */}
            <div className="order-2 md:order-1 w-full flex justify-center">
              <PrizeTicket {...mainPrizes[0]} delay="0.4s" rotate="-rotate-2" />
            </div>
            {/* Gold - 1st Place */}
            <div className="order-1 md:order-2 w-full flex justify-center transform scale-110 md:scale-125 md:-translate-y-8 z-20">
              <PrizeTicket {...mainPrizes[1]} delay="0.5s" rotate="rotate-0" />
            </div>
            {/* Bronze - 3rd Place */}
            <div className="order-3 w-full flex justify-center">
              <PrizeTicket {...mainPrizes[2]} delay="0.6s" rotate="rotate-1" />
            </div>
          </div>
        </div>

        {/* Track Prizes Section */}
        <div className="mb-32">
          <div className="text-center mb-16 relative">
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-neon-purple/20 blur-3xl rounded-full -z-10"></div>
            <h1
              className="font-pixel text-6xl md:text-8xl text-neon-cyan mb-4 drop-shadow-[0_0_30px_var(--neon-cyan)] animate-fade-in-up transform hover:scale-105 transition-transform duration-300"
              style={{ WebkitTextStroke: "2px #00ffff" }}
            >
              TRACK PRIZES
            </h1>
          </div>

          {/* Reverse Pyramid Layout */}
          <div className="flex flex-col gap-6">
            {/* Top Row - 3 cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {trackPrizes.slice(0, 3).map((track, index) => (
                <TrackPrizeCard
                  key={track.trackName}
                  {...track}
                  delay={`${0.3 + (index * 0.1)}s`}
                />
              ))}
            </div>
            {/* Middle Row - 2 cards centered */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:max-w-4xl md:mx-auto">
              {trackPrizes.slice(3, 5).map((track, index) => (
                <TrackPrizeCard
                  key={track.trackName}
                  {...track}
                  delay={`${0.6 + (index * 0.1)}s`}
                />
              ))}
            </div>
          </div>
        </div>

        {/* Speakers Section */}
        <div>
          <div className="text-center mb-16 relative">
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-neon-pink/20 blur-3xl rounded-full -z-10"></div>
            <h1
              className="font-pixel text-7xl md:text-9xl text-neon-cyan mb-4 drop-shadow-[0_0_30px_var(--neon-cyan)] animate-fade-in-up transform hover:scale-105 transition-transform duration-300"
              style={{ WebkitTextStroke: "2px #00ffff" }}
            >
              SPEAKERS
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
