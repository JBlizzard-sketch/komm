import { pgTable, serial, text, timestamp, integer, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { campaignsTable } from "./campaigns";

export const inboxMessagesTable = pgTable("inbox_messages", {
  id: serial("id").primaryKey(),
  from: text("from").notNull(),
  contactName: text("contact_name"),
  body: text("body").notNull(),
  channel: text("channel").notNull().default("sms"),
  read: boolean("read").notNull().default(false),
  campaignId: integer("campaign_id").references(() => campaignsTable.id, { onDelete: "set null" }),
  receivedAt: timestamp("received_at").notNull().defaultNow(),
});

export const insertInboxMessageSchema = createInsertSchema(inboxMessagesTable).omit({ id: true });
export type InsertInboxMessage = z.infer<typeof insertInboxMessageSchema>;
export type InboxMessage = typeof inboxMessagesTable.$inferSelect;
