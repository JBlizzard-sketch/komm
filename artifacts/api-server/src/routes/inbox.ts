import { Router } from "express";
import { db, inboxMessagesTable } from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";
import {
  MarkInboxReadParams,
  ListInboxMessagesQueryParams,
} from "@workspace/api-zod";

const router = Router();

router.get("/inbox", async (req, res) => {
  const query = ListInboxMessagesQueryParams.parse(req.query);
  const { read, page, limit } = query;

  let conditions: ReturnType<typeof eq>[] = [];
  if (read !== undefined) conditions.push(eq(inboxMessagesTable.read, read));
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

export default router;
