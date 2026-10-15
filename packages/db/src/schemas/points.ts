import {
  pgTable,
  text,
  timestamp,
  uuid,
  boolean,
  integer,
  index,
  foreignKey,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { users } from "./auth";
import { hackathons, hackathonParticipants } from "./hackathons";

// Hackathon points, scoped to one edition. Nothing here is a balance column:
//
//   earned    = sum(hackathon_event_attendee.points_awarded)
//             + sum(hackathon_point_adjustment.delta)
//   spent     = sum(hackathon_store_purchase.total) where voided_at is null
//   available = max(0, earned - spent)
//
// so every point on a hacker's total has a row that explains it, and undoing
// a check-in or voiding a purchase needs no second write to keep a running
// total honest. The API computes these (services/points.ts).

// An organiser adding or taking away points by hand, with the reason.
export const hackathonPointAdjustments = pgTable(
  "hackathon_point_adjustment",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    hackathonId: uuid("hackathon_id")
      .notNull()
      .references(() => hackathons.id, { onDelete: "cascade" }),
    participantId: uuid("participant_id").notNull(),
    // Non-zero, -1000 to 1000. Checked by the API.
    delta: integer("delta").notNull(),
    reason: text("reason").notNull(),
    actorId: text("actor_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("point_adjustment_participant_idx").on(
      table.hackathonId,
      table.participantId,
    ),
    foreignKey({
      name: "point_adjustment_participant_fk",
      columns: [table.participantId],
      foreignColumns: [hackathonParticipants.id],
    }).onDelete("cascade"),
  ],
);

// Something on the store table. `stock` null means nobody is counting; then
// `soldOut` is how an organiser says it is gone.
export const hackathonStoreItems = pgTable(
  "hackathon_store_item",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    hackathonId: uuid("hackathon_id")
      .notNull()
      .references(() => hackathons.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    price: integer("price").notNull(),
    stock: integer("stock"),
    soldOut: boolean("sold_out").notNull().default(false),
    archived: boolean("archived").notNull().default(false),
    displayOrder: integer("display_order").notNull().default(0),
    // Optimistic lock for two organisers editing the same item.
    revision: integer("revision").notNull().default(0),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [index("store_item_hackathon_idx").on(table.hackathonId)],
);

// An organiser handing something over at the store table. The id comes from
// the organiser's browser, so a retried request finds the purchase it already
// made instead of charging twice. Names and prices are copied in, so editing
// or archiving an item never rewrites what somebody paid.
export const hackathonStorePurchases = pgTable(
  "hackathon_store_purchase",
  {
    id: uuid("id").primaryKey(),
    hackathonId: uuid("hackathon_id")
      .notNull()
      .references(() => hackathons.id, { onDelete: "cascade" }),
    participantId: uuid("participant_id"),
    participantName: text("participant_name").notNull(),
    itemId: uuid("item_id"),
    itemName: text("item_name").notNull(),
    unitPrice: integer("unit_price").notNull(),
    quantity: integer("quantity").notNull(),
    // unitPrice * quantity, written by the API.
    total: integer("total").notNull(),
    stockTracked: boolean("stock_tracked").notNull(),
    actorId: text("actor_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    voidedAt: timestamp("voided_at"),
    voidedById: text("voided_by_id").references(() => users.id, {
      onDelete: "set null",
    }),
    voidReason: text("void_reason"),
    restocked: boolean("restocked").notNull().default(false),
  },
  (table) => [
    index("store_purchase_hackathon_idx").on(
      table.hackathonId,
      table.createdAt,
    ),
    index("store_purchase_participant_idx").on(table.participantId),
    foreignKey({
      name: "store_purchase_participant_fk",
      columns: [table.participantId],
      foreignColumns: [hackathonParticipants.id],
    }).onDelete("set null"),
    foreignKey({
      name: "store_purchase_item_fk",
      columns: [table.itemId],
      foreignColumns: [hackathonStoreItems.id],
    }).onDelete("set null"),
  ],
);

export const hackathonPointAdjustmentsRelations = relations(
  hackathonPointAdjustments,
  ({ one }) => ({
    participant: one(hackathonParticipants, {
      fields: [hackathonPointAdjustments.participantId],
      references: [hackathonParticipants.id],
    }),
    actor: one(users, {
      fields: [hackathonPointAdjustments.actorId],
      references: [users.id],
    }),
  }),
);

export const hackathonStoreItemsRelations = relations(
  hackathonStoreItems,
  ({ many }) => ({ purchases: many(hackathonStorePurchases) }),
);

export const hackathonStorePurchasesRelations = relations(
  hackathonStorePurchases,
  ({ one }) => ({
    participant: one(hackathonParticipants, {
      fields: [hackathonStorePurchases.participantId],
      references: [hackathonParticipants.id],
    }),
    item: one(hackathonStoreItems, {
      fields: [hackathonStorePurchases.itemId],
      references: [hackathonStoreItems.id],
    }),
  }),
);
