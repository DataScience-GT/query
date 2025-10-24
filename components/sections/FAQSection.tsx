"use client";

import React from "react";
import CloudBlueButton from "../ui/CloudButtonBlue";

export default function FAQ() {
  return (
    <section
      id="faqs"
      className="section-anchor scroll-mt-28 min-h-screen bg-[#A4C7FF] py-20"
    >
      <div className="container mx-auto px-4 md:px-8 max-w-6xl">
        <div className="text-center mb-16 md:mb-20">
          <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold text-white mb-10 drop-shadow-lg">
            FAQ
          </h1>
        </div>

        {/* Grid of cloud buttons, with responsive left shift */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-y-20 md:gap-y-28 gap-x-16 max-w-5xl mx-auto items-center justify-items-center -translate-x-16 sm:-translate-x-14 md:-translate-x-12">
          <CloudBlueButton title="Who can register?">
            <p className="font-semibold">
              Any student currently enrolled in a University above the age of 18. For any discrepancies, please reach out.
            </p>
          </CloudBlueButton>

          <CloudBlueButton title="Where and when is it held?">
            <p className="font-semibold">
              February 21st - February 23rd at the Klaus Advanced Computing Building
            </p>
          </CloudBlueButton>

          <CloudBlueButton
  title="How do I apply for Travel Reimbursements?"
  titleClassName="text-base" //should?
>
  <p className="font-semibold">Pending</p>
</CloudBlueButton>


          <CloudBlueButton title="Can you participate virtually">
            <p className="font-semibold">
              Unfortunately, no, Hacklytics 2026 is only in person this year. Sponsors want to come see you work on your projects in person!
            </p>
          </CloudBlueButton>

          <CloudBlueButton title="What is a data science hackathon?">
            <p className="font-semibold">
              A datathon is a specific type of hackathon that focuses on data science. You can choose any datasets, programming languages, APIs, or algorithms you'd like to create visualizations, develop models, derive insights, and do anything you believe to be impactful! The sky's the limit!
            </p>
          </CloudBlueButton>

          <CloudBlueButton title="How many people per team?">
            <p className="font-semibold">
              A maximum of 4 members per team. However, you’re allowed to work with fewer members as well!
            </p>
          </CloudBlueButton>

          <CloudBlueButton title="What if I don’t have a team?">
            <p className="font-semibold">
              Lots of people come in without teams! You can find people to form a team with during our team-building event or through our Discord.
            </p>
          </CloudBlueButton>

          <CloudBlueButton title="Is the event free?">
            <p className="font-semibold">
              Yes! We also provide food and other goodies if you are in-person.
            </p>
          </CloudBlueButton>
        </div>
      </div>
    </section>
  );
}
