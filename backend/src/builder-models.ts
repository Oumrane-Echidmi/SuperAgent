import { z } from 'zod';

export const builderModelId = z.string().regex(/^[a-zA-Z0-9._:-]{1,120}$/);
export interface BuilderModels { defaultModel: string | null; models: string[] }

export function readBuilderModels(env: Record<string, string | undefined>): BuilderModels {
  const defaultModel = env.BUILDER_AI_MODEL?.trim() || null;
  const raw = env.BUILDER_AI_MODELS?.trim();
  if (!defaultModel && !raw) return { defaultModel: null, models: [] };
  const models = raw ? raw.split(',').map(value => value.trim()) : [defaultModel];
  const parsed = z.array(builderModelId).min(1).max(8).safeParse(models);
  if (!defaultModel || !builderModelId.safeParse(defaultModel).success || !parsed.success
    || !parsed.data.includes(defaultModel) || new Set(parsed.data).size !== parsed.data.length) {
    throw new Error('Configure BUILDER_AI_MODEL and up to eight unique BUILDER_AI_MODELS including the default model.');
  }
  return { defaultModel, models: parsed.data };
}
