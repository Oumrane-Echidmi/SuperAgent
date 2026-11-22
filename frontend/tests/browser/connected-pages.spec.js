import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { randomUUID, createHash } from "node:crypto";
import pg from "pg";

const env = parseEnv(
  readFileSync(new URL("../../../backend/.env.test", import.meta.url), "utf8"),
);
if (
  !env.ADMIN_DATABASE_URL ||
  new URL(env.ADMIN_DATABASE_URL).pathname !== "/superagent_test"
)
  throw new Error("Dedicated test database required.");

test("Docs, Brain, Agents, Workflows and Inbox save real business records across a fresh login", async ({
  page,
}) => {
  const admin = new pg.Pool({ connectionString: env.ADMIN_DATABASE_URL });
  const suffix = randomUUID();
  const email = `pages-${suffix}@example.test`,
    password = `pages-fixture-${suffix}`;
  const ipKey = createHash("sha256").update("ip:127.0.0.1").digest("hex");
  const previous = (
    await admin.query("SELECT * FROM auth_limits WHERE key=$1", [ipKey])
  ).rows[0];
  await admin.query("DELETE FROM auth_limits WHERE key=$1", [ipKey]);
  let tenantId, userId;
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const visit = async (title) => {
    await page.locator(".side-nav").getByTitle(title, { exact: true }).click();
    await expect(page.locator(".live-preview")).toHaveCount(0);
  };
  const card = (title) => page.getByRole("button").filter({ hasText: title });
  try {
    await page.goto("/");
    await page
      .getByRole("button", { name: "New here? Create a workspace" })
      .click();
    await page
      .getByLabel("Business name", { exact: true })
      .fill("Connected shop");
    await page.getByLabel("Email", { exact: true }).fill(email);
    await page.getByLabel("Password", { exact: true }).fill(password);
    const identityResponse = page.waitForResponse(
      (response) => new URL(response.url()).pathname === "/v1/me",
    );
    await page
      .getByRole("button", { name: "Create workspace", exact: true })
      .click();
    const identity = await (await identityResponse).json();
    tenantId = identity.tenants[0].id;
    userId = identity.user.id;
    await visit("Docs");
    await page
      .getByRole("button", { name: "New document", exact: true })
      .click();
    await page.getByLabel("Title", { exact: true }).fill("Returns policy");
    await page
      .getByLabel("Content", { exact: true })
      .fill("Returns accepted within 14 days.");
    await page.getByRole("button", { name: "Save draft", exact: true }).click();
    await expect(card("Returns policy")).toBeVisible();
    await visit("Company Brain");
    await page
      .getByRole("button", { name: "New knowledge note", exact: true })
      .click();
    await page.getByLabel("Title", { exact: true }).fill("Delivery facts");
    await page
      .getByLabel("Business knowledge", { exact: true })
      .fill("التوصيل خلال يومين");
    await page.getByRole("button", { name: "Save draft", exact: true }).click();
    await expect(card("Delivery facts")).toBeVisible();
    await visit("Agents");
    await page.getByRole("button", { name: "New agent", exact: true }).click();
    await page.getByLabel("Title", { exact: true }).fill("Product assistant");
    await expect(page.getByLabel("Model", { exact: true })).toHaveValue(
      "gpt-4.1-mini",
    );
    await page.getByLabel("Model", { exact: true }).selectOption("gpt-4.1");
    await page
      .getByLabel("Instructions", { exact: true })
      .fill("Answer questions using the approved product information.");
    await page.getByRole("button", { name: "Save draft", exact: true }).click();
    await expect(card("Product assistant")).toBeVisible();
    await visit("Workflows");
    await page
      .getByRole("button", { name: "New workflow", exact: true })
      .click();
    await page.getByLabel("Title", { exact: true }).fill("Staff notification");
    await page.getByRole("button", { name: "Add node", exact: true }).click();
    await page.getByLabel("Node label", { exact: true }).fill("Notify staff");
    await page
      .getByLabel("From", { exact: true })
      .selectOption({ label: "Start" });
    await page
      .getByLabel("To", { exact: true })
      .selectOption({ label: "Notify staff" });
    await page.getByRole("button", { name: "Connect", exact: true }).click();
    await page.getByRole("button", { name: "Save draft", exact: true }).click();
    await expect(card("Staff notification")).toContainText(
      "2 nodes · 1 connections",
    );
    await visit("Inbox");
    await page
      .getByLabel("Customer reference", { exact: true })
      .fill("Saved customer");
    await page
      .getByRole("button", { name: "Add conversation", exact: true })
      .click();
    await expect(
      page.getByText("Saved customer", { exact: true }),
    ).toBeVisible();
    await page
      .getByRole("link", { name: "Open conversation", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Order history", exact: true }),
    ).toBeVisible();

    await page.reload();
    await page.getByLabel("Email", { exact: true }).fill(email);
    await page.getByLabel("Password", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await visit("Docs");
    await card("Returns policy").click();
    await expect(page.getByLabel("Content", { exact: true })).toHaveValue(
      "Returns accepted within 14 days.",
    );
    await page.screenshot({
      path: "test-results/connected-docs.png",
      fullPage: true,
    });
    await page
      .getByLabel("Content", { exact: true })
      .fill("Updated policy from the frontend.");
    await page.getByRole("button", { name: "Save draft", exact: true }).click();
    await card("Returns policy").click();
    await expect(page.getByLabel("Content", { exact: true })).toHaveValue(
      "Updated policy from the frontend.",
    );
    await page.getByRole("button", { name: "Archive", exact: true }).click();
    await expect(card("Returns policy")).toHaveCount(0);
    await visit("Company Brain");
    await card("Delivery facts").click();
    await expect(
      page.getByLabel("Business knowledge", { exact: true }),
    ).toHaveValue("التوصيل خلال يومين");
    await visit("Agents");
    await card("Product assistant").click();
    await expect(page.getByLabel("Model", { exact: true })).toHaveValue(
      "gpt-4.1",
    );
    await visit("Workflows");
    await card("Staff notification").click();
    await expect(
      page.getByRole("button").filter({ hasText: "Notify staff" }).first(),
    ).toBeVisible();
    await page.screenshot({
      path: "test-results/connected-workflow.png",
      fullPage: true,
    });
    await page.setViewportSize({ width: 390, height: 844 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: "test-results/connected-workflow-mobile.png",
      fullPage: true,
    });
    await visit("Inbox");
    await expect(
      page.getByText("Saved customer", { exact: true }),
    ).toBeVisible();
    expect(errors).toEqual([]);
  } finally {
    if (tenantId)
      await admin.query("DELETE FROM tenants WHERE id=$1", [tenantId]);
    if (userId) await admin.query("DELETE FROM users WHERE id=$1", [userId]);
    await admin.query("DELETE FROM auth_limits WHERE key=$1", [ipKey]);
    if (previous)
      await admin.query(
        "INSERT INTO auth_limits(key,attempts,window_start) VALUES($1,$2,$3)",
        [previous.key, previous.attempts, previous.window_start],
      );
    await admin.end();
  }
});
