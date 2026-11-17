import { z } from "zod";

// Logical product aliases. A future server adapter must explicitly map these to
// provider model IDs; storing a message never authorizes later automatic replay.
export const modelId = z.enum(["opus", "sonnet", "astra", "sol"]);
export const chatModels = modelId.options.map((id) => ({
  id,
  name: id[0]!.toUpperCase() + id.slice(1),
  configured: false,
}));
const text = (max: number) =>
  z
    .string()
    .max(max)
    .refine((value) => !value.includes("\u0000"), "NUL is not supported.");
const graph = z
  .strictObject({
    nodes: z
      .array(
        z.strictObject({
          id: z.string().regex(/^[a-zA-Z0-9_-]{1,60}$/),
          label: text(120).trim().min(1),
          type: z.enum(["trigger", "action", "condition", "end"]),
        }),
      )
      .min(1)
      .max(50),
    edges: z
      .array(
        z.strictObject({
          source: z.string().max(60),
          target: z.string().max(60),
        }),
      )
      .max(100),
  })
  .superRefine((value, ctx) => {
    const ids = new Set(value.nodes.map((node) => node.id));
    const links = new Set(
      value.edges.map((edge) => `${edge.source}:${edge.target}`),
    );
    if (
      ids.size !== value.nodes.length ||
      links.size !== value.edges.length ||
      value.edges.some(
        (edge) =>
          !ids.has(edge.source) ||
          !ids.has(edge.target) ||
          edge.source === edge.target,
      )
    ) {
      ctx.addIssue({
        code: "custom",
        message: "Use unique nodes and edges between existing distinct nodes.",
      });
    }
  });
export const recordKind = z.enum([
  "document",
  "knowledge",
  "agent",
  "canvas",
  "workflow",
  "chat",
]);
const title = text(120).trim().min(1);
export const recordValue = z
  .discriminatedUnion("kind", [
    z.strictObject({
      kind: z.literal("document"),
      title,
      content: z.strictObject({ body: text(20000) }),
    }),
    z.strictObject({
      kind: z.literal("knowledge"),
      title,
      content: z.strictObject({ body: text(20000) }),
    }),
    z.strictObject({
      kind: z.literal("canvas"),
      title,
      content: z.strictObject({ body: text(20000) }),
    }),
    z.strictObject({
      kind: z.literal("agent"),
      title,
      content: z.strictObject({ instructions: text(12000), model: modelId }),
    }),
    z.strictObject({ kind: z.literal("workflow"), title, content: graph }),
    z.strictObject({
      kind: z.literal("chat"),
      title,
      content: z.strictObject({ model: modelId }),
    }),
  ])
  .refine(
    (value) =>
      Buffer.byteLength(JSON.stringify(value.content), "utf8") <= 50000,
    "Content exceeds the storage size limit.",
  );
export const recordInput = z
  .strictObject({ id: z.uuid(), kind: recordKind, title, content: z.unknown() })
  .transform((input, ctx) => {
    const parsed = recordValue.safeParse({
      kind: input.kind,
      title: input.title,
      content: input.content,
    });
    if (!parsed.success) {
      ctx.addIssue({ code: "custom", message: "Invalid record content." });
      return z.NEVER;
    }
    return { id: input.id, ...parsed.data };
  });
export const messageInput = z.strictObject({
  id: z.uuid(),
  model: modelId,
  text: text(12000).trim().min(1),
});
