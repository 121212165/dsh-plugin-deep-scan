/** Term mining: turn one round's hits into the next round's queries. The
 *  deterministic signal is topic tags — count them across the precise-hit pool,
 *  drop generic noise and already-searched terms, rank by frequency then by the
 *  stars of the repos carrying them. */
import type { RawRepo } from './sources.ts';
export interface MinedTerm {
    term: string;
    count: number;
    stars: number;
}
/** Extract topic:xxx query candidates from a hit pool. `exclude` removes terms
 *  already used (pass the previous rounds' terms). */
export declare function mineTopics(hits: RawRepo[], exclude?: Iterable<string>, limit?: number): MinedTerm[];
/** Render mined terms as the next round's query list. */
export declare function minedToQueries(mined: MinedTerm[]): string[];
//# sourceMappingURL=mine.d.ts.map