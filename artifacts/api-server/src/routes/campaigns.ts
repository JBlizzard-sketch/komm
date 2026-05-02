import { Router } from "express";
import { db, campaignsTable, campaignMessagesTable, contactsTable, contactGroupsTable } from "@workspace/db";
import { eq, inArray, sql, and } from "drizzle-orm";
import { sendMessage, isSimulated } from "../services/messaging";
import {
  CreateCampaignBody,
  GetCampaignParams,
  UpdateCampaignParams,
  UpdateCampaignBody,
  DeleteCampaignParams,
  ListCampaignsQueryParams,
  SendCampaignParams,
  TestCampaignParams,
  TestCampaignBody,
  DuplicateCampaignParams,
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

  // If scheduled for the future, just mark as scheduled
  if (campaign.scheduledAt && campaign.scheduledAt > new Date()) {
    const [updated] = await db
      .update(campaignsTable)
      .set({ status: "scheduled" })
      .where(eq(campaignsTable.id, id))
      .returning();
    return res.json(updated);
  }

  // Gather all contacts in the target groups
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

  // Mark campaign as sending
  await db.update(campaignsTable).set({ status: "sending" }).where(eq(campaignsTable.id, id));

  // Send messages (real or simulated)
  const messageRows = [];
  for (const contact of contacts) {
    const body = campaign.body.replace(/{{name}}/g, contact.name);
    const result = await sendMessage(campaign.channel, contact.phone, contact.email, body);
    messageRows.push({
      campaignId: id,
      contactId: contact.id,
      contactName: contact.name,
      phone: contact.phone,
      status: result.success ? "delivered" : "failed",
      deliveredAt: result.success ? new Date() : null,
      errorMessage: result.error ?? null,
    });
  }

  if (messageRows.length > 0) {
    await db.insert(campaignMessagesTable).values(messageRows);
  }

  const [updated] = await db
    .update(campaignsTable)
    .set({
      status: "sent",
      sentAt: new Date(),
      recipientCount: contacts.length,
    })
    .where(eq(campaignsTable.id, id))
    .returning();

  return res.json({
    ...updated,
    simulated: isSimulated[campaign.channel as "sms" | "whatsapp" | "email"] ?? true,
  });
});

router.post("/campaigns/:id/test", async (req, res) => {
  const { id } = TestCampaignParams.parse(req.params);
  const body = TestCampaignBody.parse(req.body);
  const [campaign] = await db.select().from(campaignsTable).where(eq(campaignsTable.id, id));
  if (!campaign) return res.status(404).json({ error: "Not found" });

  const result = await sendMessage(campaign.channel, body.phone, body.email ?? null, campaign.body);
  return res.json({
    success: result.success,
    simulated: result.simulated ?? false,
    messageId: result.messageId ?? null,
    error: result.error ?? null,
  });
});

router.post("/campaigns/:id/duplicate", async (req, res) => {
  const { id } = DuplicateCampaignParams.parse(req.params);
  const [campaign] = await db.select().from(campaignsTable).where(eq(campaignsTable.id, id));
  if (!campaign) return res.status(404).json({ error: "Not found" });

  const [newCampaign] = await db
    .insert(campaignsTable)
    .values({
      name: `${campaign.name} (copy)`,
      channel: campaign.channel,
      body: campaign.body,
      templateId: campaign.templateId,
      groupIds: campaign.groupIds,
      recipientCount: campaign.recipientCount,
      status: "draft",
    })
    .returning();

  return res.status(201).json(newCampaign);
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
