import { pgTable, text } from "drizzle-orm/pg-core";

export const orgSettingsTable = pgTable("org_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

export type OrgSetting = typeof orgSettingsTable.$inferSelect;
