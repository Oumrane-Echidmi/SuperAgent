import assert from 'node:assert/strict';
import test from 'node:test';
import { readBuilderModels } from '../src/builder-models.ts';
import { OpenAIBuilderProvider, readBuilderWorkerConfig } from '../src/openai-builder.ts';

test('model choices are explicitly configured and include the default', () => {
  assert.deepEqual(readBuilderModels({}), { defaultModel: null, models: [] });
  assert.deepEqual(readBuilderModels({ BUILDER_AI_MODEL: 'model-fast' }), { defaultModel: 'model-fast', models: ['model-fast'] });
  assert.deepEqual(readBuilderModels({ BUILDER_AI_MODEL: 'model-fast', BUILDER_AI_MODELS: 'model-fast, model-deep' }),
    { defaultModel: 'model-fast', models: ['model-fast', 'model-deep'] });
  for (const env of [
    { BUILDER_AI_MODEL: 'bad model' },
    { BUILDER_AI_MODELS: 'model-fast' },
    { BUILDER_AI_MODEL: 'model-fast', BUILDER_AI_MODELS: 'model-deep' },
    { BUILDER_AI_MODEL: 'model-fast', BUILDER_AI_MODELS: 'model-fast,model-fast' },
  ]) assert.throws(() => readBuilderModels(env), /model/i);
});

test('worker configuration uses the same model allowlist as the API', () => {
  const config = readBuilderWorkerConfig({ BUILDER_AI_ENABLED: 'true', OPENAI_API_KEY: 'test-key',
    BUILDER_AI_MODEL: 'model-fast', BUILDER_AI_MODELS: 'model-fast,model-deep',
    BUILDER_WORKER_DATABASE_URL: 'postgresql://worker:password@localhost/test' });
  assert.deepEqual(config.models, ['model-fast', 'model-deep']);
});

test('selected model reaches OpenAI and unsupported models never make a provider request', async () => {
  const seen: string[] = [];
  const provider = new OpenAIBuilderProvider({ apiKey: 'test-key', model: 'model-fast', models: ['model-fast', 'model-deep'] }, async (_url, init) => {
    const model = JSON.parse(String(init!.body)).model;
    seen.push(model);
    return Response.json({ id: 'resp_test', model, status: 'completed', usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 },
      output: [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: '{"reply":"Bonjour"}' }] }] });
  });
  const input = { language: 'fr' as const, message: 'Bonjour', history: [], catalog: [] };
  assert.equal((await provider.infer({ ...input, model: 'model-deep' })).model, 'model-deep');
  assert.equal((await provider.infer(input)).model, 'model-fast');
  await assert.rejects(provider.infer({ ...input, model: 'unapproved-model' }), { code: 'MODEL_NOT_ALLOWED' });
  assert.deepEqual(seen, ['model-deep', 'model-fast']);
});
