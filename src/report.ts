/** Pure report-saving for `/deep-scan --save`: a slug filename the user can
 * read at a glance, written atomically (family rule) into the plugin's own
 * directory — /obsidian-push-file picks it up from there.
 * @module report */
import { mkdirSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

/** `2026-10-05-ai-novel.md` — date prefix sorts, slug caps at 40 chars. */
export function reportFilename(topic: string, now: Date): string {
  const slug = topic.trim().toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '').slice(0, 40).replace(/-+$/g, '') || 'scan';
  return `${now.toISOString().slice(0, 10)}-${slug}.md`;
}

export function saveReport(dir: string, topic: string, body: string, now: Date): string {
  const file = join(dir, reportFilename(topic, now));
  mkdirSync(dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  writeFileSync(tmp, body, 'utf8');
  renameSync(tmp, file);
  return file;
}
