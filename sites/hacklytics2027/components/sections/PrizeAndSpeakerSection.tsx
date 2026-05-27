"use client";
import React from 'react';
import Image from 'next/image';

// Main Prize Ticket Component - Brutalist Style
const PrizeTicket: React.FC<{
  type: 'gold' | 'silver' | 'bronze';
  prize: string;
  image: string;
}> = ({ type, prize, image }) => {
  const colors = {
    gold: { text: 'text-bloom-lime', border: 'border-bloom-lime' },
    silver: { text: 'text-gray-300', border: 'border-gray-500' },
    bronze: { text: 'text-bloom-pink', border: 'border-bloom-pink' }
  };

  const color = colors[type];

  return (
    <div className={`flex flex-col items-center w-full max-w-[280px] group`}>
      <div className={`w-full aspect-[1.8/1] relative border-2 ${color.border} bg-black/50 flex flex-col items-center justify-center p-4 hover:bg-white/[0.05] transition-colors overflow-hidden`}>
        {/* Abstract Glow */}
        <div className={`absolute top-0 right-0 w-32 h-32 ${color.border.replace('border-', 'bg-')}/20 blur-[40px] pointer-events-none group-hover:scale-150 transition-transform duration-700`}></div>
        
        <div className={`w-16 h-16 md:w-24 md:h-24 relative mb-2 z-10 filter grayscale group-hover:grayscale-0 transition-all duration-300`}>
          <Image src={image} alt={prize} fill className="object-contain drop-shadow-lg" />
        </div>
      </div>

      {/* Prize Text Below */}
      <div className="w-full border border-t-0 border-gridline bg-[#0b0c10] p-4 text-center">
        <div className={`font-mono text-sm tracking-widest uppercase mb-1 ${color.text}`}>
          {type}
        </div>
        <div className={`font-sans text-lg md:text-xl font-bold uppercase tracking-tight text-white`}>
          {prize}
        </div>
      </div>
    </div>
  );
};

// Track Prize Card Component - Brutalist Style
const TrackPrizeCard: React.FC<{
  trackName: string;
  description: string;
  prizes: { place: string; name: string; image: string }[];
  colorClass: string;
}> = ({ trackName, description, prizes, colorClass }) => (
  <div className="border border-gridline bg-black/50 hover:bg-white/[0.02] transition-colors h-full flex flex-col group relative overflow-hidden">
    
    {/* Abstract Background Glow */}
    <div className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-48 h-48 ${colorClass.replace('text-', 'bg-')}/5 rounded-full blur-[50px] opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none`}></div>
    
    {/* Track Header */}
    <div className="border-b border-gridline p-6 relative z-10">
      <h3 className={`font-sans text-2xl md:text-3xl font-bold uppercase tracking-tighter ${colorClass} mb-2`}>
        {trackName}
      </h3>
      <p className="font-mono text-xs text-gray-400 uppercase tracking-widest leading-relaxed">
        {description}
      </p>
    </div>

    {/* Prizes List */}
    <div className="p-6 flex flex-col gap-4 flex-1 relative z-10">
      {prizes.map((prize, index) => (
        <div key={index} className="flex items-center gap-4 border border-gridline bg-[#0b0c10] p-3 hover:border-white/20 transition-colors">
          <div className="w-12 h-12 relative flex-shrink-0 filter grayscale group-hover:grayscale-0 transition-all duration-500">
            <Image src={prize.image} alt={prize.name} fill className="object-contain" />
          </div>
          <div className="flex-1 min-w-0">
            <span className={`font-mono text-xs uppercase tracking-widest block mb-1 ${
                index === 0 ? 'text-bloom-lime' : index === 1 ? 'text-gray-400' : 'text-bloom-pink'
              }`}>
              {prize.place}
            </span>
            <p className="font-sans text-sm font-bold text-white truncate">{prize.name}</p>
          </div>
        </div>
      ))}
    </div>
  </div>
);

// Speaker Card Component - Brutalist Style
const SpeakerCard: React.FC<{ name: string; title: string; company: string; image: string; colorClass: string }> = ({
  name,
  title,
  company,
  image,
  colorClass
}) => (
  <div className="border border-gridline bg-[#0b0c10] p-6 flex flex-col items-center text-center group hover:bg-white/[0.02] transition-colors relative overflow-hidden">
    <div className={`absolute -bottom-10 -right-10 w-32 h-32 ${colorClass.replace('text-', 'bg-')}/10 blur-[40px] pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-500`}></div>
    
    {/* Image Container */}
    <div className="w-full aspect-square relative mb-6 border border-gridline filter grayscale group-hover:grayscale-0 transition-all duration-500 overflow-hidden">
      <Image src={image} alt={name} fill className="object-cover" />
    </div>

    {/* Info */}
    <h3 className={`font-sans text-2xl font-bold uppercase tracking-tight text-white mb-2 group-hover:${colorClass} transition-colors`}>
      {name}
    </h3>
    <p className="font-mono text-xs text-gray-400 uppercase tracking-widest mb-1">{title}</p>
    <p className={`font-mono text-xs font-bold ${colorClass}`}>{company}</p>
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
      description: 'Analyze market trends, predict stock movements',
      colorClass: 'text-bloom-lime',
      prizes: [
        { place: '1st Place', name: 'Nespresso Virtuo Next', image: '/prizes/nespresso-new.jpg' },
        { place: '2nd Place', name: 'JBL Grip Speaker', image: '/prizes/jbl-flip.jpg' },
        { place: '3rd Place', name: 'Clay Poker Set', image: '/prizes/poker-set-new.jpg' },
      ]
    },
    {
      trackName: 'Sports Analytics',
      description: 'Player performance & the future of sports data',
      colorClass: 'text-bloom-cyan',
      prizes: [
        { place: '1st Place', name: 'Apple 40mm Watch SE 3', image: '/prizes/apple-watch.jpg' },
        { place: '2nd Place', name: 'JBL Grip Speaker', image: '/prizes/jbl-flip.jpg' },
        { place: '3rd Place', name: 'Pickleball Set', image: '/prizes/pickleball-backpack.jpg' },
      ]
    },
    {
      trackName: 'Healthcare',
      description: 'Innovate in bioinformatics & health tech',
      colorClass: 'text-bloom-pink',
      prizes: [
        { place: '1st Place', name: 'Theragun Mini Gen 3', image: '/prizes/theragun-mini.jpg' },
        { place: '2nd Place', name: 'Fitbit Inspire 3', image: '/prizes/fitbit.jpg' },
        { place: '3rd Place', name: 'Owala Waterbottle', image: '/prizes/owala.jpg' },
      ]
    },
    {
      trackName: 'Entertainment',
      description: 'Transforming movies, gaming, & interactive media',
      colorClass: 'text-bloom-purple',
      prizes: [
        { place: '1st Place', name: 'Projector', image: '/prizes/projector-new.jpg' },
        { place: '2nd Place', name: 'Karaoke Machine', image: '/prizes/karaoke-new.jpg' },
        { place: '3rd Place', name: 'Vinyl Record Turntable', image: '/prizes/turntable-new.jpg' },
      ]
    },
    {
      trackName: 'Pure Imagination',
      description: 'Unleash creativity and build something totally unique',
      colorClass: 'text-bloom-lime',
      prizes: [
        { place: '1st Place', name: 'Ninja CREAMi Soft Serve', image: '/prizes/ninja-creami.jpg' },
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
      colorClass: 'text-bloom-purple',
    },
    {
      id: 2,
      name: 'TBD',
      title: 'Guest Speaker',
      company: 'Coming Soon',
      image: '/wonka/wonka.jpg',
      colorClass: 'text-bloom-pink',
    },
    {
      id: 3,
      name: 'TBD',
      title: 'Workshop Lead',
      company: 'Coming Soon',
      image: '/wonka/wonka.jpg',
      colorClass: 'text-bloom-lime',
    },
    {
      id: 4,
      name: 'TBD',
      title: 'Guest Speaker',
      company: 'Coming Soon',
      image: '/wonka/wonka.jpg',
      colorClass: 'text-bloom-cyan',
    }
  ];

  return (
    <section id="prizes" className="section-anchor scroll-mt-20 border-b border-gridline bg-[#0b0c10] text-white">
      
      {/* Grand Prizes Section Header */}
      <div className="w-full px-6 md:px-12 xl:px-24 py-12 md:py-24 border-b border-gridline relative overflow-hidden flex flex-col items-center text-center">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] bg-bloom-cyan/5 rounded-full blur-[100px] pointer-events-none"></div>
        <h1 className="font-sans text-5xl md:text-8xl font-bold tracking-tighter uppercase relative z-10">
          Grand<br />
          <span className="text-bloom-cyan">Prizes</span>
        </h1>
      </div>

      {/* Grand Prizes Display */}
      <div className="w-full px-6 md:px-12 xl:px-24 py-16 flex flex-col md:flex-row items-center justify-center gap-8 md:gap-12 bg-black/30 border-b border-gridline">
        <div className="order-2 md:order-1 w-full flex justify-center">
          <PrizeTicket {...mainPrizes[0]} />
        </div>
        <div className="order-1 md:order-2 w-full flex justify-center transform scale-110 z-20">
          <PrizeTicket {...mainPrizes[1]} />
        </div>
        <div className="order-3 w-full flex justify-center">
          <PrizeTicket {...mainPrizes[2]} />
        </div>
      </div>

      {/* Track Prizes Header */}
      <div className="w-full px-6 md:px-12 xl:px-24 py-12 border-b border-gridline relative overflow-hidden flex flex-col items-center text-center">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[300px] h-[300px] bg-bloom-purple/5 rounded-full blur-[80px] pointer-events-none"></div>
        <h2 className="font-sans text-4xl md:text-6xl font-bold tracking-tighter uppercase relative z-10 text-white">
          Track <span className="text-bloom-purple">Prizes</span>
        </h2>
      </div>

      {/* Track Prizes Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 border-b border-gridline">
        {trackPrizes.slice(0, 3).map((track, index) => (
          <div key={track.trackName} className={`border-b md:border-b-0 ${index < 2 ? 'md:border-r' : ''} border-gridline`}>
            <TrackPrizeCard {...track} />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 border-b border-gridline">
        {trackPrizes.slice(3, 5).map((track, index) => (
          <div key={track.trackName} className={`border-b md:border-b-0 ${index === 0 ? 'md:border-r' : ''} border-gridline`}>
            <TrackPrizeCard {...track} />
          </div>
        ))}
      </div>

      {/* Speakers Header */}
      <div className="w-full px-6 md:px-12 xl:px-24 py-12 border-b border-gridline relative overflow-hidden flex flex-col items-center text-center">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[300px] h-[300px] bg-bloom-pink/5 rounded-full blur-[80px] pointer-events-none"></div>
        <h2 className="font-sans text-4xl md:text-6xl font-bold tracking-tighter uppercase relative z-10 text-white">
          Guest <span className="text-bloom-pink">Speakers</span>
        </h2>
      </div>

      {/* Speakers Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4">
        {speakers.map((speaker, index) => (
          <div key={speaker.id} className={`border-b lg:border-b-0 ${index < 3 ? 'md:border-r' : ''} border-gridline`}>
            <SpeakerCard {...speaker} />
          </div>
        ))}
      </div>

    </section>
  );
}
