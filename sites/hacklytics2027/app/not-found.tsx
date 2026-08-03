import Link from "next/link";

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
      <div className="p-12 md:p-20 relative z-10 max-w-2xl w-full rounded-[2rem] border border-white/[0.05] bg-white/[0.02] backdrop-blur-2xl shadow-[0_0_40px_rgba(0,0,0,0.5)]">
        
        <div className="flex flex-col items-center justify-center gap-6">
          <h1 className="text-[6rem] md:text-[8rem] font-medium font-sans tracking-[-0.03em] leading-none text-white mix-blend-plus-lighter">
            404
          </h1>
          
          <div className="h-[1px] w-12 bg-white/20" />
          
          <h2 className="text-xl md:text-2xl font-sans font-light text-white/70 tracking-widest">
            Signal Lost
          </h2>
          
          <p className="text-white/40 mb-10 font-sans text-lg font-light leading-[1.6] max-w-sm mx-auto">
            The node you are looking for has disconnected from the mainframe or
            never existed.
          </p>
          
          <Link
            href="/"
            className="inline-flex items-center justify-center px-10 py-4 font-sans font-medium text-sm tracking-widest text-black bg-white rounded-full overflow-hidden hover:scale-105 transition-transform duration-500 shadow-[0_0_40px_rgba(255,255,255,0.2)]"
          >
            RETURN HOME
          </Link>
        </div>
      </div>
    </div>
  );
}
