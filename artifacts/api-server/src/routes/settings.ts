import { Router, type IRouter } from "express";
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

export default router;
