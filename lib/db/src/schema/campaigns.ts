import { pgTable, serial, text, timestamp, integer, real } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { templatesTable } from "./templates";

export const campaignsTable = pgTable("campaigns", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  channel: text("channel").notNull().default("sms"),
  status: text("status").notNull().default("draft"),
  body: text("body").notNull(),
  templateId: integer("template_id").references(() => templatesTable.id, { onDelete: "set null" }),
  groupIds: integer("group_ids").array().notNull().default([]),
  recipientCount: integer("recipient_count").notNull().default(0),
  scheduledAt: timestamp("scheduled_at"),
  sentAt: timestamp("sent_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const campaignMessagesTable = pgTable("campaign_messages", {
  id: serial("id").primaryKey(),
  campaignId: integer("campaign_id").notNull().references(() => campaignsTable.id, { onDelete: "cascade" }),
  contactId: integer("contact_id").notNull(),
  contactName: text("contact_name").notNull(),
  phone: text("phone").notNull(),
  status: text("status").notNull().default("pending"),
  errorMessage: text("error_message"),
  deliveredAt: timestamp("delivered_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertCampaignSchema = createInsertSchema(campaignsTable).omit({ id: true, createdAt: true });
export const insertCampaignMessageSchema = createInsertSchema(campaignMessagesTable).omit({ id: true, createdAt: true });

export type InsertCampaign = z.infer<typeof insertCampaignSchema>;
export type Campaign = typeof campaignsTable.$inferSelect;
export type CampaignMessage = typeof campaignMessagesTable.$inferSelect;
