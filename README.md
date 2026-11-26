# Duck Lab

以项目为主线的机器人学习与实验记录工作台，当前聚焦 MicroDuck 复刻。个人可以独立使用，也支持多位成员共享任务、记录和讨论。

**纯静态网站，无数据库，无第三方前端依赖。** 网站、计划和文章记录存放在仓库；任务使用跨仓库 GitHub Issues，交流使用 GitHub Discussions，阶段和状态可接入 GitHub Project。网页不收集密码或令牌，提交与评论使用 GitHub 自身的登录。

## 先在本地看

需要 Node.js 20 或更新版本，无需运行 npm install。

```sh
npm run dev
```

打开 http://127.0.0.1:4173 。不要直接双击 index.html，浏览器不能从 file:// 读取配置文件。

```sh
npm test
npm run build
```

构建结果在 dist/，支持个人站点和 /仓库名/ 项目子路径。

## 发布到 GitHub Pages

1. 建议新建一个专门的公开仓库，例如 duck-lab，把本目录中的所有源文件上传到仓库根目录。保留 .github/ 隐藏目录；不必上传 dist/。
2. 修改 config.json：`owner/repo` 是网站、文章与集中讨论所在仓库，`repositories` 是任务来源白名单（最多 12 个公开仓库，自动包含网站仓库）。`members` 最多 8 位成员，GitHub 用户名用于匹配负责人。
3. 主分支使用 main。在仓库 Settings → Pages → Build and deployment 中，将 Source 设置为 GitHub Actions。
4. 推送 main，或在 Actions 中手动运行 Deploy learning space。工作流会运行测试、构建和部署。部署后的真实地址显示在 Pages 设置和该工作流结果中。
5. 在仓库 Settings → General 中启用 Issues。需要协作时邀请其他成员，让参与者能够编辑任务标签、关闭任务和提交资料。此步骤由仓库所有者在 GitHub 操作。
6. 已登录 gh CLI 后运行 `npm run setup:repositories`，启用集中讨论并同步五个领域标签。需要清理旧标签时使用 `npm run setup:repositories -- --prune`，脚本先备份定义，遇到仍被 Issue 使用的非领域标签会停止，要求先迁移。Actions 的 Setup issue labels 只新增或更新领域标签，默认处理网站仓库；配置具有目标仓库 Issues 写权限的 `GH_REPO_TOKEN` Secret 后可同步全部配置仓库。

GitHub Pages 的可用性与仓库可见性有关；这份无登录读取方案以公开仓库和公开 Issues 为目标。不要上传准备保密的内容。私有仓库读取不属于此版本能力。

## 怎样使用

- 首页查看 MicroDuck 当前阶段、下一步、近期记录与协作状态。
- 看板展示配置仓库内的普通 Issue，无需 `[任务]` 标题前缀或 `task` 标签。小卡片不显示仓库名，详情仍保留完整 `owner/repo#number`。
- 筛选采用 GitHub Issues 风格的搜索框、可搜索菜单和可移除的条件标签。支持 `repo:`、`status:`、`phase:`、`label:`、`author:`、`assignee:`、`is:open`、`is:closed`；例如 `label:rl status:"In progress" phase:train`，可与普通关键词组合。当前每个字段选一个值，多个字段组合匹配。
- “记录与讨论”分成 Markdown 文章和 GitHub Discussions。历史非任务 Issue 继续展示并标记来源，不自动迁移或重复发布。
- 学习路径围绕 MicroDuck 的复现、训练、新能力、优化提升四阶段，展示目标、成果和验收条件。阶段可交叉推进，课程按需选择；任务阶段只从 Project 的 Phase 字段读取。
- 在 GitHub Issue 下评论、@其他成员或发送表情回应。网站显示回应数量并提供直达链接；不会假装在本地已经完成提交。
- 默认读取构建快照，日常浏览不消耗 API 额度。网站仓库的 Issue、Discussion 及评论变动触发部署；其他仓库事件和 Project 字段变动由每 15 分钟的定时构建补齐（GitHub 调度可能延迟），也可手动运行 Deploy learning space 或发送 `github-sync` repository_dispatch。
- “刷新 Issues”使用无令牌 REST API 更新各仓库任务，保留快照中的 Project 字段与 Discussions。它不会即时更新 Project 阶段、状态或讨论，页面会明确说明。
- 网站不会自动提交、自动通知或持续轮询。实时 API 限流或超时会保留最近一次可用的仓库数据；没有数据时明确显示空状态。
- 数量仅来自真实 Issues、Discussions 和 Markdown 文件；路线与候选建议不计为已开展工作。

### 任务如何与看板关联

点击“添加任务”，填写标题并选择仓库、Phase、Status 和领域标签，再到 GitHub 补充目标和验收标准。创建链接携带 `projects=owner/number` 预选 Project（GitHub 账号需要相应权限）；正文只保留版本化的隐藏初始化请求，不重复展示 Phase、Status。隐藏请求仅用于首次初始化，不代表当前字段值，后续以 Project 为准。GitHub 原生创建页不支持通过 URL 预填自定义字段，字段会在提交后由构建工作流写入。即使 GitHub 未预选 Project，自动化也会加入，无需重复手选。首次启用必须先把工作流推送到 main，并保证 GH_PROJECTS_TOKEN 具有 Project 写权限。

网站仓库提交后触发同步，其他仓库由每 15 分钟的定时任务处理。初始化只处理带合法请求的任务；Phase 已设置或条目已归档时跳过，后续在 Project 修改字段会保留。如果字段写入中断，下次运行可重试。只读取配置的公开仓库，每仓库扫描最近更新的 300 条 API 记录；超出上限会警告。旧任务没有初始化请求时不会被修改。

展示阶段与状态仍以 Project 的 `Phase`、`Status` 单选字段为准。关闭 Issue 一律显示 Done；同步完成前或未加入 Project 时显示 Backlog 和“阶段未设置”。初始化请求不直接控制页面分类，旧阶段、状态标签也不参与判断。

| Issue 条件 | 看板状态 |
| --- | --- |
| 关闭 Issue | Done |
| Status 为 In progress | In progress |
| Status 为 Ready | Ready |
| Status 为 Done | Done |
| Status 为 Backlog 或未设置 | Backlog |

任务目标、下一步、验收标准和证据写在 Issue 正文中，分配给 GitHub 用户后显示对应负责人。只保留 `software`、`hardware`、`rl`、`simulation`、`platform` 五个小写领域标签；各仓库使用相同名称、颜色和说明，允许多选。

| 标签 | 主要范围 |
| --- | --- |
| software | 运行控制、推理、通信接口与业务代码 |
| hardware | 机械、电子、装配、供电与标定 |
| rl | 强化学习、观测动作、奖励、训练与策略评估 |
| simulation | 仿真环境、模型、物理参数与仿真验证 |
| platform | Linux 环境、工具链、部署基础设施与学习网站 |

五个领域适合当前规模；训练环境任务可同时标记 rl 与 simulation。文档按其主题分类。只有某个领域中的子主题反复需要单独筛选时，再细分标签。

只展示配置公开仓库的正式 Issue；Draft Issue、PR、私有仓库内容不发布。带旧记录、进展、实验、想法或讨论标记的 Issue 继续作为历史讨论；普通 Issue 归为任务，旧 `[任务]` 前缀仍可兼容显示。

### 接入 GitHub Project

当前接入 [MicroDuck Project #1](https://github.com/users/xuzhuosen/projects/1)，关联网站、microduck、microduck_rl 三个仓库。`Phase` 使用 `01 让鸭子动起来`、`02 理解，再训练`、`03 给鸭子新能力`、`04 让鸭子表现更好`；`Status` 只保留 Backlog、Ready、In progress、Done，网站显示相同英文名称。领域使用仓库标签，阶段与状态使用 Project 字段。

在 config.json 设置：

```json
"project": {
  "owner": "xuzhuosen",
  "ownerType": "user",
  "number": 1,
  "phaseField": "Phase",
  "statusField": "Status"
}
```

编号以实际 Project 为准。Project 必须公开，在网站仓库 Actions Secret 中配置 `GH_PROJECTS_TOKEN`：只读取时需要 `read:project`；启用创建时自动设置字段，需要完整 `project` 权限（或对应的 Project 读写权限）。GitHub 内置 `GITHUB_TOKEN` 可以读取公开 Issues 与 Discussions，不能读取个人 Projects。凭据仅供构建使用，不进入静态网页。首次读取失败会中止构建；存在同一 Project 的历史快照时保留旧字段，并显示原时间与警告。

### 本地更新快照

先安装并登录 GitHub CLI，再运行 `npm run snapshot`。若 gh 不在 PATH，设置 `GH_EXECUTABLE` 为其完整路径；需要代理时，在当前终端设置 `HTTPS_PROXY`。项目授权使用 `gh auth refresh --hostname github.com --scopes project`，不需要将令牌写入仓库。

`npm run project:sync` 预览待初始化任务；`npm run project:sync -- --apply` 执行初始化，然后运行 `npm run snapshot` 更新本地展示。所有字段值都经过校验，Issue 内容只作为数据读取，不作为代码执行。

新讨论通过 Discussions 创建页提交，网站仅提供 Q&A（技术问题与故障排查）、General（日常交流与阶段复盘）、Ideas（实验想法与优化方案）三个类别，默认 General；其他 GitHub 类别不在网站创建入口显示。网站只提供草稿，不代替用户发布。讨论得出明确行动后创建 Issue，相互链接，稳定结论整理为文章。

### 怎样新增记录

点击“新增记录”或实验模板后，网站会打开 GitHub 的新建文件页面并预填 Markdown 模板。记录文件放在 `records/` 下，必须包含 `title` 和 `YYYY-MM-DD` 格式的 `date`；可选填写 `phase`、`tags`、`author` 和 `excerpt`。提交后，下一次 Pages 构建会生成 `data/records.json` 索引并在网站中显示文章入口。

## 内容存在哪里

| 内容 | 位置 |
| --- | --- |
| 空间名、仓库、成员 | config.json |
| 项目、四段路线、课程、候选想法、资料 | data/space.json |
| 学习记录和实验文章 | records/*.md |
| 任务、负责人、评论 | 各代码仓库的 GitHub Issues |
| 学习阶段与任务状态 | GitHub Project 字段 |
| 问答、想法与方案交流 | 网站仓库的 GitHub Discussions |
| 代码、操作手册、较大的原始实验文件 | 仓库文件，或 Issue 中关联的外部资料 |

“工作台设置”保存在**当前浏览器**，便于先试用。要让成员共享设置，保存后下载当前 config.json，再提交到仓库根目录。它不是云同步；网站会明确说明。恢复仓库配置会清除当前路径的本机覆盖。

学习内容不要重复录入：任务交流留在对应 Issue，开放交流留在 Discussions，完整过程和稳定结论整理成 `records/*.md`。任务完成应附验收证据。MicroDuck 结束后保留其 Project 与记录，新目标建立独立 Project；当前版本聚焦一个项目下的多仓库，尚未提供多项目切换。

## 已实现与边界

- 四个一级页面：首页、任务、记录与讨论、学习路径；另有全局搜索、任务负责人和阶段筛选、阶段切换、任务详情。
- Markdown 学习记录与实验模板、文章索引，以及 GitHub 讨论草稿与预填提交页。
- 浏览器无需令牌读取公开 Issues；每仓库最多读取最近更新的 300 条 API 记录（包含 PR，因此实际 Issue 可能少于 300 条）。Discussions 最多 300 条，超出会标记读取上限。
- 构建只读取 config.json 白名单仓库，并逐个确认公开性；Project 也必须公开。任一仓库读取失败会中止构建，保留已部署版本；讨论或 Project 临时失败时可保留对应历史快照并明确警告。
- 桌面与手机布局，键盘焦点、对话框与减少动画偏好。
- 不支持站内 GitHub OAuth、拖动写回看板、私有 Issue、即时聊天、站内附件上传、共享 agent。这些可在后续按实际需求增加。
- 网站显示的是转义后的文本预览，不执行 Issue 中的 HTML；文件与数据库中不保存访问令牌。

## 日常维护

建议每周一次短同步，展示成果、解阻塞、选下一步；每两周一次结对实验。记录包括版本、假设、结果、证据、下一步。每个里程碑结束，把零散记录整理为手册、报告或作品。

修改路线或课程后运行 npm test 和 npm run build。应用代码位于 app.mjs，样式位于 styles.css，GitHub 数据转换位于 lib/core.mjs。

## GitHub 账号需要提供什么

本地开发不需要账号。准备发布时提供公开 GitHub 用户名、希望使用的仓库名和成员称呼即可。仓库创建、邀请协作者、上传和发布需要使用你自己的 GitHub 登录授权；不要把密码或访问令牌发到聊天里。
# robotics-learning-hub
