"use client";
import Image from "next/image";
import { FaInstagram } from "react-icons/fa";

export default function Home() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-tr from-[#3b82f6] to-[#ec8b87]">
      <div className="bg-white rounded-3xl shadow-2xl px-8 py-12 max-w-xl w-full flex flex-col items-center">
        <Image
          src="/logo.png"
          alt="Hacklytics Logo"
          width={80}
          height={80}
          className="mb-8 rounded-full"
        />
        <h1 className="text-4xl md:text-5xl font-bold text-gray-800 text-center mb-4">
          Hacklytics 2026
        </h1>
        <div className="text-2xl text-gray-600 font-semibold mb-6 text-center">
          Feb 20–22, 2026
        </div>
        <div className="text-3xl font-extrabold text-cyan-900 mb-6 text-center">
          sign up for info!
        </div>
        <div className="w-full flex flex-col items-center mb-8">
          <button
            onClick={() =>
              window.open("https://7px1lai8dh3.typeform.com/to/ssQqAlXE", "_blank")
            }
            className="w-full md:w-auto px-8 py-3 bg-cyan-900 text-white font-semibold rounded-full shadow-md hover:bg-cyan-800 transition"
          >
            Sign up via Typeform
          </button>
        </div>
        <div className="flex space-x-6 mt-4">
          <a href="https://www.instagram.com/hacklytics/" target="_blank" rel="noopener noreferrer">
          <Image src="/instagram-logo.svg" alt="Website" width={32} height={32} className="text-3xl text-gray-800 hover:text-cyan-900 transition" />
          </a>
          <a href="https://datasciencegt.org/" target="_blank" rel="noopener noreferrer">
            <Image src="/globe.svg" alt="Website" width={32} height={32} className="text-3xl text-gray-800 hover:text-cyan-900 transition" />
          </a>
        </div>
      </div>
      <a
        id="mlh-trust-badge"
        href="https://mlh.io/na?utm_source=na-hackathon&utm_medium=TrustBadge&utm_campaign=2026-season&utm_content=white"
        target="_blank"
        style={{
          display: 'block',
          maxWidth: '100px',
          minWidth: '60px',
          position: 'fixed',
          right: '50px',
          top: 0,
          width: '10%',
          zIndex: 10000,
        }}
      >
        <img
          src="https://s3.amazonaws.com/logged-assets/trust-badge/2026/mlh-trust-badge-2026-white.svg"
          alt="Major League Hacking 2026 Hackathon Season"
          style={{ width: '100%' }}
        />
      </a>
    </div>
  );
}
