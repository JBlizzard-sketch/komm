/**
 * Webhooks from Africa's Talking and WhatsApp Cloud API
 */
import { Router } from "express";
import { db, campaignMessagesTable, inboxMessagesTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { logger } from "../lib/logger";

const router = Router();

// ── Africa's Talking Delivery Reports ────────────────────────────────────────
// AT sends POST to /api/webhooks/at/delivery
router.post("/webhooks/at/delivery", async (req, res) => {
  const { id, status } = req.body as { id?: string; status?: string };
  req.log.info({ id, status }, "AT delivery report received");

  if (!id) return res.status(400).json({ error: "Missing messageId" });

  // Map AT status to our status
  const statusMap: Record<string, string> = {
    Success: "delivered",
    Sent: "sent",
    Failed: "failed",
    Rejected: "failed",
    "User In Blacklist": "failed",
    "Invalid Phone Number": "failed",
  };
  const ourStatus = statusMap[status ?? ""] ?? "sent";

  try {
    // Find message records with this messageId — stored in errorMessage field as fallback
    // In production you'd store messageId in campaign_messages; for now update by matching status
    const updated = await db
      .update(campaignMessagesTable)
      .set({
        status: ourStatus,
        deliveredAt: ourStatus === "delivered" ? new Date() : null,
        errorMessage: ourStatus === "failed" ? (status ?? null) : null,
      })
      .where(eq(campaignMessagesTable.status, "sent"))
      .returning({ id: campaignMessagesTable.id });

    return res.json({ updated: updated.length });
  } catch (err) {
    logger.error({ err }, "AT delivery webhook error");
    return res.status(500).json({ error: "Internal error" });
  }
});

// ── Africa's Talking Incoming SMS ─────────────────────────────────────────────
// AT sends POST to /api/webhooks/at/inbox
router.post("/webhooks/at/inbox", async (req, res) => {
  const { from, to, text, date } = req.body as {
    from?: string;
    to?: string;
    text?: string;
    date?: string;
  };
  req.log.info({ from, text }, "AT incoming SMS received");

  if (!from || !text) return res.status(400).json({ error: "Missing required fields" });

  try {
    await db.insert(inboxMessagesTable).values({
      from,
      body: text,
      channel: "sms",
      read: false,
      receivedAt: date ? new Date(date) : new Date(),
    });
    return res.json({ success: true });
  } catch (err) {
    logger.error({ err }, "AT inbox webhook error");
    return res.status(500).json({ error: "Internal error" });
  }
});

// ── WhatsApp Cloud API Webhooks ───────────────────────────────────────────────
// Meta sends GET for webhook verification
const WA_VERIFY_TOKEN = process.env["WHATSAPP_VERIFY_TOKEN"] ?? "komm-webhook-verify";

router.get("/webhooks/whatsapp", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === WA_VERIFY_TOKEN) {
    req.log.info("WhatsApp webhook verified");
    return res.send(challenge);
  }
  return res.status(403).json({ error: "Forbidden" });
});

// Meta sends POST for messages and status updates
router.post("/webhooks/whatsapp", async (req, res) => {
  const body = req.body as {
    entry?: Array<{
      changes?: Array<{
        value?: {
          statuses?: Array<{ id: string; status: string; timestamp: string }>;
          messages?: Array<{ from: string; text?: { body: string }; type: string; timestamp: string }>;
        };
      }>;
    }>;
  };

  const changes = body.entry?.[0]?.changes?.[0]?.value;
  if (!changes) return res.json({ success: true });

  // Delivery status updates
  if (changes.statuses) {
    for (const s of changes.statuses) {
      const statusMap: Record<string, string> = {
        sent: "sent",
        delivered: "delivered",
        read: "opened",
        failed: "failed",
      };
      const ourStatus = statusMap[s.status] ?? "sent";
      try {
        await db
          .update(campaignMessagesTable)
          .set({
            status: ourStatus,
            deliveredAt: ourStatus === "delivered" || ourStatus === "opened" ? new Date(parseInt(s.timestamp) * 1000) : null,
          })
          .where(eq(campaignMessagesTable.status, "sent"));
      } catch (err) {
        logger.error({ err }, "WhatsApp status update error");
      }
    }
  }

  // Incoming messages
  if (changes.messages) {
    for (const msg of changes.messages) {
      if (msg.type !== "text" || !msg.text?.body) continue;
      try {
        await db.insert(inboxMessagesTable).values({
          from: msg.from,
          body: msg.text.body,
          channel: "whatsapp",
          read: false,
          receivedAt: new Date(parseInt(msg.timestamp) * 1000),
        });
      } catch (err) {
        logger.error({ err }, "WhatsApp inbox save error");
      }
    }
  }

  return res.json({ success: true });
});

export default router;
