export interface ScheduleEvent {
  time: string;
  eventName: string;
  location: string;
  category: 'general' | 'food' | 'workshop' | 'activity';
}

export type DaySchedule = Record<string, ScheduleEvent[]>;
export const scheduleData: DaySchedule = {
  Friday: [
    { time: '5:00 PM', eventName: 'Check In Starts!', location: 'Klaus Atrium', category: 'general' },
    { time: '5:30 PM - 6:30 PM', eventName: 'Workshop', location: 'TBA', category: 'workshop' },
    { time: '6:30 PM - 7:30 PM', eventName: 'Opening ceremony', location: 'TBA', category: 'general' },
    { time: '7:30 PM - 8:30 PM', eventName: 'Sponsorship Fair', location: 'TBA', category: 'activity' },
    { time: '8:30 PM', eventName: 'Dinner', location: 'TBA', category: 'food' },
    { time: '9:30 PM - 10:30 PM', eventName: 'Workshop', location: 'TBA', category: 'workshop' },
    { time: '11:00 PM - 12:00 AM', eventName: 'Activity', location: 'TBA', category: 'activity' },
    { time: '12:00 AM', eventName: 'Midnight Snack', location: 'TBA', category: 'food' }
  ],
  Saturday: [
    { time: '9:00 AM', eventName: 'Breakfast', location: 'TBA', category: 'food' },
    { time: '10:00 AM - 11:00 AM', eventName: 'Workshop', location: 'TBA', category: 'workshop' },
    { time: '11:00 AM - 12:00 PM', eventName: 'Workshop', location: 'TBA', category: 'workshop' },
    { time: '12:00 PM', eventName: 'Lunch', location: 'TBA', category: 'food' },
    { time: '1:00 PM - 2:00 PM', eventName: 'Workshop', location: 'TBA', category: 'workshop' },
    { time: '2:00 PM - 3:00 PM', eventName: 'Mini Challenge', location: 'TBA', category: 'activity' },
    { time: '4:00 PM - 5:00 PM', eventName: 'Workshop', location: 'TBA', category: 'workshop' },
    { time: '5:00 PM - 6:00 PM', eventName: 'Workshop', location: 'TBA', category: 'workshop' },
    { time: '6:00 PM', eventName: 'Dinner', location: 'TBA', category: 'food' },
    { time: '8:00 PM - 9:00 PM', eventName: 'Activity', location: 'TBA', category: 'activity' },
    { time: '12:00 AM', eventName: 'Midnight Snack', location: 'TBA', category: 'food' }
  ],
  Sunday: [
    { time: '9:00 AM', eventName: 'Breakfast', location: 'TBA', category: 'food' },
    { time: '10:00 AM - 11:00 AM', eventName: 'Workshop', location: 'TBA', category: 'workshop' },
    { time: '11:00 AM - 2:00 PM', eventName: 'Judging', location: 'TBA', category: 'general' },
    { time: '2:00 PM', eventName: 'Lunch', location: 'TBA', category: 'food' },
    { time: '4:00 PM', eventName: 'Closing Ceremony', location: 'TBA', category: 'general' }
  ]
};

export const categories = [
  { id: 'general', name: 'General', icon: './small-candy/blue.png' },
  { id: 'food', name: 'Food', icon: './small-candy/green.png' },
  { id: 'workshop', name: 'Workshop', icon: './small-candy/pink.png' },
  { id: 'activity', name: 'Activity', icon: '/small-candy/yellow.png' }
];
