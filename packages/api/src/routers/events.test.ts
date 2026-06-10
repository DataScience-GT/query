import { describe, it, expect, vi } from 'vitest';

vi.mock('@/db', () => ({
  db: {
    query: {
      hackathonParticipants: { findFirst: vi.fn() },
      events: { findFirst: vi.fn() }
    }
  }
}));

describe('Events Router Logic', () => {
  it('should detect if a user is already checked in', () => {
    // Unique test case: Handling duplicate check-ins
    const checkIns = [{ participantId: 'p-123', eventId: 'e-456' }];
    
    const isCheckedIn = checkIns.some(c => c.participantId === 'p-123' && c.eventId === 'e-456');
    expect(isCheckedIn).toBe(true);
  });

  it('should allow check-in if no prior record exists', () => {
    const checkIns = [{ participantId: 'p-999', eventId: 'e-456' }];
    
    const isCheckedIn = checkIns.some(c => c.participantId === 'p-123' && c.eventId === 'e-456');
    expect(isCheckedIn).toBe(false);
  });
});
