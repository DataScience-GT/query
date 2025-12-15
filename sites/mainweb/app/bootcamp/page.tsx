"use client";

import { useState, useEffect } from "react";
// Assuming these are custom components, they are preserved
import Background from "@/components/Background";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import Major from "@/components/Text/Major"; // Used for Headings
import Mini from "@/components/Text/Mini";   // Used for Body Text

// Custom Icon Components (Placeholder for better UI)
const CodeIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg {...props} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 6.75 14.25 12l3 5.25m-1.5-8.625 2.25 2.25M17.25 6.75l-4.25 4.25m4.25-4.25 4.25 4.25M7.75 6.75l3 5.25-3 5.25m1.5-8.625-2.25 2.25m-1.5 1.5 4.25 4.25M6.75 17.25l-4.25-4.25m4.25 4.25-4.25 4.25" />
  </svg>
);
const BookOpenIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg {...props} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.5C12 5.67157 12.6716 5 13.5 5H18.5C19.3284 5 20 5.67157 20 6.5V17.5C20 18.3284 19.3284 19 18.5 19H13.5C12.6716 19 12 18.3284 12 17.5V6.5Z" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.5C12 5.67157 11.3284 5 10.5 5H5.5C4.67157 5 4 5.67157 4 6.5V17.5C4 18.3284 4.67157 19 5.5 19H10.5C11.3284 19 12 18.3284 12 17.5V6.5Z" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.5C12 5.67157 11.3284 5 10.5 5H5.5C4.67157 5 4 5.67157 4 6.5V17.5C4 18.3284 4.67157 19 5.5 19H10.5C11.3284 19 12 18.3284 12 17.5V6.5Z" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.5C12 5.67157 11.3284 5 10.5 5H5.5C4.67157 5 4 5.67157 4 6.5V17.5C4 18.3284 4.67157 19 5.5 19H10.5C11.3284 19 12 18.3284 12 17.5V6.5Z" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.5C12 5.67157 11.3284 5 10.5 5H5.5C4.67157 5 4 5.67157 4 6.5V17.5C4 18.3284 4.67157 19 5.5 19H10.5C11.3284 19 12 18.3284 12 17.5V6.5Z" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.5C12 5.67157 11.3284 5 10.5 5H5.5C4.67157 5 4 5.67157 4 6.5V17.5C4 18.3284 4.67157 19 5.5 19H10.5C11.3284 19 12 18.3284 12 17.5V6.5Z" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.5C12 5.67157 11.3284 5 10.5 5H5.5C4.67157 5 4 5.67157 4 6.5V17.5C4 18.3284 4.67157 19 5.5 19H10.5C11.3284 19 12 18.3284 12 17.5V6.5Z" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.5C12 5.67157 11.3284 5 10.5 5H5.5C4.67157 5 4 5.67157 4 6.5V17.5C4 18.3284 4.67157 19 5.5 19H10.5C11.3284 19 12 18.3284 12 17.5V6.5Z" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.5C12 5.67157 11.3284 5 10.5 5H5.5C4.67157 5 4 5.67157 4 6.5V17.5C4 18.3284 4.67157 19 5.5 19H10.5C11.3284 19 12 18.3284 12 17.5V6.5Z" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.5C12 5.67157 11.3284 5 10.5 5H5.5C4.67157 5 4 5.67157 4 6.5V17.5C4 18.3284 4.67157 19 5.5 19H10.5C11.3284 19 12 18.3284 12 17.5V6.5Z" />
  </svg>
);
const UsersIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg {...props} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="M17.982 18.725A7.488 7.488 0 0 0 12 15.75a7.488 7.488 0 0 0-5.982 2.975m11.964 0a7.5 7.5 0 0 0-11.964 0M12 5.75a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M17.982 18.725A7.488 7.488 0 0 0 12 15.75a7.488 7.488 0 0 0-5.982 2.975m11.964 0a7.5 7.5 0 0 0-11.964 0M12 5.75a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z" />
  </svg>
);


const BootcampPage: React.FC = () => {
  const [windowWidth, setWindowWidth] = useState<number>(
    typeof window !== "undefined" ? window.innerWidth : 1024
  );

  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  return (
    // Use a very dark background for contrast (e.g., bg-gray-900)
    <div className="relative min-h-screen flex flex-col bg-gray-950">
      <Background className="absolute inset-0 z-0 opacity-50" />

      <Navbar
        screen_width={windowWidth}
        className="fixed top-0 left-0 w-full z-30 bg-gray-950/90 backdrop-blur-sm shadow-lg shadow-indigo-900/10"
        page="other"
      />

      {/* Main content with refined vertical spacing */}
      <main className="relative z-10 pt-[120px] pb-32 px-4 sm:px-8 md:px-16 space-y-32">
        {/* HERO SECTION - Enhanced Typography and Gradient */}
        <section className="text-center space-y-4">
          <Major type="b" className="text-white text-5xl sm:text-6xl font-extrabold tracking-tight">
            Data Science Bootcamp
          </Major>

          <Major type="b" className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-cyan-400 text-3xl sm:text-4xl font-bold">
            Georgia Tech
          </Major>

          <Mini className="text-gray-400 max-w-xl mx-auto pt-2 text-lg">
            Making data science accessible for all students, regardless of prior experience.
          </Mini>
        </section>

        {/* ABOUT THE BOOTCAMP - Clean Card */}
        <section className="max-w-4xl mx-auto space-y-8 bg-gray-900/60 p-8 rounded-xl shadow-2xl border border-indigo-700/50">
          <Major type="b" className="text-indigo-400 text-3xl border-b border-indigo-400/30 pb-3">
            About the Bootcamp
          </Major>

          <Mini className="text-gray-300 leading-relaxed">
            The DSGT Data Science Bootcamp is designed to introduce students to
            the core tools and ideas behind modern data science—<strong>no prior
            experience required</strong>.
          </Mini>

          <Mini className="text-gray-300 leading-relaxed">
            Through structured workshops, guided projects, and collaborative
            learning, the bootcamp focuses on building <strong>practical skills</strong> that can
            be applied to real-world problems and enhance your portfolio.
          </Mini>
        </section>

        {/* WHAT YOU’LL LEARN - Iconic Card Grid */}
        <section className="max-w-6xl mx-auto space-y-12">
          <Major type="b" className="text-white text-4xl text-center font-bold">
            Essential Skills You’ll Master
          </Major>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {/* Python Card */}
            <div className="bg-gray-800/70 p-6 rounded-2xl shadow-xl border border-gray-700 hover:bg-gray-700/80 transition duration-300 ease-in-out transform hover:scale-[1.02]">
              <CodeIcon className="h-8 w-8 text-yellow-500 mb-3" />
              <Major as="h3" compact className="text-white text-xl">Python</Major>
              <Mini className="text-gray-400 mt-2 text-sm">
                Learn the fundamentals of this powerful, beginner-friendly language, essential for data science and machine learning.
              </Mini>
            </div>

            {/* Pandas Card */}
            <div className="bg-gray-800/70 p-6 rounded-2xl shadow-xl border border-gray-700 hover:bg-gray-700/80 transition duration-300 ease-in-out transform hover:scale-[1.02]">
              <CodeIcon className="h-8 w-8 text-blue-500 mb-3" />
              <Major as="h3" compact className="text-white text-xl">Pandas</Major>
              <Mini className="text-gray-400 mt-2 text-sm">
                Master DataFrames to clean, manipulate, and analyze structured datasets from real-world sources efficiently.
              </Mini>
            </div>

            {/* NumPy Card */}
            <div className="bg-gray-800/70 p-6 rounded-2xl shadow-xl border border-gray-700 hover:bg-gray-700/80 transition duration-300 ease-in-out transform hover:scale-[1.02]">
              <CodeIcon className="h-8 w-8 text-green-500 mb-3" />
              <Major as="h3" compact className="text-white text-xl">NumPy</Major>
              <Mini className="text-gray-400 mt-2 text-sm">
                Build a foundation in numerical computing for high-performance array and matrix operations, core to ML algorithms.
              </Mini>
            </div>

            {/* Machine Learning Card */}
            <div className="bg-gray-800/70 p-6 rounded-2xl shadow-xl border border-gray-700 hover:bg-gray-700/80 transition duration-300 ease-in-out transform hover:scale-[1.02]">
              <CodeIcon className="h-8 w-8 text-purple-500 mb-3" />
              <Major as="h3" compact className="text-white text-xl">Machine Learning</Major>
              <Mini className="text-gray-400 mt-2 text-sm">
                Introduction to key ML concepts, how models learn from data, and making predictions and uncovering patterns.
              </Mini>
            </div>
          </div>

          <Mini className="text-gray-500 text-center text-sm italic">
            …and additional tools commonly used in the data science pipeline
          </Mini>
        </section>

        {/* WHAT IS DATA SCIENCE - Iconic Visualization Section */}
        <section className="max-w-4xl mx-auto space-y-6 text-center">
            <Major type="b" className="text-white text-4xl font-bold">
                What Is Data Science?
            </Major>

            <Mini className="text-gray-400 text-lg leading-relaxed">
                Data science is the intersection of three key disciplines—<strong>programming</strong>, <strong>statistics</strong>, and <strong>domain knowledge</strong>—used to extract actionable insights from raw data. It enables organizations to identify trends and make data-driven decisions.
            </Mini>


        </section>

        {/* BOOTCAMP OPTIONS - Comparison Cards */}
        <section className="max-w-6xl mx-auto space-y-12">
          <Major type="b" className="text-white text-4xl text-center font-bold">
            Choose Your Path
          </Major>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* In-Person Option */}
            <div className="bg-gray-800 border-t-4 border-indigo-500 rounded-2xl p-8 shadow-2xl hover:shadow-indigo-500/30 transition duration-300">
              <UsersIcon className="h-10 w-10 text-indigo-400 mb-4" />
              <Major as="h3" compact className="text-white text-2xl mb-4">
                In-Person Bootcamp
              </Major>
              <ul className="mt-4 space-y-3 text-gray-300 text-base">
                <li className="flex items-start">
                  <span className="text-indigo-400 text-xl mr-2">•</span> Introductory data science curriculum
                </li>
                <li className="flex items-start">
                  <span className="text-indigo-400 text-xl mr-2">•</span> Biweekly hands-on workshops
                </li>
                <li className="flex items-start">
                  <span className="text-indigo-400 text-xl mr-2">•</span> <strong>Weekly dedicated mentor meetings</strong>
                </li>
                <li className="flex items-start">
                  <span className="text-indigo-400 text-xl mr-2">•</span> Guided, hands-on project experience
                </li>
                <li className="flex items-start">
                  <span className="text-indigo-400 text-xl mr-2">•</span> Communication and support via Slack
                </li>
              </ul>
            </div>

            {/* Udemy Option */}
            <div className="bg-gray-800 border-t-4 border-cyan-500 rounded-2xl p-8 shadow-2xl hover:shadow-cyan-500/30 transition duration-300">
              <BookOpenIcon className="h-10 w-10 text-cyan-400 mb-4" />
              <Major as="h3" compact className="text-white text-2xl mb-4">Udemy Self-Paced Course</Major>
              <ul className="mt-4 space-y-3 text-gray-300 text-base">
                <li className="flex items-start">
                  <span className="text-cyan-400 text-xl mr-2">•</span> Introductory data science curriculum
                </li>
                <li className="flex items-start">
                  <span className="text-cyan-400 text-xl mr-2">•</span> Fully self-paced, flexible learning
                </li>
                <li className="flex items-start">
                  <span className="text-cyan-400 text-xl mr-2">•</span> <strong>Focus on core concepts only</strong> (No guided projects)
                </li>
                <li className="flex items-start">
                  <span className="text-cyan-400 text-xl mr-2">•</span> Peer collaboration via dedicated Slack channel
                </li>
                <li className="flex items-start">
                  <span className="text-cyan-400 text-xl mr-2">•</span> Access to all recorded lecture content
                </li>
              </ul>
            </div>
          </div>
        </section>

        {/* RESOURCES - Clean List with better emphasis */}
        <section className="max-w-5xl mx-auto space-y-8 pb-24">
          <Major type="b" className="text-white text-4xl text-center font-bold">
            Advanced Learning Resources
          </Major>

          <div className="bg-gray-800/70 p-8 rounded-xl space-y-4 shadow-xl border border-gray-700">
            {[
              { title: 'Mathematics for Machine Learning', prereq: 'No prerequisites' },
              { title: 'Python for Data Science (Beginner)', prereq: 'No prerequisites' },
              { title: 'Advanced Python', prereq: 'Beginner Python knowledge required' },
              { title: 'Fundamentals of Machine Learning', prereq: 'No prerequisites' },
              { title: 'Neural Networks & Deep Learning', prereq: 'Linear Algebra, Calculus, Python' },
              { title: 'Linear Algebra (3Blue1Brown)', prereq: 'Video Series' },
            ].map((resource, index) => (
              <div key={index} className="flex justify-between items-center border-b border-gray-700 last:border-b-0 py-2">
                <Mini className="text-white text-lg font-medium">
                  {resource.title}
                </Mini>
                <Mini className="text-indigo-300 text-sm font-light italic">
                  {resource.prereq}
                </Mini>
              </div>
            ))}
          </div>
        </section>
      </main>

      <Footer screen_width={windowWidth} className="bg-gray-900/80 border-t border-indigo-900" />
    </div>
  );
};

export default BootcampPage;