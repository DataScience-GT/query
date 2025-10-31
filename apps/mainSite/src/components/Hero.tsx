import React from "react";

interface HeroProps { screen_width?: number }

const Hero: React.FC<HeroProps> = () => {
  return (
    <section id="hero" className="w-full h-96 flex items-center justify-center bg-gray-800 text-white">
      <div className="text-center">
        <h1 className="text-4xl font-bold">Data Science @ Georgia Tech</h1>
        <p className="mt-3">The largest student-run data science organization at Georgia Tech.</p>
      </div>
    </section>
  );
};

export default Hero;
