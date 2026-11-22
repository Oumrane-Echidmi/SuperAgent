import assert from 'node:assert/strict';
import test from 'node:test';
import { readMcpServers } from '../src/mcp.ts';
import { OpenAIBuilderProvider } from '../src/openai-builder.ts';

const servers = [{ label: 'docs', url: 'https://developers.openai.com/mcp', tools: ['search_openai_docs'] }];
const input = { language: 'fr' as const, message: 'Bonjour', history: [], catalog: [] };
const answer = { id: 'resp_test', model: 'test-model', status: 'completed',
  usage: { input_tokens: 10, output_tokens: 5, total_tokens: 15 },
  output: [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: '{"reply":"Bonjour"}' }] }] };

test('MCP configuration defaults off and validates public HTTPS servers and explicit tool names', () => {
  assert.deepEqual(readMcpServers({}), []);
  assert.deepEqual(readMcpServers({ BUILDER_MCP_SERVERS_JSON: JSON.stringify(servers) }), servers);
  for (const value of ['invalid', '{}', JSON.stringify([...servers, ...servers]),
    ...['http://example.com/mcp', 'https://user:secret@example.com', 'https://127.0.0.1/mcp',
      'https://[::1]/mcp', 'https://localhost/mcp', 'https://example.com/mcp?token=secret'].map(url => JSON.stringify([{ ...servers[0], url }])),
    JSON.stringify([{ ...servers[0], tools: [] }]), JSON.stringify([{ ...servers[0], tools: ['*'] }]),
    JSON.stringify([{ ...servers[0], authorization: 'secret' }]),
  ]) {
    assert.throws(() => readMcpServers({ BUILDER_MCP_SERVERS_JSON: value }), /MCP/);
  }
});

test('configured MCP servers are not sent without separate session consent', async () => {
  const provider = new OpenAIBuilderProvider({ apiKey: 'secret', model: 'test', mcpServers: servers }, async (_url, init) => {
    const body = JSON.parse(String(init!.body));
    assert.deepEqual(body.tools, []);
    assert.equal(body.tool_choice, 'none');
    assert.equal(body.max_tool_calls, undefined);
    return Response.json(answer);
  });
  await provider.infer(input);
});

test('MCP consent enables only configured read tools and parses completed tool output', async () => {
  const provider = new OpenAIBuilderProvider({ apiKey: 'test-api-secret-123', model: 'test', mcpServers: servers }, async (_url, init) => {
    const body = JSON.parse(String(init!.body));
    assert.deepEqual(body.tools, [{ type: 'mcp', server_label: 'docs', server_url: servers[0]!.url,
      allowed_tools: { tool_names: ['search_openai_docs'], read_only: true }, require_approval: 'never' }]);
    assert.equal(body.tool_choice, 'auto');
    assert.equal(body.max_tool_calls, 4);
    assert.equal(new Headers(init!.headers).get('Authorization'), 'Bearer test-api-secret-123');
    assert.equal(JSON.stringify(body).includes('test-api-secret-123'), false);
    return Response.json({ ...answer, output: [
      { type: 'mcp_list_tools', server_label: 'docs', tools: [{ name: 'search_openai_docs', input_schema: {} }] },
      { type: 'mcp_call', server_label: 'docs', name: 'search_openai_docs', arguments: '{}', output: 'Reference text', error: null },
      ...answer.output,
    ] });
  });
  assert.deepEqual((await provider.infer({ ...input, consentToMcp: true })).extraction, { reply: 'Bonjour' });
});

test('unexpected, failed or unapproved MCP output fails closed without exposing diagnostics', async () => {
  for (const item of [
    { type: 'mcp_call', server_label: 'docs', name: 'delete_everything', arguments: '{}', output: 'done' },
    { type: 'mcp_call', server_label: 'other', name: 'search_openai_docs', arguments: '{}', output: 'done' },
    { type: 'mcp_call', server_label: 'docs', name: 'search_openai_docs', arguments: '{}', error: { message: 'secret' } },
    { type: 'mcp_approval_request', server_label: 'docs', name: 'search_openai_docs', arguments: '{}' },
  ]) {
    const provider = new OpenAIBuilderProvider({ apiKey: 'secret', model: 'test', mcpServers: servers }, async () => Response.json({ ...answer, output: [item, ...answer.output] }));
    await assert.rejects(provider.infer({ ...input, consentToMcp: true }), { code: 'PROVIDER_INVALID_RESPONSE' });
  }
  const provider = new OpenAIBuilderProvider({ apiKey: 'secret', model: 'test', mcpServers: servers }, async () => Response.json({ ...answer,
    output: [{ type: 'mcp_list_tools', server_label: 'docs', tools: [] }, ...answer.output] }));
  await assert.rejects(provider.infer(input), { code: 'PROVIDER_INVALID_RESPONSE' });
});
