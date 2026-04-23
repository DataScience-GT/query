"use client";
import Image from "next/image";
import React, { useState, useEffect } from "react";
import HomeSections from "@/components/HomeSections";
import { Press_Start_2P } from "next/font/google";

const pixel = Press_Start_2P({
  subsets: ["latin"],
  weight: ["400"],
});

// 1980s Arcade Countdown Timer
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
  }, [getTimeLeft]);

  function formatUnit(unit?: number) {
    return unit != null ? String(unit).padStart(2, "0") : "00";
  }

  if (!timeLeft) {
    return (
      <div className="flex gap-3 md:gap-4 justify-center">
        {["DAYS", "HOURS", "MINUTES", "SECONDS"].map((label, i) => (
          <div
            key={i}
            className="flex flex-col items-center bg-neon-pink rounded-xl px-4 py-3 min-w-[80px] md:min-w-[120px] shadow-[0_0_20px_var(--neon-pink)] border-4 border-neon-pink"
            style={{ animationDelay: `${i * 0.1}s` }}
          >
            <span className="text-white text-4xl md:text-6xl font-bold drop-shadow-[0_0_5px_var(--neon-pink)]">
              00
            </span>
            <span className="text-neon-cyan text-xs md:text-sm tracking-wider mt-1 font-pixel">{label}</span>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="flex gap-3 md:gap-4 justify-center">
      {[
        { label: "DAYS", value: timeLeft.days },
        { label: "HOURS", value: timeLeft.hours },
        { label: "MINUTES", value: timeLeft.minutes },
        { label: "SECONDS", value: timeLeft.seconds },
      ].map((unit, i) => (
        <div
          key={i}
          className="flex flex-col items-center bg-neon-pink rounded-xl px-4 py-3 min-w-[80px] md:min-w-[120px] shadow-[0_0_20px_var(--neon-pink)] border-4 border-neon-pink animate-pulse"
          style={{ animationDelay: `${i * 0.1}s` }}
        >
          <span className="text-white text-4xl md:text-6xl font-bold drop-shadow-[0_0_5px_var(--neon-pink)]">
            {formatUnit(unit.value)}
          </span>
          <span className="text-neon-cyan text-xs md:text-sm tracking-wider mt-1 font-pixel">{unit.label}</span>
        </div>
      ))}
    </div>
  );
};


export default function HomePage() {
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
            box-shadow: 0 0 20px rgba(255, 0, 255, 0.5),
                        0 0 40px rgba(255, 0, 255, 0.3),
                        0 0 60px rgba(255, 0, 255, 0.1);
          }
          50% {
            box-shadow: 0 0 30px rgba(255, 0, 255, 0.7),
                        0 0 60px rgba(255, 0, 255, 0.5),
                        0 0 90px rgba(255, 0, 255, 0.3);
          }
        }

        @keyframes neon-blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
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

        .animate-neon-blink {
          animation: neon-blink 2s ease-in-out infinite;
        }
      `}</style>

      <main className="relative w-full bg-retro-gradient text-neon-cyan overflow-hidden">
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

        {/* Hero Section - 1980s Arcade Style */}
        <div className="relative w-full overflow-hidden py-20 md:py-32">
          {/* Neon border glow */}
          <div className="absolute inset-0 pointer-events-none">
            <div className="absolute top-0 left-0 right-0 h-4 bg-gradient-to-b from-neon-pink/30 to-transparent"></div>
            <div className="absolute bottom-0 left-0 right-0 h-4 bg-gradient-to-t from-neon-cyan/30 to-transparent"></div>
            <div className="absolute left-0 top-0 bottom-0 w-4 bg-gradient-to-r from-neon-purple/30 to-transparent"></div>
            <div className="absolute right-0 top-0 bottom-0 w-4 bg-gradient-to-l from-neon-green/30 to-transparent"></div>
          </div>

          {/* Clouds - Retro styled */}
          <Image src="/cloud-main/smallCloud.png" alt="Cloud" className="top-[5%] left-[5%] w-32 h-20 opacity-90 md:w-72 md:h-40 absolute" />
          <Image src="/cloud-main/smallCloud.png" alt="Cloud" className="top-[2%] right-[5%] w-24 h-24 opacity-90 md:left-[70%] md:right-auto md:w-40 md:h-40 absolute" />
          <Image src="/cloud-main/midCloud.png" alt="Cloud" className="hidden md:block md:top-[20%] md:right-[10%] md:w-56 md:h-28 opacity-95 absolute" />
          <Image src="/cloud-main/largecloud.png" alt="Cloud" className="hidden md:block md:top-[60%] md:left-[5%] md:w-64 md:h-32 opacity-80 absolute" />

          <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[95%] max-w-lg h-28 z-10 md:z-40 md:w-[55rem] md:h-[23rem] md:max-w-none">
            <Image src="/dsgt.png" alt="DSGT Footer" fill className="object-contain" />
          </div>

          <Image src="/cloud-main/dateCloud.png" alt="Cloud" className="hidden md:block bottom-[45%] left-[15%] w-64 h-32 opacity-95 absolute" />
          <Image src="/cloud-main/DSGTCloud.png" alt="Cloud" className="hidden md:block bottom-[40%] right-[5%] w-64 h-32 opacity-95 absolute" />

          {/* Hero Content - 1980s Arcade Typography */}
          <div className="relative z-10 flex flex-col items-center justify-center text-center px-4 mt-8 min-h-[60vh]">
            {/* Decorative retro glow burst */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[150%] h-[150%] bg-gradient-radial from-neon-pink/20 via-neon-cyan/10 to-transparent opacity-60 blur-3xl -z-10 pointer-events-none animate-pulse-slow"></div>

            <div className="-mt-4 md:-mt-8">
              <h2 className={`${pixel.className} text-4xl md:text-6xl font-bold text-neon-cyan drop-shadow-[0_0_10px_var(--neon-cyan)] mb-6 animate-fade-in-up`}>
                HACKLYTICS
              </h2>
              <h2 className={`${pixel.className} text-4xl md:text-6xl font-bold text-neon-pink drop-shadow-[0_0_10px_var(--neon-pink)] mb-6 animate-fade-in-up`}>
                2027
              </h2>

              {/* Arcade-style title */}
              <div className="relative">
                <h1
                  className="font-pixel text-7xl md:text-[120px] font-bold text-neon-green my-2 leading-[0.9] tracking-wider transition-transform duration-300 hover:scale-105 hover:-rotate-1 drop-shadow-[0_0_20px_rgba(57,255,20,0.8)] filter"
                  style={{ WebkitTextStroke: "2px #39ff14" }}
                >
                  ARCADE EDITION
                </h1>
              </div>
            </div>

            {/* Countdown */}
            <div className="mt-8 flex flex-col items-center">
              <Countdown targetDate={new Date("2026-02-20T23:59:59")} />
            </div>
          </div>
        </div>

        <HomeSections />
      </main>
    </>
  );
}
