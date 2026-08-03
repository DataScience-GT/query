import Link from "next/link";
import PixelSprite from "../components/pixel/PixelSprite";
import { PixelFloraRow } from "../components/pixel/PixelBits";
import { MUSHROOM } from "../components/pixel/sprites";

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen text-center p-8 relative overflow-hidden bg-[#020204]">
      
      {/* Background ambient light */}
      <div className="absolute top-[20%] left-[20%] w-[300px] h-[300px] bg-bloom-pink/10 rounded-full blur-[100px] pointer-events-none mix-blend-screen animate-pulse duration-10000" />
      <div
        className="absolute bottom-[20%] right-[20%] w-[400px] h-[400px] bg-bloom-cyan/10 rounded-full blur-[120px] pointer-events-none mix-blend-screen animate-pulse duration-7000"
        style={{ animationDelay: "1s" }}
      />

      {/* Content Card */}
      <div className="pixel-frame pixel-pink p-12 md:p-20 relative z-10 max-w-2xl w-full bg-white/[0.03]">
        
        <div className="flex flex-col items-center justify-center gap-6"><PixelSprite map={MUSHROOM} palette="pink" scale={5} glow className="animate-bob" />
          <h1 className="text-[6rem] md:text-[8rem] font-medium font-sans tracking-[-0.03em] leading-none text-white mix-blend-plus-lighter">
            404
          </h1>
          
          <div className="h-[1px] w-12 bg-white/20" />
          
          <h2 className="font-pixel text-sm md:text-base neon-pink">
            Signal Lost
          </h2>
          
          <p className="text-white/40 mb-10 font-sans text-lg font-light leading-[1.6] max-w-sm mx-auto">
            The node you are looking for has disconnected from the mainframe or
            never existed.
          </p>
          
          <Link
            href="/"
            className="pixel-btn inline-flex items-center justify-center px-10 py-4 font-pixel text-xs"
          >
            RETURN HOME
          </Link>
        </div>
      </div>

      {/* pixel flower bed along the bottom */}
      <div className="absolute bottom-0 left-0 right-0 z-10 pointer-events-none">
        <PixelFloraRow seed={4} count={11} />
      </div>
    </div>
  );
}
