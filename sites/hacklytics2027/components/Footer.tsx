"use client";
import Link from "next/link";

export default function Footer() {
  return (
    <footer className="relative z-10 w-full border-t border-white/10 bg-black/40 backdrop-blur-md">
      <div className="max-w-7xl mx-auto px-6 py-8 flex flex-col md:flex-row justify-between items-center gap-4">
        {/* Nav links */}
        <nav className="flex flex-wrap gap-6 text-gray-400 text-xs font-mono tracking-widest uppercase">
          <Link
            href="mailto:hello@hacklytics.io"
            className="hover:text-bloom-cyan transition-colors duration-200"
          >
            Contact Us
          </Link>
          <Link
            href="https://instagram.com/dsgt"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-bloom-pink transition-colors duration-200"
          >
            Instagram
          </Link>
          <Link
            href="https://linkedin.com/company/dsgt"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-bloom-purple transition-colors duration-200"
          >
            LinkedIn
          </Link>
          <Link
            href="https://datasciencegt.org"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-bloom-lime transition-colors duration-200"
          >
            DSGT
          </Link>
          <Link
            href="https://static.mlh.io/docs/mlh-code-of-conduct.pdf"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-bloom-cyan transition-colors duration-200 border border-white/20 hover:border-bloom-cyan px-3 py-1 rounded-sm"
          >
            MLH Code of Conduct
          </Link>
        </nav>

        {/* Credit */}
        <p className="text-gray-600 text-xs font-mono tracking-wide">
          Made with{" "}
          <span className="text-bloom-pink animate-pulse">♥</span>{" "}
          by{" "}
          <span className="text-white font-bold">DSGT Tech</span>
        </p>
      </div>
    </footer>
  );
}
