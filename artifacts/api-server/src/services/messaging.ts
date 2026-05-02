/**
 * Messaging Service
 * Wraps Africa's Talking (SMS), WhatsApp Cloud API, and Email.
 * Falls back to simulation when credentials are not configured.
 */

// @ts-ignore — africastalking has no bundled types
import AfricasTalking from "africastalking";
import { logger } from "../lib/logger";

export interface SendResult {
  success: boolean;
  messageId?: string;
  error?: string;
  simulated?: boolean;
}

// ── Africa's Talking SMS ──────────────────────────────────────────────────────

const AT_KEY = process.env["AT_API_KEY"];
const AT_USER = process.env["AT_USERNAME"];
const AT_SENDER = process.env["AT_SENDER_ID"];

let atSms: { send: (opts: unknown) => Promise<unknown> } | null = null;

if (AT_KEY && AT_USER) {
  try {
    const at = AfricasTalking({ apiKey: AT_KEY, username: AT_USER });
    atSms = at.SMS;
    logger.info("Africa's Talking SMS client initialized");
  } catch (e) {
    logger.warn({ err: e }, "Failed to initialize Africa's Talking — will simulate SMS");
  }
}

export async function sendSms(phone: string, message: string): Promise<SendResult> {
  if (!atSms) {
    // Simulate: 80% delivered, 15% sent, 5% failed
    const roll = Math.random();
    if (roll < 0.05) return { success: false, error: "Number unreachable", simulated: true };
    return { success: true, messageId: `sim-sms-${Date.now()}`, simulated: true };
  }

  try {
    const response = await atSms.send({
      to: [phone],
      message,
      ...(AT_SENDER ? { from: AT_SENDER } : {}),
    }) as { SMSMessageData: { Recipients: { status: string; messageId: string }[] } };

    const recipient = response.SMSMessageData?.Recipients?.[0];
    if (!recipient) return { success: false, error: "No recipient in response" };

    const ok = recipient.status === "Success";
    return {
      success: ok,
      messageId: recipient.messageId,
      error: ok ? undefined : recipient.status,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ err, phone }, "Africa's Talking send failed");
    return { success: false, error: message };
  }
}

// ── WhatsApp Cloud API ────────────────────────────────────────────────────────

const WA_TOKEN = process.env["WHATSAPP_TOKEN"];
const WA_PHONE_ID = process.env["WHATSAPP_PHONE_ID"];

export async function sendWhatsApp(
  phone: string,
  message: string,
  templateName?: string
): Promise<SendResult> {
  if (!WA_TOKEN || !WA_PHONE_ID) {
    const roll = Math.random();
    if (roll < 0.05) return { success: false, error: "Number not on WhatsApp", simulated: true };
    return { success: true, messageId: `sim-wa-${Date.now()}`, simulated: true };
  }

  try {
    const body = templateName
      ? {
          messaging_product: "whatsapp",
          to: phone,
          type: "template",
          template: {
            name: templateName,
            language: { code: "en" },
          },
        }
      : {
          messaging_product: "whatsapp",
          to: phone,
          type: "text",
          text: { body: message },
        };

    const res = await fetch(
      `https://graph.facebook.com/v19.0/${WA_PHONE_ID}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${WA_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      }
    );
    const data = await res.json() as { messages?: { id: string }[]; error?: { message: string } };
    if (!res.ok) {
      return { success: false, error: data.error?.message ?? `HTTP ${res.status}` };
    }
    return { success: true, messageId: data.messages?.[0]?.id };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ err, phone }, "WhatsApp send failed");
    return { success: false, error: message };
  }
}

// ── Email (SMTP via env vars) ─────────────────────────────────────────────────

const SMTP_HOST = process.env["SMTP_HOST"];
const SMTP_PORT = parseInt(process.env["SMTP_PORT"] ?? "587");
const SMTP_USER = process.env["SMTP_USER"];
const SMTP_PASS = process.env["SMTP_PASS"];
const SMTP_FROM = process.env["SMTP_FROM"] ?? SMTP_USER;

let transporter: unknown | null = null;

async function getTransporter() {
  if (transporter) return transporter;
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) return null;
  try {
    const nodemailer = await import("nodemailer");
    transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: SMTP_PORT === 465,
      auth: { user: SMTP_USER, pass: SMTP_PASS },
    });
    logger.info({ host: SMTP_HOST }, "Nodemailer transporter initialized");
    return transporter;
  } catch (e) {
    logger.warn({ err: e }, "Nodemailer init failed — will simulate email");
    return null;
  }
}

export async function sendEmail(
  to: string,
  subject: string,
  text: string
): Promise<SendResult> {
  const t = await getTransporter() as { sendMail: (opts: unknown) => Promise<{ messageId: string }> } | null;
  if (!t) {
    return { success: true, messageId: `sim-email-${Date.now()}`, simulated: true };
  }
  try {
    const info = await t.sendMail({ from: SMTP_FROM, to, subject, text });
    return { success: true, messageId: info.messageId };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ err, to }, "Email send failed");
    return { success: false, error: message };
  }
}

// ── Dispatcher ────────────────────────────────────────────────────────────────

export async function sendMessage(
  channel: string,
  phone: string,
  email: string | null | undefined,
  body: string
): Promise<SendResult> {
  switch (channel) {
    case "sms":
      return sendSms(phone, body);
    case "whatsapp":
      return sendWhatsApp(phone, body);
    case "email":
      if (!email) return { success: false, error: "No email address for contact" };
      return sendEmail(email, "Message from Komm", body);
    default:
      return sendSms(phone, body);
  }
}

export const isSimulated = {
  sms: !atSms,
  whatsapp: !WA_TOKEN || !WA_PHONE_ID,
  email: !SMTP_HOST,
};
