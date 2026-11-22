import { Router } from "express";
import type { Request } from "express";
import type { PoolClient } from "pg";
import { z } from "zod";
import { Database, HttpError } from "./database.ts";
import { readBearerToken } from "./auth.ts";
import { requireTenant, draftPaginationSchema } from "./builder.ts";
import { recordInput, recordKind, recordValue } from "./workspace.ts";

const columns =
  'id,kind,title,content,revision,archived,created_at AS "createdAt",updated_at AS "updatedAt"';
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

export function workspaceRoutes(db: Database, models: string[] = []) {
  const router = Router();
  const base = "/tenants/:tenantId/workspace-records";
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
  function checkModel(value: z.infer<typeof recordValue>) {
    if (value.kind === "agent" && !models.includes(value.content.model))
      throw new HttpError(
        422,
        "MODEL_NOT_ALLOWED",
        "Choose an available AI model.",
      );
  }
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
  router.get(base, async (req, res) => {
    res.json(
      await scoped(req, async (client, tid) => {
        const { kind, page, pageSize } = parse(
          draftPaginationSchema.extend({ kind: recordKind }),
          req.query,
        );
        const rows = await client.query(
          `SELECT ${columns} FROM workspace_records WHERE tenant_id=$1 AND kind=$2 AND NOT archived ORDER BY updated_at DESC,id LIMIT $3 OFFSET $4`,
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
    );
  });
  router.post(base, async (req, res) => {
    const result = await scoped(req, async (client, tid, actor) => {
      await requireTenant(client, tid, true);
      const input = parse(recordInput, req.body);
      // A durable creation ID binds the original intent, even after later edits.
      const previous = await client.query(
        `SELECT ${columns},initial_intent=$3::jsonb AS matches FROM workspace_records WHERE tenant_id=$1 AND id=$2`,
        [tid, input.id, input],
      );
      if (previous.rowCount) {
        if (!previous.rows[0].matches)
          throw new HttpError(
            409,
            "ID_REUSED",
            "This ID belongs to a different record.",
          );
        const { matches, ...row } = previous.rows[0];
        return { created: false, row };
      }
      checkModel(input);
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
  router.get(base + "/:id", async (req, res) =>
    res.json(
      await scoped(req, (client, tid) => load(client, tid, req.params.id)),
    ),
  );
  router.put(base + "/:id", async (req, res) => {
    res.json(
      await scoped(req, async (client, tid) => {
        await requireTenant(client, tid, true);
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
        if (!input.archived) checkModel(value);
        return (
          await client.query(
            `UPDATE workspace_records SET title=$3,content=$4,archived=$5,revision=revision+1,updated_at=clock_timestamp()
        WHERE tenant_id=$1 AND id=$2 RETURNING ${columns}`,
            [tid, row.id, value.title, value.content, input.archived],
          )
        ).rows[0];
      }),
    );
  });
  return router;
}
