/** Report-saving: slug filename stability and an atomic write that lands.
 * @module test/report */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after } from 'node:test';

import { reportFilename, saveReport } from '../src/report.ts';

const NOW = new Date('2026-10-05T08:00:00.000Z');

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'deep-scan-report-'));
  after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

test('reportFilename slugs the topic: readable, sortable, bounded', () => {
  assert.equal(reportFilename('AI 写小说 的开源项目!!', NOW), '2026-10-05-ai-写小说-的开源项目.md');
  assert.equal(reportFilename('  --  ', NOW), '2026-10-05-scan.md', 'a topic of pure noise degrades, never crashes');
  const name = reportFilename('x'.repeat(200), NOW);
  assert.ok(name.length < 60, name);
});

test('saveReport writes atomically and lands the bytes', () => {
  const dir = tempDir();
  const file = saveReport(join(dir, 'nested'), '写小说', '# 报告', NOW);
  assert.ok(existsSync(file));
  assert.equal(readFileSync(file, 'utf8'), '# 报告');
  assert.ok(!existsSync(`${file}.${process.pid}.tmp`), 'no temp residue');
});
