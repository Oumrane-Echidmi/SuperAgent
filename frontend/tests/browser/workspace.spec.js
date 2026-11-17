import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { randomUUID, createHash } from "node:crypto";
import pg from "pg";
const env = parseEnv(
  readFileSync(new URL("../../../backend/.env.test", import.meta.url), "utf8"),
);
const hash = (value) => createHash("sha256").update(value).digest("hex");
let previousIpCounter;
test.beforeEach(async () => {
  // The isolated browser server shares a loopback IP across reruns; preserve its pre-test counter.
  const client = new pg.Client({ connectionString: env.ADMIN_DATABASE_URL });
  await client.connect();
  try {
    previousIpCounter = (
      await client.query("SELECT * FROM auth_limits WHERE key=$1", [
        hash("ip:127.0.0.1"),
      ])
    ).rows[0];
    await client.query("DELETE FROM auth_limits WHERE key=$1", [
      hash("ip:127.0.0.1"),
    ]);
  } finally {
    await client.end();
  }
});
test.afterEach(async () => {
  const client = new pg.Client({ connectionString: env.ADMIN_DATABASE_URL });
  await client.connect();
  try {
    await client.query("DELETE FROM auth_limits WHERE key=$1", [
      hash("ip:127.0.0.1"),
    ]);
    if (previousIpCounter)
      await client.query(
        "INSERT INTO auth_limits(key,attempts,window_start) VALUES ($1,$2,$3)",
        [
          previousIpCounter.key,
          previousIpCounter.attempts,
          previousIpCounter.window_start,
        ],
      );
  } finally {
    await client.end();
  }
});

test("real sign-in, profile, confirmation retry, dashboard, mobile, logout and expiry", async ({
  page,
  request,
}, info) => {
  const admin = new pg.Pool({ connectionString: env.ADMIN_DATABASE_URL }),
    id = randomUUID(),
    email = `browser-${id}@example.test`,
    password = `browser-fixture-${id}`,
    errors = [];
  let bearer = "";
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (req) => {
    if (new URL(req.url()).pathname === "/v1/me" && req.headers().authorization)
      bearer = req.headers().authorization;
  });
  try {
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: "Welcome back." }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "New here? Create a workspace" })
      .click();
    await page.getByLabel("Business name").fill("Atlas Browser Shop");
    await page.getByLabel("Email", { exact: true }).fill(email);
    await page.getByLabel("Password", { exact: true }).fill(password);
    await page
      .getByRole("button", { name: "Create workspace", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Today at a glance" }),
    ).toBeVisible();
    const account = (
        await admin.query(
          "SELECT u.id AS user_id,t.id AS tenant_id FROM users u JOIN tenants t ON t.created_by=u.id WHERE u.email=$1",
          [email],
        )
      ).rows[0],
      connectionId = randomUUID(),
      destinationId = randomUUID();
    await admin.query(
      `INSERT INTO google_connections(tenant_id,id,created_by,oauth_client_id,redirect_uri,status,credential_envelope,scopes,connected_at) VALUES ($1,$2,$3,'browser-fixture','https://example.test/callback','CONNECTED','{}',ARRAY['https://www.googleapis.com/auth/drive.file'],now())`,
      [account.tenant_id, connectionId, account.user_id],
    );
    await admin.query(
      `INSERT INTO sheet_destinations(tenant_id,id,connection_id,spreadsheet_id,sheet_id,spreadsheet_title,tab_title,row_count,column_count,created_by) VALUES ($1,$2,$3,'fixture-sheet',0,'Shop spreadsheet','Orders',1000,26,$4)`,
      [account.tenant_id, destinationId, connectionId, account.user_id],
    );
    await page
      .getByRole("link", { name: "Business profile", exact: true })
      .click();
    await page.getByLabel("Shop language").selectOption("darija");
    await page
      .getByLabel("Business description")
      .fill("Shop profile saved through the browser.");
    await page.getByRole("button", { name: "Save business profile" }).click();
    await expect(
      page.getByText("Business profile saved.", { exact: true }),
    ).toBeVisible();
    await page.getByRole("link", { name: "Orders", exact: true }).click();
    await page.getByRole("link", { name: "Record order", exact: true }).click();
    await page.getByLabel("Customer name").fill("Browser Customer");
    await page.getByLabel("Phone", { exact: true }).fill("+212612345678");
    await page
      .getByLabel("Item", { exact: true })
      .fill("=literal customer item");
    await page.getByLabel("Quantity").fill("2");
    await page.getByLabel("Unit price (MAD)").fill("125.50");
    await page.getByLabel("Delivery fee (MAD)").fill("30");
    await page.getByLabel("Delivery address").fill("Test address, Casablanca");
    await page.getByRole("button", { name: "Save order details" }).click();
    await expect(
      page.getByRole("heading", { name: "Browser Customer" }),
    ).toBeVisible();
    await expect(page.getByText("281.00 MAD", { exact: true })).toBeVisible();
    const orderId = new URL(page.url()).pathname.split("/").pop();
    const decisionIds = [];
    let dropped = false;
    await page.route("**/decisions", async (route) => {
      decisionIds.push(route.request().postDataJSON().id);
      const response = await route.fetch();
      if (!dropped) {
        dropped = true;
        await route.abort("failed");
      } else await route.fulfill({ response });
    });
    await page
      .getByLabel("Customer decision evidence")
      .fill("Customer confirmed the reviewed summary by phone.");
    await page
      .getByRole("button", { name: "Confirm order", exact: true })
      .click();
    await expect(page.getByRole("alert")).toContainText("Connection lost");
    await page.getByRole("button", { name: "Retry this decision" }).click();
    await expect(page.getByText("CONFIRMED", { exact: true })).toBeVisible();
    expect(decisionIds.length).toBe(2);
    expect(new Set(decisionIds).size).toBe(1);
    await page.getByRole("button", { name: "Use this destination" }).click();
    await expect(
      page.getByText("Shop spreadsheet", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText("Review the spreadsheet row", { exact: true }),
    ).toBeVisible();
    await expect(page.locator(".live-row-preview")).toContainText("281.00");
    await page
      .getByRole("button", { name: "Queue spreadsheet delivery" })
      .click();
    await expect(page.getByRole("alert")).toContainText(
      "Sheets delivery is not enabled",
    );
    const fixture = (
      await admin.query(
        "SELECT u.id AS user_id,t.id AS tenant_id FROM users u JOIN tenants t ON t.created_by=u.id WHERE u.email=$1",
        [email],
      )
    ).rows[0];
    expect(
      (
        await admin.query(
          "SELECT amount_minor FROM orders WHERE tenant_id=$1 AND id=$2",
          [fixture.tenant_id, orderId],
        )
      ).rows[0].amount_minor,
    ).toBe("28100");
    expect(
      (
        await admin.query(
          "SELECT count(*)::int AS count FROM order_decision_receipts WHERE tenant_id=$1",
          [fixture.tenant_id],
        )
      ).rows[0].count,
    ).toBe(1);
    expect(
      (
        await admin.query(
          "SELECT description FROM business_profiles WHERE tenant_id=$1",
          [fixture.tenant_id],
        )
      ).rows[0].description,
    ).toBe("Shop profile saved through the browser.");
    await page.getByRole("link", { name: "Home", exact: true }).click();
    await expect(
      page.locator(".live-metric").filter({ hasText: "281.00 MAD" }),
    ).toBeVisible();
    await page.screenshot({
      path: info.outputPath("dashboard.png"),
      fullPage: true,
    });
    expect(
      await page.evaluate(
        () =>
          Object.keys(localStorage).length + Object.keys(sessionStorage).length,
      ),
    ).toBe(0);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole("link", { name: "Orders", exact: true }).click();
    await expect(
      page.getByText("Browser Customer", { exact: true }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: info.outputPath("mobile-orders.png"),
      fullPage: true,
    });
    await page.getByRole("button", { name: "Sign out", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Welcome back." }),
    ).toBeVisible();
    expect(
      (
        await request.get("/v1/me", { headers: { Authorization: bearer } })
      ).status(),
    ).toBe(401);
    await page.getByLabel("Email", { exact: true }).fill(email);
    await page.getByLabel("Password", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Today at a glance" }),
    ).toBeVisible();
    await page.reload();
    await expect(
      page.getByRole("heading", { name: "Welcome back." }),
    ).toBeVisible();
    await page.getByLabel("Email", { exact: true }).fill(email);
    await page.getByLabel("Password", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Today at a glance" }),
    ).toBeVisible();
    await admin.query(
      "UPDATE sessions SET expires_at=now()-interval '1 second' WHERE user_id=$1",
      [fixture.user_id],
    );
    await page.getByRole("button", { name: "Refresh", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Welcome back." }),
    ).toBeVisible();
    await expect(
      page.getByText("Your session expired. Please sign in again."),
    ).toBeVisible();
    expect(errors).toEqual([]);
  } finally {
    const users = await admin.query("SELECT id FROM users WHERE email=$1", [
      email,
    ]);
    for (const user of users.rows) {
      await admin.query("DELETE FROM tenants WHERE created_by=$1", [user.id]);
      await admin.query("DELETE FROM users WHERE id=$1", [user.id]);
    }
    await admin.query("DELETE FROM auth_limits WHERE key=$1", [
      hash("email:" + email),
    ]);
    await admin.end();
  }
});

test("workspace switching discards stale reads, respects staff access and surfaces service errors", async ({
  page,
  request,
}) => {
  const admin = new pg.Pool({ connectionString: env.ADMIN_DATABASE_URL }),
    id = randomUUID(),
    email = `browser-switch-${id}@example.test`,
    password = `browser-fixture-${id}`,
    otherUser = randomUUID(),
    otherTenant = randomUUID();
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  let arrivals = 0;
  try {
    const registration = await request.post("/v1/auth/registrations", {
      data: { email, password, businessName: "Owner Shop" },
    });
    expect(registration.status()).toBe(201);
    const identity = await registration.json(),
      ownerTenant = identity.tenant.id;
    await admin.query(
      "UPDATE business_profiles SET description=$2 WHERE tenant_id=$1",
      [ownerTenant, "Owner shop profile"],
    );
    await admin.query(
      "INSERT INTO users(id,email,password_hash) VALUES ($1,$2,$3)",
      [otherUser, `${otherUser}@example.test`, "not-a-login-fixture"],
    );
    await admin.query(
      "INSERT INTO tenants(id,name,created_by) VALUES ($1,$2,$3)",
      [otherTenant, "Staff Shop", otherUser],
    );
    await admin.query(
      "INSERT INTO memberships(tenant_id,user_id,role) VALUES ($1,$2,'OWNER'),($1,$3,'STAFF')",
      [otherTenant, otherUser, identity.user.id],
    );
    await admin.query(
      "INSERT INTO business_profiles(tenant_id,description) VALUES ($1,'Staff shop profile')",
      [otherTenant],
    );
    await page.goto("/");
    await page.getByLabel("Email", { exact: true }).fill(email);
    await page.getByLabel("Password", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Today at a glance" }),
    ).toBeVisible();
    const selector = page.getByRole("combobox", { name: "Business workspace" });
    await selector.selectOption(ownerTenant);
    await expect(page.locator(".live-metric").first()).toBeVisible();
    await page.route(`**/tenants/${ownerTenant}/profile`, async (route) => {
      const response = await route.fetch();
      arrivals++;
      await gate;
      await route.fulfill({ response }).catch(() => {});
    });
    await page
      .getByRole("link", { name: "Business profile", exact: true })
      .click();
    await expect.poll(() => arrivals).toBeGreaterThan(0);
    await selector.selectOption(otherTenant);
    await expect(page.getByLabel("Business description")).toHaveValue(
      "Staff shop profile",
    );
    await expect(page.getByLabel("Business description")).toBeDisabled();
    await expect(
      page.getByRole("button", { name: "Save business profile" }),
    ).toHaveCount(0);
    release();
    await page.unroute(`**/tenants/${ownerTenant}/profile`);
    await expect(page.getByLabel("Business description")).toHaveValue(
      "Staff shop profile",
    );
    let reads = 0,
      outage = true;
    await page.route(/\/order-attempts\?/, async (route) => {
      reads++;
      if (outage)
        await route.fulfill({
          status: 502,
          contentType: "text/html",
          body: "private proxy diagnostics",
        });
      else await route.continue();
    });
    await page.getByRole("link", { name: "Orders", exact: true }).click();
    await expect(page.getByRole("alert")).toContainText(
      "The service is unavailable",
    );
    expect(reads).toBeGreaterThan(0);
    await expect(page.getByText("private proxy diagnostics")).toHaveCount(0);
    const beforeRetry = reads;
    outage = false;
    await page.getByRole("button", { name: "Try again", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "No orders yet." }),
    ).toBeVisible();
    expect(reads).toBeGreaterThan(beforeRetry);
  } finally {
    release();
    await admin.query("DELETE FROM tenants WHERE id=$1", [otherTenant]);
    await admin.query("DELETE FROM users WHERE id=$1", [otherUser]);
    const users = await admin.query("SELECT id FROM users WHERE email=$1", [
      email,
    ]);
    for (const user of users.rows) {
      await admin.query("DELETE FROM tenants WHERE created_by=$1", [user.id]);
      await admin.query("DELETE FROM users WHERE id=$1", [user.id]);
    }
    await admin.query("DELETE FROM auth_limits WHERE key=$1", [
      hash("email:" + email),
    ]);
    await admin.end();
  }
});
