import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mineTopics, minedToQueries } from '../src/deep-scan/mine.ts';
import type { RawRepo } from '../src/deep-scan/sources.ts';

const repo = (fullName: string, stars: number, topics: string[]): RawRepo => ({
  full_name: fullName,
  description: '',
  stargazers_count: stars,
  pushed_at: '2026-09-01T00:00:00Z',
  topics,
});

test('mineTopics counts across the pool and requires count >= 2', () => {
  const mined = mineTopics([
    repo('a/one', 100, ['novel-writing', 'ai-writing']),
    repo('b/two', 50, ['novel-writing']),
    repo('c/three', 10, ['fiction']),
  ]);
  assert.deepEqual(mined.map((entry) => entry.term), ['novel-writing']);
  assert.equal(mined[0]!.count, 2);
  assert.equal(mined[0]!.stars, 150);
});

test('generic noise topics are dropped', () => {
  const mined = mineTopics([
    repo('a/one', 100, ['ai', 'llm', 'chatgpt', 'novel-writing']),
    repo('b/two', 50, ['ai', 'novel-writing']),
  ]);
  assert.deepEqual(mined.map((entry) => entry.term), ['novel-writing']);
});

test('already-searched terms are excluded (topic: prefix tolerated)', () => {
  const mined = mineTopics([
    repo('a/one', 100, ['novel-writing']),
    repo('b/two', 50, ['novel-writing', 'worldbuilding']),
    repo('c/three', 30, ['worldbuilding']),
  ], ['topic:novel-writing']);
  assert.deepEqual(mined.map((entry) => entry.term), ['worldbuilding']);
});

test('ties break by carried stars', () => {
  const mined = mineTopics([
    repo('a/one', 900, ['x-topic', 'y-topic']),
    repo('b/two', 100, ['x-topic']),
    repo('c/three', 1, ['y-topic']),
  ]);
  assert.equal(mined[0]!.term, 'x-topic');
});

test('minedToQueries emits topic: queries', () => {
  assert.deepEqual(minedToQueries([{ term: 'novel-writing', count: 2, stars: 10 }]), ['topic:novel-writing']);
});
