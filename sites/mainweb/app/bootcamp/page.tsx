"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import PublicFrame from "@/components/PublicFrame";
import {
  BOOTCAMP_CURRICULUM,
  BOOTCAMP_START_DATE,
} from "@/lib/bootcamp-schedule";

const curriculum = BOOTCAMP_CURRICULUM;

export default function BootcampPage() {
  const [windowWidth, setWindowWidth] = useState<number>(1024);

  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    setWindowWidth(window.innerWidth);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  return (
    <PublicFrame note="12 weeks · Sep 22">
      <div className="relative min-h-screen">
        <Navbar screen_width={windowWidth} page="bootcamp" />

        <main className="relative z-10 pt-40 pb-24 px-6 lg:px-12 max-w-7xl mx-auto">
          <div className="space-y-6 mb-16 max-w-3xl">
            <p className="public-kicker">Python for data science</p>
            <h1 className="public-display text-5xl md:text-7xl">
              Twelve weeks. One notebook you can actually finish.
            </h1>
            <p className="public-lede">
              From fundamentals to machine learning. The syllabus a member sees
              signed in is the one advertised here.
            </p>
            {BOOTCAMP_START_DATE && (
              <p className="public-kicker">Starts {BOOTCAMP_START_DATE}</p>
            )}
          </div>

          {curriculum.length === 0 ? (
            <div className="public-card max-w-2xl p-10">
              <p className="public-kicker mb-3">Updating soon</p>
              <p className="public-lede">
                The week-by-week syllabus is being written now and will be
                posted here before the first session.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {curriculum.map((item) => (
                <div key={item.week} className="public-card p-6 flex flex-col">
                  <p className="public-kicker mb-4">Week {item.week}</p>
                  <h3 className="public-display text-xl mb-2">{item.title}</h3>
                  <p className="text-sm leading-relaxed">{item.desc}</p>
                </div>
              ))}
            </div>
          )}

          <div className="mt-20">
            <Link href="/login" className="public-btn">
              Apply for the next cohort
            </Link>
            <p className="mt-4 public-kicker">Spots are limited</p>
          </div>
        </main>

        <Footer screen_width={windowWidth} />
      </div>
    </PublicFrame>
  );
}
