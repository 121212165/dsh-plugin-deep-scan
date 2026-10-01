/** GitHub search API client. One call per (query, channel); each channel is a
 *  different precision/recall trade-off:
 *  - phrase  `"term"`        → exact phrase match, highest precision
 *  - loose   `term`          → name/description/topics match, sorted by stars
 *  - readme  `term in:readme`→ README full-text, finds repos whose blurb omits the term
 *  - topic   `topic:t`       → whole-niche sweep for competitive mapping
 *  The fetch impl is injectable so tests run offline. */

export interface FetchOptions {
  token?: string;
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
}

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

type FetchFn = (url: string, init: { headers: Record<string, string>; signal?: AbortSignal }) => Promise<{ ok: boolean; status: number; json(): Promise<unknown>; text(): Promise<string> }>;

const defaultFetch: FetchFn = async (url, init) => {
  const response = await fetch(url, { headers: init.headers, signal: init.signal });
  return { ok: response.ok, status: response.status, json: () => response.json(), text: () => response.text() };
};

async function getJson(url: string, options: FetchOptions): Promise<unknown> {
  const headers: Record<string, string> = { 'User-Agent': 'dsh-plugin-deep-scan', Accept: 'application/vnd.github+json' };
  if (options.token) headers.Authorization = `Bearer ${options.token}`;
  const doFetch: FetchFn = options.fetchImpl ? (options.fetchImpl as unknown as FetchFn) : defaultFetch;
  const response = await doFetch(url, { headers, signal: options.signal });
  if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
  return response.json();
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
  qualifiers?: string;
  perChannel?: number;
}

/** One GitHub search call → raw hits. A failed call returns [] (degrade, not crash). */
export async function searchChannel(request: SearchRequest, options: FetchOptions): Promise<RawRepo[]> {
  const q = queryFor(request.term, request.channel, request.qualifiers);
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
export async function searchAll(terms: string[], channels: Channel[], options: FetchOptions & { perChannel?: number; qualifiers?: string } = {}): Promise<Map<string, RawRepo[]>> {
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
    const headers: Record<string, string> = { 'User-Agent': 'dsh-plugin-deep-scan', Accept: 'application/vnd.github.raw+json' };
    if (options.token) headers.Authorization = `Bearer ${options.token}`;
    const doFetch: FetchFn = options.fetchImpl ? (options.fetchImpl as unknown as FetchFn) : defaultFetch;
    const response = await doFetch(`https://api.github.com/repos/${fullName}/readme`, { headers, signal: options.signal });
    if (!response.ok) return undefined;
    const body = (await response.text()).trim();
    const flat = body.replace(/\s+/g, ' ').trim();
    return flat ? flat.slice(0, bytes) : undefined;
  } catch {
    return undefined;
  }
}

export function readTokenFromEnv(envNames: string[]): string | undefined {
  for (const name of envNames) {
    const value = process.env[name]?.trim();
    if (value) return value;
  }
  return undefined;
}
