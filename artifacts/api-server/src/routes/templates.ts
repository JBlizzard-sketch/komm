import { Router } from "express";
import { db, templatesTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import {
  CreateTemplateBody,
  GetTemplateParams,
  UpdateTemplateParams,
  UpdateTemplateBody,
  DeleteTemplateParams,
  ListTemplatesQueryParams,
} from "@workspace/api-zod";

const router = Router();

router.get("/templates", async (req, res) => {
  const query = ListTemplatesQueryParams.parse(req.query);
  let conditions: ReturnType<typeof eq>[] = [];
  if (query.category) conditions.push(eq(templatesTable.category, query.category));
  if (query.channel) conditions.push(eq(templatesTable.channel, query.channel));
  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
  const templates = await db.select().from(templatesTable).where(whereClause).orderBy(templatesTable.createdAt);
  return res.json(templates);
});

router.post("/templates", async (req, res) => {
  const body = CreateTemplateBody.parse(req.body);
  const [template] = await db
    .insert(templatesTable)
    .values({
      name: body.name,
      body: body.body,
      channel: body.channel,
      category: body.category,
      variables: body.variables ?? [],
    })
    .returning();
  return res.status(201).json(template);
});

router.get("/templates/:id", async (req, res) => {
  const { id } = GetTemplateParams.parse(req.params);
  const [template] = await db.select().from(templatesTable).where(eq(templatesTable.id, id));
  if (!template) return res.status(404).json({ error: "Not found" });
  return res.json(template);
});

router.put("/templates/:id", async (req, res) => {
  const { id } = UpdateTemplateParams.parse(req.params);
  const body = UpdateTemplateBody.parse(req.body);
  const [template] = await db
    .update(templatesTable)
    .set({
      name: body.name,
      body: body.body,
      channel: body.channel,
      category: body.category,
      variables: body.variables ?? [],
    })
    .where(eq(templatesTable.id, id))
    .returning();
  if (!template) return res.status(404).json({ error: "Not found" });
  return res.json(template);
});

router.delete("/templates/:id", async (req, res) => {
  const { id } = DeleteTemplateParams.parse(req.params);
  await db.delete(templatesTable).where(eq(templatesTable.id, id));
  return res.status(204).send();
});

export default router;
