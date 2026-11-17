import { z } from 'zod';
import { AiFailure, BUILDER_INSTRUCTIONS, extractionSchema } from './builder-ai.ts';
import type { BuilderAiInput, BuilderAiProvider, BuilderAiResponse } from './builder-ai.ts';

const usageSchema = z.object({ input_tokens: z.number().int().min(0).max(100000), output_tokens: z.number().int().min(0).max(100000), total_tokens: z.number().int().min(0).max(200000) });
const responseSchema = z.object({ id: z.string().min(1).max(200), model: z.string().min(1).max(200), status: z.literal('completed'),
  error: z.null().optional(), incomplete_details: z.null().optional(),
  usage: usageSchema, output: z.array(z.discriminatedUnion('type', [
    z.object({ type: z.literal('reasoning') }),
    z.object({ type: z.literal('message'), role: z.literal('assistant'), content: z.array(z.discriminatedUnion('type', [
      z.object({ type: z.literal('output_text'), text: z.string().max(16000) }),
      z.object({ type: z.literal('refusal'), refusal: z.string().optional(), text: z.string().optional() }),
    ])).max(8) }),
  ])).max(16) });

export function readBuilderWorkerConfig(env: Record<string, string | undefined>) {
  const parsed = z.object({ BUILDER_AI_ENABLED: z.literal('true'), OPENAI_API_KEY: z.string().trim().min(1),
    BUILDER_AI_MODEL: z.string().regex(/^[a-zA-Z0-9._:-]{1,120}$/), BUILDER_WORKER_DATABASE_URL: z.url() }).safeParse(env);
  if (!parsed.success || !['postgres:', 'postgresql:'].includes(new URL(parsed.data.BUILDER_WORKER_DATABASE_URL).protocol)) {
    throw new Error('Enable Builder AI and configure its model, API key and worker database URL.');
  }
  return { apiKey: parsed.data.OPENAI_API_KEY, model: parsed.data.BUILDER_AI_MODEL, connectionString: parsed.data.BUILDER_WORKER_DATABASE_URL };
}
async function boundedJson(response: Response) {
  if (!response.body) throw new AiFailure('PROVIDER_INVALID_RESPONSE');
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = []; let bytes = 0;
  try {
    while (true) {
      const chunk = await reader.read(); if (chunk.done) break;
      bytes += chunk.value.length;
      if (bytes > 131072) { await reader.cancel(); throw new AiFailure('PROVIDER_RESPONSE_TOO_LARGE'); }
      chunks.push(chunk.value);
    }
    const buffer = new Uint8Array(bytes); let offset = 0;
    for (const chunk of chunks) { buffer.set(chunk, offset); offset += chunk.length; }
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(buffer)) as unknown;
  } finally { reader.releaseLock(); }
}
export class OpenAIBuilderProvider implements BuilderAiProvider {
  private readonly config: { apiKey: string; model: string };
  private readonly request: typeof fetch;
  constructor(config: { apiKey: string; model: string }, request: typeof fetch = fetch) {
    this.config = config; this.request = request;
  }
  async infer(input: BuilderAiInput, signal?: AbortSignal): Promise<BuilderAiResponse> {
    const context = JSON.stringify(input);
    if (Buffer.byteLength(context) > 32000) throw new AiFailure('CONTEXT_LIMIT');
    const abort = AbortSignal.any([AbortSignal.timeout(20000), ...(signal ? [signal] : [])]);
    let received = false;
    const schema = z.toJSONSchema(extractionSchema, { target: 'draft-7' });
    delete schema.$schema;
    try {
      abort.throwIfAborted();
      const response = await this.request('https://api.openai.com/v1/responses', {
        method: 'POST', redirect: 'error', signal: abort,
        headers: { Authorization: `Bearer ${this.config.apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: this.config.model, store: false, instructions: BUILDER_INSTRUCTIONS,
          input: [{ role: 'user', content: [{ type: 'input_text', text: context }] }], tools: [], tool_choice: 'none',
          max_output_tokens: 1800, text: { format: { type: 'json_schema', name: 'builder_extraction', strict: true,
            schema } } }),
      });
      received = true;
      if (!response.ok) {
        await response.body?.cancel();
        const code = response.status === 401 || response.status === 403 ? 'PROVIDER_AUTHORIZATION_FAILED'
          : response.status === 429 ? 'PROVIDER_RATE_LIMITED' : response.status < 500 ? 'PROVIDER_REQUEST_REJECTED' : 'PROVIDER_UNAVAILABLE';
        throw new AiFailure(code);
      }
      const envelope = responseSchema.safeParse(await boundedJson(response));
      if (!envelope.success) throw new AiFailure('PROVIDER_INVALID_RESPONSE');
      const { output, usage, id, model } = envelope.data;
      if (usage.total_tokens !== usage.input_tokens + usage.output_tokens) throw new AiFailure('PROVIDER_INVALID_RESPONSE');
      const content = output.flatMap(item => item.type === 'message' ? item.content : []);
      if (content.some(item => item.type === 'refusal')) throw new AiFailure('PROVIDER_REFUSED');
      const texts = content.filter(item => item.type === 'output_text');
      if (texts.length !== 1) throw new AiFailure('PROVIDER_INVALID_RESPONSE');
      return { extraction: JSON.parse(texts[0]!.text) as unknown, responseId: id, model,
        usage: { inputTokens: usage.input_tokens, outputTokens: usage.output_tokens, totalTokens: usage.total_tokens } };
    } catch (error) {
      if (error instanceof AiFailure) throw error;
      throw new AiFailure(abort.aborted || !received ? 'PROVIDER_OUTCOME_UNKNOWN' : 'PROVIDER_INVALID_RESPONSE');
    }
  }
}
