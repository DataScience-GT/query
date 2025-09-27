import React from 'react';
import Image from 'next/image';
import Link from 'next/link';

const SponsorsSection: React.FC = () => {
  return (
    <section
      id="sponsors"
      className="relative bg-[#A4C7FF] overflow-hidden min-h-screen flex flex-col justify-between"
    >
      {/* Main content */}
      <div className="container mx-auto px-6 pt-32 flex flex-col items-center text-center z-10">
        <h1 className="text-5xl md:text-6xl font-extrabold text-white mb-6 tracking-wide">
          Sponsors
        </h1>
        <p className="text-white text-lg md:text-xl max-w-3xl">
          We’re proud to be supported by our amazing sponsors! Learn more about the organizations powering DSGT Hacklytics 2026.
        </p>
      </div>

      {/* Bottom clouds - overlapping */}
      <div className="relative w-full h-36 md:h-48 flex justify-center items-end">
        {/* Left cloud */}
        <div className="absolute left-0 bottom-0 z-10 -translate-x-1/8">
          <Image
            src="/cloud-final/image.png"
            alt="Cloud left"
            width={800}
            height={200}
            className="object-contain"
            priority
          />
        </div>

        {/* Center cloud */}
        <div className="absolute bottom-0 z-20">
          <Image
            src="/cloud-final/image.png"
            alt="Cloud center"
            width={800}
            height={200}
            className="object-contain"
            priority
          />
        </div>

        {/* Right cloud */}
        <div className="absolute right-0 bottom-0 z-10 translate-x-1/8">
          <Image
            src="/cloud-final/image.png"
            alt="Cloud right"
            width={800}
            height={200}
            className="object-contain"
            priority
          />
        </div>

        {/* Overlay links and credit ON TOP of clouds with background */}
        <div className="absolute bottom-6 left-0 right-0 z-30 flex flex-col md:flex-row justify-between items-start md:items-center px-6 bg-[#A4C7F] bg-opacity-90 py-4 rounded-md">
          {/* Left side links stacked vertically */}
          <div className="flex flex-col space-y-4 text-black">
            {/* Connect With Us */}
            <div className="flex space-x-2 items-center">
              <span className="font-medium">Connect With Us:</span>
              <Link href="#" className="underline hover:text-gray-700">Instagram</Link>
              <span>|</span>
              <Link href="#" className="underline hover:text-gray-700">LinkedIn</Link>
              <span>|</span>
              <Link href="#" className="underline hover:text-gray-700">Facebook</Link>
            </div>

            {/* Resources */}
            <div className="flex space-x-2 items-center">
              <span className="font-medium">Resources:</span>
              <Link href="#" className="underline hover:text-gray-700">DSGT Website</Link>
              <span>|</span>
              <Link href="#" className="underline hover:text-gray-700">DSGT GitHub</Link>
              <span>|</span>
              <Link href="#" className="underline hover:text-gray-700">MLH Code of Conduct</Link>
            </div>
          </div>

          {/* Right side credit */}
          <div className="mt-4 md:mt-0 text-right text-black">
            <p className="font-medium">
              Made with <span className="text-red-500">💖</span> by the DSGT Tech and Marketing Teams
            </p>
          </div>
        </div>
      </div>
    </section>
  );
};

export default SponsorsSection;
