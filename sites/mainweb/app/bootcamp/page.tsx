"use client";

import { useState, useEffect } from "react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import Background from "@/components/Background";

export default function BootcampPage() {
    const [windowWidth, setWindowWidth] = useState<number>(1024);

    useEffect(() => {
        const handleResize = () => setWindowWidth(window.innerWidth);
        setWindowWidth(window.innerWidth);
        window.addEventListener("resize", handleResize);
        return () => window.removeEventListener("resize", handleResize);
    }, []);

    return (
        <div className="relative min-h-screen bg-[#050505] text-gray-400 font-sans selection:bg-[#00A8A8]/30">
            <Background className="fixed inset-0 z-0 opacity-[0.05]" />

            <Navbar
                screen_width={windowWidth}
                page="bootcamp"
                className="fixed top-0 z-50 border-b border-white/5 bg-[#050505]/80 backdrop-blur-md"
            />

            <main className="relative z-10 pt-40 pb-20 px-6 lg:px-12 max-w-7xl mx-auto text-center">
                <div className="space-y-6">
                    <h1 className="text-white text-5xl md:text-7xl font-bold tracking-tighter italic uppercase">
                        Data Science <br />
                        <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#00A8A8] to-[#006e6e] not-italic">Bootcamp.</span>
                    </h1>
                    <p className="text-lg text-gray-400 leading-relaxed max-w-2xl mx-auto italic">
                        Our comprehensive curriculum takes you from Python basics to advanced machine learning models.
                        Applications for Spring 2026 are currently closed.
                    </p>

                    <div className="pt-10">
                        <div className="inline-block border border-[#00A8A8]/30 bg-[#00A8A8]/5 px-8 py-4 rounded-lg">
                            <p className="font-mono text-[#00A8A8] text-xs uppercase tracking-[0.2em]">Curriculum Under Revision</p>
                        </div>
                    </div>
                </div>
            </main>

            <Footer screen_width={windowWidth} className="fixed bottom-0 z-10" />
        </div>
    );
}
