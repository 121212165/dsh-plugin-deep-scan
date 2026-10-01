import assert from 'node:assert/strict';
import { test } from 'node:test';
import { runPipeline } from '../src/deep-scan/pipeline.ts';
import { queryFor } from '../src/deep-scan/sources.ts';

const item = (fullName: string, stars: number, topics: string[]) => ({
  full_name: fullName,
  description: `desc ${fullName}`,
  stargazers_count: stars,
  pushed_at: '2026-09-01T00:00:00Z',
  topics,
});

/** Fake GitHub: routes on the decoded q= parameter. Round-1 term 写小说 hits
 *  all three channels and seeds topic:novel-writing; that topic returns one
 *  new repo; the pool then dries up (no topic with count >= 2 left) → the
 *  chain stops with "没有挖出新搜索词". */
const fakeFetch = (async (url: string | URL, init: { headers: Record<string, string> }) => {
  const target = typeof url === 'string' ? url : url.href;
  if (target.includes('/readme')) {
    return {
      ok: target.includes('p/one'),
      status: target.includes('p/one') ? 200 : 404,
      json: async () => ({}),
      text: async () => '# P1 readme\n\nmulti  space   text',
    };
  }
  const q = decodeURIComponent(new URL(target).searchParams.get('q') ?? '');
  const items = (() => {
    if (q.includes('"写小说"')) return [item('p/one', 100, ['novel-writing', 'ai-writing']), item('p/two', 50, ['novel-writing'])];
    if (q.includes('topic:novel-writing')) return [item('p/one', 100, ['novel-writing']), item('n/new', 700, ['novel-writing', 'fiction'])];
    if (q.includes('in:readme')) return [item('r/only', 3000, ['ai'])];
    if (q.startsWith('写小说')) return [item('l/huge', 50000, [])];
    return [];
  })();
  return { ok: true, status: 200, json: async () => ({ items }), text: async () => '' };
}) as unknown as typeof fetch;

test('queryFor builds the four channel variants', () => {
  assert.equal(queryFor('写小说', 'phrase', 'language:python'), '"写小说" language:python');
  assert.equal(queryFor('写小说', 'loose'), '写小说');
  assert.equal(queryFor('写小说', 'readme'), '写小说 in:readme');
  assert.equal(queryFor('novel-writing', 'topic'), 'topic:novel-writing');
  assert.equal(queryFor('topic:x', 'topic'), 'topic:x'); // no double prefix
});

test('pipeline: mine-and-iterate then stop when the pool dries up', async () => {
  const result = await runPipeline({
    queries: ['写小说'],
    mineRounds: 2,
    perChannel: 10,
    deep: 2,
    fetchImpl: fakeFetch,
  });
  // two rounds ran: 写小说 → mined topic:novel-writing → no new terms left, so
  // round 3 never fires
  assert.equal(result.pool.rounds.length, 2);
  assert.equal(result.stopReason, '没有挖出新搜索词');
  assert.deepEqual(result.pool.rounds[1]!.queries, ['topic:novel-writing']);

  // precision order: phrase hits first (stars ignored across channels), then
  // loose, readme, topic
  const names = [...result.pool.repos.values()];
  const sorted = [...names].sort((a, b) => (a.channel === 'phrase' ? -1 : 0) - (b.channel === 'phrase' ? -1 : 0));
  assert.ok(sorted.length === names.length);
  assert.equal(result.pool.repos.size, 5); // p/one p/two l/huge r/only n/new

  const report = result.report;
  assert.ok(report.includes('候选池 5 个'));
  assert.ok(report.includes('### p/one')); // deep-dive slot 1 = phrase hit
  assert.ok(report.includes('P1 readme')); // README head fetched for deep repos
  assert.ok(report.includes('topic:novel-writing')); // round-2 queries listed
});

test('pipeline: stop rule fires on a low-yield mined round', async () => {
  // one-shot fake: mined topic round returns nothing new
  const dryFetch = (async (url: string | URL) => {
    const target = typeof url === 'string' ? url : url.href;
    const q = decodeURIComponent(new URL(target).searchParams.get('q') ?? '');
    const items = q.includes('"写小说"') ? [item('p/one', 100, ['novel-writing']), item('p/two', 50, ['novel-writing'])] : [];
    return { ok: true, status: 200, json: async () => ({ items }), text: async () => '' };
  }) as unknown as typeof fetch;
  const result = await runPipeline({ queries: ['写小说'], mineRounds: 3, newKeepRatio: 0.25, deep: 1, fetchImpl: dryFetch });
  assert.equal(result.stopReason, '第2轮新发现占比过低（止损）');
  assert.equal(result.pool.rounds.length, 2);
});
