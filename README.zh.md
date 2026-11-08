# @local/dsh-superpowers

[English](README.md) | 中文

## 概要

DeepSeek Harness 的 [Superpowers](https://github.com/obra/superpowers) 移植。包内原样携带 15 个 Superpowers 技能，把它们注册进会话技能目录，并把 `using-superpowers` 引导（bootstrap）连同 DSH 工具映射注入每个顶层会话的 system prompt。装好即生效，无需逐会话开启。

仓库：<https://github.com/GrainRainAndy/dsh-superpowers>

分支约定：

- `main` —— Release 线：可安装的 bundle（运行代码、上游技能、用户文档、许可证）。
- `dev` —— 开发线：`main` 之外再加测试套件与工程记录（`docs/DESIGN.md`、`docs/VERIFICATION.md`、`docs/ACCEPTANCE.md`、`docs/evidence/`）。

上游版本固定为 v7.0.2（commit `22f0b463e7a5e579904dd6211a520321035526f7`），技能正文逐字保留；唯一改动是新增 `skills/using-superpowers/references/dsh-tools.md`，以及在 `skills/using-superpowers/SKILL.md` 的 Platform Adaptation 列表中加入一行 DSH 条目。

## Agent 得到什么

- **技能目录**：15 个技能以裸名字出现（`brainstorming`、`writing-plans`、`test-driven-development`、`subagent-driven-development` 等）。模型用 `skill` 工具加载；用户也可以用 `/brainstorming` 直接调用。技能的支持文件（`references/`、`scripts/`、prompt 模板）通过技能基目录按需读取。
- **会话开始时注入引导**：`using-superpowers/SKILL.md`（去掉 frontmatter）与 `dsh-tools.md` 组合成一段 `<EXTREMELY_IMPORTANT>` system prompt section（order 6000）。这是模型在行动前先检查技能是否适用的机制。
- **DSH 工具映射**：把 Superpowers 的动作词汇映射到真实工具——`skill`、`subagent` / `subagent_fork` / `send_message` / `list_agents`、`todo_write`、`read` / `write` / `edit` / `glob` / `grep` / `bash`、`ask_user_question`、`exit_plan_mode`、`web_search` / `web_fetch`，并说明 DSH 特有事实（技能根目录、会话日志路径、没有原生 worktree 工具等）。
- **子 agent 不注入**：delegation depth > 0 的会话不注入引导，符合 Superpowers 对 fresh-context worker 的假设。技能仍全局注册，子 agent 可按 dispatch prompt 显式加载。

## 安装

插件是 DSH profile bundle，通过 Harness 的插件管理器装入目标 profile：

```text
plugin_manager action=install_bundle target=git+https://github.com/GrainRainAndy/dsh-superpowers.git
```

本地开发时改为传 checkout 的绝对路径（如 `target=/path/to/dsh-superpowers`），pnpm 会链接而不是复制 checkout，技能改动在下一次加载时生效。

Web GUI 中同样可以在 **Plugins** 页面按 spec 安装。安装会选中 `@local/dsh-superpowers` bundle 层，然后对在线 profile 生效。安装后的 plugin row id 是 `superpowers`。

## 验证

- 当前会话调用 `skill`，`name: "brainstorming"`，应返回完整技能正文（`<skill_content>` 块）。
- **新开**会话问「你的 superpowers 是什么？」，回答应体现引导已注入。
- 验收测试：新会话发送 `Let's make a react todo list`，正常安装应先触发 `brainstorming`（先问设计问题），而不是直接写代码。

## 更新、禁用、卸载

- **git 安装**：更新 Release 线后先 `remove_bundle` 再按新 spec 安装；替换已安装包需要重启 Host 才能加载新的 JavaScript。
- **本地 checkout 安装**：`skills/` 内容下一次加载即生效；`lib/` 改动需要重启 Host。profile 链接的是该 checkout，安装期间不要移动或删除它。
- **禁用**：`plugin_manager action=set_bundle target=@local/dsh-superpowers enabled=false`，或 Plugins 页开关。
- **卸载**：`plugin_manager action=remove_bundle target=@local/dsh-superpowers`。

## 已知限制

- **Prompt 预算**：每个顶层会话有 13,218 字节的引导进入 system prompt（using-superpowers 正文 3,042 B + 工具映射 9,889 B + 包装），另有约 3 KiB 技能目录描述；技能正文按需加载。若部署无法承受，可禁用 bundle 或裁剪 checkout 中的映射。
- **子 agent 按设计不注入**：需要 Superpowers 指导的 worker 要在 dispatch prompt 中显式要求加载技能。
- **profile 相关工具**：`wait_agent` 与 Agent Teams 工具仅在挂载它们的 profile 存在；Agent Teams profile 中 Team 工具会遮蔽基础 subagent 控制工具，映射因此给出可续聊 worker 的替代路径。
- 标准工具集**没有原生 worktree 工具**，`using-git-worktrees` 走 git 回退。
- brainstorming 的可选 visual companion 通过 `bash` 后台任务启动本地 Node 服务，需要本地端口与浏览器，由用户决定是否使用。
- 没有专门的 UI；能力是面向模型的，Plugins 列表只显示本 bundle 的标题、描述和图标。

## 验证

`dev` 分支带 `node --test` 测试套件（frontmatter 解析、技能目录、bootstrap 组合与子 agent 抑制、manifest 与展示元数据、patch 锚定、上游内容对等）以及完整验证记录（`docs/VERIFICATION.md`、`docs/ACCEPTANCE.md`）和归档的验收会话。`main` 分支只保留运行内容与用户文档。

```bash
git clone -b dev https://github.com/GrainRainAndy/dsh-superpowers.git
cd dsh-superpowers
node --test tests/
```

集成与对等套件需要 `DSH_RUNTIME_ROOT`（解包的 DSH runtime）与 `SUPERPOWERS_REF_ROOT`（固定 commit 的 `obra/superpowers` checkout）；缺失时套件会带说明跳过。

## 归属与许可

Superpowers © 2025 Jesse Vincent，MIT 许可。本包自身的代码同样是 MIT。详见 [NOTICE.md](NOTICE.md)、[LICENSE](LICENSE)、[LICENSE-superpowers](LICENSE-superpowers) 与 [docs/DETAIL.zh.md](docs/DETAIL.zh.md)。
