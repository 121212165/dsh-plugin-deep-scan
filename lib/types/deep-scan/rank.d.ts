/** Ranking and report rendering. Merges every round's channel results into one
 *  deduped pool ranked by channel precision first (phrase > loose > readme >
 *  topic), then by stars — so a niche-exact phrase hit with 40 stars outranks a
 *  README-coincidence hit with 40k stars. */
import type { Channel, RawRepo } from './sources.ts';
export declare const CHANNEL_ORDER: Channel[];
export declare const CHANNEL_LABEL: Record<Channel, string>;
export interface RankedRepo {
    fullName: string;
    description: string;
    stars: number;
    pushedAt: string;
    language?: string | null | undefined;
    channel: Channel;
    terms: Set<string>;
    readmeHead?: string | undefined;
}
export interface RoundStat {
    round: number;
    queries: string[];
    hits: Record<Channel, number>;
    newRepos: number;
}
export interface Pool {
    repos: Map<string, RankedRepo>;
    rounds: RoundStat[];
}
export declare function rank(results: Map<string, RawRepo[]>, terms: string[], previous?: Pool): Pool;
export declare function ranked(pool: Pool): RankedRepo[];
export interface RenderOptions {
    deep?: number;
    totalQueries: string[];
}
export declare function render(pool: Pool, options: RenderOptions): string;
//# sourceMappingURL=rank.d.ts.map