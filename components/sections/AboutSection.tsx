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

const AboutSection: React.FC = () => {
  return (
    <section id="about" className="section-anchor scroll-mt-28 min-h-screen bg-sky relative overflow-hidden py-20">
      {/* Drifting cloud decorations - Background */}
      <div className="absolute top-10 left-[-50px] w-48 h-32 opacity-40 animate-drift" style={{ animationDelay: '0s' }}>
        <Image src="/cloud-main/smallCloud.png" alt="" fill className="object-contain" />
      </div>
      <div className="absolute top-40 right-[-60px] w-40 h-28 opacity-50 animate-drift" style={{ animationDelay: '5s' }}>
        <Image src="/cloud-main/midCloud.png" alt="" fill className="object-contain" />
      </div>
      <div className="absolute bottom-20 left-1/4 w-56 h-36 opacity-30 animate-drift" style={{ animationDelay: '2s' }}>
        <Image src="/cloud-main/largecloud.png" alt="" fill className="object-contain" />
      </div>
      
      {/* Floating Candies */}
      <FloatingCandy src="/small-candy/pink.png" delay="0s" className="top-20 right-[15%] rotate-12" />
      <FloatingCandy src="/small-candy/blue.png" delay="1.5s" className="bottom-32 left-[10%] -rotate-12" />
      <FloatingCandy src="/small-candy/yellow.png" delay="3s" className="top-1/2 right-[5%] rotate-45" />
      <FloatingCandy src="/small-candy/green.png" delay="4.5s" className="bottom-10 right-[20%] -rotate-6" />

      <div className="container mx-auto px-4 relative z-10 max-w-6xl">
        
        {/* Section Header - Compact spacing */}
        <div className="text-center mb-12 relative">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-white/30 blur-3xl rounded-full -z-10"></div>
          <h1 
            className="font-willywonka text-7xl md:text-9xl text-wonka-yellow mb-2 drop-shadow-[0_4px_0_rgba(133,77,14,0.6)] animate-fade-in-up transform hover:scale-105 transition-transform duration-300"
            style={{ WebkitTextStroke: "2px #854d0e" }}
          >
            About
          </h1>
          <div className={`${truculenta.className} text-2xl md:text-4xl text-white font-bold tracking-wide drop-shadow-md animate-fade-in-up`} style={{ animationDelay: '0.2s' }}>
            Welcome to the Factory
          </div>
        </div>

        {/* Dense 2-Column Layout */}
        <div className="grid lg:grid-cols-12 gap-6 md:gap-8 items-start">
          
          {/* Left Column: Main Story Card - Takes up 7/12 columns */}
          <div className="lg:col-span-7 animate-fade-in-up h-full" style={{ animationDelay: '0.4s' }}>
            <div className="relative group transform transition-transform hover:scale-[1.01] duration-300 h-full">
              {/* Background Layer */}
              <div className="absolute inset-0 bg-wonka-red rounded-[2.5rem] transform translate-y-2 translate-x-2 md:translate-y-4 md:translate-x-4"></div>
              
              {/* Card Content */}
              <div className="relative bg-white rounded-[2.5rem] p-8 md:p-10 border-[6px] border-wonka-red shadow-xl overflow-hidden h-full flex flex-col justify-center">
                {/* Corner Decoration */}
                <div className="absolute top-0 right-0 w-40 h-40 bg-red-100 rounded-bl-full -mr-10 -mt-10 z-0 opacity-50"></div>
                
                <div className="relative z-10">
                  <h2 className={`${truculenta.className} text-4xl md:text-5xl font-black text-wonka-red mb-6`}>
                    A World of Pure Imagination
                  </h2>
                  
                  <div className="space-y-5 text-gray-800 text-lg md:text-xl leading-relaxed font-medium">
                    <p>
                      <span className="font-bold text-wonka-red">Hacklytics</span> is a <span className="font-bold bg-red-100 text-red-600 px-2 py-0.5 rounded-md whitespace-nowrap">36-hour data science hackathon</span> hosted by Data Science @ GT.
                    </p>
                    <p>
                      Inspired by the whimsical world of <span className="font-willywonka text-2xl text-wonka-yellow drop-shadow-sm" style={{ WebkitTextStroke: "1px #854d0e" }}>Willy Wonka</span>, we invite hackers from across the globe to grab their <span className="text-amber-500 font-bold">Golden Ticket</span> to innovation. 
                    </p>
                    <p>
                      Tackle challenges across <span className="font-bold border-b-4 border-red-300">5 exciting tracks</span>, fuel your curiosity, and uncover the sweet rewards of solving complex problems with code.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Stacked Info Cards - Takes up 5/12 columns */}
          <div className="lg:col-span-5 flex flex-col gap-6 md:gap-8">
            
            {/* Where & When Card */}
            <div className="animate-fade-in-up" style={{ animationDelay: '0.6s' }}>
              <div className="relative group transform transition-transform hover:scale-[1.02] duration-300">
                <div className="absolute inset-0 bg-yellow-400 rounded-[2rem] transform translate-y-2 translate-x-2 md:translate-y-3 md:translate-x-3"></div>
                <div className="relative bg-white rounded-[2rem] p-6 md:p-8 border-[5px] border-yellow-400 shadow-lg flex items-center gap-6">
                  <div className="hidden md:flex w-16 h-16 bg-yellow-50 rounded-full items-center justify-center flex-shrink-0 border-4 border-yellow-100">
                    <Image src="/small-candy/yellow.png" alt="Candy" width={40} height={40} className="object-contain animate-spin-slow" />
                  </div>
                  
                  <div className="flex-grow text-left">
                    <h3 className={`${truculenta.className} text-2xl md:text-3xl font-black text-amber-500 mb-2`}>
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
                <div className="absolute inset-0 bg-yellow-400 rounded-[2rem] transform translate-y-2 translate-x-2 md:translate-y-3 md:translate-x-3"></div>
                <div className="relative bg-white rounded-[2rem] p-6 md:p-8 border-[5px] border-yellow-400 shadow-lg">
                   <div className="absolute -top-4 -right-4 w-12 h-12 md:w-16 md:h-16 animate-spin-slow" style={{ animationDirection: 'reverse' }}>
                    <Image src="/small-candy/yellow.png" alt="Candy" fill className="object-contain" />
                  </div>

                  <h3 className={`${truculenta.className} text-2xl md:text-3xl font-black text-amber-500 mb-4 pr-8`}>
                    Why Join Us?
                  </h3>
                  
                  <div className="space-y-3 text-gray-700">
                    <div className="flex items-center gap-3 bg-yellow-50/50 p-2 rounded-lg border border-yellow-100">
                      <span className="text-xl">🚀</span>
                      <p className="font-bold text-sm md:text-base text-gray-800">Build projects that matter</p>
                    </div>
                     <div className="flex items-center gap-3 bg-yellow-50/50 p-2 rounded-lg border border-yellow-100">
                      <span className="text-xl">🤝</span>
                      <p className="font-bold text-sm md:text-base text-gray-800">Connect with hackers</p>
                    </div>
                     <div className="flex items-center gap-3 bg-yellow-50/50 p-2 rounded-lg border border-yellow-100">
                      <span className="text-xl">🎁</span>
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
