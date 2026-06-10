"use client";
import { useState } from "react";

export default function CodeOfConductFooter() {
  const [open, setOpen] = useState(false);
  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end">
      {open && (
        <div className="mb-4 glass-panel p-6 max-w-md w-[90vw] md:w-[450px] text-xs md:text-sm text-gray-300 animate-fade-in">
          <div className="flex justify-between items-center mb-4 border-b border-white/10 pb-3">
            <span className="font-bold text-bloom-cyan tracking-widest uppercase font-mono">
              MLH Code of Conduct
            </span>
            <button
              className="text-gray-400 hover:text-white text-xl font-bold ml-2 focus:outline-none transition-colors"
              onClick={() => setOpen(false)}
              aria-label="Close Code of Conduct"
            >
              ×
            </button>
          </div>
          <div className="overflow-y-auto max-h-[60vh] pr-4 custom-scrollbar font-sans leading-relaxed">
            <strong className="text-white block mb-4">
              TL;DR. Be respectful. Harassment and abuse are never tolerated. If
              you are in a situation that makes you uncomfortable at an MLH
              Member Event, if the event itself creates an unsafe or
              inappropriate environment, or if interacting with an MLH
              representative or event organizer makes you uncomfortable, please
              report it using the procedures included in this document.
            </strong>

            <p className="mb-4">
              Major League Hacking (MLH) stands for inclusivity. We believe that
              every single person has the right to hack in a safe and welcoming
              environment.
            </p>

            <p className="mb-4">
              Harassment includes but is not limited to offensive verbal or
              written comments related to gender, age, sexual orientation,
              disability, physical appearance, body size, race, religion, social
              class, economic status, and veteran status. Additional cases of
              harassment include but are not limited to sharing sexual images,
              violent depictions, vulgar language, deliberate intimidation,
              stalking, following, brigading, doxxing, harassing photography or
              recording, sustained disruption of talks or other events,
              inappropriate physical contact, and unwelcome sexual attention.
            </p>

            <p className="mb-4">
              In particular, attendees should not use sexualized images,
              activities, or other material both in their hacks and during the
              event. Booth staff (including volunteers) should not use
              sexualized clothing/uniforms/costumes or otherwise create a
              sexualized environment.
            </p>

            <p className="mb-4">
              If what you're doing is making someone feel uncomfortable, that
              counts as harassment and is enough reason to stop doing it.
              Participants asked to stop any harassing behavior are expected to
              comply immediately.
            </p>

            <p className="mb-4">
              Sponsors, judges, mentors, volunteers, organizers, MLH staff, and
              anyone else participating in the event are also subject to the
              anti-harassment policy.
            </p>

            <p className="mb-4">
              If a participant engages in harassing behavior, MLH may take any
              action it deems appropriate, including warning the offender or
              expulsion from the event with no eligibility for reimbursement or
              refund of any type.
            </p>

            <p className="mb-4">
              If you are being harassed, notice that someone else is being
              harassed, or have any other concerns, please contact MLH using the
              reporting procedures defined below.
            </p>

            <p className="mb-4">
              MLH representatives can help participants contact campus security
              or local law enforcement, provide escorts, or otherwise assist
              those experiencing harassment to feel safe for the duration of the
              event. We value your attendance.
            </p>

            <p className="mb-6">
              We expect participants to follow these rules at all hackathon
              venues, hackathon-related social events, hackathon-supplied
              transportation, and online interactions related to the event.
            </p>

            <strong className="text-white block mb-2 font-mono uppercase tracking-widest text-xs text-bloom-lime">
              Reporting Procedures
            </strong>
            <p className="mb-2">
              If you feel uncomfortable or think there may be a potential
              violation of the code of conduct, please report it immediately
              using one of the following methods. All reporters have the right
              to remain anonymous.
            </p>
            <p className="mb-4">
              By sending information to the general reporting line, your report
              will go to our incident response team members.
            </p>

            <ul className="list-disc pl-6 mb-6 space-y-1">
              <li>
                <span className="text-white">
                  North America General Reporting
                </span>{" "}
                - +1 409 202 6060, incidents@mlh.io
              </li>
              <li>
                <span className="text-white">Canada General Reporting</span> -
                +1 343 453 4532, incidents@mlh.io
              </li>
              <li>
                <span className="text-white">Europe General Reporting</span> -
                +44 800 808 5675, incidents@mlh.io
              </li>
              <li>
                <span className="text-white">
                  Asia-Pacific General Reporting
                </span>{" "}
                - +91 000 80004 02492, incidents@mlh.io
              </li>
              <li>
                <span className="text-white">India General Reporting</span> -
                000 80004 02492, incidents@mlh.io
              </li>
            </ul>

            <strong className="text-white block mb-2 font-mono uppercase tracking-widest text-xs text-bloom-pink">
              Special Incidents
            </strong>
            <p className="mb-4">
              If you are uncomfortable reporting your situation to one or more
              of these people or need to contact any of them directly in case of
              emergency, direct contact details are listed below.
            </p>

            <ul className="list-disc pl-6 mb-6 space-y-1">
              <li>
                <span className="text-white">Mary Siebert</span> - +1 (516)
                362-1835, mary@mlh.io
              </li>
              <li>
                <span className="text-white">Swift</span> - +1 (347) 220-8667,
                swift@mlh.io
              </li>
            </ul>

            <p className="mb-4">
              MLH reserves the right to revise, make exceptions to, or otherwise
              amend these policies in whole or in part. If you have any
              questions regarding these policies, please contact MLH by e-mail
              at incidents@mlh.io.
            </p>

            <em className="text-gray-500 text-xs font-mono">
              This document was last updated on: February 14th 2025
            </em>
          </div>
        </div>
      )}
      <button
        className="glass-panel text-gray-300 hover:text-white px-5 py-3 font-mono tracking-widest text-xs uppercase hover-bloom-glow transition-all duration-300 min-w-[180px]"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls="code-of-conduct-content"
      >
        {open ? "Hide Code of Conduct" : "View Code of Conduct"}
      </button>
    </div>
  );
}
