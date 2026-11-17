import { normalizeMatchText, scenarioDefinitionSchema } from './scenario-contracts.ts';

interface CatalogEntry { scenarioId: string; revision: number; definition: unknown }
export function matchCatalog(goal: string, language: 'darija' | 'fr', catalog: CatalogEntry[]) {
  const normalized = ` ${normalizeMatchText(goal)} `;
  const candidates = catalog.flatMap(entry => {
    const parsed = scenarioDefinitionSchema.safeParse(entry.definition);
    if (!parsed.success || !parsed.data.matching?.languages.includes(language)) return [];
    const matchedPhrases = parsed.data.matching.phrases.filter(phrase => normalized.includes(` ${normalizeMatchText(phrase)} `));
    if (!matchedPhrases.length) return [];
    return [{ scenarioId: entry.scenarioId, revision: entry.revision, name: parsed.data.name, description: parsed.data.description, matchedPhrases }];
  }).sort((a, b) => b.matchedPhrases.length - a.matchedPhrases.length || (a.scenarioId < b.scenarioId ? -1 : a.scenarioId > b.scenarioId ? 1 : 0));
  return { state: candidates.length ? 'CANDIDATES' as const : 'UNSUPPORTED' as const, requiresReview: true as const,
    candidates: candidates.slice(0, 10), totalCandidates: candidates.length,
    gaps: candidates.length ? [] : [{ code: 'NO_RELEASED_MATCH', message: 'No declared phrase matched a released scenario. This request needs admin review.' }] };
}
