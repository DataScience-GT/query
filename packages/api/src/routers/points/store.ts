import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import {
  hackathons,
  hackathonParticipants,
  hackathonStoreItems,
  hackathonStorePurchases,
  users,
} from "@query/db";
import type { DrizzleDB } from "@query/db";
import { createTRPCRouter } from "../../trpc";
import { isAdmin, isScanner } from "../../middleware/procedures";
import { recordAdminAction } from "../../middleware/audit";
import { CacheKeys } from "../../middleware/cache";
import { isUniqueViolation } from "../../middleware/db-errors";
import {
  balancesFor,
  canSupply,
  fullName,
  personName,
  readBalance,
  searchParticipants,
} from "../../services/points";

const hackathonScope = z.object({
  hackathonId: z.string().uuid("Invalid hackathon ID"),
});

const itemScope = hackathonScope.extend({
  itemId: z.string().uuid("Invalid item ID"),
});

const MAX_POINTS = 100_000;

const itemName = z
  .string()
  .trim()
  .min(1, "Give the item a name")
  .max(120, "Keep the name under 120 characters");
const itemDescription = z.string().trim().max(2000).nullish();
const itemPrice = z
  .number()
  .int("Prices are whole points")
  .min(0, "A price cannot be negative")
  .max(MAX_POINTS);
// Null means nobody is counting; the soldOut switch then says when it is gone.
const itemStock = z
  .number()
  .int("Stock is a whole number")
  .min(0, "Stock cannot be negative")
  .max(MAX_POINTS)
  .nullable();
const itemOrder = z.number().int().min(0).max(10_000);

// Blank means none, so clearing the field clears the column.
const blankToNull = (value: string | null | undefined) =>
  value === undefined ? undefined : value || null;

const staleItem = (name: string) =>
  new TRPCError({
    code: "CONFLICT",
    message: `Someone changed ${name} since you opened it. Reload to see their changes, then edit again.`,
  });

export const pointsStoreRouter = createTRPCRouter({
  settings: isAdmin.input(hackathonScope).query(async ({ ctx, input }) => {
    const hackathon = await (ctx.db as DrizzleDB).query.hackathons.findFirst({
      where: eq(hackathons.id, input.hackathonId),
      columns: {
        storeCatalogVisible: true,
        storeOpen: true,
        storeLocation: true,
      },
    });

    if (!hackathon) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Hackathon not found",
      });
    }

    return {
      catalogVisible: hackathon.storeCatalogVisible,
      open: hackathon.storeOpen,
      location: hackathon.storeLocation,
    };
  }),

  // Visibility and open are separate on purpose: a catalog can go up the
  // night before so hackers can plan, while the table opens on Sunday.
  // Closed is a note for hackers, not a lock; staff can still record a sale.
  updateSettings: isAdmin
    .input(
      hackathonScope.extend({
        catalogVisible: z.boolean().optional(),
        open: z.boolean().optional(),
        location: z.string().trim().max(240).nullish(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = ctx.db as DrizzleDB;

      const [updated] = await db
        .update(hackathons)
        .set({
          storeCatalogVisible: input.catalogVisible,
          storeOpen: input.open,
          storeLocation: blankToNull(input.location),
          updatedAt: new Date(),
        })
        .where(eq(hackathons.id, input.hackathonId))
        .returning({
          catalogVisible: hackathons.storeCatalogVisible,
          open: hackathons.storeOpen,
          location: hackathons.storeLocation,
        });

      if (!updated) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Hackathon not found",
        });
      }

      // getById serves the hackathon row from cache, store columns included.
      ctx.cache.delete(CacheKeys.hackathon(input.hackathonId));

      await recordAdminAction(db, {
        userId: ctx.userId,
        action: "points.store.updateSettings",
        resourceId: input.hackathonId,
        metadata: updated,
      });

      return updated;
    }),

  // The catalog as the table sees it. Archived items only on request: they
  // are out of the catalog but their purchases still point at them.
  items: isScanner
    .input(
      hackathonScope.extend({ includeArchived: z.boolean().default(false) }),
    )
    .query(async ({ ctx, input }) => {
      return (ctx.db as DrizzleDB)
        .select()
        .from(hackathonStoreItems)
        .where(
          and(
            eq(hackathonStoreItems.hackathonId, input.hackathonId),
            input.includeArchived
              ? undefined
              : eq(hackathonStoreItems.archived, false),
          ),
        )
        .orderBy(
          asc(hackathonStoreItems.archived),
          asc(hackathonStoreItems.displayOrder),
          asc(hackathonStoreItems.name),
          asc(hackathonStoreItems.id),
        );
    }),

  createItem: isAdmin
    .input(
      hackathonScope.extend({
        name: itemName,
        description: itemDescription,
        price: itemPrice,
        stock: itemStock,
        soldOut: z.boolean().default(false),
        displayOrder: itemOrder.default(0),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = ctx.db as DrizzleDB;

      const hackathon = await db.query.hackathons.findFirst({
        where: eq(hackathons.id, input.hackathonId),
        columns: { id: true },
      });

      if (!hackathon) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Hackathon not found",
        });
      }

      const [item] = await db
        .insert(hackathonStoreItems)
        .values({
          hackathonId: input.hackathonId,
          name: input.name,
          description: blankToNull(input.description),
          price: input.price,
          stock: input.stock,
          // The switch means nothing while stock is counted.
          soldOut: input.stock === null && input.soldOut,
          displayOrder: input.displayOrder,
        })
        .returning();

      return item!;
    }),

  // Partial edits, guarded by the revision the form was opened at. A sale
  // bumps the revision too, so a stale form cannot write its old stock count
  // over a decrement that happened while it was open.
  updateItem: isAdmin
    .input(
      itemScope.extend({
        revision: z.number().int().min(0),
        name: itemName.optional(),
        description: itemDescription,
        price: itemPrice.optional(),
        stock: itemStock.optional(),
        soldOut: z.boolean().optional(),
        archived: z.boolean().optional(),
        displayOrder: itemOrder.optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = ctx.db as DrizzleDB;

      const current = await db.query.hackathonStoreItems.findFirst({
        where: and(
          eq(hackathonStoreItems.id, input.itemId),
          eq(hackathonStoreItems.hackathonId, input.hackathonId),
        ),
      });

      if (!current) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "That item is no longer in the store.",
        });
      }

      if (current.revision !== input.revision) throw staleItem(current.name);

      const stock = input.stock === undefined ? current.stock : input.stock;

      const [updated] = await db
        .update(hackathonStoreItems)
        .set({
          name: input.name,
          description: blankToNull(input.description),
          price: input.price,
          stock,
          soldOut: stock === null && (input.soldOut ?? current.soldOut),
          archived: input.archived,
          displayOrder: input.displayOrder,
          revision: sql`${hackathonStoreItems.revision} + 1`,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(hackathonStoreItems.id, current.id),
            eq(hackathonStoreItems.revision, input.revision),
          ),
        )
        .returning();

      // Someone saved, or something sold, between the read and the write.
      if (!updated) throw staleItem(current.name);

      return updated;
    }),

  // Only an item nobody has bought. Once there are purchases, archiving takes
  // it out of the catalog and keeps the link a restock needs.
  deleteItem: isAdmin.input(itemScope).mutation(async ({ ctx, input }) => {
    const db = ctx.db as DrizzleDB;

    const item = await db.transaction(async (tx) => {
      // Locked as a sale locks it, so a sale in flight finishes before the
      // count below is taken.
      const [locked] = await tx
        .select({ id: hackathonStoreItems.id, name: hackathonStoreItems.name })
        .from(hackathonStoreItems)
        .where(
          and(
            eq(hackathonStoreItems.id, input.itemId),
            eq(hackathonStoreItems.hackathonId, input.hackathonId),
          ),
        )
        .for("update");

      if (!locked) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "That item is no longer in the store.",
        });
      }

      const [sales] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(hackathonStorePurchases)
        .where(eq(hackathonStorePurchases.itemId, locked.id));

      const sold = sales?.count ?? 0;
      if (sold > 0) {
        throw new TRPCError({
          code: "CONFLICT",
          message: `${locked.name} is on ${sold} purchase${sold === 1 ? "" : "s"}. Archive it instead; that takes it out of the catalog and keeps its history.`,
        });
      }

      await tx
        .delete(hackathonStoreItems)
        .where(eq(hackathonStoreItems.id, locked.id));

      return locked;
    });

    await recordAdminAction(db, {
      userId: ctx.userId,
      action: "points.store.deleteItem",
      resourceId: item.id,
      metadata: { hackathonId: input.hackathonId, name: item.name },
    });

    return { success: true };
  }),

  // Finding the buyer by name or email, with what they can spend.
  searchParticipants: isScanner
    .input(hackathonScope.extend({ query: z.string().trim().min(1).max(120) }))
    .query(async ({ ctx, input }) => {
      const db = ctx.db as DrizzleDB;

      const matches = await searchParticipants(db, {
        hackathonId: input.hackathonId,
        query: input.query,
        limit: 20,
      });

      const balanceOf = await balancesFor(
        db,
        input.hackathonId,
        matches.map((match) => match.id),
      );

      return matches.map((match) => ({
        ...match,
        balance: balanceOf(match.id),
      }));
    }),

  // The buyer from a scanned pass, which carries only their participant id.
  lookupParticipant: isScanner
    .input(
      hackathonScope.extend({
        participantId: z.string().uuid("Invalid participant ID"),
      }),
    )
    .query(async ({ ctx, input }) => {
      const db = ctx.db as DrizzleDB;

      const participant = await db.query.hackathonParticipants.findFirst({
        where: and(
          eq(hackathonParticipants.id, input.participantId),
          eq(hackathonParticipants.hackathonId, input.hackathonId),
        ),
        columns: {
          id: true,
          firstName: true,
          lastName: true,
          registrationStatus: true,
        },
        with: { user: { columns: { name: true, email: true } } },
      });

      if (!participant) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message:
            "That pass is not for this hackathon. Search for the person by name instead.",
        });
      }

      return {
        id: participant.id,
        name: fullName(
          personName({ ...participant, accountName: participant.user.name }),
          participant.user.email,
        ),
        email: participant.user.email,
        registrationStatus: participant.registrationStatus,
        balance: await readBalance(db, participant.id),
      };
    }),

  // One sale at the table. The id comes from the station's browser and is
  // the idempotency key: a retry after a dropped response finds the sale it
  // already made instead of charging twice.
  purchase: isScanner
    .input(
      hackathonScope.extend({
        purchaseId: z.string().uuid("Invalid purchase ID"),
        participantId: z.string().uuid("Invalid participant ID"),
        itemId: z.string().uuid("Invalid item ID"),
        quantity: z
          .number()
          .int()
          .min(1, "Buy at least one")
          .max(20, "At most 20 of one item per sale"),
        // The price the station showed. A different price now means someone
        // edited the item, and the buyer should see the new total first.
        unitPrice: itemPrice,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = ctx.db as DrizzleDB;

      try {
        return await db.transaction(async (tx) => {
          // Participant first, then item. Two sales to one person, or a sale
          // and a deduction, queue here and each reads the balance the other
          // left behind; that is what stops two stations overspending it.
          const [participant] = await tx
            .select({
              id: hackathonParticipants.id,
              registrationStatus: hackathonParticipants.registrationStatus,
              firstName: hackathonParticipants.firstName,
              lastName: hackathonParticipants.lastName,
              accountName: users.name,
              email: users.email,
            })
            .from(hackathonParticipants)
            .innerJoin(users, eq(users.id, hackathonParticipants.userId))
            .where(
              and(
                eq(hackathonParticipants.id, input.participantId),
                eq(hackathonParticipants.hackathonId, input.hackathonId),
              ),
            )
            .for("update", { of: hackathonParticipants });

          if (!participant) {
            throw new TRPCError({
              code: "NOT_FOUND",
              message: "That person is not registered for this hackathon.",
            });
          }

          const [existing] = await tx
            .select()
            .from(hackathonStorePurchases)
            .where(eq(hackathonStorePurchases.id, input.purchaseId));

          if (existing) {
            const sameSale =
              existing.hackathonId === input.hackathonId &&
              existing.participantId === input.participantId &&
              existing.itemId === input.itemId &&
              existing.quantity === input.quantity &&
              existing.unitPrice === input.unitPrice;
            if (!sameSale) {
              throw new TRPCError({
                code: "CONFLICT",
                message:
                  "This sale's id was already used for a different sale. Start the sale again.",
              });
            }
            return {
              purchase: existing,
              replayed: true,
              balance: await readBalance(tx, participant.id),
            };
          }

          const name = fullName(personName(participant), participant.email);

          if (participant.registrationStatus !== "checked_in") {
            throw new TRPCError({
              code: "PRECONDITION_FAILED",
              message: `${name} has not checked in at the registration desk, so they cannot spend points yet.`,
            });
          }

          const [item] = await tx
            .select()
            .from(hackathonStoreItems)
            .where(
              and(
                eq(hackathonStoreItems.id, input.itemId),
                eq(hackathonStoreItems.hackathonId, input.hackathonId),
              ),
            )
            .for("update");

          if (!item || item.archived) {
            throw new TRPCError({
              code: "NOT_FOUND",
              message:
                "That item is no longer in the store. Reload the catalog.",
            });
          }

          if (item.price !== input.unitPrice) {
            throw new TRPCError({
              code: "CONFLICT",
              message: `${item.name} now costs ${item.price} points. Check the new total with the buyer and try again.`,
            });
          }

          if (!canSupply(item, input.quantity)) {
            throw new TRPCError({
              code: "PRECONDITION_FAILED",
              message:
                item.stock === null || item.stock === 0
                  ? `${item.name} is sold out.`
                  : `Only ${item.stock} ${item.name} left.`,
            });
          }

          const total = item.price * input.quantity;
          const balance = await readBalance(tx, participant.id);

          if (total > balance.available) {
            throw new TRPCError({
              code: "PRECONDITION_FAILED",
              message: `${name} has ${balance.available} points to spend; this costs ${total}.`,
            });
          }

          const [purchase] = await tx
            .insert(hackathonStorePurchases)
            .values({
              id: input.purchaseId,
              hackathonId: input.hackathonId,
              participantId: participant.id,
              participantName: name,
              itemId: item.id,
              itemName: item.name,
              unitPrice: item.price,
              quantity: input.quantity,
              total,
              stockTracked: item.stock !== null,
              actorId: ctx.userId,
            })
            .returning();

          if (item.stock !== null) {
            await tx
              .update(hackathonStoreItems)
              .set({
                stock: item.stock - input.quantity,
                revision: sql`${hackathonStoreItems.revision} + 1`,
                updatedAt: new Date(),
              })
              .where(eq(hackathonStoreItems.id, item.id));
          }

          return {
            purchase: purchase!,
            replayed: false,
            // Affordable means earned - spent covered the total, so this
            // stays exact without the clamp.
            balance: {
              earned: balance.earned,
              spent: balance.spent + total,
              available: balance.available - total,
            },
          };
        });
      } catch (error) {
        // The same id sent for a different buyer: their locks do not collide,
        // so the primary key is what catches it.
        if (isUniqueViolation(error)) {
          throw new TRPCError({
            code: "CONFLICT",
            message:
              "This sale's id was already used for a different sale. Start the sale again.",
          });
        }
        throw error;
      }
    }),

  // Undoes a sale and gives the points back. The row stays, marked voided,
  // so history shows what happened. Voiding twice changes nothing.
  voidPurchase: isAdmin
    .input(
      hackathonScope.extend({
        purchaseId: z.string().uuid("Invalid purchase ID"),
        // Put the items back on the shelf count. Only possible when stock was
        // counted at the sale and still is.
        restock: z.boolean().default(false),
        reason: z
          .string()
          .trim()
          .min(1, "Say why the sale is being voided")
          .max(300),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = ctx.db as DrizzleDB;

      const outcome = await db.transaction(async (tx) => {
        const [purchase] = await tx
          .select()
          .from(hackathonStorePurchases)
          .where(
            and(
              eq(hackathonStorePurchases.id, input.purchaseId),
              eq(hackathonStorePurchases.hackathonId, input.hackathonId),
            ),
          )
          .for("update");

        if (!purchase) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "That sale does not exist.",
          });
        }

        if (purchase.voidedAt) return { purchase, changed: false };

        if (input.restock) {
          const [item] = purchase.itemId
            ? await tx
                .select()
                .from(hackathonStoreItems)
                .where(eq(hackathonStoreItems.id, purchase.itemId))
                .for("update")
            : [];

          if (!purchase.stockTracked || !item || item.stock === null) {
            throw new TRPCError({
              code: "PRECONDITION_FAILED",
              message:
                "This sale cannot go back on the shelf count: stock was not being counted when it was sold, or is not now. Void it without restocking.",
            });
          }

          await tx
            .update(hackathonStoreItems)
            .set({
              stock: item.stock + purchase.quantity,
              revision: sql`${hackathonStoreItems.revision} + 1`,
              updatedAt: new Date(),
            })
            .where(eq(hackathonStoreItems.id, item.id));
        }

        const [voided] = await tx
          .update(hackathonStorePurchases)
          .set({
            voidedAt: new Date(),
            voidedById: ctx.userId,
            voidReason: input.reason,
            restocked: input.restock,
          })
          .where(eq(hackathonStorePurchases.id, purchase.id))
          .returning();

        return { purchase: voided!, changed: true };
      });

      if (outcome.changed) {
        await recordAdminAction(db, {
          userId: ctx.userId,
          action: "points.store.voidPurchase",
          resourceId: input.purchaseId,
          severity: "warn",
          metadata: {
            hackathonId: input.hackathonId,
            participantId: outcome.purchase.participantId,
            itemName: outcome.purchase.itemName,
            total: outcome.purchase.total,
            restocked: input.restock,
            reason: input.reason,
          },
        });
      }

      return { purchase: outcome.purchase, alreadyVoided: !outcome.changed };
    }),

  // Sales, newest first, for the whole store or one buyer.
  purchases: isScanner
    .input(
      hackathonScope.extend({
        participantId: z.string().uuid("Invalid participant ID").optional(),
        limit: z.number().int().min(1).max(100).default(50),
        offset: z.number().int().min(0).default(0),
      }),
    )
    .query(async ({ ctx, input }) => {
      const db = ctx.db as DrizzleDB;

      const where = and(
        eq(hackathonStorePurchases.hackathonId, input.hackathonId),
        input.participantId
          ? eq(hackathonStorePurchases.participantId, input.participantId)
          : undefined,
      );

      const [rows, [totals]] = await Promise.all([
        db
          .select({
            id: hackathonStorePurchases.id,
            participantId: hackathonStorePurchases.participantId,
            participantName: hackathonStorePurchases.participantName,
            itemId: hackathonStorePurchases.itemId,
            itemName: hackathonStorePurchases.itemName,
            unitPrice: hackathonStorePurchases.unitPrice,
            quantity: hackathonStorePurchases.quantity,
            total: hackathonStorePurchases.total,
            stockTracked: hackathonStorePurchases.stockTracked,
            createdAt: hackathonStorePurchases.createdAt,
            voidedAt: hackathonStorePurchases.voidedAt,
            voidReason: hackathonStorePurchases.voidReason,
            restocked: hackathonStorePurchases.restocked,
            actorName: users.name,
            itemStock: hackathonStoreItems.stock,
          })
          .from(hackathonStorePurchases)
          .leftJoin(users, eq(users.id, hackathonStorePurchases.actorId))
          .leftJoin(
            hackathonStoreItems,
            eq(hackathonStoreItems.id, hackathonStorePurchases.itemId),
          )
          .where(where)
          .orderBy(
            desc(hackathonStorePurchases.createdAt),
            desc(hackathonStorePurchases.id),
          )
          .limit(input.limit)
          .offset(input.offset),
        db
          .select({ count: sql<number>`count(*)::int` })
          .from(hackathonStorePurchases)
          .where(where),
      ]);

      return {
        purchases: rows.map(({ itemStock, ...row }) => ({
          ...row,
          // Whether a void could also restock, so the button can say so.
          canRestock: !row.voidedAt && row.stockTracked && itemStock !== null,
        })),
        matching: totals?.count ?? 0,
      };
    }),
});
