"use client";
import Image from "next/image";
import React from "react";
import HomeSections from "@/components/HomeSections";
import { Truculenta } from "next/font/google";

const truculenta = Truculenta({
  subsets: ["latin"],
  weight: ["900"],
});

const Cloud: React.FC<{ src: string; className?: string }> = ({ src, className }) => (
  <div className={`absolute pointer-events-none ${className}`}>
    <Image src={src} alt="Decorative cloud" fill className="object-contain" />
  </div>
);

export default function HomePage() {
  return (
    <main className="relative w-full font-sans text-gray-800 overflow-hidden">
      {/* MLH Trust Badge */}
      <a
        id="mlh-trust-badge"
        href="https://mlh.io/na?utm_source=na-hackathon&utm_medium=TrustBadge&utm_campaign=2026-season&utm_content=white"
        target="_blank"
        className="absolute top-0 right-4 md:right-[50px] z-50 block w-[10%] max-w-[100px] min-w-[60px]"
      >
        <img
          src="https://s3.amazonaws.com/logged-assets/trust-badge/2026/mlh-trust-badge-2026-white.svg"
          alt="Major League Hacking 2026 Hackathon Season"
          className="w-full"
        />
      </a>

      {/* Hero Section */}
      <div className="relative w-full bg-sky overflow-hidden py-20 md:py-32">
        {/* Background Clouds */}
        <Cloud
          src="/cloud-main/smallCloud.png"
          className="top-[5%] left-[5%] w-32 h-20 opacity-90 md:w-72 md:h-40"
        />
        <Cloud
          src="/cloud-main/smallCloud.png"
          className="top-[2%] right-[5%] w-24 h-24 opacity-90 md:left-[70%] md:right-auto md:w-40 md:h-40"
        />
        <Cloud
          src="/cloud-main/midCloud.png"
          className="hidden md:block md:top-[20%] md:right-[10%] md:w-56 md:h-28 opacity-95"
        />
        <Cloud
          src="/cloud-main/largecloud.png"
          className="hidden md:block md:top-[60%] md:left-[5%] md:w-64 md:h-32 opacity-80"
        />

        {/* Bottom clouds - left */}
        <Cloud
          src="/cloud-main/cloudBottom.png"
          className="bottom-0 left-0 w-[50%] h-32 -translate-x-1/4 opacity-95 md:h-52"
        />
        <Cloud
          src="/cloud-main/cloudBottom.png"
          className="bottom-0 left-0 w-[75%] h-32 -translate-x-[25%] opacity-95 md:h-52"
        />

        {/* Bottom clouds - right */}
        <Cloud
          src="/cloud-main/cloudBottom.png"
          className="bottom-0 right-0 w-[50%] h-32 translate-x-1/4 opacity-95 md:h-52"
        />
        <Cloud
          src="/cloud-main/cloudBottom.png"
          className="bottom-0 right-0 w-[75%] h-32 translate-x-[25%] opacity-95 md:h-52"
        />

        {/* Candy images */}
        <div className="absolute bottom-0 left-[2%] w-28 h-28 z-30 md:left-[5%] md:w-60 md:h-60">
          <Image
            src="/cloud-main/candy/candyEnd.png"
            alt="Candy left"
            fill
            className="object-contain md:scale-150"
          />
        </div>
        <div className="absolute bottom-0 right-[2%] w-28 h-28 z-30 md:right-[5%] md:w-60 md:h-60">
          <Image
            src="/cloud-main/candy/candyEnd.png"
            alt="Candy right"
            fill
            className="object-contain md:scale-150"
          />
        </div>

        {/* DSGT image */}
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[95%] max-w-lg h-28 z-40 md:w-[55rem] md:h-[23rem] md:max-w-none">
          <Image
            src="/dsgt.png"
            alt="DSGT Footer"
            fill
            className="object-contain"
          />
        </div>

        {/* Floating date & DSGT clouds */}
        <Cloud
          src="/cloud-main/dateCloud.png"
          className="hidden md:block bottom-[45%] left-[20%] w-64 h-32 opacity-95"
        />
        <Cloud
          src="/cloud-main/DSGTCloud.png"
          className="hidden md:block bottom-[40%] right-[5%] w-64 h-32 opacity-95"
        />

        {/* Hero Content */}
        <div className="relative z-10 flex flex-col items-center justify-center text-center px-4 mt-8">
          <h2 className={`${truculenta.className} text-4xl md:text-6xl font-black leading-none tracking-normal`}>
            Hacklytics 2026:
          </h2>
          <h1
            className="font-willywonka text-8xl md:text-[150px] font-normal text-wonka-yellow my-3 leading-none tracking-normal"
            style={{ WebkitTextStroke: "1px #854d0e" }}
          >
            Golden Byte
          </h1>

          {/* Apply Now! Button */}
          <a href="https://form.typeform.com/to/ssQqAlXE">
            <button
              className={`${truculenta.className} bg-wonka-red text-white font-bold rounded-xl shadow-lg hover:bg-red-600 transition-transform hover:scale-100 mt-2 px-8 py-4 text-xl md:px-10 md:py-5 md:text-2xl`}
            >
              Apply Now!
            </button>
          </a>

          {/* Golden ticket placeholder */}
          <div className="mt-4 w-64 h-32 md:w-[480px] md:h-[240px] bg-transparent mx-auto"></div>
        </div>
      </div>

      <HomeSections />
    </main>
  );
}
