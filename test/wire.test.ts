/**
 * Wire-level (assembly layer) tests for deep-scan: mount the real apply()
 * against a scripted cordis context and cover the network-free wiring paths —
 * mounted command/tool surface, args validation, empty-query pipeline runs,
 * presenter cards, and the disabled config. The pipeline's GitHub fetches are
 * exercised by test/pipeline.test.ts through fetchImpl injection; the wiring
 * here replaces unbound globalThis.fetch with a tripwire so any accidental
 * network call fails the test loudly. No real network anywhere.
 * Template: dsh-plugin-quota/test/harness.ts (style: dsh-plugin-tool-trace/test/wire.test.ts).
 * @module test/wire
 */
import assert from 'node:assert/strict';
import { test, after } from 'node:test';
import { ToolArgsError } from '@deepseek-ai/dsh-tools';

interface CapturedCommand {
  name: string;
  handler: (args: { rawInput?: string }) => Promise<{ kind: string; text: string }>;
}

interface CapturedTool {
  name: string;
  execute: (args: Record<string, unknown>) => Promise<string>;
  presentCall: (args: Record<string, unknown>) => { card: string; title: string; kind: string } | undefined;
  presentResult: (args: Record<string, unknown>) => { card: string; title: string; kind: string } | undefined;
  output: { render: (args: unknown, value: string) => Array<{ type: string; text: string }> };
}

type Apply = (ctx: unknown, config: Record<string, unknown>) => void;

const plugin = await import('../src/plugin.ts');
const apply = plugin.apply as unknown as Apply;
const inject = plugin.inject as string[];

function cmdLogger() {
  return { info() {}, warn() {}, debug() {} };
}

/** Fetch tripwire: count every call and throw, so a stray request aborts its handler. */
const network: string[] = [];
const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: string | URL | Request) => {
  network.push(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
  throw new Error('wire test must not hit the network');
}) as typeof fetch;
after(() => {
  globalThis.fetch = realFetch;
});

function mount(over: Record<string, unknown> = {}): { commands: CapturedCommand[]; tools: CapturedTool[]; config: Record<string, unknown> } {
  const commands: CapturedCommand[] = [];
  const tools: CapturedTool[] = [];
  const config = {
    enabled: true,
    tokenEnv: ['GITHUB_TOKEN', 'GH_TOKEN'],
    perChannel: 30,
    mineRounds: 2,
    deep: 5,
    newKeepRatio: 0.25,
    reportDir: '~/.dsh/deep-scan/reports',
    ...over,
  };
  const ctx = {
    logger: cmdLogger,
    on() { assert.fail('deep-scan registers no listeners'); },
    commands: { register(definition: CapturedCommand) { commands.push(definition); } },
    tools: { register(definition: CapturedTool) { tools.push(definition); } },
  };
  apply(ctx, config);
  return { commands, tools, config };
}

test('mount registers the /deep-scan command and the deep_scan tool with the promised surface', () => {
  const { commands, tools } = mount();
  assert.deepEqual(inject, ['commands', 'tools']);
  assert.deepEqual(commands.map((command) => command.name), ['deep-scan']);
  assert.deepEqual(tools.map((tool) => tool.name), ['deep_scan']);
  const tool = tools[0]!;
  assert.equal(typeof tool.execute, 'function');
  assert.equal(typeof tool.presentCall, 'function');
  assert.equal(typeof tool.presentResult, 'function');
  assert.deepEqual(tool.output.render({}, 'report'), [{ type: 'text', text: 'report' }]);
  assert.equal(network.length, 0, 'mounting alone never touches the network');
});

test('empty and separator-only command inputs fall back to the local usage text, with no fetch', async () => {
  const { commands } = mount();
  const scan = commands[0]!;
  const blank = await scan.handler({ rawInput: '' });
  assert.equal(blank.kind, 'error');
  assert.ok(blank.text.includes('想找什么'), blank.text);

  const separators = await scan.handler({ rawInput: '||； --save' });
  assert.equal(separators.kind, 'success');
  assert.ok(separators.text.includes('用法：/deep-scan'), `usage guidance after stripping --save: ${separators.text}`);
  assert.ok(separators.text.includes('--save'), 'the usage text explains the save flag');
  assert.equal(network.length, 0, 'both degraded paths resolved without any request');
});

test('deep_scan executes a dry pipeline offline for a separator-only query', async () => {
  const { tools } = mount();
  const tool = tools[0]!;
  const report = await tool.execute({ queries: ' | ' });
  assert.ok(report.includes('候选池 0 个'), `empty pipeline renders a ranked-empty report: ${report}`);
  assert.ok(report.includes('链路结束：没有挖出新搜索词'), `${report}`);
  assert.ok(!report.includes('undefined') && !report.includes('NaN'), report);
  assert.equal(network.length, 0, 'an empty query list schedules zero GitHub calls');
});

test('deep_scan validates its args before anything runs; cards render or degrade softly', async () => {
  const { tools } = mount();
  const tool = tools[0]!;
  await assert.rejects(tool.execute({}), ToolArgsError, 'missing required queries throws ToolArgsError, not a fetch');
  await assert.rejects(tool.execute({ queries: 42 as unknown as string }), ToolArgsError);
  assert.equal(network.length, 0, 'validation is purely local');

  assert.deepEqual(
    tool.presentCall({ queries: '写小说|网文' }),
    { card: 'generic', title: '深扫：写小说|网文', kind: 'search', rawInput: '写小说|网文' },
  );
  const done = tool.presentResult({ queries: '写小说' });
  assert.ok(done && done.title === '深扫完成：写小说', JSON.stringify(done));
  assert.equal(tool.presentCall({ queries: 42 as unknown as string }), undefined, 'junk args degrade to no card instead of throwing');
  assert.equal(network.length, 0, 'cards never reach for the network either');
});

test('disabled config mounts nothing', () => {
  const disabled = {
    logger: cmdLogger,
    on() { assert.fail('listener registered while disabled'); },
    commands: { register() { assert.fail('command registered while disabled'); } },
    tools: { register() { assert.fail('tool registered while disabled'); } },
  };
  apply(disabled, { enabled: false });
  assert.equal(network.length, 0);
});
