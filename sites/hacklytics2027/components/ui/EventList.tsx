"use client";

import type React from 'react';
import { ScheduleEvent } from '../sections/Schedule/data';

interface Props {
  events: ScheduleEvent[];
  iconFor: (category: string) => string;
}

export default function EventList({ events, iconFor }: Props) {
  return (
    <div className="divide-y divide-white">
      {events.map((event, i) => (
        <div
          key={i}
          className="grid grid-cols-1 md:grid-cols-3 gap-4 py-6 px-6"
          style={{ backgroundColor: '#FE97B0' }}
        >
          <div className="flex items-center space-x-3">
            <span
              className="w-8 h-8 bg-center bg-no-repeat bg-contain inline-block"
              style={{ backgroundImage: `url(${iconFor(event.category)})` }}
            />
            <span className="font-semibold text-lg text-white">{event.time}</span>
          </div>
          <div className="flex items-center">
            <span className="font-semibold text-lg text-white">{event.eventName}</span>
          </div>
          <div className="flex items-center">
            <span className="text-lg text-white">{event.location}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
