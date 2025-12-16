// components/Footer/Footer.tsx
"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";

import logo from "@/assets/images/dsgt/apple-touch-icon.png";
import footerBlob from "@/assets/images/blobs/footer--export.svg";
import footerBlobMobile from "@/assets/images/blobs/footer-mobile2--export.svg";

interface FooterProps {
  screen_width: number;
  className?: string;
}

const Footer = ({ screen_width, className = "" }: FooterProps) => {
  const [windowWidth, setWindowWidth] = useState(screen_width || 0);
  const WIDTH_THRESHOLD = 1000;

  useEffect(() => {
    setWindowWidth(screen_width);
  }, [screen_width]);

  return (
    <div
      className={`relative w-full flex flex-wrap pt-20 min-h-[300px] bg-gray-900 text-black ${className}`}
    >
      <Image
        src={windowWidth >= WIDTH_THRESHOLD ? footerBlob : footerBlobMobile}
        alt="footer blob"
        className="absolute w-full h-full top-0 left-0 object-cover"
      />

      <div className="relative w-full max-w-[1600px] mx-auto flex flex-wrap justify-around items-start gap-8 px-6">
        <div className="flex flex-wrap items-center gap-4 p-5">
          <Image src={logo} alt="DSGT Logo" className="h-10 w-auto" />
          <h1 className="text-2xl font-bold">DSGT</h1>
        </div>

        <div className="flex flex-col items-start p-5">
          <h2 className="font-bold text-lg pb-1">Company</h2>
          <Link href="/about" className="pl-4 font-medium hover:underline">
            About Us
          </Link>
          <Link
            href="mailto:hello@datasciencegt.org"
            className="pl-4 font-medium hover:underline"
          >
            Contact
          </Link>
        </div>

        <div className="flex flex-col items-start p-5">
          <h2 className="font-bold text-lg pb-1">Connect with Us</h2>
          <Link
            href="mailto:hello@datasciencegt.org"
            className="pl-4 font-medium hover:underline"
          >
            Email
          </Link>
          <a
            href="https://www.instagram.com/datasciencegt/"
            target="_blank"
            rel="noopener noreferrer"
            className="pl-4 font-medium hover:underline"
          >
            Instagram
          </a>
          <a
            href="https://www.facebook.com/datasciencegt/"
            target="_blank"
            rel="noopener noreferrer"
            className="pl-4 font-medium hover:underline"
          >
            Facebook
          </a>
          <a
            href="https://www.linkedin.com/company/dsgt/"
            target="_blank"
            rel="noopener noreferrer"
            className="pl-4 font-medium hover:underline"
          >
            LinkedIn
          </a>
          <a
            href="https://github.com/DataScience-GT"
            target="_blank"
            rel="noopener noreferrer"
            className="pl-4 font-medium hover:underline"
          >
            Github
          </a>
        </div>

        <div className="flex flex-col items-start p-5 max-w-[300px]">
          <h2 className="font-bold text-lg">
            Made with 💖 by the DSGT Tech Team.
          </h2>
        </div>
      </div>
    </div>
  );
};

export default Footer;
