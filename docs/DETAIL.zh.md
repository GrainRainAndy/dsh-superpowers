# 实现细节

本文是 [README.zh.md](../README.zh.md) 的技术补充，也有英文版 [DETAIL.md](DETAIL.md)。

## 1. 上游与移植规则

- 上游：Superpowers v7.0.2，commit `22f0b463e7a5e579904dd6211a520321035526f7`。
- `skills/` 目录逐字复制，用 `diff -r` 对干净的上游 checkout 验证内容对等。
- 上游移植指南禁止为了让 harness 适配而改写技能正文。一次移植只应新增（a）工具映射参考、（b）bootstrap 注入器。本包正是这样做的：
  - 新增 `skills/using-superpowers/references/dsh-tools.md`；
  - 在 `skills/using-superpowers/SKILL.md` 的 Platform Adaptation 列表新增一行；
  - 新增 `lib/`（provider + bootstrap section）、包元数据、locale、图标。

## 2. 包结构

| 路径 | 作用 |
|---|---|
| `package.json` | bundle manifest：`dsh.bundle.patch`、`exports`、`files`、顶层 `icon` |
| `cordis.patch.yml` | 插入一条 Host row，id `superpowers`，模块 `./lib/index.js` |
| `lib/index.js` | Cordis 插件：注册 provider 与 system prompt section |
| `lib/skills.js` | 技能发现、frontmatter 解析、provider 实现 |
| `lib/prompt.js` | bootstrap 组合、section 常量、delegation 判定 |
| `skills/` | 上游技能树：15 个技能目录，81 个文件（80 上游 + 映射） |
| `locale/{en,zh}.json` | Plugin Manager 的 `meta.title` / `meta.description` / `meta.detail` |
| `icon.svg` | 为本包绘制的 36×36 SVG |
| `tests/` | `node --test` 测试（单元、Cordis 集成、manifest、上游对等） |

## 3. Bundle 层与安装

profile 由空 entry 列表开始，按顺序应用每个被选中 bundle 的 patch，再应用 profile 自己的 patch。`install_bundle` 会：用 pnpm 把本目录加入 profile（生成 `link:<绝对路径>` 依赖与 `node_modules` 符号链接）；读取 `package.json.dsh.bundle.patch`；应用 patch 层并把 bundle 名写入 profile manifest；在在线 surface 上重载组合。

`dsh-app-boot` 的 `anchorInsertedPluginNames` 会把插入行中相对的 `name`（`./lib/index.js`）转换为以 patch 文件所在目录为锚的 `file:` URL，因此一个包可以同时是 bundle 和 Host 插件。安装是链接：改动 `skills/` 会在下一次技能加载时生效；改动 `lib/` 需要重启 Host（模块代际被缓存）。

包没有 `dependencies`、没有 install script：插件只 import `node:fs`、`node:fs/promises`、`node:path`、`node:url`。因此版本兼容性检查没有需要评估的约束。

## 4. Host 插件生命周期

```js
export const name = 'superpowers'
export const inject = ['skills', 'systemPrompt']
export async function apply(ctx) { … return dispose }
```

`apply` 先读取两份 bootstrap 源文件，再注册任何东西——打包错误会立即报错，而不是发布一个半可用的插件。两个注册都是插件 fiber 拥有的 effect，同时显式返回 disposer，两条卸载路径都干净。没有 `Config` 导出：没有需要安全暴露的配置项；启停用 bundle/row 开关，内容调整在链接的 checkout 中进行。

## 5. Skill provider 契约

`ctx.skills.registerProvider(create)` 注册 provider，名字为 `superpowers`。每个技能候选字段：

- `name`：frontmatter 名字，裸 kebab-case（跨技能引用写作 `superpowers:<name>`，bootstrap 指示去掉前缀）；
- `description`：frontmatter 描述；
- `invocation`：`{modelInvocable: true, userInvocable: true}`；
- `provider: superpowers`、`source: bundled`；
- `rank: 600`（`BUNDLED_SKILL_RANK`）；project（100/200）、custom（300）、user（400/500）根的同名技能会覆盖 bundle；
- `resourceBase`：`{kind: 'directory', path: <技能目录>}`，是必需的：技能正文引用 `references/*`、`scripts/*` 与相邻技能的路径，`skill` 工具会渲染这个基目录供模型解析；
- `locator` / `path`：`SKILL.md` 绝对路径。

`get(candidate)` 每次重新读取文件并返回去掉 frontmatter 的正文。发现结果按 provider 实例缓存，正文不缓存（与 filesystem provider 一致）。发现阶段的错误会抛出带名字的错误而不是静默丢弃技能：打包内容由测试校验，加载期失败意味着包本身坏了。

## 6. Bootstrap 组合

```
<EXTREMELY_IMPORTANT>
You have superpowers.

**IMPORTANT: … ALREADY LOADED … Do NOT use the skill tool to load "using-superpowers" again …**

<using-superpowers 正文（去掉 frontmatter）>

<dsh-tools.md 原文>
</EXTREMELY_IMPORTANT>
```

以 `ctx.systemPrompt.section({ name: 'superpowers:bootstrap', order: 6000,
interpolate: false, text })` 注册。`interpolate: false` 是必须的：技能正文包含花括号形态的文本，必须原样送达模型。order 6000 位于一方的流程/工具指导（≤ 5000）之后，deliverable、structured-output、harness-source 等 section（≥ 9000）之前；这个数字是展示顺序选择，不是契约。

section 全局注册（profile 范围），这正是"每个顶层会话、无需逐个开启"成立的原因；子 agent 抑制在文本 provider 内处理（见 §7）。实测组合大小为 13,218 字节，每个顶层会话的每个请求都会付出这个成本。

## 7. 子 agent 抑制

section 文本 provider 在 assembly context 的 agent 属于 delegated 时返回 `''`（渲染时丢弃）：

```js
agent?.session?.header?.delegationDepth > 0 || agent?.options?.subagentDepth > 0
```

这两个信号与 `@deepseek-ai/dsh-subagent` 的 `delegationDepthOf()` 一致。理由：Superpowers 的子 agent 工作流投入最多精力防止 fresh worker 重新走设计与批准流程；其他 in-process harness 的实践表明只依赖模型遵守 `<SUBAGENT-STOP>` 标记并不可靠，所以移植检测结构信号。技能在所有会话仍然注册，dispatch prompt 可以要求 worker 显式加载。

没有 agent 的 assembly（例如展示性探测）视为顶层会话，注入 bootstrap。

## 8. 工具映射

映射文件逐一给出真实工具参数：技能调用与 `/name` 用户调用；subagent 的派发/续聊/生命周期/等待/并行/模型选择；`todo_write`；文件与搜索工具；`bash` 语义（全新 shell、`workdir`、后台/job 工具、sandbox 拒绝）；`ask_user_question`（包括"跳过不等于许可"与 profile 条件性的 timed 变体）；plan mode（人工 `/plan` 进入、`exit_plan_mode` 呈现）；web 工具；技能目录与 frontmatter；会话日志位置；指令优先级。

映射明确列出 DSH 没有的东西（原生 worktree、subagent close/status、`subagent_type`、`CLAUDE_PLUGIN_ROOT`、`~/.claude` 路径、agent 侧 plan-mode 进入工具），并告诉模型按技能自带的 fallback 措辞处理，不要发明工具。

两个 profile 条件性事实按条件表述：`wait_agent` 与 Agent Teams 工具只在挂载它们的 profile 存在（Team 工具会遮蔽基础 subagent 控制工具，可续聊 worker 用 `spawn_teammate` + `send_message`）；`ask_user_question` 的 `timeout` 只在 `timed` 变体存在，默认 `legacy` 模式没有该参数。

## 9. 内容对等

`tests/upstream-parity.test.mjs`（以及 VERIFICATION.md 中的 `diff -r` 命令）强制包内树与上游的差异只有新增映射文件和 Platform Adaptation 那一行。这是防止"harness 调优"侵入行为塑造文本的机制。

## 10. 失败模式与诊断

| 现象 | 含义 / 处理 |
|---|---|
| bundle row failed / 插件不存在 | `apply` 抛错，通常是打包文件缺失（错误会带路径）。恢复文件或重装。 |
| bundle 在列表里但新会话无 bootstrap | 会话所在 profile 没有该 row（用 `--dump-config` 检查），或该会话是子 agent（预期行为）。 |
| 技能目录没变化 | 更高层禁用了该 row，或 profile 没挂载 skill 工具；`plugin_manager list_plugins` 可看 row 的 fiber phase。 |
| 技能重名 | project/user 的技能同名时覆盖 bundled（rank 语义）；上游行为通过覆盖而非重命名保留。 |
| 卸载后无法启动 | profile 链接的是本 checkout；若目录先被删除，用 `plugin_manager remove_bundle` 移除链接并重启。 |

## 11. 信任与安全

注入的都是打包的、可信的内容（上游 MIT 技能 + 本包映射）。没有网络代码，也没有能把内容注入 bootstrap 的运行时输入。bootstrap 是行为塑造文本，和任何 system prompt 内容一样，被篡改的 checkout 能改变模型行为；bundle 由用户显式安装，可随时禁用。技能脚本通过 `bash` 以当前用户身份执行，Harness 的 sandbox/approval 策略照常适用。映射中的会话日志指引是只读的。

## 12. 设计决策与被否方案

| 决策 | 备选 | 理由 |
|---|---|---|
| system prompt section | 在第一步注入 durable user context（Claude Code `SessionStart` 形态） | prompt section 更简单、会话内静态、天然跨 compaction，不需要写会话日志；代价是位于 system prompt 而非历史。 |
| 自建 provider | 复用 `dsh-skill-filesystem` 的 `customSkillDirs` 指向包内目录 | 那样 patch 需要写入绝对安装路径；自建 provider 让包自包含，并给出精确 provenance（`provider: superpowers`、`source: bundled`）。 |
| 裸技能名 | 注册为 `superpowers:<name>` | 注册表要求裸 kebab-case；跨引用保持上游写法，由映射指示去前缀。 |
| 结构信号抑制子 agent | 只依赖 `<SUBAGENT-STOP>` 标记 | 标记依赖模型遵守；其他 in-process harness 在真实失败后补上了结构检测。 |
| 只加映射参考 | 改写技能正文里的工具名 | 上游把技能文本视为调优过的行为代码；harness 知识集中在一个映射文件。 |
| 单包 | bundle 包 + 独立插件包 | loader 以 patch 文件为锚解析相对路径，一个包足够，安装环节更少。 |

## 13. 兼容性说明

- 针对 DSH `0.2.2-rc.1` 构建并验证。
- 依赖：`ctx.skills.registerProvider`/`skills.list`/`skills.get` 服务契约、`ctx.systemPrompt.section`、delegated 信号（`session.header.delegationDepth`、`AgentOptions.subagentDepth`）、`dsh-app-boot` 的插入行路径锚定。
- 未来 DSH 若改动 provider 契约或 section 顺序表，集成测试会先失败；测试套件就是预警机制。
- 跟进新上游版本：用新 commit 的 `skills/` 替换、重新应用两处允许的差异（新树的映射文件、Platform Adaptation 行）、更新 `NOTICE.md` 的固定 commit、重跑对等与目录测试。
