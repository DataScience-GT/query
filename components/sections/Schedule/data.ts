export interface ScheduleEvent {
  time: string;
  eventName: string;
  location: string;
  category: 'general' | 'food' | 'workshop' | 'activity';
}

export type DaySchedule = Record<string, ScheduleEvent[]>;
export const scheduleData: DaySchedule = {
  Friday: [
    { time: '09:00 AM', eventName: 'Pending', location: 'Pending', category: 'general' },
    { time: '10:30 AM', eventName: 'Pending', location: 'Pending', category: 'food' },
    { time: '11:00 AM', eventName: 'Pending', location: 'Pending', category: 'workshop' },
    { time: '12:30 PM', eventName: 'Pending', location: 'Pending', category: 'food' },
    { time: '02:00 PM', eventName: 'Pending', location: 'Pending', category: 'activity' }
  ],
  Saturday: [
    { time: '09:00 AM', eventName: 'Pending', location: 'Pending', category: 'workshop' },
    { time: '10:30 AM', eventName: 'Pending', location: 'Pending', category: 'food' },
    { time: '11:00 AM', eventName: 'Pending', location: 'Pending', category: 'workshop' },
    { time: '12:30 PM', eventName: 'Pending', location: 'Pending', category: 'food' },
    { time: '02:00 PM', eventName: 'Pending', location: 'Pending', category: 'activity' }
  ],
  Sunday: [
    { time: '09:00 AM', eventName: 'Pending', location: 'Pending', category: 'workshop' },
    { time: '10:30 AM', eventName: 'Pending', location: 'Pending', category: 'food' },
    { time: '11:00 AM', eventName: 'Pending', location: 'Pending', category: 'workshop' },
    { time: '12:30 PM', eventName: 'Pending', location: 'Pending', category: 'food' },
    { time: '02:00 PM', eventName: 'Pending', location: 'Pending', category: 'activity' }
  ]
};

export const categories = [
  { id: 'general', name: 'General', icon: './small-candy/blue.png' },
  { id: 'food', name: 'Food', icon: './small-candy/green.png' },
  { id: 'workshop', name: 'Workshop', icon: './small-candy/pink.png' },
  { id: 'activity', name: 'Activity', icon: '/small-candy/yellow.png' }
];
