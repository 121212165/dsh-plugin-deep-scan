/** GitHub search API client. One call per (query, channel); each channel is a
 *  different precision/recall trade-off:
 *  - phrase  `"term"`        → exact phrase match, highest precision
 *  - loose   `term`          → name/description/topics match, sorted by stars
 *  - readme  `term in:readme`→ README full-text, finds repos whose blurb omits the term
 *  - topic   `topic:t`       → whole-niche sweep for competitive mapping
 *  The fetch impl is injectable so tests run offline. */
import { readTokenFromEnv, type FetchOptions } from '@dsh-family/kit/kit/http';
export { readTokenFromEnv };
export type { FetchOptions };
export interface RawRepo {
    full_name: string;
    description: string | null;
    stargazers_count: number;
    pushed_at: string;
    topics?: string[];
    language?: string | null;
    fork?: boolean;
    archived?: boolean;
}
export type Channel = 'phrase' | 'loose' | 'readme' | 'topic';
/** Build the query string for one (term, channel) pair. Qualifiers already
 *  embedded in the term (language:, stars:, pushed:) pass through untouched. */
export declare function queryFor(term: string, channel: Channel, qualifiers?: string): string;
export interface SearchRequest {
    term: string;
    channel: Channel;
    qualifiers?: string | undefined;
    perChannel?: number | undefined;
}
/** One GitHub search call → raw hits. A failed call returns [] (degrade, not crash). */
export declare function searchChannel(request: SearchRequest, options: FetchOptions): Promise<RawRepo[]>;
/** Run every (term × channel) pair with bounded concurrency. */
export declare function searchAll(terms: string[], channels: Channel[], options?: FetchOptions & {
    perChannel?: number | undefined;
    qualifiers?: string | undefined;
}): Promise<Map<string, RawRepo[]>>;
/** Raw README body for deep-dive repos (raw accept header skips base64). */
export declare function fetchReadmeHead(fullName: string, bytes?: number, options?: FetchOptions): Promise<string | undefined>;
//# sourceMappingURL=sources.d.ts.map