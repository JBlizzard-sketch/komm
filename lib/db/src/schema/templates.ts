import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const templatesTable = pgTable("templates", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  body: text("body").notNull(),
  channel: text("channel").notNull().default("sms"),
  category: text("category").notNull().default("general"),
  variables: text("variables").array().notNull().default([]),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertTemplateSchema = createInsertSchema(templatesTable).omit({ id: true, createdAt: true });
export type InsertTemplate = z.infer<typeof insertTemplateSchema>;
export type Template = typeof templatesTable.$inferSelect;
