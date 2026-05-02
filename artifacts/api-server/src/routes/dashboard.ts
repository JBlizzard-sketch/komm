import { Router } from "express";
import { db, contactsTable, campaignsTable, campaignMessagesTable, inboxMessagesTable } from "@workspace/db";
import { eq, gte, sql } from "drizzle-orm";
import { GetDashboardActivityQueryParams } from "@workspace/api-zod";

const router = Router();

router.get("/dashboard/stats", async (req, res) => {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const [
    contactsCount,
    campaignsCount,
    messagesThisMonth,
    deliveryStats,
    scheduledCount,
    unreadCount,
  ] = await Promise.all([
    db.select({ count: sql<number>`count(*)::int` }).from(contactsTable),
    db.select({ count: sql<number>`count(*)::int` }).from(campaignsTable),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(campaignMessagesTable)
      .where(gte(campaignMessagesTable.createdAt, thirtyDaysAgo)),
    db
      .select({
        total: sql<number>`count(*)::int`,
        delivered: sql<number>`count(case when status = 'delivered' then 1 end)::int`,
      })
      .from(campaignMessagesTable),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(campaignsTable)
      .where(eq(campaignsTable.status, "scheduled")),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(inboxMessagesTable)
      .where(eq(inboxMessagesTable.read, false)),
  ]);

  const total = deliveryStats[0]?.total ?? 0;
  const delivered = deliveryStats[0]?.delivered ?? 0;
  const deliveryRate = total > 0 ? Math.round((delivered / total) * 100) : 0;

  return res.json({
    totalContacts: contactsCount[0]?.count ?? 0,
    totalCampaigns: campaignsCount[0]?.count ?? 0,
    messagesSentThisMonth: messagesThisMonth[0]?.count ?? 0,
    deliveryRate,
    scheduledCampaigns: scheduledCount[0]?.count ?? 0,
    unreadReplies: unreadCount[0]?.count ?? 0,
  });
});

router.get("/dashboard/activity", async (req, res) => {
  const query = GetDashboardActivityQueryParams.parse(req.query);
  const limit = query.limit ?? 10;

  const campaigns = await db
    .select()
    .from(campaignsTable)
    .orderBy(sql`${campaignsTable.createdAt} DESC`)
    .limit(limit);

  const activity = campaigns.map((c) => ({
    id: c.id,
    type: c.status === "scheduled" ? "campaign_scheduled" : "campaign_sent",
    description:
      c.status === "scheduled"
        ? `Campaign "${c.name}" scheduled${c.scheduledAt ? ` for ${new Date(c.scheduledAt).toLocaleDateString("en-KE", { day: "numeric", month: "short", year: "numeric" })}` : ""}`
        : `Campaign "${c.name}" sent to ${c.recipientCount} recipients`,
    channel: c.channel,
    count: c.recipientCount,
    createdAt: c.createdAt,
  }));

  return res.json(activity);
});

router.get("/dashboard/delivery-trend", async (req, res) => {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const rows = await db
    .select({
      date: sql<string>`date_trunc('day', ${campaignMessagesTable.createdAt})::date::text`,
      channel: campaignsTable.channel,
      count: sql<number>`count(*)::int`,
    })
    .from(campaignMessagesTable)
    .leftJoin(campaignsTable, eq(campaignMessagesTable.campaignId, campaignsTable.id))
    .where(gte(campaignMessagesTable.createdAt, thirtyDaysAgo))
    .groupBy(
      sql`date_trunc('day', ${campaignMessagesTable.createdAt})::date`,
      campaignsTable.channel
    )
    .orderBy(sql`date_trunc('day', ${campaignMessagesTable.createdAt})::date`);

  // Build a map of date → {sms, whatsapp, email}
  const dateMap = new Map<string, { sms: number; whatsapp: number; email: number }>();
  for (const row of rows) {
    const d = row.date;
    if (!dateMap.has(d)) dateMap.set(d, { sms: 0, whatsapp: 0, email: 0 });
    const entry = dateMap.get(d)!;
    if (row.channel === "sms") entry.sms += row.count;
    else if (row.channel === "whatsapp") entry.whatsapp += row.count;
    else if (row.channel === "email") entry.email += row.count;
  }

  return res.json(
    Array.from(dateMap.entries()).map(([date, counts]) => ({ date, ...counts }))
  );
});

router.get("/dashboard/channel-breakdown", async (req, res) => {
  const rows = await db
    .select({
      channel: campaignsTable.channel,
      count: sql<number>`count(${campaignMessagesTable.id})::int`,
    })
    .from(campaignMessagesTable)
    .leftJoin(campaignsTable, eq(campaignMessagesTable.campaignId, campaignsTable.id))
    .groupBy(campaignsTable.channel);

  const total = rows.reduce((sum, r) => sum + r.count, 0);
  return res.json(
    rows.map((r) => ({
      channel: r.channel ?? "sms",
      count: r.count,
      percentage: total > 0 ? Math.round((r.count / total) * 100) : 0,
    }))
  );
});

export default router;
