import React from 'react';
import Image from 'next/image';
import Link from 'next/link';

const SponsorsSection: React.FC = () => {
  return (
    <section
      id="sponsors"
      className="relative bg-[#A4C7FF] overflow-hidden flex flex-col justify-between"
    >
      {/* Main content */}
      <div className="container mx-auto px-6 pt-20 md:pt-32 flex flex-col items-center text-center z-10">
        <h1 className="text-5xl md:text-6xl font-extrabold text-white mb-6 tracking-wide">
          Sponsors
        </h1>
        <p className="text-white text-lg md:text-xl max-w-3xl">
          We’re proud to be supported by our amazing sponsors! Learn more about the organizations powering DSGT Hacklytics 2026.
        </p>
      </div>

      {/* Bottom clouds - overlapping */}
      <div className="relative w-full h-52 md:h-64 flex justify-center items-end mt-16">
        {/* Left cloud */}
        <div className="absolute left-0 bottom-0 z-10 w-2/3 h-full md:w-[800px] -translate-x-1/4">
          <Image
            src="/cloud-final/image.png"
            alt="Cloud left"
            fill
            className="object-cover object-bottom"
            priority
          />
        </div>

        {/* Center cloud */}
        <div className="absolute bottom-0 z-20 w-full h-full md:w-[800px]">
          <Image
            src="/cloud-final/image.png"
            alt="Cloud center"
            fill
            className="object-cover object-bottom"
            priority
          />
        </div>

        {/* Right cloud */}
        <div className="absolute right-0 bottom-0 z-10 w-2/3 h-full md:w-[800px] translate-x-1/4">
          <Image
            src="/cloud-final/image.png"
            alt="Cloud right"
            fill
            className="object-cover object-bottom"
            priority
          />
        </div>

        {/* Overlay links and credit ON TOP of clouds */}
        <div className="absolute bottom-2 left-0 right-0 z-30 flex flex-col md:flex-row justify-center items-center md:justify-between px-6 md:bottom-4 drop-shadow-md">
          {/* Left side links stacked vertically */}
          <div className="flex flex-col space-y-2 text-stone-800 text-sm md:text-base text-center md:text-left">
            {/* Connect With Us */}
            <div className="flex flex-wrap gap-x-2 items-center justify-center md:justify-start">
              <span className="font-bold">Connect With Us:</span>
              <Link href="#" className="underline hover:text-gray-900">Instagram</Link>
              <span>|</span>
              <Link href="#" className="underline hover:text-gray-900">LinkedIn</Link>
              <span>|</span>
              <Link href="#" className="underline hover:text-gray-900">Facebook</Link>
            </div>

            {/* Resources */}
            <div className="flex flex-wrap gap-x-2 items-center justify-center md:justify-start">
              <span className="font-bold">Resources:</span>
              <Link href="#" className="underline hover:text-gray-900">DSGT Website</Link>
              <span>|</span>
              <Link href="#" className="underline hover:text-gray-900">DSGT GitHub</Link>
              <span>|</span>
              <Link href="#" className="underline hover:text-gray-900">MLH Code of Conduct</Link>
            </div>
          </div>

          {/* Right side credit */}
          <div className="mt-4 md:mt-0 text-center md:text-right text-stone-800 text-sm md:text-base">
            <p className="font-bold">
              Made with <span className="text-red-500">💖</span> by the DSGT Tech and Marketing Teams
            </p>
          </div>
        </div>
      </div>
    </section>
  );
};

export default SponsorsSection;

