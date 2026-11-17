import assert from "node:assert/strict";
import test from "node:test";
import { recordInput, messageInput, chatModels } from "../src/workspace.ts";

test("workspace contracts bound graphs and reject unknown model/provider fields", () => {
  const graph = {
    nodes: [{ id: "start", label: "Start", type: "trigger" }],
    edges: [],
  };
  assert.equal(
    recordInput.safeParse({
      id: crypto.randomUUID(),
      kind: "workflow",
      title: "Draft",
      content: graph,
    }).success,
    true,
  );
  for (const content of [
    { ...graph, edges: [{ source: "start", target: "missing" }] },
    { ...graph, nodes: [...graph.nodes, ...graph.nodes] },
    {
      ...graph,
      nodes: Array.from({ length: 51 }, (_, i) => ({
        id: `n${i}`,
        label: "Node",
        type: "action",
      })),
    },
  ])
    assert.equal(
      recordInput.safeParse({
        id: crypto.randomUUID(),
        kind: "workflow",
        title: "Draft",
        content,
      }).success,
      false,
    );
  assert.equal(
    messageInput.safeParse({
      id: crypto.randomUUID(),
      model: "opus",
      text: "Hello",
    }).success,
    true,
  );
  assert.equal(
    messageInput.safeParse({
      id: crypto.randomUUID(),
      model: "invented",
      text: "Hello",
    }).success,
    false,
  );
  assert.equal(
    messageInput.safeParse({
      id: crypto.randomUUID(),
      model: "opus",
      text: "Hello",
      apiKey: "secret",
    }).success,
    false,
  );
  assert.equal(
    recordInput.safeParse({
      id: crypto.randomUUID(),
      kind: "agent",
      title: "Agent",
      content: { instructions: "Help", model: "sol", running: true },
    }).success,
    false,
  );
  assert.deepEqual(
    chatModels.map((model) => model.id),
    ["opus", "sonnet", "astra", "sol"],
  );
  assert.ok(chatModels.every((model) => !model.configured));
  for (const body of ["\u0000", "\u754c".repeat(18000)]) {
    assert.equal(
      recordInput.safeParse({
        id: crypto.randomUUID(),
        kind: "document",
        title: "Bounded",
        content: { body },
      }).success,
      false,
    );
  }
});
