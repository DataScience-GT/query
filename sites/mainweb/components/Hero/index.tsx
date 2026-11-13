// src/components/Hero.tsx
import Image from "next/image";
import Link from "next/link";
import Mini from "../Text/Mini";

import type { BootcampSession } from "@/lib/bootcamp-sessions.server";
import { eventDateParts, sessionTitle } from "@/lib/public-events";

import hero3 from "@/assets/images/blobs/hero3--export.svg";
import hero2mobile from "@/assets/images/blobs/hero2-mobile--export.svg";
import herologo from "@/assets/images/dsgt/square-logo.png";

function NextSession({ session }: { session: BootcampSession }) {
  const { weekday, month, day, time } = eventDateParts(session.eventDate);
  const heading = session.bootcampWeek
    ? `Week ${session.bootcampWeek}: ${sessionTitle(session.title)}`
    : sessionTitle(session.title);

  return (
    <>
      <p className="text-lg font-semibold leading-snug text-white">{heading}</p>
      <p className="mt-1 text-sm text-gray-300">
        {weekday.slice(0, 3)}, {month} {day} · {time}
        {session.location ? ` · ${session.location}` : ""}
      </p>
    </>
  );
}

function NoSession() {
  return (
    <p className="text-lg font-semibold leading-snug text-white">
      Bootcamp meets weekly during the semester.{" "}
      <Link
        href="/bootcamp"
        className="whitespace-nowrap text-dsgt-teal transition-colors hover:text-white"
      >
        See the schedule →
      </Link>
    </p>
  );
}

const Hero = ({ nextSession }: { nextSession: BootcampSession | null }) => {
  return (
    <section
      id="hero"
      className="relative w-full min-h-screen py-24 flex items-center justify-center px-8 overflow-hidden bg-[#050505]"
    >
      {/* CSS picks the blob so the server HTML is already right at every width. */}
      <div className="absolute inset-0 z-0">
        <Image
          src={hero3}
          alt="background"
          fill
          className="hidden min-[1000px]:block object-cover object-right opacity-40"
          priority
        />
        <Image
          src={hero2mobile}
          alt="background"
          fill
          className="min-[1000px]:hidden object-cover object-right opacity-40"
          priority
        />
      </div>

      <div className="relative z-10 w-full max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-12">
        {/* Left Content */}
        <div className="flex flex-col justify-center items-start w-full md:w-3/5 space-y-6">
          <h1
            className="text-5xl md:text-7xl lg:text-8xl font-black uppercase tracking-tighter leading-[0.85] text-transparent"
            style={{ WebkitTextStroke: "1.5px rgba(255,255,255,0.8)" }}
          >
            Data Science
            <br />
            <span className="text-white" style={{ WebkitTextStroke: "0" }}>
              @ GT
            </span>
          </h1>

          <div className="max-w-md">
            <Mini className="text-gray-400 text-lg leading-relaxed">
              The largest student-run data science organization at Georgia Tech.
              We bridge the gap between classroom theory and production
              engineering.
            </Mini>
          </div>

          <dl className="grid w-full max-w-xl grid-cols-1 gap-6 border-t-2 border-dsgt-teal pt-5 sm:grid-cols-[auto_1fr] sm:gap-10">
            <div>
              <dt className="font-mono text-[11px] uppercase tracking-[0.2em] text-gray-400">
                Verified members
              </dt>
              <dd className="mt-2 text-3xl font-bold leading-none tracking-tight text-white tabular-nums">
                550+
              </dd>
            </div>
            <div>
              <dt className="font-mono text-[11px] uppercase tracking-[0.2em] text-gray-400">
                Next bootcamp session
              </dt>
              <dd className="mt-2">
                {nextSession ? (
                  <NextSession session={nextSession} />
                ) : (
                  <NoSession />
                )}
              </dd>
            </div>
          </dl>
        </div>

        {/* Right Logo */}
        <div className="hidden md:flex md:w-1/3 justify-center md:justify-end">
          <Image
            src={herologo}
            alt="DSGT logo"
            width={300}
            height={300}
            className="w-48 h-48 md:w-72 md:h-72 object-contain"
          />
        </div>
      </div>
    </section>
  );
};

export default Hero;
