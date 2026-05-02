/**
 * Campaign Scheduler
 * Polls every minute for campaigns with scheduledAt <= now and status = 'scheduled'.
 * Triggers the send flow for each one found.
 */
import { db, campaignsTable, campaignMessagesTable, contactsTable, contactGroupsTable } from "@workspace/db";
import { eq, lte, inArray, and } from "drizzle-orm";
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
      let contacts: { id: number; name: string; phone: string; email: string | null; channel: string }[] = [];
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
            })
            .from(contactsTable)
            .where(inArray(contactsTable.id, contactIds));
        }
      }

      // Send to each contact
      let deliveredCount = 0;
      const messageRows = [];

      for (const contact of contacts) {
        const effectiveChannel = campaign.channel === "sms" || campaign.channel === "whatsapp" || campaign.channel === "email"
          ? campaign.channel
          : contact.channel;

        // Replace template variables (basic)
        const body = campaign.body.replace(/{{name}}/g, contact.name);

        const result = await sendMessage(effectiveChannel, contact.phone, contact.email, body);
        const status = result.success ? "delivered" : "failed";
        if (result.success) deliveredCount++;

        messageRows.push({
          campaignId: campaign.id,
          contactId: contact.id,
          contactName: contact.name,
          phone: contact.phone,
          status,
          deliveredAt: result.success ? new Date() : null,
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
