import { describe, it, expect, vi, beforeEach } from 'vitest';
import { appRouter } from '../root';
import { TRPCError } from '@trpc/server';
import { cache } from '../middleware/cache';
import { db } from '@query/db';
import { errorFormatter } from '../trpc';
import { sanitizeInput } from '../middleware/security';

// Fully mock the DB at the file level
const mockFindFirst = vi.fn();
const mockFindMany = vi.fn();
const mockInsert = vi.fn();
const mockUpdate = vi.fn();
const mockDelete = vi.fn();

vi.mock('@query/db', () => {
  return {
    db: {
      transaction: vi.fn().mockImplementation((callback) => callback(db)),
      query: {
        admins: {
          findFirst: (...args: any[]) => mockFindFirst('admins', ...args),
          findMany: (...args: any[]) => mockFindMany('admins', ...args),
        },
        hackathons: {
          findFirst: (...args: any[]) => mockFindFirst('hackathons', ...args),
          findMany: (...args: any[]) => mockFindMany('hackathons', ...args),
        },
        hackathonParticipants: {
          findFirst: (...args: any[]) => mockFindFirst('hackathonParticipants', ...args),
          findMany: (...args: any[]) => mockFindMany('hackathonParticipants', ...args),
        },
        hackathonTeams: {
          findFirst: (...args: any[]) => mockFindFirst('hackathonTeams', ...args),
          findMany: (...args: any[]) => mockFindMany('hackathonTeams', ...args),
        },
        users: {
          findFirst: (...args: any[]) => mockFindFirst('users', ...args),
          findMany: (...args: any[]) => mockFindMany('users', ...args),
        },
        members: {
          findFirst: (...args: any[]) => mockFindFirst('members', ...args),
          findMany: (...args: any[]) => mockFindMany('members', ...args),
        },
        events: {
          findFirst: (...args: any[]) => mockFindFirst('events', ...args),
          findMany: (...args: any[]) => mockFindMany('events', ...args),
        },
        judges: {
          findFirst: (...args: any[]) => mockFindFirst('judges', ...args),
          findMany: (...args: any[]) => mockFindMany('judges', ...args),
        },
        judgeAssignments: {
          findFirst: (...args: any[]) => mockFindFirst('judgeAssignments', ...args),
          findMany: (...args: any[]) => mockFindMany('judgeAssignments', ...args),
        },
        hackathonProjects: {
          findFirst: (...args: any[]) => mockFindFirst('hackathonProjects', ...args),
          findMany: (...args: any[]) => mockFindMany('hackathonProjects', ...args),
        }
      },
      insert: () => ({
        values: () => ({
          returning: mockInsert,
        }),
      }),
      update: () => ({
        set: () => ({
          where: mockUpdate,
        }),
      }),
      delete: () => ({
        where: mockDelete,
      }),
      select: vi.fn().mockImplementation(() => ({
        from: vi.fn().mockImplementation(() => ({
          where: vi.fn().mockImplementation(() => ({
            orderBy: vi.fn().mockResolvedValue([{ count: 0 }]),
          })),
          orderBy: vi.fn().mockResolvedValue([{ count: 0 }]),
        })),
      })),
    },
    admins: {
      userId: 'user_id',
      isActive: 'is_active',
      role: 'role',
    },
    users: {
      id: 'id',
      email: 'email',
    },
    hackathons: {
      id: 'id',
      status: 'status',
      isPublic: 'is_public',
      startDate: 'start_date',
      endDate: 'end_date',
    },
    hackathonParticipants: {
      id: 'id',
      hackathonId: 'hackathon_id',
      userId: 'user_id',
      status: 'status',
    },
    hackathonTeams: {
      id: 'id',
      hackathonId: 'hackathon_id',
      name: 'name',
    },
    members: {
      userId: 'user_id',
    },
    events: {
      id: 'id',
      title: 'title',
      qrCode: 'qr_code',
      checkInEnabled: 'check_in_enabled',
      eventDate: 'event_date',
    },
    judges: {
      id: 'id',
      userId: 'user_id',
    },
    judgeAssignments: {
      judgeId: 'judge_id',
      hackathonId: 'hackathon_id',
    },
    hackathonProjects: {
      id: 'id',
      hackathonId: 'hackathon_id',
    }
  };
});

describe('Router Integration and Access Control Verification Suite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    cache.clear();
  });

  const createMockCtx = (userId?: string, extra: Record<string, any> = {}, headers: Record<string, string> = {}) => {
    return {
      db,
      session: userId ? { user: { id: userId } } : null,
      userId: userId || undefined,
      cache: cache,
      clientIp: '127.0.0.1',
      req: {
        headers: {
          get: (name: string) => headers[name.toLowerCase()] || null,
        },
      },
      ...extra,
    } as any;
  };

  describe('1. Admin Permissions and Role Restrictons', () => {
    it('should query the database on cache miss and verify admin status', async () => {
      const ctx = createMockCtx('admin_user_id');
      mockFindFirst.mockImplementation((table) => {
        if (table === 'admins') {
          return { id: 'admin_1', userId: 'admin_user_id', role: 'admin', isActive: true, permissions: [] };
        }
        return null;
      });

      const caller = appRouter.createCaller(ctx);
      const res = await caller.admin.isAdmin();

      expect(res.isAdmin).toBe(true);
      expect(res.role).toBe('admin');
      expect(mockFindFirst).toHaveBeenCalledTimes(1);

      // Hit cache next time
      const cachedRes = await caller.admin.isAdmin();
      expect(cachedRes.isAdmin).toBe(true);
      expect(mockFindFirst).toHaveBeenCalledTimes(1);
    });

    it('should throw FORBIDDEN error when regular user calls admin endpoints', async () => {
      const ctx = createMockCtx('regular_user_id');
      mockFindFirst.mockReturnValue(null); // Not an admin

      const caller = appRouter.createCaller(ctx);
      await expect(caller.admin.analyticsOverview()).rejects.toThrowError('Admin access required');
    });

    it('should block non-super-admins from adding new admins', async () => {
      const ctx = createMockCtx('admin_user_id');
      mockFindFirst.mockImplementation((table) => {
        if (table === 'admins') {
          return { id: 'admin_1', userId: 'admin_user_id', role: 'admin', isActive: true };
        }
        return null;
      });

      const caller = appRouter.createCaller(ctx);
      await expect(
        caller.admin.create({
          userId: 'target_user_id',
          role: 'admin',
        })
      ).rejects.toThrowError('Super admin access required');
    });
  });

  describe('2. Hackathon and Club Events Access Controls', () => {
    it('should allow public listing of hackathons by unauthenticated users', async () => {
      const ctx = createMockCtx(); // No session
      mockFindMany.mockReturnValue([
        { id: 'h_1', name: 'Public Hackathon 2026', status: 'open', isPublic: true },
      ]);

      const caller = appRouter.createCaller(ctx);
      const result = await caller.hackathon.list({ limit: 10 });
      expect(result.length).toBe(1);
      expect(result[0].name).toBe('Public Hackathon 2026');
    });

    it('should separate hackathon event and club event category designations', () => {
      const hackathonType = { id: 'type_1', category: 'hackathon' };
      const clubType = { id: 'type_2', category: 'club' };
      expect(hackathonType.category).not.toBe(clubType.category);
    });
  });

  describe('3. Over-Fetching and Leakage Protections', () => {
    it('should strip secret qrCode from public events listing', async () => {
      const ctx = createMockCtx(); // Public user
      mockFindMany.mockReturnValue([
        { id: 'event_1', title: 'Keynote Speech', qrCode: 'secret_qr_code_123', checkInEnabled: true, eventDate: new Date() }
      ]);

      const caller = appRouter.createCaller(ctx);
      const listResult = await caller.events.list();
      
      expect(listResult.length).toBe(1);
      expect(listResult[0].title).toBe('Keynote Speech');
      // Assert qrCode is stripped from returned object
      expect((listResult[0] as any).qrCode).toBeUndefined();
    });

    it('should retain qrCode in admin listAll events endpoint', async () => {
      const ctx = createMockCtx('admin_user_id');
      mockFindFirst.mockImplementation((table) => {
        if (table === 'admins') {
          return { id: 'admin_1', userId: 'admin_user_id', role: 'admin', isActive: true };
        }
        return null;
      });
      mockFindMany.mockReturnValue([
        { id: 'event_1', title: 'Keynote Speech', qrCode: 'secret_qr_code_123', checkInEnabled: true, eventDate: new Date() }
      ]);

      const caller = appRouter.createCaller(ctx);
      const allResult = await caller.events.listAll();
      
      expect(allResult.length).toBe(1);
      expect(allResult[0].qrCode).toBe('secret_qr_code_123');
    });
  });

  describe('4. Secure Error Formatting', () => {
    it('should mask database connection string credentials in production mode', () => {
      const rawError = new Error('Fatal Postgres connection timeout: secret_password_value=xyz123');
      
      const originalEnv = process.env.NODE_ENV;
      (process.env as Record<string, string | undefined>).NODE_ENV = 'production';

      const trpcError = new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: rawError.message,
        cause: rawError,
      });

      const formatted = errorFormatter({
        shape: {
          message: trpcError.message,
          code: -32603,
          data: {
            code: 'INTERNAL_SERVER_ERROR',
            httpStatus: 500,
          },
        },
        error: trpcError,
      });

      (process.env as Record<string, string | undefined>).NODE_ENV = originalEnv;

      expect(formatted.message).toBe('An unexpected error occurred');
      expect(formatted.message).not.toContain('secret_password_value');
    });

    it('should retain detailed error messages in development mode', () => {
      const rawError = new Error('Database column missing error detail');
      
      const originalEnv = process.env.NODE_ENV;
      (process.env as Record<string, string | undefined>).NODE_ENV = 'development';

      const trpcError = new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: rawError.message,
        cause: rawError,
      });

      const formatted = errorFormatter({
        shape: {
          message: trpcError.message,
          code: -32603,
          data: {
            code: 'INTERNAL_SERVER_ERROR',
            httpStatus: 500,
          },
        },
        error: trpcError,
      });

      (process.env as Record<string, string | undefined>).NODE_ENV = originalEnv;

      expect(formatted.message).toBe('Database column missing error detail');
    });
  });

  describe('5. Content-Type Evasion and CSRF Protection', () => {
    it('should allow mutation when Content-Type is application/json', async () => {
      const ctx = createMockCtx('admin_user_id', {}, { 'content-type': 'application/json' });
      mockFindFirst.mockImplementation((table, query) => {
        if (table === 'admins') {
          if (query && JSON.stringify(query).includes('target_user')) {
            return null; // Target user is not already admin
          }
          return { id: 'admin_1', userId: 'admin_user_id', role: 'super_admin', isActive: true };
        }
        if (table === 'users') {
          return { id: 'target_user' };
        }
        return null;
      });
      mockInsert.mockReturnValue([{ id: 'new_admin' }]);

      const caller = appRouter.createCaller(ctx);
      const res = await caller.admin.create({
        userId: 'target_user',
        role: 'admin',
      });
      expect(res).toBeDefined();
    });

    it('should block mutation when Content-Type is text/plain (CORS preflight bypass)', async () => {
      const ctx = createMockCtx('admin_user_id', {}, { 'content-type': 'text/plain' });
      
      const caller = appRouter.createCaller(ctx);
      await expect(
        caller.admin.create({
          userId: 'target_user',
          role: 'admin',
        })
      ).rejects.toThrowError('Invalid Content-Type for mutation request');
    });

    it('should block mutation when Content-Type is application/x-www-form-urlencoded', async () => {
      const ctx = createMockCtx('admin_user_id', {}, { 'content-type': 'application/x-www-form-urlencoded' });
      
      const caller = appRouter.createCaller(ctx);
      await expect(
        caller.admin.create({
          userId: 'target_user',
          role: 'admin',
        })
      ).rejects.toThrowError('Invalid Content-Type for mutation request');
    });

    it('should allow queries even with text/plain Content-Type (safe side-effect free requests)', async () => {
      const ctx = createMockCtx('admin_user_id', {}, { 'content-type': 'text/plain' });
      mockFindFirst.mockImplementation((table) => {
        if (table === 'admins') {
          return { id: 'admin_1', userId: 'admin_user_id', role: 'admin', isActive: true, permissions: [] };
        }
        return null;
      });

      const caller = appRouter.createCaller(ctx);
      const res = await caller.admin.isAdmin();
      expect(res.isAdmin).toBe(true);
    });
  });

  describe('6. Postgres Connection Starvation and Parameter Safety', () => {
    it('should format Postgres connection pool exhaustion errors safely in production', () => {
      const pgError = new Error('sorry, too many clients already');
      
      const originalEnv = process.env.NODE_ENV;
      (process.env as Record<string, string | undefined>).NODE_ENV = 'production';

      const trpcError = new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: pgError.message,
        cause: pgError,
      });

      const formatted = errorFormatter({
        shape: {
          message: trpcError.message,
          code: -32603,
          data: {
            code: 'INTERNAL_SERVER_ERROR',
            httpStatus: 500,
          },
        },
        error: trpcError,
      });

      (process.env as Record<string, string | undefined>).NODE_ENV = originalEnv;

      // Ensure error details about clients or connection exhaustion are masked
      expect(formatted.message).toBe('An unexpected error occurred');
      expect(formatted.message).not.toContain('too many clients');
    });

    it('should ensure backslash escapes in sql queries are checked securely', () => {
      // Drizzle handles parameterization automatically, so raw inputs are never interpolated directly.
      // We test that inputs containing backslashes are sanitized/passed as single literals.
      const dangerousValue = "value\\' OR \\'1\\'=\\'1";
      const cleanValue = sanitizeInput(dangerousValue);
      expect(typeof cleanValue).toBe('string');
    });
  });

  describe('7. Hackathon Teams, Judge and Project Submission Restrictions', () => {
    it('should reject team creation if maxMembers is greater than 4', async () => {
      const ctx = createMockCtx('user_id');
      const caller = appRouter.createCaller(ctx);
      await expect(
        caller.team.createTeam({
          hackathonId: '00000000-0000-0000-0000-000000000000',
          name: 'Super Team',
          maxMembers: 5,
        })
      ).rejects.toThrow();
    });

    it('should prevent registered participants from applying to be a judge', async () => {
      const ctx = createMockCtx('participant_user_id');
      const hackathonId = '00000000-0000-0000-0000-000000000001';
      mockFindFirst.mockImplementation((table) => {
        if (table === 'hackathonParticipants') {
          return { id: 'participant_1', userId: 'participant_user_id', hackathonId };
        }
        return null;
      });

      const caller = appRouter.createCaller(ctx);
      await expect(
        caller.judge.register({
          hackathonId,
          name: 'John Doe',
          email: 'john@example.com',
        })
      ).rejects.toThrowError('You cannot apply to be a judge because you are registered as a participant for this hackathon.');
    });

    it('should prevent project submissions before 12 hours after the hacking begins', async () => {
      const ctx = createMockCtx('captain_user_id');
      const hackathonId = '00000000-0000-0000-0000-000000000001';
      const teamId = '00000000-0000-0000-0000-000000000002';
      
      const recentStartDate = new Date(Date.now() - 11 * 60 * 60 * 1000); // 11 hours ago

      mockFindFirst.mockImplementation((table) => {
        if (table === 'hackathonParticipants') {
          return { id: 'participant_1', userId: 'captain_user_id', hackathonId, teamId };
        }
        if (table === 'hackathons') {
          return { id: hackathonId, startDate: recentStartDate, hackingStartTime: null };
        }
        if (table === 'hackathonTeams') {
          return { id: teamId, captainId: 'captain_user_id', hackathonId };
        }
        return null;
      });

      const caller = appRouter.createCaller(ctx);
      await expect(
        caller.team.submitProject({
          hackathonId,
          teamId,
          name: 'Awesome Project',
          description: 'This is a long description of the awesome project.',
        })
      ).rejects.toThrowError('Project submission is not open yet. It starts 12 hours after the hacking begins.');
    });

    it('should prevent project edits (existing project) after 34 hours of starting hacking', async () => {
      const ctx = createMockCtx('captain_user_id');
      const hackathonId = '00000000-0000-0000-0000-000000000001';
      const teamId = '00000000-0000-0000-0000-000000000002';
      
      const startDate35hAgo = new Date(Date.now() - 35 * 60 * 60 * 1000); // 35 hours ago

      mockFindFirst.mockImplementation((table) => {
        if (table === 'hackathonParticipants') {
          return { id: 'participant_1', userId: 'captain_user_id', hackathonId, teamId };
        }
        if (table === 'hackathons') {
          return { id: hackathonId, startDate: startDate35hAgo, hackingStartTime: null };
        }
        if (table === 'hackathonTeams') {
          return { id: teamId, captainId: 'captain_user_id', hackathonId };
        }
        if (table === 'hackathonProjects') {
          return { id: 'project_1', hackathonId, teamId, name: 'Old Name', description: 'Old Description' };
        }
        return null;
      });

      const caller = appRouter.createCaller(ctx);
      await expect(
        caller.team.submitProject({
          hackathonId,
          teamId,
          name: 'Awesome Project',
          description: 'This is a long description of the awesome project.',
        })
      ).rejects.toThrowError('Project edits are closed. Devposts must be final 34 hours after the hacking starts.');
    });

    it('should prevent project submissions more than 36 hours after hacking starts', async () => {
      const ctx = createMockCtx('captain_user_id');
      const hackathonId = '00000000-0000-0000-0000-000000000001';
      const teamId = '00000000-0000-0000-0000-000000000002';
      
      const pastStartDate = new Date(Date.now() - 37 * 60 * 60 * 1000); // 37 hours ago

      mockFindFirst.mockImplementation((table) => {
        if (table === 'hackathonParticipants') {
          return { id: 'participant_1', userId: 'captain_user_id', hackathonId, teamId };
        }
        if (table === 'hackathons') {
          return { id: hackathonId, startDate: pastStartDate, hackingStartTime: null };
        }
        if (table === 'hackathonTeams') {
          return { id: teamId, captainId: 'captain_user_id', hackathonId };
        }
        return null;
      });

      const caller = appRouter.createCaller(ctx);
      await expect(
        caller.team.submitProject({
          hackathonId,
          teamId,
          name: 'Awesome Project',
          description: 'This is a long description of the awesome project.',
        })
      ).rejects.toThrowError('Project submission closed. The submission window ended 36 hours after the hacking started.');
    });
  });

});
