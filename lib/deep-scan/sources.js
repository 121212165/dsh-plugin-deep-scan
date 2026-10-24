/** GitHub search API client. One call per (query, channel); each channel is a
 *  different precision/recall trade-off:
 *  - phrase  `"term"`        → exact phrase match, highest precision
 *  - loose   `term`          → name/description/topics match, sorted by stars
 *  - readme  `term in:readme`→ README full-text, finds repos whose blurb omits the term
 *  - topic   `topic:t`       → whole-niche sweep for competitive mapping
 *  The fetch impl is injectable so tests run offline. */
const defaultFetch = async (url, init) => {
    const requestInit = { headers: init.headers };
    if (init.signal !== undefined)
        requestInit.signal = init.signal;
    const response = await fetch(url, requestInit);
    return { ok: response.ok, status: response.status, json: () => response.json(), text: () => response.text() };
};
async function getJson(url, options) {
    const headers = { 'User-Agent': 'dsh-plugin-deep-scan', Accept: 'application/vnd.github+json' };
    if (options.token)
        headers.Authorization = `Bearer ${options.token}`;
    const doFetch = options.fetchImpl ? options.fetchImpl : defaultFetch;
    const response = await doFetch(url, { headers, signal: options.signal });
    if (!response.ok)
        throw new Error(`HTTP ${response.status} for ${url}`);
    return response.json();
}
/** Build the query string for one (term, channel) pair. Qualifiers already
 *  embedded in the term (language:, stars:, pushed:) pass through untouched. */
export function queryFor(term, channel, qualifiers = '') {
    const suffix = qualifiers ? ` ${qualifiers.trim()}` : '';
    switch (channel) {
        case 'phrase': return `"${term}"${suffix}`;
        case 'loose': return `${term}${suffix}`;
        case 'readme': return `${term}${suffix} in:readme`;
        case 'topic': return term.startsWith('topic:') ? term : `topic:${term}`;
    }
}
/** One GitHub search call → raw hits. A failed call returns [] (degrade, not crash). */
export async function searchChannel(request, options) {
    const q = queryFor(request.term, request.channel, request.qualifiers ?? '');
    const sort = request.channel === 'phrase' ? '' : '&sort=stars';
    const perPage = Math.min(request.perChannel ?? 30, 100);
    try {
        const payload = (await getJson(`https://api.github.com/search/repositories?q=${encodeURIComponent(q)}&per_page=${perPage}${sort}`, options));
        return payload.items ?? [];
    }
    catch {
        return [];
    }
}
/** Run every (term × channel) pair with bounded concurrency. */
export async function searchAll(terms, channels, options = {}) {
    const results = new Map();
    const jobs = [];
    for (const term of terms) {
        for (const channel of channels) {
            jobs.push({ key: `${channel}\u0000${term}`, request: { term, channel, perChannel: options.perChannel, qualifiers: options.qualifiers } });
        }
    }
    const concurrency = 4;
    let cursor = 0;
    async function worker() {
        while (cursor < jobs.length) {
            const job = jobs[cursor++];
            results.set(job.key, await searchChannel(job.request, options));
        }
    }
    await Promise.all(Array.from({ length: Math.min(concurrency, jobs.length) }, worker));
    return results;
}
/** Raw README body for deep-dive repos (raw accept header skips base64). */
export async function fetchReadmeHead(fullName, bytes = 600, options = {}) {
    try {
        const headers = { 'User-Agent': 'dsh-plugin-deep-scan', Accept: 'application/vnd.github.raw+json' };
        if (options.token)
            headers.Authorization = `Bearer ${options.token}`;
        const doFetch = options.fetchImpl ? options.fetchImpl : defaultFetch;
        const response = await doFetch(`https://api.github.com/repos/${fullName}/readme`, { headers, signal: options.signal });
        if (!response.ok)
            return undefined;
        const body = (await response.text()).trim();
        const flat = body.replace(/\s+/g, ' ').trim();
        return flat ? flat.slice(0, bytes) : undefined;
    }
    catch {
        return undefined;
    }
}
export function readTokenFromEnv(envNames) {
    for (const name of envNames) {
        const value = process.env[name]?.trim();
        if (value)
            return value;
    }
    return undefined;
}
//# sourceMappingURL=sources.js.map