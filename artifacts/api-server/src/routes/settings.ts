import { Router, type IRouter } from "express";
import { db, orgSettingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { isSimulated, sendMessage } from "../services/messaging";

const router: IRouter = Router();

const CHANNELS = ["sms", "whatsapp", "email"] as const;
type Channel = (typeof CHANNELS)[number];

router.get("/settings/status", (_req, res) => {
  return res.json({
    sms: isSimulated.sms ? "simulated" : "active",
    whatsapp: isSimulated.whatsapp ? "simulated" : "active",
    email: isSimulated.email ? "simulated" : "active",
  });
});

router.post("/settings/test/:channel", async (req, res) => {
  const ch = req.params["channel"] as string;
  if (!CHANNELS.includes(ch as Channel)) {
    return res.status(400).json({ error: "Invalid channel" });
  }
  const channel = ch as Channel;
  const phone: string = (req.body?.phone as string | undefined) ?? "+254700000000";
  const email: string | null = (req.body?.email as string | undefined) ?? null;
  const message = `Komm connection test — ${new Date().toISOString()}`;

  const result = await sendMessage(channel, phone, email, message);
  return res.json({
    success: result.success,
    simulated: result.simulated ?? isSimulated[channel],
    messageId: result.messageId ?? null,
    error: result.error ?? null,
    channel,
  });
});

const PROFILE_KEYS = ["org_name", "org_timezone", "sender_name"] as const;

router.get("/settings/profile", async (_req, res) => {
  const rows = await db.select().from(orgSettingsTable);
  const profile: Record<string, string> = {};
  for (const row of rows) {
    if (PROFILE_KEYS.includes(row.key as typeof PROFILE_KEYS[number])) {
      profile[row.key] = row.value;
    }
  }
  return res.json({
    orgName: profile["org_name"] ?? "",
    orgTimezone: profile["org_timezone"] ?? "Africa/Nairobi",
    senderName: profile["sender_name"] ?? "",
  });
});

router.put("/settings/profile", async (req, res) => {
  const body = req.body as { orgName?: string; orgTimezone?: string; senderName?: string };
  const updates: { key: string; value: string }[] = [];
  if (typeof body.orgName === "string") updates.push({ key: "org_name", value: body.orgName.trim() });
  if (typeof body.orgTimezone === "string") updates.push({ key: "org_timezone", value: body.orgTimezone.trim() });
  if (typeof body.senderName === "string") updates.push({ key: "sender_name", value: body.senderName.trim() });

  for (const { key, value } of updates) {
    await db
      .insert(orgSettingsTable)
      .values({ key, value })
      .onConflictDoUpdate({ target: orgSettingsTable.key, set: { value } });
  }

  return res.json({ ok: true });
});

export default router;
