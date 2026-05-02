import { Router } from "express";
import { db, inboxMessagesTable } from "@workspace/db";
import { eq, and, sql, or, ilike } from "drizzle-orm";
import { sendMessage } from "../services/messaging";
import {
  MarkInboxReadParams,
  ListInboxMessagesQueryParams,
} from "@workspace/api-zod";

const router = Router();

router.get("/inbox", async (req, res) => {
  const query = ListInboxMessagesQueryParams.parse(req.query);
  const { read, page, limit } = query;
  const search = typeof req.query["search"] === "string" ? req.query["search"].trim() : undefined;

  const conditions: ReturnType<typeof eq>[] = [];
  if (read !== undefined) conditions.push(eq(inboxMessagesTable.read, read));
  if (search) {
    conditions.push(
      or(
        ilike(inboxMessagesTable.from, `%${search}%`),
        ilike(inboxMessagesTable.contactName, `%${search}%`),
      ) as ReturnType<typeof eq>
    );
  }
  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const [messages, countResult, unreadResult] = await Promise.all([
    db
      .select()
      .from(inboxMessagesTable)
      .where(whereClause)
      .limit(limit)
      .offset((page - 1) * limit)
      .orderBy(sql`${inboxMessagesTable.receivedAt} DESC`),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(inboxMessagesTable)
      .where(whereClause),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(inboxMessagesTable)
      .where(eq(inboxMessagesTable.read, false)),
  ]);

  return res.json({
    data: messages,
    total: countResult[0]?.count ?? 0,
    page,
    limit,
    unreadCount: unreadResult[0]?.count ?? 0,
  });
});

router.post("/inbox/read-all", async (req, res) => {
  const result = await db
    .update(inboxMessagesTable)
    .set({ read: true })
    .where(eq(inboxMessagesTable.read, false))
    .returning({ id: inboxMessagesTable.id });
  return res.json({ marked: result.length });
});

router.post("/inbox/:id/read", async (req, res) => {
  const { id } = MarkInboxReadParams.parse(req.params);
  const [message] = await db
    .update(inboxMessagesTable)
    .set({ read: true })
    .where(eq(inboxMessagesTable.id, id))
    .returning();
  if (!message) return res.status(404).json({ error: "Not found" });
  return res.json(message);
});

router.post("/inbox/:id/reply", async (req, res) => {
  const id = parseInt(req.params["id"] ?? "0", 10);
  if (!id) return res.status(400).json({ error: "Invalid id" });

  const [msg] = await db
    .select()
    .from(inboxMessagesTable)
    .where(eq(inboxMessagesTable.id, id));
  if (!msg) return res.status(404).json({ error: "Not found" });

  const body: string = (req.body?.body as string | undefined) ?? "";
  if (!body.trim()) return res.status(400).json({ error: "body is required" });

  const channel = (msg.channel ?? "sms") as "sms" | "whatsapp" | "email";
  const phone = msg.from;

  const result = await sendMessage(channel, phone, null, body);

  await db.update(inboxMessagesTable).set({ read: true }).where(eq(inboxMessagesTable.id, id));

  return res.json({
    success: result.success,
    simulated: result.simulated ?? false,
    messageId: result.messageId ?? null,
    error: result.error ?? null,
  });
});

export default router;
