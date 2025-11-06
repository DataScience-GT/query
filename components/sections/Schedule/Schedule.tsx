"use client";
import React, { useState } from 'react';
import { scheduleData, categories } from './data';
import DayButtons from '../../ui/DayButtons';
import EventList from '../../ui/EventList';
import CategoryFilter from '../../ui/CategoryFilter';

export default function Schedule() {
  const [selectedDay, setSelectedDay] = useState('Sunday');
  const [selectedCategory, setSelectedCategory] = useState('all'); // start with “all”

  // filtering button 
  const filtered =
    selectedCategory === 'all'
      ? scheduleData[selectedDay]
      : scheduleData[selectedDay].filter(
          e => e.category === selectedCategory
        );

  const iconFor = (category: string) =>
    categories.find(c => c.id === category)?.icon || '/images/icons/general.png';

  return (
    <section
      id="schedule"
      className="scroll-mt-28 min-h-screen py-16 px-4"
      style={{ backgroundColor: '#A4C7FF' }}
    >
      <div className="max-w-6xl mx-auto px-4">
        {/* Title centered */}
        <h1 className="text-5xl font-bold mb-10 text-white text-center">
          Schedule
        </h1>

        <DayButtons
          days={Object.keys(scheduleData)}
          selectedDay={selectedDay}
          onSelect={setSelectedDay}
        />

        {/* Inner container with pink background */}
        <div
          className="rounded-2xl overflow-hidden shadow-lg"
          style={{ backgroundColor: '#FE97B0' }}
        >
          {/* Table header */}
          <div className="py-4 px-4 font-bold text-left grid grid-cols-1 md:grid-cols-3 gap-4 text-white">
            <div>Time</div>
            <div>Event</div>
            <div>Location</div>
          </div>

          {/* Events */}
          <EventList events={filtered} iconFor={iconFor} />

          {/* Category Filter */}
          <CategoryFilter
            selected={selectedCategory}
            onSelect={setSelectedCategory}
            bgColor="#FE97B0"
          />
        </div>
      </div>
    </section>
  );
}
