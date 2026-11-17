import assert from "node:assert/strict";
import test from "node:test";
import { createApi, ApiError, moneyMinor } from "../src/lib/api.js";

test("API requests stay same-origin, reject redirects and never retry writes", async () => {
  let calls = 0;
  const api = createApi(
    "private-token",
    () => {},
    async (url, options) => {
      calls++;
      assert.equal(url, "/v1/orders");
      assert.equal(options.headers.Authorization, "Bearer private-token");
      assert.equal(options.redirect, "error");
      assert.equal(options.credentials, "omit");
      return Response.json(
        { error: { code: "FAILED", message: "Try later." } },
        { status: 500 },
      );
    },
  );
  await assert.rejects(
    api("/orders", { method: "POST", body: { id: "id" } }),
    (error) => error instanceof ApiError && error.status === 500,
  );
  assert.equal(calls, 1);
  await assert.rejects(api("https://example.test"));
  assert.equal(calls, 1);
});
test("expired sessions are reported, and non-JSON proxy responses have safe errors", async () => {
  let expired = 0;
  const api = createApi(
    "token",
    () => expired++,
    async () =>
      Response.json(
        { error: { code: "UNAUTHENTICATED", message: "Sign in to continue." } },
        { status: 401 },
      ),
  );
  await assert.rejects(api("/me"), (error) => error.code === "UNAUTHENTICATED");
  assert.equal(expired, 1);
  await assert.rejects(
    createApi(
      null,
      () => {},
      async () => new Response("<html>proxy details</html>"),
    )("/me"),
    (error) =>
      error.message === "The service is unavailable. Please try again.",
  );
});
test("shop prices convert decimal strings to bounded integer minor units without rounding", () => {
  assert.equal(moneyMinor("125.50"), 12550);
  assert.equal(moneyMinor("0"), 0);
  assert.equal(moneyMinor("0.01"), 1);
  for (const value of ["1.001", "-1", "NaN", "10000000.01"])
    assert.throws(() => moneyMinor(value));
});
