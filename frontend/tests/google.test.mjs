import test from "node:test";
import assert from "node:assert/strict";
import { spreadsheetIdFrom } from "../src/lib/google.js";

test("extracts a spreadsheet ID from a link or bare ID", () => {
  assert.equal(
    spreadsheetIdFrom(
      "https://docs.google.com/spreadsheets/d/abc_123-X/edit#gid=0",
    ),
    "abc_123-X",
  );
  assert.equal(spreadsheetIdFrom(" abc123 "), "abc123");
  assert.equal(spreadsheetIdFrom("https://example.com/x y"), null);
});
