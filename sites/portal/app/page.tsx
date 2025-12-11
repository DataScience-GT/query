"use client";

import Link from "next/link";
import Image from "next/image";

export default function LandingPage() {
  return (
    <main className="min-h-screen flex flex-col md:flex-row items-center justify-between px-8 md:px-16 bg-gray-900 relative">

      <div className="flex flex-col max-w-xl text-center md:text-left space-y-6 md:space-y-8">
        <h1 className="text-4xl md:text-5xl font-extrabold leading-tight text-white">
          The Official Platform for DSGT: <span className="text-blue-500">Cerebra</span>.
        </h1>

        <p className="text-gray-300 text-lg md:text-xl">
          <span className="font-bold">Cerebra</span> serves as the central digital platform for the Georgia Tech Data Science Organization. Seamlessly manage your membership, RSVP for all events, track ongoing projects, and connect instantly with the integrated DSGT community.
        </p>

        <div className="flex flex-col sm:flex-row gap-4 mt-4">
          <Link
            href="/login"
            className="px-8 py-3 rounded-lg bg-blue-600 text-white font-semibold text-lg hover:bg-blue-500 transition duration-300 shadow-lg"
          >
            Access Cerebra
          </Link>

          <Link
            href="/website"
            className="px-8 py-3 rounded-lg border-2 border-blue-500 text-blue-500 font-semibold text-lg hover:bg-blue-500 hover:text-white transition duration-300"
          >
            Go to DSGT Website
          </Link>
        </div>
      </div>

      <div className="relative w-full max-w-md md:max-w-lg aspect-square mt-12 md:mt-0 mx-auto md:mx-0">
        <Image
          src="/images/apple-touch-icon.png"
          alt="DSGT Cerebra Platform Illustration"
          fill
          className="object-contain rounded-xl shadow-lg hover:-translate-y-1 hover:scale-105 transition-transform duration-300"
        />
      </div>
    </main>
  );
}
