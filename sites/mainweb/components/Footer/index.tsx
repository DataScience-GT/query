// components/Footer/Footer.tsx
"use client";

import Image from "next/image";
import Link from "next/link";
import logo from "@/assets/images/dsgt/apple-touch-icon.png";

interface FooterProps {
  screen_width: number;
  className?: string;
}

const Footer = ({ screen_width, className = "" }: FooterProps) => {
  return (
    <footer
      className={`relative w-full py-20 bg-[#050505] border-t border-white/5 text-gray-400 font-sans ${className}`}
    >
      <div className="relative z-10 max-w-7xl mx-auto px-6 lg:px-12">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-12 lg:gap-8">

          {/* BRANDING COLUMN */}
          <div className="space-y-6">
            <div className="flex items-center gap-3">
              <Image src={logo} alt="DSGT Logo" className="h-8 w-8 rounded shadow-lg shadow-indigo-500/10" />
              <span className="text-white text-xl font-bold tracking-tighter uppercase italic">DSGT</span>
            </div>
            <p className="text-sm text-gray-500 leading-relaxed max-w-[240px]">
              The largest student-run data science organization at Georgia Tech.
            </p>
          </div>

          {/* COMPANY COLUMN */}
          <div className="flex flex-col space-y-4">
            <h2 className="text-white font-mono text-[10px] uppercase tracking-[0.3em] font-bold">Company</h2>
            <nav className="flex flex-col space-y-2 text-sm">
              <Link href="/team" className="hover:text-indigo-400 transition-colors">About the Team</Link>
              <Link href="mailto:hello@datasciencegt.org" className="hover:text-indigo-400 transition-colors">Contact</Link>
              <Link href="/bootcamp" className="hover:text-indigo-400 transition-colors">Bootcamp</Link>
            </nav>
          </div>

          {/* SOCIAL COLUMN */}
          <div className="flex flex-col space-y-4">
            <h2 className="text-white font-mono text-[10px] uppercase tracking-[0.3em] font-bold">Connect</h2>
            <nav className="flex flex-col space-y-2 text-sm">
              <a href="https://github.com/DataScience-GT" target="_blank" rel="noopener noreferrer" className="hover:text-indigo-400 transition-colors">Github</a>
              <a href="https://www.linkedin.com/company/dsgt/" target="_blank" rel="noopener noreferrer" className="hover:text-indigo-400 transition-colors">LinkedIn</a>
              <a href="https://www.instagram.com/datasciencegt/" target="_blank" rel="noopener noreferrer" className="hover:text-indigo-400 transition-colors">Instagram</a>
              <a href="mailto:hello@datasciencegt.org" className="hover:text-indigo-400 transition-colors">Email List</a>
            </nav>
          </div>

          {/* TECH TEAM CREDIT */}
          <div className="flex flex-col space-y-4">
            <h2 className="text-white font-mono text-[10px] uppercase tracking-[0.3em] font-bold">System</h2>
            <div className="p-4 rounded border border-white/5 bg-white/[0.02]">
              <p className="text-[11px] font-mono text-gray-500 leading-relaxed italic">
                {">"} Built with precision by the <span className="text-indigo-400 font-bold">DSGT Tech Team</span>.
                <br />
                {">"} Node: ATL_GT_V4
              </p>
            </div>
          </div>

        </div>

        {/* BOTTOM COPYRIGHT */}
        <div className="mt-20 pt-8 border-t border-white/5 flex flex-col md:flex-row justify-between gap-4">
          <p className="text-[10px] font-mono text-gray-600 uppercase tracking-widest">
            © 2025 Data Science at Georgia Tech
          </p>
          <div className="flex gap-6">
            <span className="text-[10px] font-mono text-gray-700 uppercase tracking-tighter">Lat: 33.7756° N</span>
            <span className="text-[10px] font-mono text-gray-700 uppercase tracking-tighter">Lon: 84.3963° W</span>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;