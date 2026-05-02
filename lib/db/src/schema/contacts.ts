import { pgTable, serial, text, timestamp, jsonb, integer, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const contactsTable = pgTable("contacts", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  phone: text("phone").notNull().unique(),
  email: text("email"),
  channel: text("channel").notNull().default("sms"),
  customFields: jsonb("custom_fields").$type<Record<string, string>>(),
  optedOut: boolean("opted_out").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const groupsTable = pgTable("groups", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const contactGroupsTable = pgTable("contact_groups", {
  id: serial("id").primaryKey(),
  contactId: integer("contact_id").notNull().references(() => contactsTable.id, { onDelete: "cascade" }),
  groupId: integer("group_id").notNull().references(() => groupsTable.id, { onDelete: "cascade" }),
});

export const insertContactSchema = createInsertSchema(contactsTable).omit({ id: true, createdAt: true });
export const insertGroupSchema = createInsertSchema(groupsTable).omit({ id: true, createdAt: true });

export type InsertContact = z.infer<typeof insertContactSchema>;
export type Contact = typeof contactsTable.$inferSelect;
export type Group = typeof groupsTable.$inferSelect;
export type ContactGroup = typeof contactGroupsTable.$inferSelect;
