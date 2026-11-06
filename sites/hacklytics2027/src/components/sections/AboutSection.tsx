import React from "react";

const AboutSection: React.FC = () => {
  return (
    <section id="about" className="section-anchor relative">
      <div className="wrap py-12 md:py-24">
        <h2 className="display -ml-[0.125em] text-[32px] md:text-[48px] xl:text-[64px] leading-[1.05] text-balance">
          The Southeast’s data science hackathon
        </h2>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-16 gap-y-5 mt-8 md:mt-12">
          <p className="font-sans text-[17px] md:text-[19px] text-ink leading-[1.55] max-w-[60ch]">
            Hacklytics is a 36-hour data science and AI hackathon run by Data
            Science @ GT at the Klaus Advanced Computing Building in Atlanta,
            February 26–28, 2027.
          </p>
          <p className="font-sans text-[17px] md:text-[19px] text-ink-2 leading-[1.55] max-w-[60ch]">
            Room for 1,000+ hackers. It costs nothing to attend: meals and swag are covered.
          </p>
        </div>
      </div>
    </section>
  );
};

export default AboutSection;
