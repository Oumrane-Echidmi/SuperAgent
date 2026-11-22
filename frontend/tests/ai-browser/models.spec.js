import { test, expect } from "@playwright/test";

async function workspace(
  page,
  {
    enabled = true,
    role = "OWNER",
    loseFirstReply = false,
    queueReply = false,
  } = {},
) {
  const sent = [];
  const sampleOrder = {
    id: "test-order",
    status: "PENDING",
    revision: 1,
    summaryHash: "fixture",
    startedAt: "2026-11-21T10:00:00Z",
    details: {
      recipient: "Test customer",
      item: "Sample product",
      quantity: 1,
      phone: "+212600000000",
      address: "Test address",
      unitAmountMinor: "10000",
      deliveryAmountMinor: "0",
    },
    review: { amountMinor: "10000", ready: true },
  };
  const session = {
    id: "chat-one",
    createdAt: "2026-11-21T10:00:00Z",
    language: "fr",
    revision: 0,
    consentToOpenAI: true,
    consentToMcp: false,
    turns: [],
  };
  let lostReply = false,
    reads = 0;
  await page.route("**/v1/**", async (route) => {
    const request = route.request(),
      path = new URL(request.url()).pathname;
    let json = { data: [] };
    if (path.endsWith("/auth/sessions")) json = { token: "test-session" };
    else if (path.endsWith("/me"))
      json = {
        user: { email: "owner@example.test" },
        tenants: [{ id: "tenant-one", name: "Test shop", role }],
      };
    else if (path.endsWith("/profile"))
      json = {
        language: "fr",
        timezone: "Africa/Casablanca",
        description: "Test shop profile",
        updatedAt: "2026-11-21T10:00:00Z",
      };
    else if (path.endsWith("/dashboard/outcomes"))
      json = {
        totals: {
          pending: 1,
          confirmed: 0,
          declined: 0,
          confirmationRate: null,
          confirmedOrderValueMinor: "0",
          sheetSyncWaiting: 0,
        },
      };
    else if (path.endsWith("/order-attempts"))
      json = {
        data: [sampleOrder],
        pagination: { page: 1, totalPages: 1, totalItems: 1 },
      };
    else if (path.endsWith("/order-attempts/test-order")) json = sampleOrder;
    else if (path.endsWith("/builder/models"))
      json = {
        enabled,
        defaultModel: "model-fast",
        data: [
          { id: "model-fast", name: "Fast model" },
          { id: "model-deep", name: "Deep model" },
        ],
        mcpServers: [],
      };
    else if (
      path.endsWith("/builder/sessions") &&
      request.method() === "POST"
    ) {
      Object.assign(session, request.postDataJSON());
      json = session;
    } else if (path.endsWith("/builder/sessions"))
      json = { data: session.turns.length ? [session] : [] };
    else if (path.endsWith("/messages")) {
      const body = request.postDataJSON();
      sent.push(body);
      let turn = session.turns.find((turn) => turn.id === body.id);
      if (!turn) {
        session.revision++;
        turn = {
          ...body,
          revision: session.revision,
          status: queueReply ? "QUEUED" : "SUCCEEDED",
          provider: { model: body.model },
          result: { reply: `Reply using ${body.model}` },
        };
        session.turns.push(turn);
      }
      if (loseFirstReply && !lostReply) {
        lostReply = true;
        await route.abort("failed");
        return;
      }
      json = turn;
    } else if (path.includes("/builder/sessions/")) {
      reads++;
      if (queueReply && reads >= 3)
        for (const turn of session.turns) turn.status = "SUCCEEDED";
      json = session;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(json),
    });
  });
  await page.goto("/");
  await page.getByLabel("Email", { exact: true }).fill("owner@example.test");
  await page.getByLabel("Password", { exact: true }).fill("test-password-123");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.getByRole("link", { name: "Chat", exact: true }).click();
  return sent;
}

test("changing models sends the selected backend ID and keeps conversation history", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const sent = await workspace(page);
  await expect(page.getByLabel("AI model", { exact: true })).toHaveValue(
    "model-fast",
  );
  await page.getByLabel("Share this setup conversation with OpenAI").check();
  await page.getByLabel("AI model", { exact: true }).selectOption("model-deep");
  await page
    .getByLabel("Message assistant", { exact: true })
    .fill("Help me set up an assistant");
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await expect(
    page.getByText("Reply using model-deep", { exact: true }),
  ).toBeVisible();
  expect(sent[0].model).toBe("model-deep");
  await page.getByLabel("AI model", { exact: true }).selectOption("model-fast");
  await page
    .getByLabel("Message assistant", { exact: true })
    .fill("Continue with a faster model");
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await expect(
    page.getByText("Reply using model-fast", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Reply using model-deep", { exact: true }),
  ).toBeVisible();
  expect(sent.map((turn) => turn.model)).toEqual(["model-deep", "model-fast"]);
  expect(sent[1].expectedRevision).toBe(1);
  expect(errors).toEqual([]);
  await page.screenshot({
    path: "test-results/ai-model-selector-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByLabel("AI model", { exact: true })).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/ai-model-selector-mobile.png",
    fullPage: true,
  });
});

test("disabled AI and staff roles cannot send requests", async ({ page }) => {
  await workspace(page, { enabled: false, role: "STAFF" });
  await expect(
    page.getByRole("button", { name: "Send message", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByText("Only an owner can send messages.", { exact: true }),
  ).toBeVisible();
});

test("all workspace pages share the black theme and SuperAgent branding", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await workspace(page);
  await page.getByRole("link", { name: "Workspace", exact: true }).click();
  for (const label of [
    "Home",
    "Orders",
    "Business profile",
    "Inbox",
    "Agents",
    "Docs",
    "Company Brain",
    "Workflows",
    "Canvas",
  ]) {
    await page.locator(".side-nav").getByTitle(label, { exact: true }).click();
    await expect(page.getByRole("heading").first()).toBeVisible();
    expect(
      await page
        .locator(".main")
        .evaluate((element) => getComputedStyle(element).backgroundColor),
    ).toBe("rgb(0, 0, 0)");
    await expect(page.locator(".sidebar .workspace-brand-logo")).toBeVisible();
    if (["Home", "Business profile", "Company Brain"].includes(label))
      await page.screenshot({
        path: `test-results/black-${label.toLowerCase().replaceAll(" ", "-")}.png`,
        fullPage: true,
      });
  }
  await page.getByRole("link", { name: "Orders", exact: true }).click();
  await page.getByRole("link", { name: "Record order", exact: true }).click();
  await expect(page.getByRole("heading").first()).toBeVisible();
  await page.getByRole("link", { name: "Orders", exact: true }).click();
  await page.getByRole("link").filter({ hasText: "Test customer" }).click();
  await expect(
    page.getByRole("heading", { name: "Order details", exact: true }),
  ).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator(".sidebar .workspace-brand-logo")).toBeVisible();
  await page.screenshot({
    path: "test-results/black-order-mobile.png",
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
  await page.goto("/");
  await expect(page.locator(".sign-in .workspace-brand-logo")).toBeVisible();
  expect(
    await page
      .locator(".sign-in")
      .evaluate((element) => getComputedStyle(element).backgroundColor),
  ).toBe("rgb(0, 0, 0)");
  await page.screenshot({
    path: "test-results/black-sign-in-mobile.png",
    fullPage: true,
  });
});

test("black chat layout uses the transparent brand asset and working prompt cards", async ({
  page,
}) => {
  await workspace(page);
  await expect(
    page.getByRole("heading", { name: "How can I help you?" }),
  ).toBeVisible();
  await expect(
    page.getByRole("navigation", { name: "Workspace" }),
  ).toBeVisible();
  expect(
    await page
      .locator(".ai-welcome-logo")
      .evaluate((image) => image.complete && image.naturalWidth > 0),
  ).toBe(true);
  expect(
    await page
      .locator(".ai-chat-shell")
      .evaluate((element) => getComputedStyle(element).backgroundColor),
  ).toBe("rgb(0, 0, 0)");
  await page.screenshot({
    path: "test-results/ai-chat-welcome-desktop.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Confirm my orders" }).click();
  await expect(
    page.getByLabel("Message assistant", { exact: true }),
  ).toHaveValue(/cash-on-delivery/);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByLabel("AI model", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Open chat navigation" }).click();
  await expect(
    page.getByRole("button", { name: "New chat", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "New chat", exact: true }).click();
  await expect(
    page.getByLabel("Message assistant", { exact: true }),
  ).toHaveValue("");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/ai-chat-welcome-mobile.png",
    fullPage: true,
  });
});

test("an uncertain response retries the same message and model without duplicating the turn", async ({
  page,
}) => {
  const sent = await workspace(page, { loseFirstReply: true });
  await page.getByLabel("Share this setup conversation with OpenAI").check();
  await page.getByLabel("AI model", { exact: true }).selectOption("model-deep");
  await page
    .getByLabel("Message assistant", { exact: true })
    .fill("Keep this message identity");
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Retry same message" }),
  ).toBeVisible();
  await expect(page.getByLabel("AI model", { exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Retry same message" }).click();
  await expect(
    page.getByText("Reply using model-deep", { exact: true }),
  ).toHaveCount(1);
  expect(sent).toHaveLength(2);
  expect(sent[1]).toEqual(sent[0]);
});

test("queued replies poll for completion and hold the selected model while waiting", async ({
  page,
}) => {
  await workspace(page, { queueReply: true });
  await page.getByLabel("Share this setup conversation with OpenAI").check();
  await page
    .getByLabel("Message assistant", { exact: true })
    .fill("Wait for the worker");
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await expect(
    page.getByText("Waiting for the assistant…", { exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("AI model", { exact: true })).toBeDisabled();
  await expect(
    page.getByText("Reply using model-fast", { exact: true }),
  ).toBeVisible({ timeout: 10000 });
  await expect(page.getByLabel("AI model", { exact: true })).toBeEnabled();
});
