# 实现说明

## 网站结构与数据归属

网站是纯静态应用，无数据库、站内 GitHub OAuth 或第三方前端依赖。网站提供浏览、筛选和草稿入口，任务、讨论及文章通过 GitHub 提交；网页不收集密码或访问令牌。

四个一级页面为首页、任务、记录与讨论、学习路径，另有全局搜索、任务详情与工作台设置。布局支持桌面和手机，并提供键盘焦点、对话框和减少动画偏好。

| 内容 | 来源 |
| --- | --- |
| 网站名称、仓库白名单、成员 | `config.json` |
| 项目介绍、四阶段路线、课程、候选想法、资料 | `data/space.json` |
| 学习记录和实验文章 | `records/*.md` |
| 文章索引 | 构建生成的 `data/records.json` |
| 任务、负责人、评论、回应 | 各配置仓库的 GitHub Issues |
| 阶段和状态 | GitHub Project 的 Phase、Status 字段 |
| 问答、想法与方案交流 | 网站仓库的 GitHub Discussions |
| 构建时的 GitHub 数据 | `data/issue-snapshot.json` |

首页数量来自真实 Issues、Discussions 和 Markdown 文件。路线与候选建议不计为已开展工作。

## 任务创建与字段初始化

网站创建任务时先校验标题、仓库、Phase、Status 和领域标签，再打开 GitHub Issue 创建页。标题没有固定前缀；正文与 `.github/ISSUE_TEMPLATE/05-task.md` 使用相同的五段结构：目标、操作清单、完成标准、参考资料与前置任务、结果与证据。

网站生成的链接通过 `projects=owner/number` 预选 Project，账号需要相应权限。GitHub 原生创建页不支持通过 URL 预填自定义字段，因此正文携带版本化的隐藏初始化请求。它只用于首次设置字段，不代表当前值；可见正文不重复 Phase 和 Status。

构建工作流使用 `scripts/initialize-project-tasks.mjs` 读取请求，将 Issue 加入配置的 Project，并依次设置 Status 和 Phase。即使 GitHub 创建页没有预选 Project，初始化也会添加。GitHub 原生模板没有隐藏请求，不会自动初始化字段。

初始化仅处理白名单公开仓库中的合法请求。Phase 已设置或条目已归档时跳过，后续手动修改会保留；中途失败时下次可重试。每仓库扫描最近更新的 300 条 API 记录，达到上限会警告。没有初始化请求的任务不会被修改。所有字段值经过校验，Issue 内容只作为数据读取。

任务标题、内容、领域标签和关闭状态来自 Issues，Phase、Status 来自 Project：

| 条件 | 网站状态 |
| --- | --- |
| Issue 已关闭 | Done，优先于 Project 状态 |
| Issue 打开且存在有效 Project Status | 对应的 Backlog、Ready、In progress 或 Done |
| Issue 打开且没有有效 Project Status | Backlog |
| 没有有效 Project Phase | 阶段未设置 |

旧阶段和状态标签、隐藏初始化请求都不直接决定网站分类。普通 Issue 归为任务，带旧记录、进展、实验、想法或讨论标记的 Issue 被排除；PR、Draft Issue、私有内容不展示。旧 `[任务]` 前缀仍可识别，但新任务无需使用。

## 筛选与发布入口

任务筛选使用搜索框、可搜索菜单和可移除条件标签。支持 `repo:`、`status:`、`phase:`、`label:`、`author:`、`assignee:`、`is:open`、`is:closed`，例如：

```text
label:rl status:"In progress" phase:train
```

筛选可与普通关键词组合；每个字段当前只选一个值，不同字段组合匹配。任务小卡片隐藏仓库名，详情保留 `owner/repo#number`。

讨论列表、首页动态和搜索仅使用 Discussions，不聚合历史讨论 Issue。创建入口提供 Q&A、General、Ideas，默认 General；GitHub 其他类别不在网站创建入口显示。

任务与讨论弹窗使用紧凑布局，小视口允许滚动。关闭按钮位于独立顶部区域，不覆盖滚动条。跳转 GitHub 后关闭原弹窗，校验失败时保留草稿。网站只生成草稿，不代替用户发布或发送通知。

## 同步与异常处理

默认读取构建快照，日常浏览不消耗 GitHub API 额度。Deploy learning space 工作流按以下事件更新：

- `main` 分支推送。
- 网站仓库 Issue、Discussion 及评论变动。
- 每 15 分钟定时构建，补齐其他仓库事件和 Project 字段变动；GitHub 调度可能延迟。
- 手动运行工作流，或发送 `github-sync` repository_dispatch。

“刷新 Issues”通过无令牌 REST API 更新各仓库任务正文、标签、关闭状态等 Issue 数据，保留快照中的 Project 字段与 Discussions。它不会即时更新阶段、Project 状态和讨论，也不持续轮询。API 限流或超时时保留最近一次可用数据；无数据时展示空状态。

构建逐个确认配置仓库为公开仓库，Project 也必须公开。任一仓库读取失败会中止构建，保留已部署版本。讨论或 Project 暂时失败时，可使用匹配配置的历史快照并保留原时间和警告；没有可用历史快照时读取失败会中止构建。

每仓库最多读取最近更新的 300 条 API 记录，其中包含 PR，因此实际 Issue 数量可能少于 300；Discussions 最多 300 条，达到上限会标记。

## 文章与构建

“新增记录”和实验模板打开 GitHub 新建文件页，预填 Markdown。记录位于 `records/`，必须包含 `title` 和 `YYYY-MM-DD` 格式的 `date`；可选字段为 `phase`、`tags`、`author`、`excerpt`。格式示例见[记录说明](../records/README.md)。

构建生成 `data/records.json` 索引，将静态资源复制到 `dist/` 并写入 `.nojekyll`。文章提交后由下一次 Pages 构建更新入口。

## 代码位置与验证

| 文件或目录 | 职责 |
| --- | --- |
| `app.mjs` | 页面渲染、任务筛选、弹窗及 GitHub 跳转 |
| `styles.css` | 布局与样式 |
| `lib/core.mjs` | 数据转换、任务模板、筛选与 URL 构造 |
| `lib/task-intake.mjs` | 隐藏初始化请求的生成与校验 |
| `lib/live.mjs` | 浏览器侧公开 Issue 读取 |
| `scripts/initialize-project-tasks.mjs` | Project 任务初始化 |
| `scripts/snapshot.mjs` | Issues、Project 与 Discussions 快照 |
| `scripts/records.mjs` | Markdown 文章索引 |
| `scripts/build.mjs` | 静态站点构建 |
| `.github/workflows/` | 同步、测试与 Pages 部署 |
| `tests/` | 数据处理、页面交互和同步验证 |

修改代码、配置、路线或课程后运行：

```sh
npm test
npm run build
```

## 当前边界

网站读取公开数据，不支持私有 Issue、站内直接写回看板、即时聊天、站内附件上传或共享 agent。Issue 内容以转义后的文本预览展示，不执行其中的 HTML；静态网页和仓库中不保存访问令牌。

当前支持一个 Project 下的多个仓库，尚未提供多项目切换。MicroDuck 学习结束后保留其 Project 与记录，新目标使用独立 Project，并按需修改网站配置。
