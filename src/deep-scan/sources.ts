/** GitHub search API client. One call per (query, channel); each channel is a
 *  different precision/recall trade-off:
 *  - phrase  `"term"`        → exact phrase match, highest precision
 *  - loose   `term`          → name/description/topics match, sorted by stars
 *  - readme  `term in:readme`→ README full-text, finds repos whose blurb omits the term
 *  - topic   `topic:t`       → whole-niche sweep for competitive mapping
 *  The fetch impl is injectable so tests run offline. */

import { githubJson, githubText, readTokenFromEnv, type FetchOptions } from '@dsh-family/kit/kit/http';

export { readTokenFromEnv };
export type { FetchOptions };

const USER_AGENT = 'dsh-plugin-deep-scan';

/** Every request goes through the shared client, keeping the fetch seam so
 *  tests can run the whole pipeline offline. */
const getJson = (url: string, options: FetchOptions): Promise<unknown> =>
  githubJson(url, { ...options, userAgent: USER_AGENT });

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
export function queryFor(term: string, channel: Channel, qualifiers = ''): string {
  const suffix = qualifiers ? ` ${qualifiers.trim()}` : '';
  switch (channel) {
    case 'phrase': return `"${term}"${suffix}`;
    case 'loose': return `${term}${suffix}`;
    case 'readme': return `${term}${suffix} in:readme`;
    case 'topic': return term.startsWith('topic:') ? term : `topic:${term}`;
  }
}

export interface SearchRequest {
  term: string;
  channel: Channel;
  qualifiers?: string | undefined;
  perChannel?: number | undefined;
}

/** One GitHub search call → raw hits. A failed call returns [] (degrade, not crash). */
export async function searchChannel(request: SearchRequest, options: FetchOptions): Promise<RawRepo[]> {
  const q = queryFor(request.term, request.channel, request.qualifiers ?? '');
  const sort = request.channel === 'phrase' ? '' : '&sort=stars';
  const perPage = Math.min(request.perChannel ?? 30, 100);
  try {
    const payload = (await getJson(
      `https://api.github.com/search/repositories?q=${encodeURIComponent(q)}&per_page=${perPage}${sort}`,
      options,
    )) as { items?: RawRepo[] };
    return payload.items ?? [];
  } catch {
    return [];
  }
}

/** Run every (term × channel) pair with bounded concurrency. */
export async function searchAll(terms: string[], channels: Channel[], options: FetchOptions & { perChannel?: number | undefined; qualifiers?: string | undefined } = {}): Promise<Map<string, RawRepo[]>> {
  const results = new Map<string, RawRepo[]>();
  const jobs: { key: string; request: SearchRequest }[] = [];
  for (const term of terms) {
    for (const channel of channels) {
      jobs.push({ key: `${channel}\u0000${term}`, request: { term, channel, perChannel: options.perChannel, qualifiers: options.qualifiers } });
    }
  }
  const concurrency = 4;
  let cursor = 0;
  async function worker(): Promise<void> {
    while (cursor < jobs.length) {
      const job = jobs[cursor++]!;
      results.set(job.key, await searchChannel(job.request, options));
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, jobs.length) }, worker));
  return results;
}

/** Raw README body for deep-dive repos (raw accept header skips base64). */
export async function fetchReadmeHead(fullName: string, bytes = 600, options: FetchOptions = {}): Promise<string | undefined> {
  try {
    const body = (await githubText(`https://api.github.com/repos/${fullName}/readme`, {
      ...options,
      userAgent: USER_AGENT,
      accept: 'application/vnd.github.raw+json',
    })).trim();
    const flat = body.replace(/\s+/g, ' ').trim();
    return flat ? flat.slice(0, bytes) : undefined;
  } catch {
    return undefined;
  }
}

