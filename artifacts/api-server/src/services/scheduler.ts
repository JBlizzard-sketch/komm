/**
 * Campaign Scheduler
 * Polls every minute for campaigns with scheduledAt <= now and status = 'scheduled'.
 * Triggers the send flow for each one found.
 */
import { db, campaignsTable, campaignMessagesTable, contactsTable, contactGroupsTable, orgSettingsTable } from "@workspace/db";
import { eq, lte, inArray, and, sql } from "drizzle-orm";
import { logger } from "../lib/logger";
import { sendMessage } from "./messaging";

let schedulerInterval: NodeJS.Timeout | null = null;

async function processDueCampaigns() {
  const now = new Date();

  // Find scheduled campaigns that are due
  const dueCampaigns = await db
    .select()
    .from(campaignsTable)
    .where(and(eq(campaignsTable.status, "scheduled"), lte(campaignsTable.scheduledAt, now)));

  if (dueCampaigns.length === 0) return;

  logger.info({ count: dueCampaigns.length }, "Processing due campaigns");

  for (const campaign of dueCampaigns) {
    try {
      // Mark as sending
      await db.update(campaignsTable).set({ status: "sending" }).where(eq(campaignsTable.id, campaign.id));

      // Gather contacts
      let contacts: { id: number; name: string; phone: string; email: string | null; channel: string; customFields: Record<string, string> | null }[] = [];
      if (campaign.groupIds.length > 0) {
        const memberships = await db
          .select({ contactId: contactGroupsTable.contactId })
          .from(contactGroupsTable)
          .where(inArray(contactGroupsTable.groupId, campaign.groupIds));
        const contactIds = [...new Set(memberships.map((m) => m.contactId))];
        if (contactIds.length > 0) {
          contacts = await db
            .select({
              id: contactsTable.id,
              name: contactsTable.name,
              phone: contactsTable.phone,
              email: contactsTable.email,
              channel: contactsTable.channel,
              customFields: contactsTable.customFields,
            })
            .from(contactsTable)
            .where(and(inArray(contactsTable.id, contactIds), eq(contactsTable.optedOut, false)));
        }
      }

      // Fetch org name for variable substitution
      const orgNameRow = await db.select().from(orgSettingsTable).where(eq(orgSettingsTable.key, "org_name"));
      const orgName = orgNameRow[0]?.value ?? "";

      // Variable substitution helper (mirrors campaigns route)
      const substituteVars = (template: string, contact: typeof contacts[number]) => {
        const today = new Date();
        const due = new Date(today); due.setDate(due.getDate() + 7);
        const fmt = (d: Date) => d.toLocaleDateString("en-KE", { day: "numeric", month: "long", year: "numeric" });
        const defaults: Record<string, string> = {
          name: contact.name,
          date: fmt(today),
          due: fmt(due),
          amount: contact.customFields?.["amount"] ?? "",
          balance: contact.customFields?.["balance"] ?? "",
          org_name: orgName,
        };
        const vars = { ...defaults, ...(contact.customFields ?? {}) };
        return template.replace(/{{(\w+)}}/g, (_, key: string) => vars[key] ?? `{{${key}}}`);
      };

      // Send to each contact
      let deliveredCount = 0;
      const messageRows = [];

      for (const contact of contacts) {
        const effectiveChannel = campaign.channel === "sms" || campaign.channel === "whatsapp" || campaign.channel === "email"
          ? campaign.channel
          : contact.channel;

        const body = substituteVars(campaign.body, contact);
        const result = await sendMessage(effectiveChannel, contact.phone, contact.email, body);

        const initialStatus = result.simulated
          ? (result.success ? "delivered" : "failed")
          : (result.success ? "sent" : "failed");
        if (result.success) deliveredCount++;

        messageRows.push({
          campaignId: campaign.id,
          contactId: contact.id,
          contactName: contact.name,
          phone: contact.phone,
          status: initialStatus,
          providerMessageId: result.messageId ?? null,
          deliveredAt: initialStatus === "delivered" ? new Date() : null,
          errorMessage: result.error ?? null,
        });
      }

      if (messageRows.length > 0) {
        await db.insert(campaignMessagesTable).values(messageRows);
      }

      await db.update(campaignsTable).set({
        status: "sent",
        sentAt: new Date(),
        recipientCount: contacts.length,
      }).where(eq(campaignsTable.id, campaign.id));

      logger.info(
        { campaignId: campaign.id, name: campaign.name, total: contacts.length, deliveredCount },
        "Scheduled campaign sent"
      );
    } catch (err) {
      logger.error({ err, campaignId: campaign.id }, "Failed to process scheduled campaign");
      await db.update(campaignsTable).set({ status: "failed" }).where(eq(campaignsTable.id, campaign.id));
    }
  }
}

export function startScheduler() {
  if (schedulerInterval) return;
  // Check every 60 seconds
  schedulerInterval = setInterval(async () => {
    try {
      await processDueCampaigns();
    } catch (err) {
      logger.error({ err }, "Scheduler tick error");
    }
  }, 60_000);

  // Run immediately on startup
  processDueCampaigns().catch((err) =>
    logger.error({ err }, "Initial scheduler run failed")
  );

  logger.info("Campaign scheduler started (60s interval)");
}

export function stopScheduler() {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
    logger.info("Campaign scheduler stopped");
  }
}
