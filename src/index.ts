export { name, Config, apply, inject } from './plugin.ts';
export type { Config as DeepScanConfig } from './plugin.ts';
export { runPipeline, readToken, type PipelineOptions, type PipelineResult } from './deep-scan/pipeline.ts';
export { mineTopics, minedToQueries, type MinedTerm } from './deep-scan/mine.ts';
export {
  rank,
  ranked,
  render,
  CHANNEL_ORDER,
  CHANNEL_LABEL,
  type Pool,
  type RankedRepo,
  type RoundStat,
} from './deep-scan/rank.ts';
export {
  queryFor,
  searchChannel,
  searchAll,
  fetchReadmeHead,
  readTokenFromEnv,
  type Channel,
  type RawRepo,
  type SearchRequest,
} from './deep-scan/sources.ts';
