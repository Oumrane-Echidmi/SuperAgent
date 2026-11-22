import assert from "node:assert/strict";
import test from "node:test";
import { recordInput } from "../src/workspace.ts";

test("workspace records validate kind-specific content and reject authority/provider fields", () => {
  const input = {
    id: crypto.randomUUID(),
    kind: "document",
    title: "Policy",
    content: { body: "Real saved text" },
  };
  assert.equal(recordInput.safeParse(input).success, true);
  for (const invalid of [
    { ...input, tenantId: crypto.randomUUID() },
    {
      ...input,
      kind: "agent",
      content: { instructions: "Help", model: "bad model" },
    },
    {
      ...input,
      kind: "agent",
      content: { instructions: "Help", model: "gpt-4.1-mini", running: true },
    },
    { ...input, content: { body: "\u0000" } },
    { ...input, content: { body: "界".repeat(18000) } },
  ])
    assert.equal(recordInput.safeParse(invalid).success, false);
});

test("workflow drafts bound graphs and reject dangling edges and duplicate nodes", () => {
  const graph = {
    nodes: [{ id: "start", label: "Start", type: "trigger" }],
    edges: [],
  };
  const input = {
    id: crypto.randomUUID(),
    kind: "workflow",
    title: "Workflow",
    content: graph,
  };
  assert.equal(recordInput.safeParse(input).success, true);
  for (const content of [
    { ...graph, edges: [{ source: "start", target: "missing" }] },
    { ...graph, nodes: [...graph.nodes, ...graph.nodes] },
    {
      ...graph,
      nodes: Array.from({ length: 51 }, (_, i) => ({
        id: `n${i}`,
        label: "Step",
        type: "action",
      })),
    },
  ])
    assert.equal(recordInput.safeParse({ ...input, content }).success, false);
});
