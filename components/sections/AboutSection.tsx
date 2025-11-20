"use client";
import React from 'react';
import Image from 'next/image';
import CandyIcon from '../ui/CandyIcon';

const AboutSection: React.FC = () => {
  return (
    <section id="about" className="section-anchor scroll-mt-28 min-h-screen bg-sky relative overflow-hidden">
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

      <div className="container mx-auto px-4 py-24 max-w-6xl relative z-10">
        
        <div className="text-center mb-12">
          <h1 className="text-6xl font-bold text-white mb-8 drop-shadow-lg animate-fade-in-up">
            About
          </h1>
        </div>

        <div className="bg-red-500 rounded-3xl p-8 mb-16 shadow-2xl animate-fade-in-up" style={{ animationDelay: '0.2s' }}>
          <div className="text-white text-lg leading-relaxed space-y-6">
            <p>
              <strong>Hacklytics</strong> is a <strong>36-hour data science hackathon</strong> hosted by <strong>Data Science @ GT</strong>, Georgia Tech's largest data science club. Each year, hackers from across the globe join us in building <strong>impactful, data-driven projects</strong> tackling meaningful challenges.
            </p>
            <p>
              Inspired by the whimsical world of <strong>Willy Wonka</strong>, this year's theme invites you into a fantastical factory of technological development and discovery -- where curiosity fuels creativity, and <strong>innovation is your golden ticket</strong>. Tackle exciting challenges across our <strong>five tracks</strong>, each crafted to ignite your imagination and help you uncover the sweet rewards of solving complex issues through <strong>collaboration and code</strong>. So, bring your brightest ideas and your boldest builds; we promise your journey through Hacklytics will be <strong>anything but ordinary</strong>.
            </p>
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-12 mb-16">
          <div className="animate-fade-in-up" style={{ animationDelay: '0.4s' }}>
            <h2 className="text-4xl font-bold text-red-500 mb-6 drop-shadow-md">
              Where and When?
            </h2>
            <div className="text-white text-lg leading-relaxed">
              <p>
                <strong>Hacklytics 2026</strong> will take place on <strong>Feb. 20-22</strong>, located in Georgia Tech's <strong>Klaus Advanced Computing Building</strong>.
              </p>
            </div>
            <div className="flex justify-start items-center mt-8 gap-2">
              <div className="animate-spin-slow"><CandyIcon /></div>
              <div className="animate-spin-slow"><CandyIcon /></div>
              <div className="animate-spin-slow"><CandyIcon /></div>
              <div className="animate-spin-slow"><CandyIcon /></div>
            </div>
          </div>
          <div className="animate-fade-in-up" style={{ animationDelay: '0.6s' }}>
            <div className="flex justify-end items-center mb-8 gap-2">
              <div className="animate-spin-slow"><CandyIcon /></div>
              <div className="animate-spin-slow"><CandyIcon /></div>
              <div className="animate-spin-slow"><CandyIcon /></div>
              <div className="animate-spin-slow"><CandyIcon /></div>
            </div>
            <h2 className="text-4xl font-bold text-red-500 mb-6 drop-shadow-md text-right">
              Why Participate?
            </h2>
            <div className="text-white text-lg leading-relaxed text-right">
              <p>
                <strong>Hacklytics</strong> is your chance to <strong>gain hands-on data science experience</strong>, build projects that matter, and turn ideas into impact. Along the way, you'll <strong>connect with passionate hackers from all backgrounds</strong>, grow your network, and -- most importantly -- <strong>have a blast doing it</strong>.
              </p>
            </div>
          </div>
        </div>

      </div>
      
      <style jsx>{`
        @keyframes spin-slow {
          from {
            transform: rotate(0deg);
          }
          to {
            transform: rotate(360deg);
          }
        }
        
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
        
        .animate-spin-slow {
          animation: spin-slow 4s linear infinite;
          display: inline-block;
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
};

export default AboutSection;