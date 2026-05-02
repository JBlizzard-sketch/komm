import { Router } from "express";
import { db, campaignsTable, campaignMessagesTable, contactsTable, contactGroupsTable } from "@workspace/db";
import { eq, inArray, sql, and } from "drizzle-orm";
import {
  CreateCampaignBody,
  GetCampaignParams,
  UpdateCampaignParams,
  UpdateCampaignBody,
  DeleteCampaignParams,
  ListCampaignsQueryParams,
  SendCampaignParams,
  ListCampaignMessagesParams,
  ListCampaignMessagesQueryParams,
} from "@workspace/api-zod";

const router = Router();

router.get("/campaigns", async (req, res) => {
  const query = ListCampaignsQueryParams.parse(req.query);
  const { status, channel, page, limit } = query;

  let conditions: ReturnType<typeof eq>[] = [];
  if (status) conditions.push(eq(campaignsTable.status, status));
  if (channel) conditions.push(eq(campaignsTable.channel, channel));
  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const [campaigns, countResult] = await Promise.all([
    db
      .select()
      .from(campaignsTable)
      .where(whereClause)
      .limit(limit)
      .offset((page - 1) * limit)
      .orderBy(sql`${campaignsTable.createdAt} DESC`),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(campaignsTable)
      .where(whereClause),
  ]);

  return res.json({ data: campaigns, total: countResult[0]?.count ?? 0, page, limit });
});

router.post("/campaigns", async (req, res) => {
  const body = CreateCampaignBody.parse(req.body);

  let recipientCount = 0;
  if (body.groupIds && body.groupIds.length > 0) {
    const [countResult] = await db
      .select({ count: sql<number>`count(distinct ${contactGroupsTable.contactId})::int` })
      .from(contactGroupsTable)
      .where(inArray(contactGroupsTable.groupId, body.groupIds));
    recipientCount = countResult?.count ?? 0;
  }

  const [campaign] = await db
    .insert(campaignsTable)
    .values({
      name: body.name,
      channel: body.channel,
      status: "draft",
      body: body.body,
      templateId: body.templateId ?? null,
      groupIds: body.groupIds ?? [],
      recipientCount,
      scheduledAt: body.scheduledAt ? new Date(body.scheduledAt) : null,
    })
    .returning();
  return res.status(201).json(campaign);
});

router.get("/campaigns/:id", async (req, res) => {
  const { id } = GetCampaignParams.parse(req.params);
  const [campaign] = await db.select().from(campaignsTable).where(eq(campaignsTable.id, id));
  if (!campaign) return res.status(404).json({ error: "Not found" });

  const [stats] = await db
    .select({
      deliveredCount: sql<number>`count(case when status = 'delivered' then 1 end)::int`,
      failedCount: sql<number>`count(case when status = 'failed' then 1 end)::int`,
      openedCount: sql<number>`count(case when status = 'opened' then 1 end)::int`,
      total: sql<number>`count(*)::int`,
    })
    .from(campaignMessagesTable)
    .where(eq(campaignMessagesTable.campaignId, id));

  const total = stats?.total ?? 0;
  const deliveredCount = stats?.deliveredCount ?? 0;

  return res.json({
    ...campaign,
    deliveredCount,
    failedCount: stats?.failedCount ?? 0,
    openedCount: stats?.openedCount ?? 0,
    deliveryRate: total > 0 ? Math.round((deliveredCount / total) * 100) : 0,
  });
});

router.put("/campaigns/:id", async (req, res) => {
  const { id } = UpdateCampaignParams.parse(req.params);
  const body = UpdateCampaignBody.parse(req.body);

  let recipientCount = 0;
  if (body.groupIds && body.groupIds.length > 0) {
    const [countResult] = await db
      .select({ count: sql<number>`count(distinct ${contactGroupsTable.contactId})::int` })
      .from(contactGroupsTable)
      .where(inArray(contactGroupsTable.groupId, body.groupIds));
    recipientCount = countResult?.count ?? 0;
  }

  const [campaign] = await db
    .update(campaignsTable)
    .set({
      name: body.name,
      channel: body.channel,
      body: body.body,
      templateId: body.templateId ?? null,
      groupIds: body.groupIds ?? [],
      recipientCount,
      scheduledAt: body.scheduledAt ? new Date(body.scheduledAt) : null,
    })
    .where(eq(campaignsTable.id, id))
    .returning();

  if (!campaign) return res.status(404).json({ error: "Not found" });
  return res.json(campaign);
});

router.delete("/campaigns/:id", async (req, res) => {
  const { id } = DeleteCampaignParams.parse(req.params);
  await db.delete(campaignsTable).where(eq(campaignsTable.id, id));
  return res.status(204).send();
});

router.post("/campaigns/:id/send", async (req, res) => {
  const { id } = SendCampaignParams.parse(req.params);
  const [campaign] = await db.select().from(campaignsTable).where(eq(campaignsTable.id, id));
  if (!campaign) return res.status(404).json({ error: "Not found" });

  // Gather all contacts in the target groups
  let contacts: { id: number; name: string; phone: string }[] = [];
  if (campaign.groupIds.length > 0) {
    const memberships = await db
      .select({ contactId: contactGroupsTable.contactId })
      .from(contactGroupsTable)
      .where(inArray(contactGroupsTable.groupId, campaign.groupIds));
    const contactIds = [...new Set(memberships.map((m) => m.contactId))];
    if (contactIds.length > 0) {
      contacts = await db
        .select({ id: contactsTable.id, name: contactsTable.name, phone: contactsTable.phone })
        .from(contactsTable)
        .where(inArray(contactsTable.id, contactIds));
    }
  }

  // Create campaign message records (simulated send)
  if (contacts.length > 0) {
    const statuses = ["delivered", "delivered", "delivered", "sent", "failed"];
    await db.insert(campaignMessagesTable).values(
      contacts.map((c, i) => {
        const status = statuses[i % statuses.length];
        return {
          campaignId: id,
          contactId: c.id,
          contactName: c.name,
          phone: c.phone,
          status,
          deliveredAt: status === "delivered" ? new Date() : null,
          errorMessage: status === "failed" ? "Number unreachable" : null,
        };
      })
    );
  }

  const [updated] = await db
    .update(campaignsTable)
    .set({
      status: campaign.scheduledAt && campaign.scheduledAt > new Date() ? "scheduled" : "sent",
      sentAt: new Date(),
      recipientCount: contacts.length,
    })
    .where(eq(campaignsTable.id, id))
    .returning();

  return res.json(updated);
});

router.get("/campaigns/:id/messages", async (req, res) => {
  const { id } = ListCampaignMessagesParams.parse(req.params);
  const query = ListCampaignMessagesQueryParams.parse(req.query);
  const { status, page, limit } = query;

  let conditions: ReturnType<typeof eq>[] = [eq(campaignMessagesTable.campaignId, id)];
  if (status) conditions.push(eq(campaignMessagesTable.status, status));
  const whereClause = and(...conditions);

  const [messages, countResult] = await Promise.all([
    db
      .select()
      .from(campaignMessagesTable)
      .where(whereClause)
      .limit(limit)
      .offset((page - 1) * limit)
      .orderBy(campaignMessagesTable.createdAt),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(campaignMessagesTable)
      .where(whereClause),
  ]);

  return res.json({ data: messages, total: countResult[0]?.count ?? 0, page, limit });
});

export default router;
