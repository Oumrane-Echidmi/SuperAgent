import assert from "node:assert/strict";
import test from "node:test";
import { randomBytes, randomUUID } from "node:crypto";
import { once } from "node:events";
import pg from "pg";
import { Database, hashToken } from "../src/database.ts";
import { createApp } from "../src/app.ts";

for (const key of ["DATABASE_URL", "ADMIN_DATABASE_URL"]) {
  if (
    !process.env[key] ||
    new URL(process.env[key]!).pathname !== "/superagent_test"
  )
    throw new Error("Dedicated test database required.");
}
test("workspace persistence, idempotency, revisions and RLS boundaries", async () => {
  const db = new Database(process.env.DATABASE_URL!),
    admin = new pg.Pool({ connectionString: process.env.ADMIN_DATABASE_URL });
  const users = [randomUUID(), randomUUID(), randomUUID()],
    tenants = [randomUUID(), randomUUID()];
  const tokens = users.map(() => randomBytes(32).toString("base64url"));
  const server = createApp(db).listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const origin = `http://127.0.0.1:${address.port}/v1`;
  const root = `/tenants/${tenants[0]}/workspace-records`;
  async function request(
    path: string,
    method = "GET",
    body?: unknown,
    token = tokens[0],
  ) {
    const res = await fetch(origin + path, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return { status: res.status, body: await res.json() };
  }
  try {
    for (let i = 0; i < users.length; i++) {
      await admin.query(
        "INSERT INTO users(id,email,password_hash) VALUES($1,$2,$3)",
        [users[i], `${users[i]}@example.test`, "workspace-fixture"],
      );
      await admin.query(
        "INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '1 hour')",
        [hashToken(tokens[i]!), users[i]],
      );
      if (i < 2) {
        await admin.query(
          "INSERT INTO tenants(id,name,created_by) VALUES($1,$2,$3)",
          [tenants[i], "Workspace test", users[i]],
        );
        await admin.query(
          "INSERT INTO memberships(tenant_id,user_id,role) VALUES($1,$2,'OWNER')",
          [tenants[i], users[i]],
        );
      }
    }
    await admin.query(
      "INSERT INTO memberships(tenant_id,user_id,role) VALUES($1,$2,'STAFF')",
      [tenants[0], users[2]],
    );
    assert.equal(
      (await request("/chat-models", "GET", undefined, "invalid")).status,
      401,
    );
    assert.equal((await request("/chat-models")).body.data.length, 4);
    const input = {
      id: randomUUID(),
      kind: "document",
      title: "Policy",
      content: { body: "Real saved text" },
    };
    const created = await Promise.all([
      request(root, "POST", input),
      request(root, "POST", input),
    ]);
    assert.deepEqual(created.map((row) => row.status).sort(), [200, 201]);
    assert.equal(
      (await request(root, "POST", { ...input, title: "Changed" })).status,
      409,
    );
    assert.equal(
      (await request(root + "?kind=document")).body.pagination.totalItems,
      1,
    );
    const path = root + "/" + input.id;
    const update = {
      expectedRevision: 1,
      title: "Updated",
      content: { body: "Persisted revision" },
      archived: false,
    };
    assert.equal((await request(path, "PUT", update, tokens[2])).status, 403);
    const changes = await Promise.all([
      request(path, "PUT", update),
      request(path, "PUT", update),
    ]);
    assert.deepEqual(changes.map((row) => row.status).sort(), [200, 409]);
    assert.equal((await request(root, "POST", input)).body.revision, 2);
    assert.equal((await request(path)).body.content.body, "Persisted revision");
    assert.equal(
      (await request(path, "GET", undefined, tokens[1])).status,
      404,
    );
    assert.equal(
      (await request(root + "?kind=document", "GET", undefined, tokens[1]))
        .status,
      404,
    );
    const chat = {
      id: randomUUID(),
      kind: "chat",
      title: "Business chat",
      content: { model: "opus" },
    };
    assert.equal((await request(root, "POST", chat, tokens[2])).status, 201);
    const messages = root + "/" + chat.id + "/messages",
      message = { id: randomUUID(), model: "sol", text: "Please help" };
    const sent = await Promise.all([
      request(messages, "POST", message, tokens[2]),
      request(messages, "POST", message, tokens[2]),
    ]);
    assert.deepEqual(sent.map((row) => row.status).sort(), [200, 201]);
    assert.equal(sent[0]!.body.status, "AWAITING_PROVIDER");
    assert.equal(sent[0]!.body.role, "user");
    assert.equal(
      (await request(messages, "POST", { ...message, model: "astra" })).status,
      409,
    );
    assert.equal((await request(messages)).body.pagination.totalItems, 1);
    assert.equal(
      (
        await request(path + "/messages", "POST", {
          ...message,
          id: randomUUID(),
        })
      ).status,
      422,
    );
    assert.equal(
      (
        await request(root + "/" + chat.id, "PUT", {
          expectedRevision: 1,
          title: chat.title,
          content: chat.content,
          archived: true,
        })
      ).status,
      200,
    );
    assert.equal((await request(messages, "POST", message)).status, 200);
    assert.equal(
      (await request(messages, "POST", { ...message, id: randomUUID() }))
        .status,
      409,
    );
    assert.equal((await request(root + "?kind=chat")).body.data.length, 0);
    for (const kind of ["knowledge", "canvas", "agent", "workflow"]) {
      const content =
        kind === "agent"
          ? { instructions: "Help customers", model: "sonnet" }
          : kind === "workflow"
            ? {
                nodes: [{ id: "start", label: "Start", type: "trigger" }],
                edges: [],
              }
            : { body: "Saved" };
      assert.equal(
        (
          await request(root, "POST", {
            id: randomUUID(),
            kind,
            title: kind,
            content,
          })
        ).status,
        201,
      );
    }
    assert.equal(
      (await request(`/tenants/${tenants[0]}/conversations`)).body.pagination
        .totalItems,
      0,
    );
    const conversations = [randomUUID(), randomUUID()];
    for (const id of conversations) {
      assert.equal(
        (
          await request(`/tenants/${tenants[0]}/conversations`, "POST", {
            id,
            customerReference: id,
            language: "fr",
          })
        ).status,
        201,
      );
      assert.equal(
        (
          await request(`/tenants/${tenants[0]}/order-attempts`, "POST", {
            id: randomUUID(),
            conversationId: id,
            details: {},
          })
        ).status,
        201,
      );
    }
    const inbox = await request(
      `/tenants/${tenants[0]}/conversations?pageSize=1`,
    );
    assert.equal(inbox.body.data.length, 1);
    assert.equal(inbox.body.pagination.totalItems, 2);
    const filtered = await request(
      `/tenants/${tenants[0]}/order-attempts?conversationId=${conversations[0]}`,
    );
    assert.equal(filtered.body.pagination.totalItems, 1);
    assert.equal(filtered.body.data[0].conversationId, conversations[0]);
    assert.equal(
      (await request(path, "GET", undefined, tokens[2])).body.title,
      "Updated",
    );
    await assert.rejects(
      db.authenticated(tokens[2]!, (client) =>
        client.query(
          "INSERT INTO workspace_records(tenant_id,id,kind,title,content,initial_intent,created_by) VALUES($1,$2,'document','Denied','{}','{}',$3)",
          [tenants[0], randomUUID(), users[2]],
        ),
      ),
      { code: "42501" },
    );
    await db.authenticated(tokens[1]!, async (client) => {
      for (const table of ["workspace_records", "workspace_messages"])
        assert.equal(
          (
            await client.query(`SELECT * FROM ${table} WHERE tenant_id=$1`, [
              tenants[0],
            ])
          ).rowCount,
          0,
        );
    });
    await db.authenticated(tokens[2]!, async (client) => {
      assert.equal(
        (
          await client.query(
            "UPDATE workspace_records SET title='forbidden' WHERE tenant_id=$1 AND kind='document'",
            [tenants[0]],
          )
        ).rowCount,
        0,
      );
    });
    await assert.rejects(
      db.authenticated(tokens[0]!, (client) =>
        client.query(
          "UPDATE workspace_records SET kind='chat' WHERE tenant_id=$1",
          [tenants[0]],
        ),
      ),
      { code: "42501" },
    );
    await assert.rejects(
      db.authenticated(tokens[0]!, (client) =>
        client.query("DELETE FROM workspace_messages WHERE tenant_id=$1", [
          tenants[0],
        ]),
      ),
      { code: "42501" },
    );
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await admin.query("DELETE FROM tenants WHERE id=ANY($1::uuid[])", [
      tenants,
    ]);
    await admin.query("DELETE FROM users WHERE id=ANY($1::uuid[])", [users]);
    await db.pool.end();
    await admin.end();
  }
});
