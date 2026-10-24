/** dsh wiring for deep-scan. One call = the full iterative chain: multi-query
 *  × 4-channel search → mine next-round topic queries from precise hits →
 *  iterate with a diminishing-returns stop rule → one precision-ranked report.
 *  The agent-facing tool lets the harness answer "这个赛道有哪些开源项目/竞品"
 *  by itself; the command takes raw `词1|词2` input. */
import type { Context } from '@deepseek-ai/cordis';
import Schema from '@deepseek-ai/schemastery';
export declare const name = "deep-scan";
export declare const inject: string[];
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
export declare const Config: Schema<Schemastery.ObjectS<{
    enabled: Schema<boolean, boolean>;
    tokenEnv: Schema<string[], string[]>;
    perChannel: Schema<number, number>;
    mineRounds: Schema<number, number>;
    deep: Schema<number, number>;
    newKeepRatio: Schema<number, number>;
    reportDir: Schema<string, string>;
}>, Schemastery.ObjectT<{
    enabled: Schema<boolean, boolean>;
    tokenEnv: Schema<string[], string[]>;
    perChannel: Schema<number, number>;
    mineRounds: Schema<number, number>;
    deep: Schema<number, number>;
    newKeepRatio: Schema<number, number>;
    reportDir: Schema<string, string>;
}>>;
export declare function expandHome(path: string): string;
export declare function apply(ctx: Context, config: Config): void;
//# sourceMappingURL=plugin.d.ts.map