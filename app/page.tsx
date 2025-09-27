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
  <div className={`absolute ${className}`}>
    <Image src={src} alt="Decorative cloud" fill className="object-contain" />
  </div>
);

export default function HomePage() {
  return (
    <main className="relative w-full font-sans text-gray-800">
      {/* MLH Trust Badge */}
      <a
        id="mlh-trust-badge"
        href="https://mlh.io/na?utm_source=na-hackathon&utm_medium=TrustBadge&utm_campaign=2026-season&utm_content=white"
        target="_blank"
        className="absolute top-0 right-[50px] z-50 block w-[10%] max-w-[100px] min-w-[60px]"
      >
        <img
          src="https://s3.amazonaws.com/logged-assets/trust-badge/2026/mlh-trust-badge-2026-white.svg"
          alt="Major League Hacking 2026 Hackathon Season"
          className="w-full"
        />
      </a>

      {/* Hero Section */}
      <div className="relative w-full bg-sky overflow-hidden py-32">
        {/* Background Clouds */}
        <Cloud src="/cloud-main/smallCloud.png" className="top-[5%] left-[5%] w-72 h-40 opacity-90" />

        <Cloud src="/cloud-main/smallCloud.png" className="top-[5%] left-[70%] w-40 h-40 opacity-90" />
        <Cloud src="/cloud-main/midCloud.png" className="top-[20%] right-[10%] w-56 h-28 opacity-95" />

        <Cloud src="/cloud-main/largecloud.png" className="top-[60%] left-[5%] w-64 h-32 opacity-80" />

        {/* Bottom clouds */}
        <Cloud
          src="/cloud-main/cloudBottom.png"
          className="bottom-0 left-0 w-2/3 h-52 -translate-x-1/4 opacity-95"
        />
        <Cloud
          src="/cloud-main/cloudBottom.png"
          className="bottom-0 right-0 w-2/3 h-52 translate-x-1/4 opacity-95"
        />

        {/* Candy images anchored to bottom */}
        <div className="absolute bottom-0 left-[5%] w-60 h-60 z-30">
          <Image
            src="/cloud-main/candy/candyEnd.png"
            alt="Candy left"
            fill
            className="object-contain scale-150"
          />
        </div>
        <div className="absolute bottom-0 right-[5%] w-60 h-60 z-30">
          <Image
            src="/cloud-main/candy/candyEnd.png"
            alt="Candy right"
            fill
            className="object-contain scale-150"
          />
        </div>

        {/* DSGT image at the very bottom - INCREASED SIZE */}
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[60rem] h-120 z-40">
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
        className="bottom-[50%] left-[20%] w-64 h-32 opacity-95"
        />
        <Cloud
        src="/cloud-main/DSGTCloud.png"
        className="bottom-[40%] right-[5%] w-64 h-32 opacity-95"
      />

        {/* Hero Content */}
        <div className="relative z-10 flex flex-col items-center justify-center text-center px-4 mt-8">
          <h2 className={`${truculenta.className} text-6xl font-black leading-none tracking-normal`}>
            Hacklytics 2026:
          </h2>
          <h1
            className="font-willywonka text-[150px] font-normal text-wonka-yellow my-3 leading-none tracking-normal"
            style={{ WebkitTextStroke: "2px #854d0e" }}
          >
            Golden Byte
          </h1>

          {/* Apply Now! Button (185x67) with Truculenta font */}
          <a href="https://www.instagram.com/p/DNiRD-GNXh0/">
          <button
            className={`${truculenta.className} bg-wonka-red text-white font-bold rounded-xl shadow-lg hover:bg-red-600 transition-transform hover:scale-105 mt-2`}
            style={{ width: "185px", height: "67px", fontSize: "20px" }}
            >
            Apply Now!
            </button>
            </a>



          {/* Golden ticket placeholder */}
          <div className="mt-4 w-48 sm:w-64 md:w-[480px] h-[480px] bg-transparent mx-auto"></div>
        </div>
      </div>

      <HomeSections />
    </main>
  );
}
