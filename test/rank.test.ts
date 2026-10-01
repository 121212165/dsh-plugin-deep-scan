import assert from 'node:assert/strict';
import { test } from 'node:test';
import { rank, ranked, render } from '../src/deep-scan/rank.ts';
import type { RawRepo } from '../src/deep-scan/sources.ts';

const repo = (fullName: string, stars: number, topics: string[] = []): RawRepo => ({
  full_name: fullName,
  description: `desc of ${fullName}`,
  stargazers_count: stars,
  pushed_at: '2026-09-01T00:00:00Z',
  topics,
});

function results(entries: [channel: string, term: string, repos: RawRepo[]][]): Map<string, RawRepo[]> {
  const map = new Map<string, RawRepo[]>();
  for (const [channel, term, repos] of entries) map.set(`${channel}\u0000${term}`, repos);
  return map;
}

test('channel precision outranks stars (phrase 40★ before loose 50k★)', () => {
  const pool = rank(results([
    ['phrase', '写小说', [repo('p/small', 40)]],
    ['loose', '写小说', [repo('l/huge', 50000)]],
  ]), ['写小说']);
  const order = ranked(pool).map((entry) => entry.fullName);
  assert.deepEqual(order, ['p/small', 'l/huge']);
});

test('same channel sorts by stars; dedup merges terms across channels', () => {
  const pool = rank(results([
    ['phrase', '写小说', [repo('a/one', 100)]],
    ['loose', '写小说', [repo('b/two', 200), repo('a/one', 100)]],
    ['readme', '写小说', [repo('a/one', 100)]],
  ]), ['写小说']);
  const order = ranked(pool).map((entry) => entry.fullName);
  assert.deepEqual(order, ['a/one', 'b/two']);
  const merged = pool.repos.get('a/one')!;
  assert.equal(merged.channel, 'phrase');
  assert.equal(merged.terms.size, 1); // same term, counted once
});

test('forks and archived repos are dropped', () => {
  const pool = rank(results([
    ['loose', 'x', [{ ...repo('f/fork', 999), fork: true }, { ...repo('a/dead', 999), archived: true }, repo('k/keep', 1)]],
  ]), ['x']);
  assert.deepEqual(ranked(pool).map((entry) => entry.fullName), ['k/keep']);
});

test('rounds accumulate stats with new-repo counts', () => {
  let pool = rank(results([['phrase', '写小说', [repo('a/one', 100)]]]), ['写小说']);
  pool = rank(results([['topic', 'novel-writing', [repo('a/one', 100), repo('n/new', 50)]]]), ['topic:novel-writing'], pool);
  assert.equal(pool.rounds.length, 2);
  assert.equal(pool.rounds[0]!.newRepos, 1);
  assert.equal(pool.rounds[1]!.newRepos, 2); // a/one gains a term, n/new is new
});

test('render emits round stats, deep section and tail pool', () => {
  const pool = rank(results([
    ['phrase', '写小说', [repo('a/one', 100)]],
    ['loose', '写小说', [repo('b/two', 200)]],
  ]), ['写小说']);
  const text = render(pool, { deep: 1, totalQueries: ['写小说'] });
  assert.ok(text.includes('候选池 2 个'));
  assert.ok(text.includes('第1轮'));
  assert.ok(text.includes('短语=1'));
  assert.ok(text.includes('### a/one')); // phrase hit wins the deep slot despite fewer stars
  assert.ok(text.includes('- b/two ⭐200 [泛搜|写小说]'));
});
