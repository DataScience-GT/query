"use client";
import Image from "next/image";
import React, { useState, useEffect } from "react";
import HomeSections from "@/components/HomeSections";
import { Truculenta } from "next/font/google";
import { Button } from "@/components/ui/button";

const truculenta = Truculenta({
  subsets: ["latin"],
  weight: ["900"],
});

const Cloud: React.FC<{ src: string; className?: string; animationDelay?: string }> = ({ 
  src, 
  className,
  animationDelay = "0s"
}) => {
  return (
    <div 
      className={`absolute pointer-events-none ${className} animate-drift`}
      style={{ animationDelay }}
    >
      <Image src={src} alt="Decorative cloud" fill className="object-contain" />
    </div>
  );
};

const Candy: React.FC<{ className?: string; direction?: "left" | "right" }> = ({ 
  className, 
  direction = "left" 
}) => (
  <div className={`absolute ${className} z-30`}>
    <Image 
      src="/cloud-main/candy/candyEnd.png" 
      alt={`Candy ${direction}`} 
      fill 
      className="object-contain md:scale-150" 
    />
  </div>
);

export default function HomePage() {
  const [loading, setLoading] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleApplyClick = () => {
    setLoading(true);
    setTimeout(() => {
      window.location.href = "https://form.typeform.com/to/lb2fKhKu";
    }, 500);
  };

  if (!mounted) {
    return null;
  }

  return (
    <>
      <style jsx global>{`
        @keyframes drift {
          0%, 100% { 
            transform: translateX(0px); 
          }
          50% { 
            transform: translateX(30px); 
          }
        }

        @keyframes pulse-glow {
          0%, 100% {
            box-shadow: 0 0 20px rgba(220, 38, 38, 0.3),
                        0 0 40px rgba(220, 38, 38, 0.2),
                        0 0 60px rgba(220, 38, 38, 0.1);
          }
          50% {
            box-shadow: 0 0 30px rgba(220, 38, 38, 0.5),
                        0 0 60px rgba(220, 38, 38, 0.4),
                        0 0 90px rgba(220, 38, 38, 0.3);
          }
        }

        .animate-drift {
          animation: drift 10s ease-in-out infinite;
        }

        .button-glow {
          animation: pulse-glow 2s ease-in-out infinite;
        }
      `}</style>

      <main className="relative w-full font-sans text-gray-800 overflow-hidden">
        {/* MLH Trust Badge */}
        <a
          id="mlh-trust-badge"
          href="https://mlh.io/na?utm_source=na-hackathon&utm_medium=TrustBadge&utm_campaign=2026-season&utm_content=white"
          target="_blank"
          className="absolute top-0 right-4 md:right-[50px] z-50 block w-[10%] max-w-[100px] min-w-[60px] transition-transform hover:scale-110"
        >
          <img
            src="https://s3.amazonaws.com/logged-assets/trust-badge/2026/mlh-trust-badge-2026-white.svg"
            alt="Major League Hacking 2026 Hackathon Season"
            className="w-full"
          />
        </a>

        {/* Hero Section */}
        <div className="relative w-full bg-sky overflow-hidden py-20 md:py-32">
          {/* Drifting Clouds - subtle horizontal movement */}
          <Cloud 
            src="/cloud-main/smallCloud.png" 
            className="top-[5%] left-[5%] w-32 h-20 opacity-90 md:w-72 md:h-40"
            animationDelay="0s"
          />
          <Cloud 
            src="/cloud-main/smallCloud.png" 
            className="top-[2%] right-[5%] w-24 h-24 opacity-90 md:left-[70%] md:right-auto md:w-40 md:h-40"
            animationDelay="2.5s"
          />
          <Cloud 
            src="/cloud-main/midCloud.png" 
            className="hidden md:block md:top-[20%] md:right-[10%] md:w-56 md:h-28 opacity-95"
            animationDelay="5s"
          />
          <Cloud 
            src="/cloud-main/largecloud.png" 
            className="hidden md:block md:top-[60%] md:left-[5%] md:w-64 md:h-32 opacity-80"
            animationDelay="7s"
          />
          {/* Drifting Bottom Clouds */}
          <div className="absolute bottom-0 left-0 w-[50%] h-32 -translate-x-1/4 opacity-95 md:h-52 pointer-events-none animate-drift" style={{ animationDelay: '1s' }}>
            <Image src="/cloud-main/cloudBottom.png" alt="Decorative cloud" fill className="object-contain" />
          </div>
          <div className="absolute bottom-0 left-0 w-[75%] h-32 -translate-x-[25%] opacity-95 md:h-52 pointer-events-none animate-drift" style={{ animationDelay: '4s' }}>
            <Image src="/cloud-main/cloudBottom.png" alt="Decorative cloud" fill className="object-contain" />
          </div>
          <div className="absolute bottom-0 right-0 w-[50%] h-32 translate-x-1/4 opacity-95 md:h-52 pointer-events-none animate-drift" style={{ animationDelay: '6s' }}>
            <Image src="/cloud-main/cloudBottom.png" alt="Decorative cloud" fill className="object-contain" />
          </div>
          <div className="absolute bottom-0 right-0 w-[75%] h-32 translate-x-[25%] opacity-95 md:h-52 pointer-events-none animate-drift" style={{ animationDelay: '8s' }}>
            <Image src="/cloud-main/cloudBottom.png" alt="Decorative cloud" fill className="object-contain" />
          </div>

          {/* Static Candies */}
          <Candy 
            className="bottom-0 left-[2%] w-28 h-28 md:left-[5%] md:w-60 md:h-60" 
            direction="left"
          />
          <Candy 
            className="bottom-0 right-[2%] w-28 h-28 md:right-[5%] md:w-60 md:h-60" 
            direction="right"
          />

          <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[95%] max-w-lg h-28 z-10 md:z-40 md:w-[55rem] md:h-[23rem] md:max-w-none">
            <Image src="/dsgt.png" alt="DSGT Footer" fill className="object-contain" />
          </div>

          <Cloud 
            src="/cloud-main/dateCloud.png" 
            className="hidden md:block bottom-[45%] left-[20%] w-64 h-32 opacity-95"
            animationDelay="3.5s"
          />
          <Cloud 
            src="/cloud-main/DSGTCloud.png" 
            className="hidden md:block bottom-[40%] right-[5%] w-64 h-32 opacity-95"
            animationDelay="1.5s"
          />

          {/* Hero Content */}
          <div className="relative z-10 flex flex-col items-center justify-center text-center px-4 mt-8">
            <h2 className={`${truculenta.className} text-4xl md:text-6xl font-black leading-none tracking-normal animate-fade-in`}>
              Hacklytics 2026:
            </h2>
            <h1 
              className="font-willywonka text-8xl md:text-[150px] font-normal text-wonka-yellow my-3 leading-none tracking-normal transition-transform hover:scale-105" 
              style={{ WebkitTextStroke: "1px #854d0e" }}
            >
              Golden Byte
            </h1>

            {/* Enhanced Dynamic Apply Now! Button */}
            <Button
              onClick={handleApplyClick}
              disabled={loading}
              size="lg"
              className={`${truculenta.className} relative bg-wonka-red text-white font-bold rounded-xl shadow-lg hover:bg-red-700 transition-all duration-500 ease-out hover:scale-[1.35] hover:-translate-y-4 hover:rotate-1 hover:shadow-[0_25px_60px_rgba(220,38,38,0.6)] mt-2 px-8 py-4 text-xl md:px-10 md:py-5 md:text-2xl cursor-pointer flex items-center justify-center gap-3 disabled:opacity-75 disabled:hover:scale-100 disabled:hover:translate-y-0 disabled:hover:rotate-0 button-glow active:scale-110 active:translate-y-0`}
            >
              {loading ? (
                <>
                  <div className="h-5 w-5 border-t-2 border-b-2 border-white rounded-full animate-spin"></div>
                  Hold on tight...
                </>
              ) : (
                <>
                  <span className="relative z-10">Apply Now!</span>
                  <span className="absolute inset-0 rounded-xl bg-gradient-to-r from-red-600 via-red-500 to-red-600 opacity-0 hover:opacity-20 transition-opacity duration-500"></span>
                </>
              )}
            </Button>

            {/* Golden ticket placeholder */}
            <div className="mt-4 w-64 h-32 md:w-[480px] md:h-[240px] bg-transparent mx-auto"></div>
          </div>
        </div>

        <HomeSections />
      </main>
    </>
  );
}