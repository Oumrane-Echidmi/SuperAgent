import { z } from 'zod';

const toolName = z.string().regex(/^[a-zA-Z0-9_-]{1,120}$/);
const publicUrl = z.url().max(2048).refine(value => {
  const url = new URL(value);
  return url.protocol === 'https:' && !url.username && !url.password && !url.search && !url.hash
    && (!url.port || url.port === '443')
    && /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i.test(url.hostname)
    && !/\.(localhost|local|internal|test|invalid)$/i.test(url.hostname);
});
const serversSchema = z.array(z.strictObject({
  label: z.string().regex(/^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/),
  url: publicUrl,
  tools: z.array(toolName).min(1).max(20).refine(names => new Set(names).size === names.length),
})).max(4).refine(servers => new Set(servers.map(server => server.label)).size === servers.length);
export type McpServer = z.infer<typeof serversSchema>[number];

// Operator-managed public reference servers only. Never accept endpoints from a chat message.
export function readMcpServers(env: Record<string, string | undefined>): McpServer[] {
  const raw = env.BUILDER_MCP_SERVERS_JSON ?? '[]';
  try {
    if (Buffer.byteLength(raw) > 16000) throw new Error();
    return serversSchema.parse(JSON.parse(raw));
  } catch {
    throw new Error('Configure BUILDER_MCP_SERVERS_JSON with unique MCP labels, public HTTPS URLs and explicit read tool names.');
  }
}

export function mcpTools(servers: McpServer[]) {
  return servers.map(server => ({ type: 'mcp' as const, server_label: server.label, server_url: server.url,
    allowed_tools: { tool_names: server.tools, read_only: true }, require_approval: 'never' as const }));
}
