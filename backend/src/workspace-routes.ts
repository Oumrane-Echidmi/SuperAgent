import { Router } from "express";
import type { Request } from "express";
import type { PoolClient } from "pg";
import { z } from "zod";
import { Database, HttpError } from "./database.ts";
import { readBearerToken } from "./auth.ts";
import { requireTenant, draftPaginationSchema } from "./builder.ts";
import {
  chatModels,
  recordInput,
  recordKind,
  recordValue,
  messageInput,
} from "./workspace.ts";

const columns =
  'id,kind,title,content,revision,archived,created_at AS "createdAt",updated_at AS "updatedAt"';
const messageColumns =
  'id,record_id AS "recordId",model,text,role,status,created_at AS "createdAt"';
function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success)
    throw new HttpError(
      422,
      "INVALID_INPUT",
      "Check the workspace fields and sizes.",
    );
  return result.data;
}
export function workspaceRoutes(db: Database) {
  const router = Router(),
    base = "/tenants/:tenantId/workspace-records";
  router.use((_req, res, next) => {
    res.set("Cache-Control", "no-store");
    next();
  });
  function scoped<T>(
    req: Request,
    work: (client: PoolClient, tenantId: string, actor: string) => Promise<T>,
  ) {
    return db.authenticated(
      readBearerToken(req.headers.authorization),
      async (client, actor) => {
        const tenantId = parse(z.uuid(), req.params.tenantId);
        await requireTenant(client, tenantId, false);
        return work(client, tenantId, actor);
      },
    );
  }
  router.get("/chat-models", async (req, res) => {
    await db.authenticated(
      readBearerToken(req.headers.authorization),
      async () => {},
    );
    res.json({ data: chatModels });
  });
  router.get(base, async (req, res) =>
    res.json(
      await scoped(req, async (client, tid) => {
        const { kind, page, pageSize } = parse(
          draftPaginationSchema.extend({ kind: recordKind }),
          req.query,
        );
        const rows = await client.query(
          `SELECT ${columns} FROM workspace_records WHERE tenant_id=$1 AND kind=$2 AND NOT archived
      ORDER BY updated_at DESC,id LIMIT $3 OFFSET $4`,
          [tid, kind, pageSize, (page - 1) * pageSize],
        );
        const count = await client.query(
          "SELECT count(*)::integer AS total FROM workspace_records WHERE tenant_id=$1 AND kind=$2 AND NOT archived",
          [tid, kind],
        );
        return {
          data: rows.rows,
          pagination: {
            page,
            pageSize,
            totalItems: count.rows[0].total,
            totalPages: Math.ceil(count.rows[0].total / pageSize),
          },
        };
      }),
    ),
  );
  router.post(base, async (req, res) => {
    const result = await scoped(req, async (client, tid, actor) => {
      const input = parse(recordInput, req.body);
      await requireTenant(client, tid, input.kind !== "chat");
      const inserted = await client.query(
        `INSERT INTO workspace_records(tenant_id,id,kind,title,content,initial_intent,created_by)
        VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(tenant_id,id) DO NOTHING RETURNING ${columns}`,
        [tid, input.id, input.kind, input.title, input.content, input, actor],
      );
      if (inserted.rowCount) return { created: true, row: inserted.rows[0] };
      const old = await client.query(
        `SELECT ${columns},initial_intent=$3::jsonb AS matches FROM workspace_records WHERE tenant_id=$1 AND id=$2`,
        [tid, input.id, input],
      );
      if (!old.rows[0]?.matches)
        throw new HttpError(
          409,
          "ID_REUSED",
          "This ID belongs to a different record.",
        );
      const { matches, ...row } = old.rows[0];
      return { created: false, row };
    });
    res.status(result.created ? 201 : 200).json(result.row);
  });
  async function load(
    client: PoolClient,
    tid: string,
    id: unknown,
    lock = false,
  ) {
    const rows = await client.query(
      `SELECT ${columns} FROM workspace_records WHERE tenant_id=$1 AND id=$2${lock ? " FOR UPDATE" : ""}`,
      [tid, parse(z.uuid(), id)],
    );
    if (!rows.rowCount)
      throw new HttpError(404, "NOT_FOUND", "Workspace record not found.");
    return rows.rows[0];
  }
  router.get(base + "/:id", async (req, res) =>
    res.json(
      await scoped(req, (client, tid) => load(client, tid, req.params.id)),
    ),
  );
  router.put(base + "/:id", async (req, res) =>
    res.json(
      await scoped(req, async (client, tid) => {
        const head = await load(client, tid, req.params.id);
        await requireTenant(client, tid, head.kind !== "chat");
        const row = await load(client, tid, req.params.id, true);
        const input = parse(
          z.strictObject({
            expectedRevision: z.number().int().min(1).max(2147483646),
            title: z.string(),
            content: z.unknown(),
            archived: z.boolean(),
          }),
          req.body,
        );
        const value = parse(recordValue, {
          kind: row.kind,
          title: input.title,
          content: input.content,
        });
        if (row.revision !== input.expectedRevision)
          throw new HttpError(
            409,
            "REVISION_CHANGED",
            "This record changed. Reload before saving.",
          );
        return (
          await client.query(
            `UPDATE workspace_records SET title=$3,content=$4,archived=$5,revision=revision+1,updated_at=clock_timestamp()
      WHERE tenant_id=$1 AND id=$2 RETURNING ${columns}`,
            [tid, row.id, value.title, value.content, input.archived],
          )
        ).rows[0];
      }),
    ),
  );
  router.get(base + "/:id/messages", async (req, res) =>
    res.json(
      await scoped(req, async (client, tid) => {
        const row = await load(client, tid, req.params.id);
        if (row.kind !== "chat")
          throw new HttpError(422, "NOT_CHAT", "Choose a chat record.");
        const { page, pageSize } = parse(draftPaginationSchema, req.query);
        const rows = await client.query(
          `SELECT ${messageColumns} FROM workspace_messages WHERE tenant_id=$1 AND record_id=$2
      ORDER BY created_at DESC,id DESC LIMIT $3 OFFSET $4`,
          [tid, row.id, pageSize, (page - 1) * pageSize],
        );
        const count = await client.query(
          "SELECT count(*)::integer AS total FROM workspace_messages WHERE tenant_id=$1 AND record_id=$2",
          [tid, row.id],
        );
        return {
          data: rows.rows.reverse(),
          pagination: {
            page,
            pageSize,
            totalItems: count.rows[0].total,
            totalPages: Math.ceil(count.rows[0].total / pageSize),
          },
        };
      }),
    ),
  );
  router.post(base + "/:id/messages", async (req, res) => {
    const result = await scoped(req, async (client, tid, actor) => {
      const row = await load(client, tid, req.params.id, true),
        input = parse(messageInput, req.body);
      if (row.kind !== "chat")
        throw new HttpError(422, "NOT_CHAT", "Choose a chat record.");
      // Replay remains possible after archival; no new message may be added.
      const prior = await client.query(
        `SELECT ${messageColumns} FROM workspace_messages WHERE tenant_id=$1 AND id=$2`,
        [tid, input.id],
      );
      if (prior.rowCount) {
        const old = prior.rows[0];
        if (
          old.recordId !== row.id ||
          old.model !== input.model ||
          old.text !== input.text
        )
          throw new HttpError(
            409,
            "ID_REUSED",
            "This message ID has different content.",
          );
        return { created: false, row: old };
      }
      if (row.archived)
        throw new HttpError(409, "ARCHIVED", "This chat is archived.");
      const saved = await client.query(
        `INSERT INTO workspace_messages(tenant_id,record_id,id,model,text,created_by)
        VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(tenant_id,id) DO NOTHING RETURNING ${messageColumns}`,
        [tid, row.id, input.id, input.model, input.text, actor],
      );
      if (!saved.rowCount)
        throw new HttpError(
          409,
          "ID_REUSED",
          "This message ID was used by another chat.",
        );
      return { created: true, row: saved.rows[0] };
    });
    res.status(result.created ? 201 : 200).json(result.row);
  });
  return router;
}
