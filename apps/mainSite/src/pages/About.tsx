import React, { useState, useEffect } from "react";
import { Navbar, Section, Footer } from "../components";

// ✅ Fixed import path
import Archie from "../assets/images/portraits/2024/Archie.jpg";

const About: React.FC = () => {
  const [windowWidth, setWindowWidth] = useState<number>(
    typeof window !== "undefined" ? window.innerWidth : 1024
  );

  useEffect(() => {
    const handle = () => setWindowWidth(window.innerWidth);
    window.addEventListener("resize", handle);
    return () => window.removeEventListener("resize", handle);
  }, []);

  return (
    <div id="about-page" className="relative min-h-screen">
      <Navbar screen_width={windowWidth} />

      <main className="relative z-10 pt-[80px]">
        <div className="px-6 py-8">
          <h1 className="text-4xl font-bold">Meet The Team</h1>
          <p className="mt-2 text-gray-600">The people who make DSGT what it is</p>
        </div>

        <Section id="teams" makefull>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-10 px-5 max-w-7xl mx-auto">
            <div className="p-4 bg-white rounded shadow">
              <img
                src={Archie}
                alt="Archie"
                className="w-full h-48 object-cover rounded"
              />
              <h3 className="font-bold mt-3">Archie Goli</h3>
              <p className="text-sm text-gray-600">President</p>
            </div>
          </div>
        </Section>

        <Footer screen_width={windowWidth} />
      </main>
    </div>
  );
};

export default About;
