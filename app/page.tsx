"use client";
import Image from "next/image";
import React, { useState, useEffect } from "react";
import HomeSections from "@/components/HomeSections";
import { Truculenta } from "next/font/google";

const truculenta = Truculenta({
  subsets: ["latin"],
  weight: ["900"],
});

const Cloud: React.FC<{ src: string; className?: string; animationDelay?: string; speed?: "slow" | "normal" | "fast" }> = ({
  src,
  className,
  animationDelay = "0s",
  speed = "normal"
}) => {
  const speedClass = speed === "slow" ? "animate-float-slow" : speed === "fast" ? "animate-float-fast" : "animate-float";

  return (
    <div
      className={`absolute pointer-events-none ${className} ${speedClass}`}
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

// Countdown component
// Countdown component with digital grid
const Countdown: React.FC<{ targetDate: Date }> = ({ targetDate }) => {
  const [timeLeft, setTimeLeft] = useState(getTimeLeft());

  function getTimeLeft() {
    const now = new Date().getTime();
    const distance = targetDate.getTime() - now;

    if (distance <= 0) return null;

    const days = Math.floor(distance / (1000 * 60 * 60 * 24));
    const hours = Math.floor((distance / (1000 * 60 * 60)) % 24);
    const minutes = Math.floor((distance / (1000 * 60)) % 60);
    const seconds = Math.floor((distance / 1000) % 60);

    return { days, hours, minutes, seconds };
  }

  useEffect(() => {
    const interval = setInterval(() => setTimeLeft(getTimeLeft()), 1000);
    return () => clearInterval(interval);
  }, []);

  function formatUnit(unit?: number) {
    return unit != null ? String(unit).padStart(2, "0") : "00";
  }

  if (!timeLeft) {
    return (
      <div className="flex gap-3 md:gap-4">
        {["DAYS", "HOURS", "MINUTES", "SECONDS"].map((label, i) => (
          <div key={i} className="flex flex-col items-center bg-wonka-red rounded-2xl px-4 py-3 md:px-6 md:py-4 min-w-[60px] md:min-w-[90px] shadow-[0_4px_0_#991b1b] border-2 border-red-900">
            <span className="text-white text-3xl md:text-5xl font-bold">00</span>
            <span className="text-white text-xs md:text-sm tracking-wider mt-1">{label}</span>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="flex gap-3 md:gap-4">
      {[
        { label: "DAYS", value: timeLeft.days },
        { label: "HOURS", value: timeLeft.hours },
        { label: "MINUTES", value: timeLeft.minutes },
        { label: "SECONDS", value: timeLeft.seconds },
      ].map((unit, i) => (
        <div key={i} className="flex flex-col items-center bg-wonka-red rounded-2xl px-4 py-3 md:px-6 md:py-4 min-w-[60px] md:min-w-[90px] shadow-[0_4px_0_#991b1b] border-2 border-red-900">
          <span className="text-white text-3xl md:text-5xl font-bold">{formatUnit(unit.value)}</span>
          <span className="text-white text-xs md:text-sm tracking-wider mt-1">{unit.label}</span>
        </div>
      ))}
    </div>
  );
};


export default function HomePage() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return null;
  }

  return (
    <>
      <style jsx global>{`
        @keyframes float {
          0% { transform: translateX(0px); }
          50% { transform: translateX(20px); }
          100% { transform: translateX(0px); }
        }

        @keyframes float-slow {
          0% { transform: translateX(0px); }
          50% { transform: translateX(-20px); }
          100% { transform: translateX(0px); }
        }

        @keyframes float-fast {
          0% { transform: translateX(0px); }
          50% { transform: translateX(15px); }
          100% { transform: translateX(0px); }
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

        @keyframes shine {
          100% { transform: translateX(100%); }
        }

        .animate-shine {
          animation: shine 1.5s ease-in-out infinite;
        }

        .animate-pulse-slow {
          animation: pulse 4s cubic-bezier(0.4, 0, 0.6, 1) infinite;
        }

        .animate-float {
          animation: float 8s ease-in-out infinite;
        }

        .animate-float-slow {
          animation: float-slow 12s ease-in-out infinite;
        }

        .animate-float-fast {
          animation: float-fast 6s ease-in-out infinite;
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
          {/* Clouds */}
          <Cloud src="/cloud-main/smallCloud.png" className="top-[5%] left-[5%] w-32 h-20 opacity-90 md:w-72 md:h-40" animationDelay="0s" speed="normal" />
          <Cloud src="/cloud-main/smallCloud.png" className="top-[2%] right-[5%] w-24 h-24 opacity-90 md:left-[70%] md:right-auto md:w-40 md:h-40" animationDelay="2.5s" speed="fast" />
          <Cloud src="/cloud-main/midCloud.png" className="hidden md:block md:top-[20%] md:right-[10%] md:w-56 md:h-28 opacity-95" animationDelay="1.8s" speed="slow" />
          <Cloud src="/cloud-main/largecloud.png" className="hidden md:block md:top-[60%] md:left-[5%] md:w-64 md:h-32 opacity-80" animationDelay="3.2s" speed="slow" />

          {/* Bottom Clouds */}
          <div className="absolute bottom-0 left-0 w-[50%] h-32 -translate-x-1/4 opacity-95 md:h-52 pointer-events-none">
            <Image src="/cloud-main/cloudBottom.png" alt="Decorative cloud" fill className="object-contain" />
          </div>
          <div className="absolute bottom-0 left-0 w-[75%] h-32 -translate-x-[25%] opacity-95 md:h-52 pointer-events-none">
            <Image src="/cloud-main/cloudBottom.png" alt="Decorative cloud" fill className="object-contain" />
          </div>
          <div className="absolute bottom-0 right-0 w-[50%] h-32 translate-x-1/4 opacity-95 md:h-52 pointer-events-none">
            <Image src="/cloud-main/cloudBottom.png" alt="Decorative cloud" fill className="object-contain" />
          </div>
          <div className="absolute bottom-0 right-0 w-[75%] h-32 translate-x-[25%] opacity-95 md:h-52 pointer-events-none">
            <Image src="/cloud-main/cloudBottom.png" alt="Decorative cloud" fill className="object-contain" />
          </div>

          {/* Static Candies */}
          <Candy className="bottom-0 left-[2%] w-28 h-28 md:left-[5%] md:w-60 md:h-60" direction="left" />
          <Candy className="bottom-0 right-[2%] w-28 h-28 md:right-[5%] md:w-60 md:h-60" direction="right" />

          <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[95%] max-w-lg h-28 z-10 md:z-40 md:w-[55rem] md:h-[23rem] md:max-w-none">
            <Image src="/dsgt.png" alt="DSGT Footer" fill className="object-contain" />
          </div>

          <Cloud src="/cloud-main/dateCloud.png" className="hidden md:block bottom-[45%] left-[15%] w-64 h-32 opacity-95" animationDelay="2.7s" speed="slow" />
          <Cloud src="/cloud-main/DSGTCloud.png" className="hidden md:block bottom-[40%] right-[5%] w-64 h-32 opacity-95" animationDelay="4.1s" speed="normal" />

          {/* Hero Content */}
          <div className="relative z-10 flex flex-col items-center justify-center text-center px-4 mt-8 min-h-[60vh]">
            {/* Decorative light burst */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[150%] h-[150%] bg-radial-gradient from-white/40 to-transparent opacity-60 blur-3xl -z-10 pointer-events-none animate-pulse-slow"></div>

            <div className="-mt-4 md:-mt-8">
              <h2 className={`${truculenta.className} text-5xl md:text-7xl font-black leading-none tracking-tight text-white drop-shadow-[0_4px_0_rgba(165,32,25,0.4)] animate-fade-in-up mb-8`}>
                Hacklytics 2026
              </h2>

              <div className="relative group">
                <h1
                  className="font-willywonka text-9xl md:text-[170px] font-normal text-wonka-yellow my-2 leading-[0.8] tracking-normal transition-transform duration-500 hover:scale-105 hover:rotate-2 drop-shadow-[0_8px_0_rgba(133,77,14,0.8)] filter"
                  style={{ WebkitTextStroke: "3px #854d0e" }}
                >
                  Golden Byte
                </h1>
              </div>
            </div>

            {/* Countdown */}
            <div className="mt-8 flex flex-col items-center">
              <Countdown targetDate={new Date("2026-02-20T23:59:59")} />
            </div>

            {/* Golden ticket placeholder */}
            <div className="mt-12 w-64 h-32 md:w-[480px] md:h-[240px] bg-transparent mx-auto animate-float-slow relative">
              <div className="absolute inset-0 bg-yellow-400/20 blur-[60px] rounded-full transform scale-75"></div>
            </div>
          </div>
        </div>

        <HomeSections />
      </main>
    </>
  );
}
