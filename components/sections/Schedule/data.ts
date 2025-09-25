export interface ScheduleEvent {
  time: string;
  eventName: string;
  location: string;
  category: 'general' | 'food' | 'workshop' | 'activity';
}

export type DaySchedule = Record<string, ScheduleEvent[]>;

export const scheduleData: DaySchedule = {
  Sunday: [
    { time: '09:00 AM', eventName: 'Opening Keynote', location: 'Main Auditorium', category: 'general' },
    { time: '10:30 AM', eventName: 'Coffee Break', location: 'Lobby Area', category: 'food' },
    { time: '11:00 AM', eventName: 'React Best Practices', location: 'Room A', category: 'workshop' },
    { time: '12:30 PM', eventName: 'Lunch Break', location: 'Cafeteria', category: 'food' },
    { time: '02:00 PM', eventName: 'Networking Session', location: 'Garden Area', category: 'activity' }
  ],
  Friday: [
    { time: '09:00 AM', eventName: 'AI in Development', location: 'Tech Theater', category: 'workshop' },
    { time: '10:30 AM', eventName: 'Morning Coffee', location: 'Cafe Corner', category: 'food' },
    { time: '11:00 AM', eventName: 'Cloud Architecture', location: 'Room C', category: 'workshop' },
    { time: '12:30 PM', eventName: 'Catered Lunch', location: 'Main Dining', category: 'food' },
    { time: '02:00 PM', eventName: 'Team Building', location: 'Activity Center', category: 'activity' }
  ],
  Saturday: [
    { time: '09:00 AM', eventName: 'Mobile Development', location: 'Studio A', category: 'workshop' },
    { time: '10:30 AM', eventName: 'Breakfast Meetup', location: 'Breakfast Nook', category: 'food' },
    { time: '11:00 AM', eventName: 'UI/UX Workshop', location: 'Design Lab', category: 'workshop' },
    { time: '12:30 PM', eventName: 'Group Lunch', location: 'Outdoor Patio', category: 'food' },
    { time: '02:00 PM', eventName: 'Hackathon Prep', location: 'Coding Space', category: 'activity' }
  ]
};

export const categories = [
  { id: 'general', name: 'General', icon: './small-candy/blue.png' },
  { id: 'food', name: 'Food', icon: './small-candy/green.png' },
  { id: 'workshop', name: 'Workshop', icon: './small-candy/pink.png' },
  { id: 'activity', name: 'Activity', icon: '/small-candy/yellow.png' }
];
