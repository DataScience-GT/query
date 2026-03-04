"use client";
import { useState } from "react";

export default function CodeOfConductFooter() {
  const [open, setOpen] = useState(false);
  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end">
      {open && (
        <div className="mb-2 bg-white bg-opacity-95 border border-gray-200 shadow-2xl rounded-xl p-4 max-w-md w-[90vw] md:w-96 text-xs md:text-sm text-gray-700 animate-fade-in">
          <div className="flex justify-between items-center mb-2">
            <span className="font-bold text-cyan-900">MLH Code of Conduct</span>
            <button
              className="text-gray-400 hover:text-gray-700 text-lg font-bold ml-2 focus:outline-none"
              onClick={() => setOpen(false)}
              aria-label="Close Code of Conduct"
            >
              ×
            </button>
          </div>
          <div className="overflow-y-auto max-h-72 pr-1">
            <strong>TL;DR. Be respectful. Harassment and abuse are never tolerated. If you are in a situation that makes you uncomfortable at an MLH Member Event, if the event itself creates an unsafe or inappropriate environment, or if interacting with an MLH representative or event organizer makes you uncomfortable, please report it using the procedures included in this document.</strong>
            <br /><br />
            Major League Hacking (MLH) stands for inclusivity. We believe that every single person has the right to hack in a safe and welcoming environment.<br /><br />
            Harassment includes but is not limited to offensive verbal or written comments related to gender, age, sexual orientation, disability, physical appearance, body size, race, religion, social class, economic status, and veteran status. Additional cases of harassment include but are not limited to sharing sexual images, violent depictions, vulgar language, deliberate intimidation, stalking, following, brigading, doxxing, harassing photography or recording, sustained disruption of talks or other events, inappropriate physical contact, and unwelcome sexual attention.<br /><br />
            In particular, attendees should not use sexualized images, activities, or other material both in their hacks and during the event. Booth staff (including volunteers) should not use sexualized clothing/uniforms/costumes or otherwise create a sexualized environment.<br /><br />
            If what you're doing is making someone feel uncomfortable, that counts as harassment and is enough reason to stop doing it. Participants asked to stop any harassing behavior are expected to comply immediately.<br /><br />
            Sponsors, judges, mentors, volunteers, organizers, MLH staff, and anyone else participating in the event are also subject to the anti-harassment policy.<br /><br />
            If a participant engages in harassing behavior, MLH may take any action it deems appropriate, including warning the offender or expulsion from the event with no eligibility for reimbursement or refund of any type.<br /><br />
            If you are being harassed, notice that someone else is being harassed, or have any other concerns, please contact MLH using the reporting procedures defined below.<br /><br />
            MLH representatives can help participants contact campus security or local law enforcement, provide escorts, or otherwise assist those experiencing harassment to feel safe for the duration of the event. We value your attendance.<br /><br />
            We expect participants to follow these rules at all hackathon venues, hackathon-related social events, hackathon-supplied transportation, and online interactions related to the event.<br /><br />
            <strong>Reporting Procedures</strong><br /><br />
            If you feel uncomfortable or think there may be a potential violation of the code of conduct, please report it immediately using one of the following methods. All reporters have the right to remain anonymous.<br /><br />
            By sending information to the general reporting line, your report will go to our incident response team members.<br /><br />
            <ul className="list-disc pl-6">
              <li>North America General Reporting - +1 409 202 6060, incidents@mlh.io</li>
              <li>Canada General Reporting - +1 343 453 4532, incidents@mlh.io</li>
              <li>Europe General Reporting - +44 800 808 5675, incidents@mlh.io</li>
              <li>Asia-Pacific General Reporting - +91 000 80004 02492, incidents@mlh.io</li>
              <li>India General Reporting - 000 80004 02492, incidents@mlh.io</li>
            </ul>
            <br />
            <strong>Special Incidents</strong><br /><br />
            If you are uncomfortable reporting your situation to one or more of these people or need to contact any of them directly in case of emergency, direct contact details are listed below.<br /><br />
            <ul className="list-disc pl-6">
              <li>Mary Siebert - +1 (516) 362-1835, mary@mlh.io</li>
              <li>Swift - +1 (347) 220-8667, swift@mlh.io</li>
            </ul>
            <br />
            MLH reserves the right to revise, make exceptions to, or otherwise amend these policies in whole or in part. If you have any questions regarding these policies, please contact MLH by e-mail at incidents@mlh.io.<br /><br />
            <em>This document was last updated on: February 14th 2025</em>
          </div>
        </div>
      )}
      <button
        className="bg-cyan-900 text-white rounded-full shadow-lg px-5 py-3 font-semibold hover:bg-cyan-800 focus:outline-none focus:ring-2 focus:ring-cyan-500 text-sm"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls="code-of-conduct-content"
        style={{ minWidth: 180 }}
      >
        {open ? 'Hide Code of Conduct' : 'View Code of Conduct'}
      </button>
    </div>
  );
} 