/** Term mining: turn one round's hits into the next round's queries. The
 *  deterministic signal is topic tags — count them across the precise-hit pool,
 *  drop generic noise and already-searched terms, rank by frequency then by the
 *  stars of the repos carrying them. */

import type { RawRepo } from './sources.ts';

/** Generic tags that appear on half of GitHub and say nothing about a niche. */
const NOISE_TOPICS = new Set([
  'ai', 'llm', 'llms', 'gpt', 'chatgpt', 'openai', 'anthropic', 'claude', 'gemini',
  'python', 'typescript', 'javascript', 'nodejs', 'rust', 'go', 'java',
  'machine-learning', 'deep-learning', 'nlp', 'agent', 'agents', 'ai-agents',
  'open-source', 'awesome', 'awesome-list', 'tutorial', 'cli', 'api', 'sdk',
  'windows', 'linux', 'macos', 'android', 'ios', 'web', 'react', 'vue',
  'self-hosted', 'docker', 'productivity', 'automation',
]);

export interface MinedTerm {
  term: string;
  count: number;
  stars: number;
}

/** Extract topic:xxx query candidates from a hit pool. `exclude` removes terms
 *  already used (pass the previous rounds' terms). */
export function mineTopics(hits: RawRepo[], exclude: Iterable<string> = [], limit = 4): MinedTerm[] {
  const excluded = new Set([...exclude].map((term) => term.replace(/^topic:/, '').toLowerCase()));
  const stats = new Map<string, { count: number; stars: number }>();
  for (const repo of hits) {
    for (const raw of repo.topics ?? []) {
      const topic = raw.trim().toLowerCase();
      if (!topic || NOISE_TOPICS.has(topic) || excluded.has(topic)) continue;
      const entry = stats.get(topic) ?? { count: 0, stars: 0 };
      entry.count += 1;
      entry.stars += repo.stargazers_count;
      stats.set(topic, entry);
    }
  }
  return [...stats.entries()]
    .map(([term, value]) => ({ term, count: value.count, stars: value.stars }))
    .filter((mined) => mined.count >= 2)
    .sort((a, b) => b.count - a.count || b.stars - a.stars)
    .slice(0, limit);
}

/** Render mined terms as the next round's query list. */
export function minedToQueries(mined: MinedTerm[]): string[] {
  return mined.map((entry) => `topic:${entry.term}`);
}
