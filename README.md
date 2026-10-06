# dsh-plugin-deep-scan

> 🧩 **dsh 插件家族**（22 件）：总目录 **[dsh-plugin-family](https://github.com/121212165/dsh-plugin-family)** ｜ 明星插件：**[ide-hub](https://github.com/121212165/dsh-plugin-ide-hub)** 跨 IDE 统一管理 · **[task-forge](https://github.com/121212165/dsh-plugin-task-forge)** 跨窗口无损交接 · **[quota](https://github.com/121212165/dsh-plugin-quota)** 实时用量仪表


**EN** · Iterative GitHub deep search: four channels (exact phrase, broad match, README body, topic expansion), new keywords mined out of the previous round, and a diminishing-returns stop rule instead of a fixed page count. `/deep-scan` returns a ranked pool annotating which channel found each hit and which words matched. · Limits: the search API caps at 1,000 results per query; generic cross-industry words sink to the noisy channels.

DeepSeek Harness (dsh) 插件：**GitHub 赛道深度扫描器**。一条链路跑完"多词搜索 → 挖词 → 迭代 → 止损"，自动把一个口语化的赛道需求变成几百个候选仓库的精准榜单。

适合回答："这个赛道有哪些开源项目/竞品？我下一个产品该卡哪个位？哪个是漏网大鱼？"

同系列：[price-aware](https://github.com/121212165/dsh-plugin-price-aware) · [cost-ledger](https://github.com/121212165/dsh-plugin-cost-ledger) · [relay-quota](https://github.com/121212165/dsh-plugin-relay-quota) · [transcript](https://github.com/121212165/dsh-plugin-transcript) · [transcript-search](https://github.com/121212165/dsh-plugin-transcript-search) · [obsidian-push](https://github.com/121212165/dsh-plugin-obsidian-push) · [session-insights](https://github.com/121212165/dsh-plugin-session-insights) · [eco-scan](https://github.com/121212165/dsh-plugin-eco-scan)。

## 链路

```
词1|词2|词3
  └─ 第1轮：每词 × 四通道并行搜索
       短语(phrase)   "词" 精确短语匹配 —— 精准度最高
       泛搜(loose)    词 名字/简介/topic —— 按 star 排
       正文(readme)   词 in:readme —— 挖简介没写但 README 详述的
       赛道(topic)    topic:x —— 从精准命中挖出的标签横扫
  └─ 挖词：统计精准命中池的 topics 高频标签（滤掉 ai/llm 等噪声标签，
          排除已搜过的词，出现≥2次才入选）
  └─ 第2..N轮：用挖出的 topic:xxx 当新一轮搜索词，重复上述链路
  └─ 止损：某轮新发现占比 < newKeepRatio(默认25%)，或挖不出新词 → 收
  └─ 排序：通道精准度优先（短语>泛搜>正文>赛道），同通道按 star
  └─ 深挖：Top N 仓库补 README 摘要，尾部附完整候选池（标注命中通道+词）
```

设计依据（AI 小说赛道实测）：泛词必被巨库淹没（搜"AI 小说"出来的是 LangChain）；精确短语一击命中真竞品；`in:readme` 捞回简介漏写的大鱼（AI_NovelGenerator 6.1k★ 靠"伏笔"命中）；第 3 轮起边际收益明显下降——所以默认 `mineRounds: 2`（最多 3 轮）。

## 用法

- **`/deep-scan 写小说|网文|AI novel`**：多词用 `|` 分隔（含全角），上限 6 个
- **`deep_scan` 工具**（给 agent 用）：`{ queries: "写小说|网文|AI novel", language?, minStars? }`

搜索词要具体：给 2-4 个同义词/中英文变体。词内可带 GitHub 限定符（`pushed:>2025-06-01`）。

## 配置

| 字段 | 默认 | 说明 |
|---|---|---|
| `tokenEnv` | `[GITHUB_TOKEN, GH_TOKEN]` | GitHub token（无 token 搜索限流 10 次/分，建议设置） |
| `perChannel` | `30` | 每通道每词拉取条数 |
| `mineRounds` | `2` | 首轮之后自动挖词迭代几轮 |
| `deep` | `5` | 深挖（README 摘要）的仓库数 |
| `newKeepRatio` | `0.25` | 一轮新发现占比低于此值 → 止损 |

## 已知边界

- 挖词只走 topics 标签（确定性可测），简介里的功能词（如"去AI味/拆文"）由 agent 看完报告后自行追加搜索——这是分工：插件负责可复现的链路，agent 负责语义跳转
- 跨行业通用词（审稿/续写/工作流）会漏噪声进池，但噪声沉在泛搜/正文通道底部，不动摇深挖区
- GitHub 搜索 API 上限 1000 条/查询，超大赛道建议加 `minStars` 收窄

## 安装

三步，实测于 `@deepseek-ai/dsh@0.1.7-alpha.1`（需 `pnpm` 在 PATH 上）：

```sh
# ① 装进 profile：dsh plugin 把参数原样转发给 pnpm，git 包会自动跑 prepare 构建 lib/
dsh plugin --profile web add github:121212165/dsh-plugin-deep-scan
```

② 把本仓库根目录 `cordis.patch.yml` 的内容**并进** `$DSH_HOME/profiles/web/cordis.patch.yml`。
该文件默认是 `[]`，所以要么整份替换，要么把 insert 条目并进同一个数组；**不要直接追加**——
追加会形成两个 YAML 文档，启动即报
`failed to parse overlay ... end of the stream or a document separator is expected`（本机实测踩过）。

③ 重启 dsh。配置层与 client 半都要重启才生效（客户端按 boot 时算出的内容 rev 下发，硬刷新浏览器没用）。

自检挂载：`dsh --profile web --dump-config | grep dsh-plugin-deep-scan`，应看到该条目。