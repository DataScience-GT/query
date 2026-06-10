import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen text-center p-8 relative overflow-hidden">
      <div className="absolute top-[20%] left-[20%] w-[300px] h-[300px] bg-bloom-pink/20 rounded-full blur-[100px] pointer-events-none mix-blend-screen animate-pulse"></div>
      <div
        className="absolute bottom-[20%] right-[20%] w-[400px] h-[400px] bg-bloom-cyan/20 rounded-full blur-[120px] pointer-events-none mix-blend-screen animate-pulse"
        style={{ animationDelay: "1s" }}
      ></div>

      <div className="glass-panel p-12 relative z-10 max-w-2xl w-full">
        <h1 className="text-6xl md:text-8xl font-bold font-sans tracking-tighter mb-4 text-transparent bg-clip-text bg-gradient-to-r from-bloom-pink to-bloom-cyan bloom-text-glow">
          404
        </h1>
        <h2 className="text-xl md:text-3xl font-mono text-white mb-6 uppercase tracking-widest">
          Signal Lost
        </h2>
        <p className="text-gray-400 mb-10 font-mono text-sm leading-relaxed max-w-md mx-auto">
          The node you are looking for has disconnected from the mainframe or
          never existed.
        </p>
        <Link
          href="/"
          className="inline-flex items-center justify-center px-8 py-4 glass-panel text-white font-mono uppercase tracking-widest text-sm hover-bloom-glow transition-all duration-300"
        >
          Re-establish Connection
        </Link>
      </div>
    </div>
  );
}
