/** Ranking and report rendering. Merges every round's channel results into one
 *  deduped pool ranked by channel precision first (phrase > loose > readme >
 *  topic), then by stars — so a niche-exact phrase hit with 40 stars outranks a
 *  README-coincidence hit with 40k stars. */
export const CHANNEL_ORDER = ['phrase', 'loose', 'readme', 'topic'];
export const CHANNEL_LABEL = { phrase: '短语', loose: '泛搜', readme: '正文', topic: '赛道' };
export function rank(results, terms, previous) {
    const pool = previous ?? { repos: new Map(), rounds: [] };
    const byChannel = new Map();
    for (const [key, repos] of results) {
        const [channel, rawTerm] = key.split('\u0000');
        const term = rawTerm.replace(/^topic:/, '');
        const list = byChannel.get(channel) ?? [];
        byChannel.set(channel, list);
        for (const repo of repos) {
            if (repo.fork || repo.archived)
                continue;
            const entry = pool.repos.get(repo.full_name);
            if (entry) {
                entry.terms.add(term);
            }
            else {
                pool.repos.set(repo.full_name, {
                    fullName: repo.full_name,
                    description: repo.description ?? '',
                    stars: repo.stargazers_count,
                    pushedAt: repo.pushed_at,
                    language: repo.language,
                    channel,
                    terms: new Set([term]),
                });
            }
            list.push(repo);
        }
    }
    const currentTerms = new Set(terms.map((term) => term.replace(/^topic:/, '')));
    const newNames = new Set();
    for (const repo of pool.repos.values())
        for (const term of repo.terms)
            if (currentTerms.has(term))
                newNames.add(repo.fullName);
    const hits = Object.fromEntries(CHANNEL_ORDER.map((channel) => [channel, byChannel.get(channel)?.length ?? 0]));
    pool.rounds.push({ round: pool.rounds.length + 1, queries: terms, hits, newRepos: newNames.size });
    return pool;
}
export function ranked(pool) {
    return [...pool.repos.values()].sort((a, b) => CHANNEL_ORDER.indexOf(a.channel) - CHANNEL_ORDER.indexOf(b.channel) || b.stars - a.stars);
}
export function render(pool, options) {
    const all = ranked(pool);
    const deep = options.deep ?? 5;
    const lines = [];
    lines.push(`GitHub 深度扫描：候选池 ${all.length} 个（${pool.rounds.length} 轮，共 ${options.totalQueries.length} 个搜索词）`);
    lines.push('');
    for (const stat of pool.rounds) {
        const detail = CHANNEL_ORDER.map((channel) => `${CHANNEL_LABEL[channel]}=${stat.hits[channel]}`).join(' ');
        lines.push(`- 第${stat.round}轮 [${stat.queries.join(' | ')}] 命中 ${detail} · 新发现 ${stat.newRepos}`);
    }
    lines.push('');
    lines.push(`## 深挖 Top ${Math.min(deep, all.length)}`);
    lines.push('');
    for (const repo of all.slice(0, deep)) {
        lines.push(`### ${repo.fullName}  ⭐${repo.stars}`);
        lines.push(`- 简介: ${repo.description || '（无）'}`);
        lines.push(`- 最后推送: ${repo.pushedAt.slice(0, 10)}${repo.language ? ` | 语言: ${repo.language}` : ''}`);
        lines.push(`- 通道: ${CHANNEL_LABEL[repo.channel]} | 命中词: ${[...repo.terms].join(', ')}`);
        if (repo.readmeHead)
            lines.push(`> ${repo.readmeHead}`);
        lines.push('');
    }
    lines.push(`## 完整候选池（未深挖 ${Math.max(0, all.length - deep)} 个）`);
    lines.push('');
    for (const repo of all.slice(deep)) {
        lines.push(`- ${repo.fullName} ⭐${repo.stars} [${CHANNEL_LABEL[repo.channel]}|${[...repo.terms].join(',')}] — ${repo.description.slice(0, 70)}`);
    }
    return lines.join('\n');
}
//# sourceMappingURL=rank.js.map