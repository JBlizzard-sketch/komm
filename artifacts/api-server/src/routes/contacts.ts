import { Router } from "express";
import { db, contactsTable, groupsTable, contactGroupsTable, campaignMessagesTable, campaignsTable } from "@workspace/db";
import { eq, ilike, inArray, sql, and } from "drizzle-orm";
import {
  CreateContactBody,
  GetContactParams,
  UpdateContactParams,
  UpdateContactBody,
  DeleteContactParams,
  ListContactsQueryParams,
  ImportContactsBody,
  BulkDeleteContactsBody,
  BulkAddContactsToGroupBody,
  AddContactsToGroupParams,
  AddContactsToGroupBody,
  UpdateGroupParams,
  UpdateGroupBody,
  DeleteGroupParams,
  CreateGroupBody,
  ListGroupMembersParams,
  ListGroupMembersQueryParams,
  RemoveContactFromGroupParams,
  RemoveContactFromGroupQueryParams,
} from "@workspace/api-zod";

const router = Router();

// ── Contacts ──────────────────────────────────────────────────────────────

router.get("/contacts", async (req, res) => {
  const query = ListContactsQueryParams.parse(req.query);
  const { search, groupId, page, limit } = query;

  let conditions: ReturnType<typeof and>[] = [];
  if (search) {
    conditions.push(
      sql`(${contactsTable.name} ILIKE ${"%" + search + "%"} OR ${contactsTable.phone} ILIKE ${"%" + search + "%"})`
    );
  }

  let contactIds: number[] | undefined;
  if (groupId) {
    const memberships = await db
      .select({ contactId: contactGroupsTable.contactId })
      .from(contactGroupsTable)
      .where(eq(contactGroupsTable.groupId, groupId));
    contactIds = memberships.map((m) => m.contactId);
    if (contactIds.length === 0) {
      return res.json({ data: [], total: 0, page, limit });
    }
    conditions.push(inArray(contactsTable.id, contactIds));
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const [contacts, countResult] = await Promise.all([
    db
      .select()
      .from(contactsTable)
      .where(whereClause)
      .limit(limit)
      .offset((page - 1) * limit)
      .orderBy(contactsTable.createdAt),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(contactsTable)
      .where(whereClause),
  ]);

  const total = countResult[0]?.count ?? 0;

  // Enrich with groupIds
  const ids = contacts.map((c) => c.id);
  let groupMemberships: { contactId: number; groupId: number }[] = [];
  if (ids.length > 0) {
    groupMemberships = await db
      .select({ contactId: contactGroupsTable.contactId, groupId: contactGroupsTable.groupId })
      .from(contactGroupsTable)
      .where(inArray(contactGroupsTable.contactId, ids));
  }
  const groupMap = new Map<number, number[]>();
  for (const m of groupMemberships) {
    if (!groupMap.has(m.contactId)) groupMap.set(m.contactId, []);
    groupMap.get(m.contactId)!.push(m.groupId);
  }

  return res.json({
    data: contacts.map((c) => ({
      ...c,
      groupIds: groupMap.get(c.id) ?? [],
      customFields: c.customFields ?? null,
    })),
    total,
    page,
    limit,
  });
});

router.post("/contacts/import", async (req, res) => {
  const body = ImportContactsBody.parse(req.body);
  let imported = 0;
  let duplicates = 0;
  let errors = 0;
  const errorDetails: string[] = [];

  for (const c of body.contacts) {
    try {
      const existing = await db
        .select({ id: contactsTable.id })
        .from(contactsTable)
        .where(eq(contactsTable.phone, c.phone));
      if (existing.length > 0) {
        duplicates++;
        continue;
      }
      const [inserted] = await db
        .insert(contactsTable)
        .values({
          name: c.name,
          phone: c.phone,
          email: c.email ?? null,
          channel: c.channel,
          customFields: c.customFields ?? null,
        })
        .returning({ id: contactsTable.id });

      if (body.groupId && inserted) {
        await db.insert(contactGroupsTable).values({
          contactId: inserted.id,
          groupId: body.groupId,
        });
      }
      imported++;
    } catch {
      errors++;
      errorDetails.push(`Failed to import ${c.phone}`);
    }
  }

  return res.json({ imported, duplicates, errors, errorDetails });
});

router.post("/contacts", async (req, res) => {
  const body = CreateContactBody.parse(req.body);
  const [contact] = await db
    .insert(contactsTable)
    .values({
      name: body.name,
      phone: body.phone,
      email: body.email ?? null,
      channel: body.channel,
      customFields: body.customFields ?? null,
    })
    .returning();

  if (body.groupIds && body.groupIds.length > 0) {
    await db.insert(contactGroupsTable).values(
      body.groupIds.map((gId) => ({ contactId: contact.id, groupId: gId }))
    );
  }

  return res.status(201).json({ ...contact, groupIds: body.groupIds ?? [] });
});

router.get("/contacts/:id", async (req, res) => {
  const { id } = GetContactParams.parse(req.params);
  const [contact] = await db.select().from(contactsTable).where(eq(contactsTable.id, id));
  if (!contact) return res.status(404).json({ error: "Not found" });

  const memberships = await db
    .select({ groupId: contactGroupsTable.groupId })
    .from(contactGroupsTable)
    .where(eq(contactGroupsTable.contactId, id));

  return res.json({ ...contact, groupIds: memberships.map((m) => m.groupId) });
});

router.get("/contacts/:id/messages", async (req, res) => {
  const { id } = GetContactParams.parse(req.params);
  const page = Math.max(1, parseInt((req.query.page as string) ?? "1"));
  const limit = Math.min(50, Math.max(1, parseInt((req.query.limit as string) ?? "20")));

  const whereClause = eq(campaignMessagesTable.contactId, id);

  const [rows, countResult] = await Promise.all([
    db
      .select({
        id: campaignMessagesTable.id,
        campaignId: campaignMessagesTable.campaignId,
        campaignName: campaignsTable.name,
        channel: campaignsTable.channel,
        status: campaignMessagesTable.status,
        errorMessage: campaignMessagesTable.errorMessage,
        deliveredAt: campaignMessagesTable.deliveredAt,
        createdAt: campaignMessagesTable.createdAt,
      })
      .from(campaignMessagesTable)
      .innerJoin(campaignsTable, eq(campaignMessagesTable.campaignId, campaignsTable.id))
      .where(whereClause)
      .orderBy(sql`${campaignMessagesTable.createdAt} DESC`)
      .limit(limit)
      .offset((page - 1) * limit),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(campaignMessagesTable)
      .where(whereClause),
  ]);

  return res.json({ data: rows, total: countResult[0]?.count ?? 0, page, limit });
});

router.put("/contacts/:id", async (req, res) => {
  const { id } = UpdateContactParams.parse(req.params);
  const body = UpdateContactBody.parse(req.body);

  const [contact] = await db
    .update(contactsTable)
    .set({
      name: body.name,
      phone: body.phone,
      email: body.email ?? null,
      channel: body.channel,
      customFields: body.customFields ?? null,
    })
    .where(eq(contactsTable.id, id))
    .returning();

  if (!contact) return res.status(404).json({ error: "Not found" });

  if (body.groupIds !== undefined) {
    await db.delete(contactGroupsTable).where(eq(contactGroupsTable.contactId, id));
    if (body.groupIds.length > 0) {
      await db.insert(contactGroupsTable).values(
        body.groupIds.map((gId) => ({ contactId: id, groupId: gId }))
      );
    }
  }

  return res.json({ ...contact, groupIds: body.groupIds ?? [] });
});

router.delete("/contacts/:id", async (req, res) => {
  const { id } = DeleteContactParams.parse(req.params);
  await db.delete(contactsTable).where(eq(contactsTable.id, id));
  return res.status(204).send();
});

router.post("/contacts/bulk-delete", async (req, res) => {
  const { contactIds } = BulkDeleteContactsBody.parse(req.body);
  if (contactIds.length === 0) return res.json({ deleted: 0 });
  await db.delete(contactGroupsTable).where(inArray(contactGroupsTable.contactId, contactIds));
  const deleted = await db.delete(contactsTable).where(inArray(contactsTable.id, contactIds)).returning({ id: contactsTable.id });
  return res.json({ deleted: deleted.length });
});

router.post("/contacts/bulk-group", async (req, res) => {
  const { contactIds, groupId } = BulkAddContactsToGroupBody.parse(req.body);
  if (contactIds.length === 0) return res.json({ added: 0 });

  const existing = await db
    .select({ contactId: contactGroupsTable.contactId })
    .from(contactGroupsTable)
    .where(and(eq(contactGroupsTable.groupId, groupId), inArray(contactGroupsTable.contactId, contactIds)));
  const existingSet = new Set(existing.map((e) => e.contactId));
  const toInsert = contactIds.filter((id) => !existingSet.has(id));

  if (toInsert.length > 0) {
    await db.insert(contactGroupsTable).values(toInsert.map((cid) => ({ contactId: cid, groupId })));
  }
  return res.json({ added: toInsert.length });
});

// ── Groups ─────────────────────────────────────────────────────────────────

router.get("/groups", async (req, res) => {
  const groups = await db.select().from(groupsTable).orderBy(groupsTable.createdAt);

  const counts = await db
    .select({ groupId: contactGroupsTable.groupId, count: sql<number>`count(*)::int` })
    .from(contactGroupsTable)
    .groupBy(contactGroupsTable.groupId);
  const countMap = new Map(counts.map((c) => [c.groupId, c.count]));

  return res.json(
    groups.map((g) => ({ ...g, contactCount: countMap.get(g.id) ?? 0 }))
  );
});

router.post("/groups", async (req, res) => {
  const body = CreateGroupBody.parse(req.body);
  const [group] = await db
    .insert(groupsTable)
    .values({ name: body.name, description: body.description ?? null })
    .returning();
  return res.status(201).json({ ...group, contactCount: 0 });
});

router.put("/groups/:id", async (req, res) => {
  const { id } = UpdateGroupParams.parse(req.params);
  const body = UpdateGroupBody.parse(req.body);
  const [group] = await db
    .update(groupsTable)
    .set({ name: body.name, description: body.description ?? null })
    .where(eq(groupsTable.id, id))
    .returning();
  if (!group) return res.status(404).json({ error: "Not found" });
  const [count] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(contactGroupsTable)
    .where(eq(contactGroupsTable.groupId, id));
  return res.json({ ...group, contactCount: count?.count ?? 0 });
});

router.delete("/groups/:id", async (req, res) => {
  const { id } = DeleteGroupParams.parse(req.params);
  await db.delete(groupsTable).where(eq(groupsTable.id, id));
  return res.status(204).send();
});

router.get("/groups/:id/members", async (req, res) => {
  const { id } = ListGroupMembersParams.parse(req.params);
  const query = ListGroupMembersQueryParams.parse(req.query);
  const { page, limit } = query;

  const memberships = await db
    .select({ contactId: contactGroupsTable.contactId })
    .from(contactGroupsTable)
    .where(eq(contactGroupsTable.groupId, id));

  const contactIds = memberships.map((m) => m.contactId);
  if (contactIds.length === 0) return res.json({ data: [], total: 0, page, limit });

  const [contacts, countResult] = await Promise.all([
    db.select().from(contactsTable)
      .where(inArray(contactsTable.id, contactIds))
      .limit(limit)
      .offset((page - 1) * limit)
      .orderBy(contactsTable.name),
    db.select({ count: sql<number>`count(*)::int` })
      .from(contactsTable)
      .where(inArray(contactsTable.id, contactIds)),
  ]);

  return res.json({
    data: contacts.map((c) => ({ ...c, groupIds: [id] })),
    total: countResult[0]?.count ?? 0,
    page,
    limit,
  });
});

router.delete("/groups/:id/members", async (req, res) => {
  const { id } = RemoveContactFromGroupParams.parse(req.params);
  const query = RemoveContactFromGroupQueryParams.parse(req.query);
  const contactId = query.contactId;

  await db.delete(contactGroupsTable)
    .where(and(eq(contactGroupsTable.groupId, id), eq(contactGroupsTable.contactId, contactId)));

  return res.json({ removed: true });
});

router.post("/groups/:id/contacts", async (req, res) => {
  const { id } = AddContactsToGroupParams.parse(req.params);
  const { contactIds } = AddContactsToGroupBody.parse(req.body);

  const existing = await db
    .select({ contactId: contactGroupsTable.contactId })
    .from(contactGroupsTable)
    .where(eq(contactGroupsTable.groupId, id));
  const existingIds = new Set(existing.map((e) => e.contactId));
  const toInsert = contactIds.filter((cid) => !existingIds.has(cid));

  if (toInsert.length > 0) {
    await db.insert(contactGroupsTable).values(
      toInsert.map((cid) => ({ contactId: cid, groupId: id }))
    );
  }

  const [group] = await db.select().from(groupsTable).where(eq(groupsTable.id, id));
  const [count] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(contactGroupsTable)
    .where(eq(contactGroupsTable.groupId, id));
  return res.json({ ...group, contactCount: count?.count ?? 0 });
});

export default router;
