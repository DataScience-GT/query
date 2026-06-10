"use client";
import React from "react";
import Image from "next/image";
import { FlowerAccent, FlowerDivider } from "../FloatingFlowers";

// Cybernetic Prize Ticket Component
const PrizeTicket: React.FC<{
  type: "gold" | "silver" | "bronze";
  prize: string;
  image: string;
}> = ({ type, prize, image }) => {
  const colors = {
    gold: {
      text: "text-bloom-lime",
      border: "border-bloom-lime",
      shadow: "shadow-[0_0_20px_rgba(204,255,0,0.3)]",
    },
    silver: {
      text: "text-bloom-cyan",
      border: "border-bloom-cyan",
      shadow: "shadow-[0_0_20px_rgba(0,243,255,0.3)]",
    },
    bronze: {
      text: "text-bloom-pink",
      border: "border-bloom-pink",
      shadow: "shadow-[0_0_20px_rgba(255,0,127,0.3)]",
    },
  };

  const color = colors[type];

  return (
    <div
      className={`flex flex-col items-center w-full max-w-[280px] group transition-all duration-500 hover:-translate-y-2`}
    >
      <div
        className={`w-full aspect-[1.8/1] relative glass-panel flex flex-col items-center justify-center p-4 overflow-hidden border-2 ${color.border} ${color.shadow} rounded-b-none bg-black/20`}
      >
        {/* Ticket Background Image Watermark */}
        <div className="absolute inset-0 z-0 opacity-40 group-hover:opacity-60 transition-opacity duration-500">
          <Image
            src={`/tickets/${type}.png`}
            alt={`${type} ticket background`}
            fill
            className="object-cover"
          />
        </div>

        {/* Abstract Glow */}
        <div
          className={`absolute top-0 right-0 w-40 h-40 ${color.border.replace("border-", "bg-")}/30 blur-[50px] pointer-events-none group-hover:scale-150 transition-transform duration-700 z-10`}
        ></div>

        <div
          className={`w-16 h-16 md:w-24 md:h-24 relative mb-2 z-20 filter drop-shadow-[0_0_15px_currentColor] group-hover:scale-110 transition-all duration-500`}
        >
          <Image src={image} alt={prize} fill className="object-contain" />
        </div>
      </div>

      {/* Prize Text Below */}
      <div
        className={`w-full glass-panel !rounded-t-none border-t-0 p-4 text-center border-2 ${color.border} border-t-transparent shadow-xl bg-black/40`}
      >
        <div
          className={`font-mono text-sm tracking-widest uppercase mb-1 font-bold ${color.text} drop-shadow-[0_0_5px_currentColor]`}
        >
          {type}
        </div>
        <div
          className={`font-sans text-lg md:text-xl font-bold uppercase tracking-tight text-white drop-shadow-md`}
        >
          {prize}
        </div>
      </div>
    </div>
  );
};

// Cybernetic Track Prize Card Component
const TrackPrizeCard: React.FC<{
  trackName: string;
  description: string;
  prizes: { place: string; name: string; image: string }[];
  colorClass: string;
}> = ({ trackName, description, prizes, colorClass }) => (
  <div
    className={`glass-panel hover:bg-white/[0.05] transition-all duration-500 h-full flex flex-col group relative overflow-hidden hover:-translate-y-1 hover:border-${colorClass.replace("text-", "")}/50`}
  >
    {/* Abstract Background Glow */}
    <div
      className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 ${colorClass.replace("text-", "bg-")}/10 rounded-full blur-[60px] opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none`}
    ></div>

    {/* Track Header */}
    <div className="border-b border-white/10 p-6 relative z-10">
      <h3
        className={`font-sans text-2xl md:text-3xl font-bold uppercase tracking-tighter ${colorClass} mb-2 drop-shadow-[0_0_5px_currentColor]`}
      >
        {trackName}
      </h3>
      <p className="font-mono text-xs text-gray-300 uppercase tracking-widest leading-relaxed">
        {description}
      </p>
    </div>

    {/* Prizes List */}
    <div className="p-6 flex flex-col gap-4 flex-1 relative z-10">
      {prizes.map((prize, index) => (
        <div
          key={index}
          className={`flex items-center gap-4 bg-white/5 rounded-xl p-3 border border-white/5 group-hover:border-${colorClass.replace("text-", "")}/30 transition-colors`}
        >
          <div className="w-12 h-12 relative flex-shrink-0 group-hover:scale-110 transition-transform duration-500 drop-shadow-[0_0_10px_currentColor] text-white">
            <Image
              src={prize.image}
              alt={prize.name}
              fill
              className="object-contain rounded-md"
            />
          </div>
          <div className="flex-1 min-w-0">
            <span
              className={`font-mono text-xs uppercase tracking-widest block mb-1 font-bold ${
                index === 0
                  ? "text-bloom-lime"
                  : index === 1
                    ? "text-bloom-cyan"
                    : "text-bloom-pink"
              }`}
            >
              {prize.place}
            </span>
            <p className="font-sans text-sm font-bold text-white truncate">
              {prize.name}
            </p>
          </div>
        </div>
      ))}
    </div>
  </div>
);

// Cybernetic Speaker Avatar Placeholder Component
const SpeakerAvatar: React.FC<{ colorClass: string }> = ({ colorClass }) => {
  const glowColor = colorClass.includes("purple")
    ? "#9d00ff"
    : colorClass.includes("pink")
      ? "#ff007f"
      : colorClass.includes("lime")
        ? "#ccff00"
        : "#00f3ff";

  return (
    <div className="w-full h-full relative bg-black/40 flex items-center justify-center">
      <svg className="w-full h-full" viewBox="0 0 100 100" fill="none">
        <defs>
          <radialGradient
            id={`avatarGlow-${glowColor.replace("#", "")}`}
            cx="50%"
            cy="50%"
            r="50%"
          >
            <stop offset="0%" stopColor={glowColor} stopOpacity="0.4" />
            <stop offset="70%" stopColor={glowColor} stopOpacity="0.1" />
            <stop offset="100%" stopColor={glowColor} stopOpacity="0" />
          </radialGradient>
          <linearGradient
            id={`silhouetteGrad-${glowColor.replace("#", "")}`}
            x1="0%"
            y1="0%"
            x2="100%"
            y2="100%"
          >
            <stop offset="0%" stopColor="#1e2230" />
            <stop offset="100%" stopColor={glowColor} stopOpacity="0.35" />
          </linearGradient>
        </defs>

        {/* Background glow */}
        <circle
          cx="50"
          cy="50"
          r="45"
          fill={`url(#avatarGlow-${glowColor.replace("#", "")})`}
        />

        {/* Cyber circuit lines */}
        <circle
          cx="50"
          cy="50"
          r="38"
          stroke={glowColor}
          strokeWidth="0.5"
          strokeDasharray="4 8"
          className="animate-pulse"
          style={{ transformOrigin: "center" }}
        />
        <circle
          cx="50"
          cy="50"
          r="32"
          stroke={glowColor}
          strokeWidth="0.25"
          opacity="0.5"
        />

        {/* Target reticle elements */}
        <path
          d="M 50 8 L 50 14 M 50 86 L 50 92 M 8 50 L 14 50 M 86 50 L 92 50"
          stroke={glowColor}
          strokeWidth="1"
          opacity="0.6"
        />

        {/* Silhouette */}
        <path
          d="M 50 32 C 43 32 38 37 38 44 C 38 51 43 56 50 56 C 57 56 62 51 62 44 C 62 37 57 32 50 32 Z M 50 60 C 36 60 25 70 25 80 L 75 80 C 75 70 64 60 50 60 Z"
          fill={`url(#silhouetteGrad-${glowColor.replace("#", "")})`}
          stroke={glowColor}
          strokeWidth="0.5"
          opacity="0.8"
        />

        {/* Digital node details */}
        <circle cx="50" cy="44" r="1.5" fill={glowColor} />
        <line
          x1="50"
          y1="44"
          x2="62"
          y2="44"
          stroke={glowColor}
          strokeWidth="0.5"
          opacity="0.5"
        />
        <circle cx="62" cy="44" r="1" fill="#fff" />
      </svg>
    </div>
  );
};

// Cybernetic Speaker Card Component
const SpeakerCard: React.FC<{
  name: string;
  title: string;
  company: string;
  image: string;
  colorClass: string;
}> = ({ name, title, company, image, colorClass }) => (
  <div
    className={`glass-panel p-6 flex flex-col items-center text-center group hover:-translate-y-2 transition-all duration-500 relative overflow-hidden hover:border-${colorClass.replace("text-", "")}/50`}
  >
    <div
      className={`absolute -bottom-10 -right-10 w-48 h-48 ${colorClass.replace("text-", "bg-")}/20 blur-[50px] pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-500`}
    ></div>

    {/* Image Container */}
    <div
      className={`w-full aspect-square relative mb-6 rounded-full border-4 border-transparent group-hover:border-${colorClass.replace("text-", "")}/50 filter grayscale group-hover:grayscale-0 transition-all duration-500 overflow-hidden shadow-2xl bg-black/40`}
    >
      {name === "TBD" ? (
        <SpeakerAvatar colorClass={colorClass} />
      ) : (
        <Image
          src={image}
          alt={name}
          fill
          className="object-cover group-hover:scale-110 transition-transform duration-700"
        />
      )}
    </div>

    {/* Info */}
    <h3
      className={`font-sans text-2xl font-bold uppercase tracking-tight text-white mb-2 group-hover:${colorClass} transition-colors drop-shadow-md`}
    >
      {name}
    </h3>
    <p className="font-mono text-xs text-gray-300 uppercase tracking-widest mb-1">
      {title}
    </p>
    <p
      className={`font-mono text-xs font-bold ${colorClass} drop-shadow-[0_0_5px_currentColor]`}
    >
      {company}
    </p>
  </div>
);

export default function PrizeAndSpeakerSection() {
  const mainPrizes = [
    {
      type: "silver" as const,
      rank: "2",
      prize: "Apple AirPods Max",
      image:
        "https://store.storeimages.cdn-apple.com/4982/as-images.apple.com/is/airpods-max-select-spacegray-202011?wid=400&hei=400&fmt=png-alpha",
    },
    {
      type: "gold" as const,
      rank: "1",
      prize: "Apple MacBook Air M4",
      image:
        "https://store.storeimages.cdn-apple.com/4982/as-images.apple.com/is/macbook-air-midnight-select-20220606?wid=400&hei=400&fmt=png-alpha",
    },
    {
      type: "bronze" as const,
      rank: "3",
      prize: "Samsung Odyssey G5 Monitor",
      image: "/prizes/samsung-monitor.jpg",
    },
  ];

  const trackPrizes = [
    {
      trackName: "Finance",
      description: "Analyze market trends, predict stock movements",
      colorClass: "text-bloom-lime",
      prizes: [
        {
          place: "1st Place",
          name: "Nespresso Virtuo Next",
          image: "/prizes/nespresso-new.jpg",
        },
        {
          place: "2nd Place",
          name: "JBL Grip Speaker",
          image: "/prizes/jbl-flip.jpg",
        },
        {
          place: "3rd Place",
          name: "Clay Poker Set",
          image: "/prizes/poker-set-new.jpg",
        },
      ],
    },
    {
      trackName: "Sports Analytics",
      description: "Player performance & the future of sports data",
      colorClass: "text-bloom-cyan",
      prizes: [
        {
          place: "1st Place",
          name: "Apple 40mm Watch SE 3",
          image: "/prizes/apple-watch.jpg",
        },
        {
          place: "2nd Place",
          name: "JBL Grip Speaker",
          image: "/prizes/jbl-flip.jpg",
        },
        {
          place: "3rd Place",
          name: "Pickleball Set",
          image: "/prizes/pickleball-backpack.jpg",
        },
      ],
    },
    {
      trackName: "Healthcare",
      description: "Innovate in bioinformatics & health tech",
      colorClass: "text-bloom-pink",
      prizes: [
        {
          place: "1st Place",
          name: "Theragun Mini Gen 3",
          image: "/prizes/theragun-mini.jpg",
        },
        {
          place: "2nd Place",
          name: "Fitbit Inspire 3",
          image: "/prizes/fitbit.jpg",
        },
        {
          place: "3rd Place",
          name: "Owala Waterbottle",
          image: "/prizes/owala.jpg",
        },
      ],
    },
    {
      trackName: "Entertainment",
      description: "Transforming movies, gaming, & interactive media",
      colorClass: "text-bloom-purple",
      prizes: [
        {
          place: "1st Place",
          name: "Projector",
          image: "/prizes/projector-new.jpg",
        },
        {
          place: "2nd Place",
          name: "Karaoke Machine",
          image: "/prizes/karaoke-new.jpg",
        },
        {
          place: "3rd Place",
          name: "Vinyl Record Turntable",
          image: "/prizes/turntable-new.jpg",
        },
      ],
    },
    {
      trackName: "Pure Imagination",
      description: "Unleash creativity and build something totally unique",
      colorClass: "text-bloom-lime",
      prizes: [
        {
          place: "1st Place",
          name: "Ninja CREAMi Soft Serve",
          image: "/prizes/ninja-creami.jpg",
        },
      ],
    },
  ];

  const speakers = [
    {
      id: 1,
      name: "TBD",
      title: "Keynote Speaker",
      company: "Coming Soon",
      image: "/wonka/wonka.jpg",
      colorClass: "text-bloom-purple",
    },
    {
      id: 2,
      name: "TBD",
      title: "Guest Speaker",
      company: "Coming Soon",
      image: "/wonka/wonka.jpg",
      colorClass: "text-bloom-pink",
    },
    {
      id: 3,
      name: "TBD",
      title: "Workshop Lead",
      company: "Coming Soon",
      image: "/wonka/wonka.jpg",
      colorClass: "text-bloom-lime",
    },
    {
      id: 4,
      name: "TBD",
      title: "Guest Speaker",
      company: "Coming Soon",
      image: "/wonka/wonka.jpg",
      colorClass: "text-bloom-cyan",
    },
  ];

  return (
    <section
      id="prizes"
      className="section-anchor scroll-mt-24 text-white relative"
    >
      {/* Grand Prizes Section Header */}
      <div className="w-full px-6 md:px-12 xl:px-24 py-12 md:py-24 relative overflow-hidden flex flex-col items-center text-center">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] bg-bloom-cyan/20 rounded-full blur-[100px] pointer-events-none mix-blend-screen animate-pulse"></div>
        <FlowerAccent position="top-right" color="#00f3ff" size={55} />
        <FlowerAccent position="top-left" color="#ff007f" size={45} />
        <h1 className="font-sans text-5xl md:text-8xl lg:text-9xl font-bold tracking-tighter uppercase relative z-10 drop-shadow-2xl">
          Grand
          <br />
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-bloom-cyan to-white bloom-text-glow">
            Prizes
          </span>
        </h1>
      </div>

      {/* Grand Prizes Display */}
      <div className="w-full px-6 md:px-12 xl:px-24 pb-24 flex flex-col md:flex-row items-center justify-center gap-12 md:gap-16">
        <div className="order-2 md:order-1 w-full flex justify-center">
          <PrizeTicket {...mainPrizes[0]} />
        </div>
        <div className="order-1 md:order-2 w-full flex justify-center transform md:scale-110 z-20">
          <PrizeTicket {...mainPrizes[1]} />
        </div>
        <div className="order-3 w-full flex justify-center">
          <PrizeTicket {...mainPrizes[2]} />
        </div>
      </div>

      {/* Flower divider */}
      <FlowerDivider variant="lime" />

      {/* Track Prizes Header */}
      <div className="w-full px-6 md:px-12 xl:px-24 py-16 relative overflow-hidden flex flex-col items-center text-center mt-12">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[300px] h-[300px] bg-bloom-purple/20 rounded-full blur-[100px] pointer-events-none mix-blend-screen"></div>
        <h2 className="font-sans text-4xl md:text-6xl lg:text-7xl font-bold tracking-tighter uppercase relative z-10 text-white drop-shadow-xl">
          Track{" "}
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-bloom-purple to-bloom-pink bloom-text-glow">
            Prizes
          </span>
        </h2>
      </div>

      {/* Track Prizes Grid */}
      <div className="w-full px-6 md:px-12 xl:px-24 mb-24">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-8 mb-6 md:mb-8">
          {trackPrizes.slice(0, 3).map((track) => (
            <TrackPrizeCard key={track.trackName} {...track} />
          ))}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8">
          {trackPrizes.slice(3, 5).map((track) => (
            <TrackPrizeCard key={track.trackName} {...track} />
          ))}
        </div>
      </div>

      {/* Flower divider before speakers */}
      <FlowerDivider variant="pink" />

      {/* Speakers Header */}
      <div className="w-full px-6 md:px-12 xl:px-24 py-16 relative overflow-hidden flex flex-col items-center text-center">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[300px] h-[300px] bg-bloom-pink/20 rounded-full blur-[100px] pointer-events-none mix-blend-screen"></div>
        <h2 className="font-sans text-4xl md:text-6xl lg:text-7xl font-bold tracking-tighter uppercase relative z-10 text-white drop-shadow-xl">
          Guest{" "}
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-bloom-pink to-bloom-lime bloom-text-glow">
            Speakers
          </span>
        </h2>
      </div>

      {/* Speakers Grid */}
      <div className="w-full px-6 md:px-12 xl:px-24 mb-24">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 md:gap-8">
          {speakers.map((speaker) => (
            <SpeakerCard key={speaker.id} {...speaker} />
          ))}
        </div>
      </div>
    </section>
  );
}
