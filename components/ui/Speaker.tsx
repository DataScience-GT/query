"use client";

import React from 'react';

interface Speaker {
  id: number;
  name: string;
  title: string;
  company: string;
  bio: string;
  image: string;
}

interface SpeakersProps {
  speakers: Speaker[];
}

const Speakers: React.FC<SpeakersProps> = ({ speakers }) => {
  return (
    <div className="text-center">
      <h2 className="text-5xl font-bold text-white mb-12 drop-shadow-lg">
        Speakers
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
        {speakers.map((speaker) => (
          <div
            key={speaker.id}
            className="bg-gradient-to-br from-green-300 to-green-400 rounded-2xl overflow-hidden shadow-xl hover:shadow-2xl transition-shadow duration-300"
          >
            {/* Speaker Image */}
            <div className="p-6 pb-4">
              <div className="w-32 h-32 mx-auto rounded-2xl overflow-hidden shadow-lg">
                <img
                  src={speaker.image}
                  alt={speaker.name}
                  className="w-full h-full object-cover"
                />
              </div>
            </div>
            {/* Speaker Info */}
            <div className="px-6 pb-6">
              <h3 className="text-lg font-bold text-gray-800 mb-1">
                {speaker.name}
              </h3>
              <p className="text-sm text-gray-700 mb-1">
                {speaker.title}
              </p>
              <p className="text-sm text-gray-700 mb-3">
                {speaker.company}
              </p>
              <p className="text-xs text-gray-600 leading-relaxed">
                {speaker.bio}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default Speakers;
