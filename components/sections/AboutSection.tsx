import React from 'react';
import CandyIcon from '../ui/CandyIcon';

const AboutSection: React.FC = () => {
  return (
    // Replaced the invalid hex code with your 'bg-sky' class
    <section id="about" className="section-anchor scroll-mt-28 min-h-screen bg-sky">
      <div className="container mx-auto px-4 py-24 max-w-6xl">
        
        <div className="text-center mb-12">
          <h1 className="text-6xl font-bold text-white mb-8 drop-shadow-lg">
            About
          </h1>
        </div>

        <div className="bg-red-500 rounded-3xl p-8 mb-16 shadow-2xl">
          <div className="text-white text-lg leading-relaxed space-y-6">
            <p>
              <strong>HacklyticS</strong> is a <strong>36-hour data science hackathon</strong> hosted by <strong>Data Science @ GT</strong>, Georgia Tech's largest data science club. Each year, hackers from across the globe join us in building <strong>impactful, data-driven projects</strong> tackling meaningful challenges.
            </p>
            <p>
              Inspired by the whimsical world of <strong>Willy Wonka</strong>, this year's theme invites you into a fantastical factory of technological development and discovery -- where curiosity fuels creativity, and <strong>innovation is your golden ticket</strong>. Tackle exciting challenges across our <strong>five tracks</strong>, each crafted to ignite your imagination and help you uncover the sweet rewards of solving complex issues through <strong>collaboration and code</strong>. So, bring your brightest ideas and your boldest builds; we promise your journey through HacklyticS will be <strong>anything but ordinary</strong>.
            </p>
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-12 mb-16">
          <div>
            <h2 className="text-4xl font-bold text-red-500 mb-6 drop-shadow-md">
              Where and When?
            </h2>
            <div className="text-white text-lg leading-relaxed">
              <p>
                <strong>Hacklytics 2026</strong> will take place on <strong>Feb. 20-22</strong>, located in Georgia Tech's <strong>Klaus Advanced Computing Building</strong>.
              </p>
            </div>
            <div className="flex justify-start items-center mt-8">
              <CandyIcon /><CandyIcon /><CandyIcon /><CandyIcon />
            </div>
          </div>
          <div>
            <div className="flex justify-end items-center mb-8">
              <CandyIcon /><CandyIcon /><CandyIcon /><CandyIcon />
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
    </section>
  );
};

export default AboutSection;