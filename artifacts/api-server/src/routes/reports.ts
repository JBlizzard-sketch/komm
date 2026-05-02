import { Router } from "express";
import { db, campaignsTable, campaignMessagesTable } from "@workspace/db";
import { eq, sql, inArray, gte, and } from "drizzle-orm";

const router = Router();

/**
 * GET /reports/campaigns
 * Returns sent campaigns enriched with delivery stats.
 * Accepts optional ?days= to filter by sentAt recency.
 */
router.get("/reports/campaigns", async (req, res) => {
  const days = Math.min(365, Math.max(1, parseInt(String(req.query.days ?? "30"), 10) || 30));
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);

  const campaigns = await db
    .select()
    .from(campaignsTable)
    .where(and(eq(campaignsTable.status, "sent"), gte(campaignsTable.sentAt, cutoff)))
    .orderBy(sql`${campaignsTable.sentAt} DESC`)
    .limit(50);

  if (campaigns.length === 0) return res.json([]);

  const ids = campaigns.map((c) => c.id);

  const statsRows = await db
    .select({
      campaignId: campaignMessagesTable.campaignId,
      deliveredCount: sql<number>`count(case when status = 'delivered' then 1 end)::int`,
      failedCount: sql<number>`count(case when status = 'failed' then 1 end)::int`,
      openedCount: sql<number>`count(case when status = 'opened' then 1 end)::int`,
      total: sql<number>`count(*)::int`,
    })
    .from(campaignMessagesTable)
    .where(inArray(campaignMessagesTable.campaignId, ids))
    .groupBy(campaignMessagesTable.campaignId);

  const statsMap = new Map(statsRows.map((s) => [s.campaignId, s]));

  const result = campaigns.map((c) => {
    const s = statsMap.get(c.id);
    const total = s?.total ?? 0;
    const deliveredCount = s?.deliveredCount ?? 0;
    return {
      ...c,
      deliveredCount,
      failedCount: s?.failedCount ?? 0,
      openedCount: s?.openedCount ?? 0,
      deliveryRate: total > 0 ? Math.round((deliveredCount / total) * 100) : 0,
    };
  });

  return res.json(result);
});

export default router;
