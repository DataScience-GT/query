"use client";

import React, { useState } from "react";
import Image from "next/image";
import { Truculenta } from 'next/font/google';

const truculenta = Truculenta({
  subsets: ['latin'],
  weight: ['400', '700', '900'],
});

const FloatingCandy: React.FC<{ src: string; delay: string; className?: string }> = ({ src, delay, className }) => (
  <div
    className={`absolute pointer-events-none animate-float ${className}`}
    style={{ animationDelay: delay }}
  >
    <Image src={src} alt="Candy" width={60} height={60} className="object-contain drop-shadow-lg" />
  </div>
);

const FAQCard: React.FC<{ title: string; content: string; delay: string; color: string; rotate: string }> = ({
  title,
  content,
  delay,
  color,
  rotate
}) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div
      className={`group relative w-full animate-fade-in-up ${rotate} hover:rotate-0 transition-all duration-300 hover:z-10 cursor-pointer h-fit`}
      style={{ animationDelay: delay }}
      onClick={() => setIsOpen(!isOpen)}
    >
      {/* Shadow Layer */}
      <div className={`absolute inset-0 ${color} rounded-[2rem] transform translate-y-2 translate-x-2 transition-transform group-hover:translate-x-3 group-hover:translate-y-3`}></div>

      {/* Card Body */}
      <div className="relative bg-white rounded-[2rem] border-[4px] border-gray-100 p-8 flex flex-col shadow-lg overflow-hidden group-hover:shadow-xl transition-all">
        <div className="flex justify-between items-start gap-4">
          <h3 className={`${truculenta.className} text-2xl md:text-3xl font-black text-gray-800 leading-tight group-hover:text-${color.replace('bg-', '')} transition-colors select-none`}>
            {title}
          </h3>

          {/* Expand/Collapse Icon */}
          <div className={`flex-shrink-0 transform transition-transform duration-300 ${isOpen ? 'rotate-180' : ''} mt-1`}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M6 9L12 15L18 9" stroke="#4B5563" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
        </div>

        <div className={`grid transition-all duration-300 ease-in-out ${isOpen ? 'grid-rows-[1fr] opacity-100 mt-4' : 'grid-rows-[0fr] opacity-0 mt-0'}`}>
          <div className="overflow-hidden">
            <p className="text-gray-600 font-medium leading-relaxed text-lg select-none">
              {content}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default function FAQ() {
  const faqItems = [
    {
      title: "What if i forgot to register?",
      content: "We will have a limited day of walk ins starting at 6:00PM",
      delay: "0s"

    },
    {
      title: "Who can register?",
      content: "Any student currently enrolled in a University above the age of 18. For any discrepancies, please reach out.",
      delay: "0s"
    },
    {
      title: "Where and when is it held?",
      content: "February 20th - February 22rd at the Klaus Advanced Computing Building",
      delay: "0.1s"
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

  // Assign colors and rotations
  const itemsWithStyle = faqItems.map((item, index) => ({
    ...item,
    color: [
      'bg-purple-400',
      'bg-pink-400',
      'bg-emerald-400',
      'bg-orange-400',
      'bg-blue-400',
      'bg-yellow-400',
      'bg-rose-400',
      'bg-cyan-400'
    ][index % 8],
    rotate: index % 2 === 0 ? '-rotate-1' : 'rotate-1'
  }));

  return (
    <section
      id="faqs"
      className="section-anchor scroll-mt-28 min-h-screen bg-sky relative overflow-hidden py-24"
    >
      {/* Decorations */}
      <div className="absolute top-20 left-[-60px] w-56 h-36 opacity-30 animate-drift" style={{ animationDelay: '0s' }}>
        <Image src="/cloud-main/largecloud.png" alt="" fill className="object-contain" />
      </div>
      <div className="absolute bottom-40 right-[-50px] w-64 h-40 opacity-40 animate-drift" style={{ animationDelay: '2s' }}>
        <Image src="/cloud-main/midCloud.png" alt="" fill className="object-contain" />
      </div>

      <FloatingCandy src="/small-candy/pink.png" delay="0s" className="top-32 left-[10%] rotate-12" />
      <FloatingCandy src="/small-candy/blue.png" delay="2s" className="bottom-20 right-[15%] -rotate-12" />
      <FloatingCandy src="/small-candy/green.png" delay="1.5s" className="top-[40%] left-[5%] rotate-6" />

      <div className="container mx-auto px-4 relative z-10 max-w-6xl">
        <div className="text-center mb-20 relative">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-white/30 blur-3xl rounded-full -z-10"></div>
          <h1
            className="font-willywonka text-7xl md:text-9xl text-wonka-yellow mb-4 drop-shadow-[0_4px_0_rgba(133,77,14,0.6)] animate-fade-in-up transform hover:scale-105 transition-transform duration-300"
            style={{ WebkitTextStroke: "2px #854d0e" }}
          >
            FAQ
          </h1>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-10 perspective-1000">
          {itemsWithStyle.map((item, index) => (
            <FAQCard
              key={index}
              {...item}
              delay={`${0.2 + (index * 0.1)}s`}
            />
          ))}
        </div>
      </div>

      <style jsx>{`
        @keyframes drift {
          0%, 100% { transform: translateX(0px) translateY(0px); }
          50% { transform: translateX(20px) translateY(-10px); }
        }

        @keyframes float {
          0%, 100% { transform: translateY(0) rotate(var(--tw-rotate)); }
          50% { transform: translateY(-20px) rotate(calc(var(--tw-rotate) + 5deg)); }
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

        .perspective-1000 {
          perspective: 1000px;
        }

        .animate-drift {
          animation: drift 10s ease-in-out infinite;
        }

        .animate-float {
          animation: float 6s ease-in-out infinite;
        }

        .animate-fade-in-up {
          animation: fade-in-up 0.8s ease-out forwards;
          opacity: 0;
        }
      `}</style>
    </section>
  );
}
