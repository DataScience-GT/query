import { TRPCError } from '@trpc/server';
import { db } from '@query/db';
import { roles, users } from '@query/db/schema';

export async function requireAdmin(ctx: any) {
  if (!ctx.user) throw new TRPCError({ code: 'UNAUTHORIZED' });

  const u = await db.select().from(users).where(users.id.eq(ctx.user.id)).then(r => r[0]);
  if (!u) throw new TRPCError({ code: 'UNAUTHORIZED' });

  const r = await db.select().from(roles).where(roles.id.eq(u.role_id)).then(r => r[0]);
  if (!r || r.name !== 'admin') throw new TRPCError({ code: 'FORBIDDEN' });

  return true;
}
