import Image from 'next/image';
import React from 'react';
import HomeSections from '@/components/HomeSections';

const Cloud: React.FC<{ src: string; className?: string }> = ({ src, className }) => (
  <div className={`absolute ${className}`}>
    <Image src={src} alt="Decorative cloud" fill className="object-contain" />
  </div>
);

export default function HomePage() {
  const lollipops: string[] = [
    '/lollipop-red.svg', '/lollipop-green.svg', '/lollipop-red.svg',
    '/lollipop-green.svg', '/lollipop-red.svg', '/lollipop-green.svg', '/lollipop-red.svg'
  ];

  return (
    <main className="w-full font-sans text-gray-800">

      {/* 1. Replaced min-h-screen with vertical padding for a shorter section */}
      <div className="relative w-full bg-sky overflow-hidden py-32">

        {/* Cloud Decorations (unchanged) */}
        <Cloud src="/cloud.png" className="top-[6%] left-[8%] w-72 h-40 opacity-95" />
        <Cloud src="/cloud.png" className="top-[24%] right-[6%] w-56 h-24" />
        <Cloud src="/cloud.png" className="top-[4%] right-[36%] w-48 h-20 opacity-80" />
        <Cloud src="/cloud.png" className="top-[42%] left-[4%] w-64 h-32" />
        <Cloud src="/cloud.png" className="top-[60%] right-[20%] w-36 h-18 opacity-95" />
        <Cloud src="/cloud.png" className="top-[78%] left-[10%] w-44 h-22" />

        {/* Hero Section - Reduced top margin */}
        <div className="relative z-10 flex flex-col items-center justify-center text-center px-4 mt-8">
          
          {/* 2. Reduced font sizes */}
          <h2 className="text-xl md:text-3xl font-bold">Hacklytics 2026:</h2>

          <h1 className="font-willywonka text-3xl sm:text-5xl md:text-7xl lg:text-8xl text-wonka-yellow my-3 leading-tight" style={{ WebkitTextStroke: '2px #854d0e' }}>
            Golden Byte
          </h1>

          <button className="bg-wonka-red text-white font-bold text-base sm:text-xl px-5 sm:px-8 py-2 rounded-xl shadow-lg hover:bg-red-600 transition-transform hover:scale-105 mt-2">
            Apply Now!
          </button>

          {/* Floating Date and Tagline (unchanged) */}
          <div className="hidden md:block absolute top-[18%] left-[6%] -rotate-12 text-xl md:text-3xl font-bold">
            Feb 20-22
          </div>
          <div className="hidden md:block absolute top-[34%] right-[8%] rotate-12 text-sm md:text-2xl font-bold text-white bg-purple-500 px-3 py-1 rounded-lg">
            Data Science @ GT
          </div>

          {/* 3. Reduced graphic size */}
          <div className="mt-4 w-48 sm:w-64 md:w-[480px]">
            <Image src="/earth-graphic.png" alt="Earth with golden ticket" width={600} height={600} className="w-full h-auto" />
          </div>
        </div>

        {/* 4. Reduced footer size */}
        <footer className="absolute bottom-0 left-0 w-full h-20 sm:h-24 flex justify-around items-end z-20 px-4">
          {lollipops.map((src, index) => (
            <div key={index} className="relative w-10 h-14 sm:w-14 sm:h-18 md:w-16 md:h-24">
              <Image src={src} alt="Lollipop" fill className="object-contain" />
            </div>
          ))}
        </footer>
      </div>

      <HomeSections />

    </main>
  );
}