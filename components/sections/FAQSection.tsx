"use client";

import React from "react";
import Image from "next/image";
import CloudBlueButton from "../ui/CloudButtonBlue";

export default function FAQ() {
  const faqItems = [
    {
      title: "Who can register?",
      content: "Any student currently enrolled in a University above the age of 18. For any discrepancies, please reach out.",
      delay: "0s"
    },
    {
      title: "Where and when is it held?",
      content: "February 21st - February 23rd at the Klaus Advanced Computing Building",
      delay: "0.1s"
    },
    {
      title: "How do I apply for Travel Reimbursements?",
      content: "Pending",
      delay: "0.2s",
      titleClassName: "text-base"
    },
    {
      title: "Can you participate virtually",
      content: "Unfortunately, no, Hacklytics 2026 is only in person this year. Sponsors want to come see you work on your projects in person!",
      delay: "0.3s"
    },
    {
      title: "What is a data science hackathon?",
      content: "A datathon is a specific type of hackathon that focuses on data science. You can choose any datasets, programming languages, APIs, or algorithms you'd like to create visualizations, develop models, derive insights, and do anything you believe to be impactful! The sky's the limit!",
      delay: "0.4s"
    },
    {
      title: "How many people per team?",
      content: "A maximum of 4 members per team. However, you're allowed to work with fewer members as well!",
      delay: "0.5s"
    },
    {
      title: "What if I don't have a team?",
      content: "Lots of people come in without teams! You can find people to form a team with during our team-building event or through our Discord.",
      delay: "0.6s"
    },
    {
      title: "Is the event free?",
      content: "Yes! We also provide food and other goodies if you are in-person.",
      delay: "0.7s"
    }
  ];

  return (
    <section
      id="faqs"
      className="section-anchor scroll-mt-28 min-h-screen bg-[#A4C7FF] py-20 relative overflow-hidden"
    >
      {/* Drifting cloud decorations */}
      <div className="absolute top-10 left-10 w-32 h-20 opacity-40 animate-drift pointer-events-none" style={{ animationDelay: '0s' }}>
        <Image src="/cloud-main/smallCloud.png" alt="" fill className="object-contain" />
      </div>
      <div className="absolute top-32 right-20 w-24 h-16 opacity-50 animate-drift pointer-events-none" style={{ animationDelay: '1s' }}>
        <Image src="/cloud-main/smallCloud.png" alt="" fill className="object-contain" />
      </div>
      <div className="absolute bottom-20 left-1/4 w-40 h-24 opacity-30 animate-drift pointer-events-none" style={{ animationDelay: '2s' }}>
        <Image src="/cloud-main/smallCloud.png" alt="" fill className="object-contain" />
      </div>
      <div className="absolute bottom-40 right-1/3 w-28 h-18 opacity-45 animate-drift pointer-events-none" style={{ animationDelay: '3s' }}>
        <Image src="/cloud-main/smallCloud.png" alt="" fill className="object-contain" />
      </div>
      <div className="absolute top-1/2 left-5 w-20 h-14 opacity-35 animate-drift pointer-events-none" style={{ animationDelay: '4s' }}>
        <Image src="/cloud-main/smallCloud.png" alt="" fill className="object-contain" />
      </div>
      <div className="absolute top-1/3 right-10 w-36 h-22 opacity-40 animate-drift pointer-events-none" style={{ animationDelay: '2.5s' }}>
        <Image src="/cloud-main/smallCloud.png" alt="" fill className="object-contain" />
      </div>

      <div className="container mx-auto px-4 md:px-8 max-w-6xl relative z-10">
        <div className="text-center mb-16 md:mb-20">
          <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold text-white mb-10 drop-shadow-lg animate-fade-in-up">
            FAQ
          </h1>
        </div>

        {/* Grid of cloud buttons with staggered animations */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-y-20 md:gap-y-28 gap-x-16 max-w-5xl mx-auto items-center justify-items-center -translate-x-16 sm:-translate-x-14 md:-translate-x-12">
          {faqItems.map((item, index) => (
            <div
              key={index}
              className="animate-fade-in-up w-full"
              style={{ animationDelay: item.delay }}
            >
              <CloudBlueButton 
                title={item.title}
                titleClassName={item.titleClassName}
              >
                <p className="font-semibold">{item.content}</p>
              </CloudBlueButton>
            </div>
          ))}
        </div>
      </div>

      <style jsx>{`
        @keyframes drift {
          0%, 100% { 
            transform: translateX(0px); 
          }
          50% { 
            transform: translateX(30px); 
          }
        }

        @keyframes fade-in-up {
          from {
            opacity: 0;
            transform: translateY(30px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .animate-drift {
          animation: drift 10s ease-in-out infinite;
        }

        .animate-fade-in-up {
          animation: fade-in-up 0.8s ease-out forwards;
          opacity: 0;
        }
      `}</style>
    </section>
  );
}