/** The pipeline: round 1 searches the user's terms across phrase/loose/readme;
 *  each later round mines topic: queries from the precise-hit pool and runs
 *  them; a round that adds fewer than newKeepRatio new repos ends the chain.
 *  Every round's output feeds the next round's queries — the diminishing
 *  returns of round 3+ are the stop signal, mirroring the manual three-round
 *  sweep that produced 1088 unique repos on the AI-novel niche. */

import { CHANNEL_ORDER, rank, ranked, render, type Pool, type RenderOptions } from './rank.ts';
import { mineTopics, minedToQueries } from './mine.ts';
import { searchAll, fetchReadmeHead, readTokenFromEnv, type Channel, type FetchOptions } from './sources.ts';

export interface PipelineOptions {
  queries: string[];
  language?: string;
  minStars?: number;
  /** rounds after the first that may mine-and-run (default 2 → up to 3 rounds total) */
  mineRounds?: number;
  perChannel?: number;
  deep?: number;
  newKeepRatio?: number;
  maxQueriesPerRound?: number;
  token?: string;
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
}

export interface PipelineResult {
  report: string;
  pool: Pool;
  stopReason: string;
}

const SEARCH_CHANNELS: Channel[] = ['phrase', 'loose', 'readme', 'topic'];

function qualifiersOf(options: PipelineOptions): string {
  const parts: string[] = [];
  if (options.language) parts.push(`language:${options.language}`);
  if (options.minStars !== undefined && options.minStars > 0) parts.push(`stars:>=${options.minStars}`);
  return parts.join(' ');
}

export async function runPipeline(options: PipelineOptions): Promise<PipelineResult> {
  const fetchOptions: FetchOptions = { token: options.token, fetchImpl: options.fetchImpl, signal: options.signal };
  const qualifiers = qualifiersOf(options);
  const mineRounds = options.mineRounds ?? 2;
  const newKeepRatio = options.newKeepRatio ?? 0.25;
  const maxQueries = options.maxQueriesPerRound ?? 6;

  let pool: Pool | undefined;
  let queries = options.queries.map((query) => query.trim()).filter(Boolean).slice(0, maxQueries);
  const allQueries = [...queries];
  let stopReason = '轮次用尽';

  for (let round = 0; round <= mineRounds; round++) {
    const isMinedRound = round > 0;
    const results = await searchAll(queries, SEARCH_CHANNELS, { ...fetchOptions, perChannel: options.perChannel, qualifiers });    pool = rank(results, queries, pool);

    // 止损：本轮（挖词轮）新发现太少 → 不再挖下一轮
    if (isMinedRound && pool.rounds[pool.rounds.length - 1]!.newRepos < newKeepRatio * (pool.repos.size || 1)) {
      stopReason = `第${round + 1}轮新发现占比过低（止损）`;
      break;
    }

    if (round === mineRounds) break;

    const precise = [...pool.repos.values()]
      .filter((repo) => repo.channel === 'phrase' || repo.channel === 'topic')
      .map((repo) => ({
        full_name: repo.fullName,
        description: repo.description,
        stargazers_count: repo.stars,
        pushed_at: repo.pushedAt,
        topics: [] as string[],
      }));
    // topic 挖掘需要 topics 字段，从原始结果里补齐
    for (const [key, repos] of results) {
      const [channel] = key.split('\u0000');
      if (channel === 'phrase' || channel === 'topic') {
        for (const repo of repos) {
          const target = precise.find((entry) => entry.full_name === repo.full_name);
          if (target && repo.topics?.length) target.topics = repo.topics;
        }
      }
    }

    const mined = mineTopics(precise, allQueries);
    const nextQueries = minedToQueries(mined).slice(0, maxQueries);
    if (!nextQueries.length) {
      stopReason = '没有挖出新搜索词';
      break;
    }
    queries = nextQueries;
    allQueries.push(...queries);
  }

  // 深挖：给前 deep 个仓库补 README 摘要
  const deep = options.deep ?? 5;
  const top = ranked(pool!).slice(0, deep);
  for (const repo of top) {
    repo.readmeHead = await fetchReadmeHead(repo.fullName, 600, fetchOptions);
  }

  const renderOptions: RenderOptions = { deep, totalQueries: allQueries };
  return { report: render(pool!, renderOptions), pool: pool!, stopReason };
}

export function readToken(envNames: string[]): string | undefined {
  return readTokenFromEnv(envNames);
}

export { CHANNEL_ORDER, CHANNEL_LABEL } from './rank.ts';
