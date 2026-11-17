import assert from 'node:assert/strict';
import test from 'node:test';
import { OpenAIBuilderProvider, readBuilderWorkerConfig } from '../src/openai-builder.ts';

const input = { language: 'fr' as const, message: 'Bonjour', history: [], catalog: [] };
const response = () => ({ id: 'resp_test', model: 'test-model', status: 'completed',
  output: [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: JSON.stringify({ reply: 'Bonjour' }) }] }],
  usage: { input_tokens: 10, output_tokens: 5, total_tokens: 15 } });

test('provider sends a bounded tool-free structured request and parses REST output', async () => {
  const provider = new OpenAIBuilderProvider({ apiKey: 'test-secret', model: 'test-model' }, async (url, options) => {
    assert.equal(url, 'https://api.openai.com/v1/responses');
    assert.equal(options?.redirect, 'error');
    const body = JSON.parse(options!.body as string);
    assert.equal(body.store, false); assert.deepEqual(body.tools, []);
    assert.equal(body.max_output_tokens, 1800); assert.equal(body.text.format.strict, true);
    assert.equal(body.text.format.type, 'json_schema');
    assert.equal(body.text.format.schema.$schema, undefined);
    assert.equal(body.previous_response_id, undefined);
    return new Response(JSON.stringify(response()));
  });
  const result = await provider.infer(input);
  assert.deepEqual(result.usage, { inputTokens: 10, outputTokens: 5, totalTokens: 15 });
  assert.equal(result.responseId, 'resp_test');
});

test('provider fails closed on refusal, incomplete output, tool requests, bad JSON and oversized bodies', async () => {
  const refused = response(); refused.output[0]!.content = [{ type: 'refusal', text: 'No' }];
  for (const body of [
    { ...response(), status: 'incomplete' }, refused,
    { ...response(), output: [{ type: 'function_call', name: 'send_money' }] },
    { ...response(), output: [] }, { ...response(), usage: null },
    { ...response(), error: { message: 'Contradictory provider status' } },
  ]) {
    await assert.rejects(new OpenAIBuilderProvider({ apiKey: 'test', model: 'test' }, async () => new Response(JSON.stringify(body))).infer(input));
  }
  await assert.rejects(new OpenAIBuilderProvider({ apiKey: 'test', model: 'test' }, async () => new Response('invalid')).infer(input), { code: 'PROVIDER_INVALID_RESPONSE' });
  await assert.rejects(new OpenAIBuilderProvider({ apiKey: 'test', model: 'test' }, async () => new Response('x'.repeat(131073))).infer(input), { code: 'PROVIDER_RESPONSE_TOO_LARGE' });
});
test('provider does not retry failures and honors cancellation', async () => {
  let calls = 0;
  const provider = new OpenAIBuilderProvider({ apiKey: 'test', model: 'test' }, async () => { calls++; return new Response('private provider details', { status: 429 }); });
  await assert.rejects(provider.infer(input), { code: 'PROVIDER_RATE_LIMITED' }); assert.equal(calls, 1);
  const abort = new AbortController(); abort.abort();
  await assert.rejects(provider.infer(input, abort.signal)); assert.equal(calls, 1);
});
test('cancellation during transport is uncertain and context limits apply before a call', async () => {
  const abort = new AbortController(); let calls = 0;
  const provider = new OpenAIBuilderProvider({ apiKey: 'test', model: 'test' }, async (_url, options) => {
    calls++;
    return new Promise<Response>((_resolve, reject) => { options!.signal!.addEventListener('abort', () => reject(new Error('private diagnostic')), { once: true }); abort.abort(); });
  });
  await assert.rejects(provider.infer(input, abort.signal), { code: 'PROVIDER_OUTCOME_UNKNOWN' });
  assert.equal(calls, 1);
  await assert.rejects(provider.infer({ ...input, message: 'x'.repeat(33000) }), { code: 'CONTEXT_LIMIT' });
  assert.equal(calls, 1);
});
test('worker configuration is opt-in and requires an explicit model, key and worker connection', () => {
  assert.throws(() => readBuilderWorkerConfig({}));
  assert.throws(() => readBuilderWorkerConfig({ BUILDER_AI_ENABLED: 'true' }));
  assert.equal(readBuilderWorkerConfig({ BUILDER_AI_ENABLED: 'true', OPENAI_API_KEY: 'test', BUILDER_AI_MODEL: 'test-model', BUILDER_WORKER_DATABASE_URL: 'postgresql://worker:test@localhost/test' }).model, 'test-model');
});
