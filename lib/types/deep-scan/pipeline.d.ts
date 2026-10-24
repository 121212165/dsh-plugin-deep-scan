/** The pipeline: round 1 searches the user's terms across phrase/loose/readme;
 *  each later round mines topic: queries from the precise-hit pool and runs
 *  them; a round that adds fewer than newKeepRatio new repos ends the chain.
 *  Every round's output feeds the next round's queries — the diminishing
 *  returns of round 3+ are the stop signal, mirroring the manual three-round
 *  sweep that produced 1088 unique repos on the AI-novel niche. */
import { type Pool } from './rank.ts';
export interface PipelineOptions {
    queries: string[];
    language?: string | undefined;
    minStars?: number | undefined;
    /** rounds after the first that may mine-and-run (default 2 → up to 3 rounds total) */
    mineRounds?: number | undefined;
    perChannel?: number | undefined;
    deep?: number | undefined;
    newKeepRatio?: number | undefined;
    maxQueriesPerRound?: number | undefined;
    token?: string | undefined;
    fetchImpl?: typeof fetch | undefined;
    signal?: AbortSignal | undefined;
}
export interface PipelineResult {
    report: string;
    pool: Pool;
    stopReason: string;
}
export declare function runPipeline(options: PipelineOptions): Promise<PipelineResult>;
export declare function readToken(envNames: string[]): string | undefined;
export { CHANNEL_ORDER, CHANNEL_LABEL } from './rank.ts';
//# sourceMappingURL=pipeline.d.ts.map