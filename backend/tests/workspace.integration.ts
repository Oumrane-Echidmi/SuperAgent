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

test("connected workspace persists every record kind, fences edits, isolates tenants and lists real inbox conversations", async () => {
  const db = new Database(process.env.DATABASE_URL!);
  const admin = new pg.Pool({
    connectionString: process.env.ADMIN_DATABASE_URL,
  });
  const users = [randomUUID(), randomUUID(), randomUUID()];
  const tenants = [randomUUID(), randomUUID()];
  const tokens = users.map(() => randomBytes(32).toString("base64url"));
  const server = createApp(db, {
    builderModels: {
      defaultModel: "gpt-4.1-mini",
      models: ["gpt-4.1-mini", "gpt-4.1"],
    },
  }).listen(0, "127.0.0.1");
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
    return {
      status: res.status,
      body: await res.json(),
      cache: res.headers.get("cache-control"),
    };
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
      (await request(root + "?kind=document", "GET", undefined, "invalid"))
        .status,
      401,
    );
    const doc = {
      id: randomUUID(),
      kind: "document",
      title: "Policy",
      content: { body: "Real saved text" },
    };
    const created = await Promise.all([
      request(root, "POST", doc),
      request(root, "POST", doc),
    ]);
    assert.deepEqual(created.map((row) => row.status).sort(), [200, 201]);
    assert.equal(created[0]!.cache, "no-store");
    assert.equal(
      (await request(root, "POST", { ...doc, title: "Different" })).status,
      409,
    );
    assert.equal(
      (await request(root, "POST", { ...doc, id: randomUUID() }, tokens[2]))
        .status,
      403,
    );
    assert.equal(
      (await request(root + "/" + doc.id, "GET", undefined, tokens[1])).status,
      404,
    );
    assert.equal(
      (await request(root + "?kind=document", "GET", undefined, tokens[1]))
        .status,
      404,
    );
    assert.equal(
      (await request(root + "/" + doc.id, "GET", undefined, tokens[2])).body
        .content.body,
      "Real saved text",
    );
    const update = {
      expectedRevision: 1,
      title: "Updated policy",
      content: { body: "Persisted revision" },
      archived: false,
    };
    assert.equal(
      (await request(root + "/" + doc.id, "PUT", update, tokens[2])).status,
      403,
    );
    const changes = await Promise.all([
      request(root + "/" + doc.id, "PUT", update),
      request(root + "/" + doc.id, "PUT", update),
    ]);
    assert.deepEqual(changes.map((row) => row.status).sort(), [200, 409]);
    assert.equal((await request(root, "POST", doc)).body.revision, 2);
    assert.equal(
      (await request(root + "/" + doc.id)).body.content.body,
      "Persisted revision",
    );
    for (const item of [
      {
        kind: "knowledge",
        content: { body: "Delivery policy in Darija: التوصيل" },
      },
      {
        kind: "agent",
        content: { instructions: "Answer product questions", model: "gpt-4.1" },
      },
      {
        kind: "workflow",
        content: {
          nodes: [
            { id: "start", label: "Start", type: "trigger" },
            { id: "done", label: "Done", type: "end" },
          ],
          edges: [{ source: "start", target: "done" }],
        },
      },
    ]) {
      const record = { ...item, id: randomUUID(), title: "Saved " + item.kind };
      assert.equal((await request(root, "POST", record)).status, 201);
      assert.deepEqual(
        (await request(root + "/" + record.id)).body.content,
        record.content,
      );
      const listed = await request(root + "?kind=" + item.kind);
      assert.equal(listed.body.pagination.totalItems, 1);
      assert.equal(listed.body.data[0].id, record.id);
    }
    assert.equal(
      (
        await request(root, "POST", {
          id: randomUUID(),
          kind: "agent",
          title: "Bad model",
          content: { instructions: "Help", model: "unapproved" },
        })
      ).body.error.code,
      "MODEL_NOT_ALLOWED",
    );
    assert.equal(
      (
        await request(root + "/" + doc.id, "PUT", {
          ...update,
          expectedRevision: 2,
          archived: true,
        })
      ).status,
      200,
    );
    assert.equal(
      (await request(root + "?kind=document")).body.pagination.totalItems,
      0,
    );
    await db.authenticated(tokens[1]!, async (client) => {
      assert.equal(
        (
          await client.query(
            "SELECT * FROM workspace_records WHERE tenant_id=$1",
            [tenants[0]],
          )
        ).rowCount,
        0,
      );
    });
    await assert.rejects(
      db.authenticated(tokens[0]!, (client) =>
        client.query(
          "UPDATE workspace_records SET kind='workflow' WHERE tenant_id=$1",
          [tenants[0]],
        ),
      ),
      { code: "42501" },
    );
    const conversation = {
      id: randomUUID(),
      customerReference: "Saved customer",
      language: "fr",
    };
    const inboxRoot = `/tenants/${tenants[0]}`;
    assert.equal(
      (await request(inboxRoot + "/conversations", "POST", conversation))
        .status,
      201,
    );
    const another = {
      ...conversation,
      id: randomUUID(),
      customerReference: "Other customer",
    };
    await request(inboxRoot + "/conversations", "POST", another);
    const inbox = await request(inboxRoot + "/conversations?page=1&pageSize=1");
    assert.equal(inbox.body.pagination.totalItems, 2);
    assert.equal(inbox.body.data.length, 1);
    assert.equal(
      (await request(inboxRoot + "/conversations", "GET", undefined, tokens[1]))
        .status,
      404,
    );
    assert.equal(
      (await request(inboxRoot + "/conversations", "GET", undefined, tokens[2]))
        .body.pagination.totalItems,
      2,
    );
    const order = {
      id: randomUUID(),
      conversationId: conversation.id,
      details: {
        recipient: "Client",
        item: "Product",
        quantity: 1,
        phone: "+212600000000",
        address: "Test address",
        unitAmountMinor: 10000,
        deliveryAmountMinor: 0,
      },
    };
    assert.equal(
      (await request(inboxRoot + "/order-attempts", "POST", order)).status,
      201,
    );
    assert.equal(
      (
        await request(
          inboxRoot + "/order-attempts?conversationId=" + conversation.id,
        )
      ).body.pagination.totalItems,
      1,
    );
    assert.equal(
      (
        await request(
          inboxRoot + "/order-attempts?conversationId=" + another.id,
        )
      ).body.pagination.totalItems,
      0,
    );
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
    await admin.query("DELETE FROM tenants WHERE id=ANY($1::uuid[])", [
      tenants,
    ]);
    await admin.query("DELETE FROM users WHERE id=ANY($1::uuid[])", [users]);
    await db.pool.end();
    await admin.end();
  }
});
