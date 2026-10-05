/** dsh wiring for deep-scan. One call = the full iterative chain: multi-query
 *  × 4-channel search → mine next-round topic queries from precise hits →
 *  iterate with a diminishing-returns stop rule → one precision-ranked report.
 *  The agent-facing tool lets the harness answer "这个赛道有哪些开源项目/竞品"
 *  by itself; the command takes raw `词1|词2` input. */
import type { Context } from '@deepseek-ai/cordis';
import Schema from '@deepseek-ai/schemastery';
import { defineTool } from '@deepseek-ai/dsh-tools';
import type {} from '@deepseek-ai/dsh-commands';
import type {} from '@deepseek-ai/dsh-tools';
import { homedir } from 'node:os';
import { join } from 'node:path';

import { runPipeline, readToken } from './deep-scan/pipeline.ts';

export const name = 'deep-scan';
export const inject = ['commands', 'tools'];

export interface Config {
  enabled: boolean;
  tokenEnv: string[];
  perChannel: number;
  mineRounds: number;
  deep: number;
  newKeepRatio: number;
}

export const Config = Schema.object({
  enabled: Schema.boolean().default(true),
  tokenEnv: Schema.array(Schema.string()).default(['GITHUB_TOKEN', 'GH_TOKEN']),
  perChannel: Schema.natural().default(30),
  mineRounds: Schema.natural().default(2),
  deep: Schema.natural().default(5),
  newKeepRatio: Schema.number().default(0.25),
});

import { runPipeline, readToken } from './deep-scan/pipeline.ts';
import { saveReport } from './report.ts';

export const name = 'deep-scan';
export const inject = ['commands', 'tools'];

export interface Config {
  enabled: boolean;
  tokenEnv: string[];
  perChannel: number;
  mineRounds: number;
  deep: number;
  newKeepRatio: number;
  /** where /deep-scan --save writes reports; /obsidian-push-file archives them */
  reportDir?: string;
}

export const Config = Schema.object({
  enabled: Schema.boolean().default(true),
  tokenEnv: Schema.array(Schema.string()).default(['GITHUB_TOKEN', 'GH_TOKEN']),
  perChannel: Schema.natural().default(30),
  mineRounds: Schema.natural().default(2),
  deep: Schema.natural().default(5),
  newKeepRatio: Schema.number().default(0.25),
  reportDir: Schema.string().default('~/.dsh/deep-scan/reports'),
});

async function scan(rawQueries: string, config: Config): Promise<string> {
  const wantsSave = /\s--save\b/.test(rawQueries);
  const topic = rawQueries.replace(/\s--save\b/g, '').trim();
  const queries = topic.split(/[|;；｜]/).map((part) => part.trim()).filter(Boolean).slice(0, 6);
  if (!queries.length) {
    return '用法：/deep-scan 词1|词2|词3 [--save] —— 多词分隔，每词自动跑 短语/泛搜/README正文/赛道 四通道，再挖词迭代。--save 把报告落盘后可 /obsidian-push-file 归档。例：/deep-scan 写小说|网文|AI novel';
  }
  const result = await runPipeline({
    queries,
    perChannel: config.perChannel,
    mineRounds: config.mineRounds,
    deep: config.deep,
    newKeepRatio: config.newKeepRatio,
    token: readToken(config.tokenEnv),
  });
  const text = `${result.report}\n\n（链路结束：${result.stopReason}）`;
  if (!wantsSave) return text;
  try {
    const dir = config.reportDir ? expandHome(config.reportDir) : reportDirDefault;
    const file = saveReport(dir, queries[0]!, text, new Date());
    return `${text}\n\n📄 报告已落盘：${file}——可 /obsidian-push-file ${file} 归档进 Obsidian。`;
  } catch (error) {
    return `${text}\n\n⚠ 报告落盘失败：${String(error)}`;
  }
}

const reportDirDefault = '~/.dsh/deep-scan/reports';

export function expandHome(path: string): string {
  return path.startsWith('~') ? join(homedir(), path.slice(1)) : path;
}

export function apply(ctx: Context, config: Config): void {
  const log = ctx.logger('deep-scan');
  if (!config.enabled) return void log.info('disabled by config');

  ctx.commands.register({
    name: 'deep-scan',
    description: 'GitHub 深度扫描：直接说人话（/deep-scan 想找 AI 写小说的开源项目）或给 2-4 个变体（/deep-scan 写小说|网文|AI novel）。说人话时第一轮以整句搜索，靠挖词迭代自己扩展',
    input: { hint: '<一句话需求 或 词1|词2|...>' },
    handler: ({ rawInput }) => {
      const query = String(rawInput ?? '').trim();
      if (!query) return Promise.resolve({ kind: 'error' as const, text: '想找什么？直接说人话（/deep-scan AI 写小说的开源项目）或给几个变体（写小说|网文|AI novel）' });
      return scan(query, config).then((text) => ({ kind: 'success' as const, text }));
    },
  });

  ctx.tools.register(
    defineTool({
      name: 'deep_scan',
      description:
        'GitHub 深度扫描：多搜索词 × 四通道（精确短语/泛搜/README正文/赛道topic扩散），自动挖词迭代 2-3 轮并止损，按通道精准度+star 排序输出候选池。做赛道调研、找竞品、找开源项目时用。搜索词要具体：给 2-4 个同义词/中英文变体（如 写小说|网文|AI novel），泛词会被大项目淹没。',
      parameters: {
        queries: { type: 'string', required: true, description: '搜索词，| 分隔 2-4 个同义词/中英文变体，如：写小说|网文|AI novel' },
        language: { type: 'string', description: '可选，限定语言如 python' },
        minStars: { type: 'number', description: '可选，最低 star 数' },
      },
      output: {
        schema: { type: 'string' } as const,
        render: (_args, value) => [{ type: 'text', text: value }],
      },
      presentCall: (args: { queries: string }) => {
        const queries = String(args.queries ?? '');
        return { card: 'generic', title: `深扫：${queries}`, kind: 'search', rawInput: queries };
      },
      presentResult: (args: { queries: string }) => {
        const queries = String(args.queries ?? '');
        return { card: 'generic', title: `深扫完成：${queries}`, kind: 'search', rawInput: queries };
      },
      async execute(args: { queries: string; language?: string; minStars?: number }) {
        const result = await runPipeline({
          queries: args.queries.split(/[|;；｜]/).map((part) => part.trim()).filter(Boolean).slice(0, 6),
          language: args.language,
          minStars: args.minStars,
          perChannel: config.perChannel,
          mineRounds: config.mineRounds,
          deep: config.deep,
          newKeepRatio: config.newKeepRatio,
          token: readToken(config.tokenEnv),
        });
        return `${result.report}\n\n（链路结束：${result.stopReason}）`;
      },
    }),
  );

  log.info(`mounted · perChannel=${config.perChannel} mineRounds=${config.mineRounds}`);
}
