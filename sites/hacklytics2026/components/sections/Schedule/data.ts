export interface ScheduleEvent {
  time: string;
  eventName: string;
  location: string;
  category: 'general' | 'food' | 'workshop' | 'activity';
}

export type DaySchedule = Record<string, ScheduleEvent[]>;
export const scheduleData: DaySchedule = {
  Friday: [
    { time: '5:00 PM', eventName: 'Check In', location: 'Klaus Atrium', category: 'general' },
    { time: '6:30 PM - 7:15 PM', eventName: 'Opening Ceremony', location: 'Howey', category: 'general' },
    { time: '7:30 PM - 8:30 PM', eventName: 'Sponsorship Fair', location: 'Klaus Atrium', category: 'general' },
    { time: '8:30 PM', eventName: 'Dinner', location: 'Klaus 1116', category: 'food' },
    { time: '9:30 PM - 10:30 PM', eventName: 'Figma Workshop', location: 'Klaus 1443', category: 'workshop' },
    { time: '10:30 PM - 11:30 PM', eventName: 'Wellness Kit Distribution', location: 'Klaus 1116', category: 'activity' },
    { time: '12:00 AM', eventName: 'Midnight Snack', location: 'Klaus 1116', category: 'food' }
  ],
  Saturday: [
    { time: '9:00 AM', eventName: 'Breakfast', location: 'Klaus 1116', category: 'food' },
    { time: '10:00 AM - 11:00 AM', eventName: 'MLH Workshop', location: 'Klaus 2443', category: 'workshop' },
    { time: '11:00 AM - 12:00 PM', eventName: 'Sphinx Workshop', location: 'Klaus 1456', category: 'workshop' },
    { time: '12:00 PM', eventName: 'Lunch', location: 'Klaus 1116', category: 'food' },
    { time: '1:00 PM - 2:00 PM', eventName: 'Databricks Workshop', location: 'Klaus 1443', category: 'workshop' },
    { time: '2:00 PM - 3:00 PM', eventName: 'Chubby Bunny Challenge', location: 'Klaus Atrium', category: 'activity' },
    { time: '4:00 PM - 5:00 PM', eventName: 'GrowthFactor Workshop', location: 'Klaus 1456', category: 'workshop' },
    { time: '5:00 PM - 6:00 PM', eventName: 'MLH Activity', location: 'Klaus 1447', category: 'activity' },
    { time: '6:00 PM - 7:00 PM', eventName: 'Generative AI Panel', location: 'Klaus 1443', category: 'workshop' },
    { time: '7:00 PM', eventName: 'Dinner', location: 'Klaus 1116', category: 'food' },
    { time: '8:00 PM - 10:00 PM', eventName: 'Scavenger Hunt', location: 'TBA', category: 'activity' },
    { time: '10:00 PM - 12:00 AM', eventName: 'Karaoke', location: 'Klaus 2456', category: 'activity' },
    { time: '12:00 AM', eventName: 'Midnight Snack', location: 'Klaus 1116', category: 'food' }
  ],
  Sunday: [
    { time: '9:00 AM', eventName: 'Breakfast', location: 'Klaus 1116', category: 'food' },
    { time: '11:00 AM - 2:00 PM', eventName: 'Judging', location: 'Throughout Klaus', category: 'general' },
    { time: '2:00 PM', eventName: 'Lunch', location: 'Klaus 1116', category: 'food' },
    { time: '4:00 PM', eventName: 'Closing Ceremony', location: 'Howey', category: 'general' }
  ]
};

export const categories = [
  { id: 'general', name: 'General', icon: './small-candy/blue.png' },
  { id: 'food', name: 'Food', icon: './small-candy/green.png' },
  { id: 'workshop', name: 'Workshop', icon: './small-candy/pink.png' },
  { id: 'activity', name: 'Activity', icon: '/small-candy/yellow.png' }
];
