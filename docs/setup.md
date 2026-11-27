# 配置与部署

## 环境与配置文件

需要 Node.js 20 或更新版本，无第三方前端依赖，无需运行 `npm install`。

仓库根目录的 `config.json` 是共享配置来源：

| 字段 | 用途 |
| --- | --- |
| `siteName` | 网站名称 |
| `owner` / `repo` | 网站、Markdown 记录和集中讨论所在仓库 |
| `repositories` | 任务来源白名单，最多 12 个公开仓库；自动包含网站仓库 |
| `project` | Project 所属账号、类型、编号和字段名称 |
| `discussions.enabled` | 是否读取和创建 GitHub Discussions |
| `members` | 最多 8 位成员；`github` 用于匹配任务负责人 |

浏览器中的“工作台设置”只保存于当前浏览器及站点路径。要共享设置，下载当前 `config.json` 并提交到仓库根目录。恢复仓库配置会清除当前路径的本机覆盖。

当前配置关联 `xuzhuosen/robotics-learning-hub`、`xuzhuosen/microduck` 和 `xuzhuosen/microduck_rl`，使用 [MicroDuck Project #1](https://github.com/users/xuzhuosen/projects/1)。

## 接入 GitHub Project

在 `config.json` 中设置：

```json
"project": {
  "owner": "xuzhuosen",
  "ownerType": "user",
  "number": 1,
  "phaseField": "Phase",
  "statusField": "Status"
}
```

账号和编号按实际 Project 修改；组织 Project 使用 `ownerType: "organization"`。Project 必须公开。

- `Phase` 使用单选字段，对应复现、训练、新能力、优化提升四个阶段。
- `Status` 使用单选字段，选项为 `Backlog`、`Ready`、`In progress`、`Done`。
- 领域使用仓库标签，负责人使用 Issue Assignees；正文不重复记录这些字段。

在网站仓库 Settings → Secrets and variables → Actions 中配置：

| Secret | 权限与用途 |
| --- | --- |
| `GH_PROJECTS_TOKEN` | 仅构建读取 Project 时需要 `read:project`；初始化任务字段需要完整 `project` 权限，或对应的 Project 读写权限 |
| `GH_REPO_TOKEN`（可选） | Setup issue labels 工作流同步全部配置仓库时，需要目标仓库的 Issues 写权限 |

内置 `GITHUB_TOKEN` 用于读取公开 Issues 和 Discussions，不能读取个人 Projects。凭据仅供构建使用，不进入静态网页。令牌的账号还必须能够访问目标 Project。

## 初始化仓库

在各仓库启用 Issues，在网站仓库启用 Discussions。需要协作时邀请成员，并授予相应的任务编辑权限。

安装并登录 GitHub CLI 后运行：

```sh
npm run setup:repositories
```

脚本启用集中讨论，并为配置仓库同步五个小写领域标签：

| 标签 | 范围 |
| --- | --- |
| `software` | 运行控制、推理、通信接口与业务代码 |
| `hardware` | 机械、电子、装配、供电与标定 |
| `rl` | 强化学习、观测动作、奖励、训练与策略评估 |
| `simulation` | 仿真环境、模型、物理参数与仿真验证 |
| `platform` | Linux 环境、工具链、部署基础设施与学习网站 |

标签允许多选，文档按主题归类。需要清理旧标签时运行 `npm run setup:repositories -- --prune`；脚本先备份定义，仍被 Issue 使用的非领域标签需要先迁移。

Actions 中的 Setup issue labels 默认只新增或更新网站仓库的领域标签；配置 `GH_REPO_TOKEN` 后同步全部配置仓库。

## 部署到 GitHub Pages

1. 使用公开仓库，源文件放在仓库根目录，保留 `.github/`；不必上传 `dist/`。
2. 修改 `config.json`，完成仓库和 Project 配置。
3. 使用 `main` 分支，在 Settings → Pages → Build and deployment 中将 Source 设为 GitHub Actions。
4. 推送到 `main`，或在 Actions 中手动运行 Deploy learning space。工作流运行测试、初始化任务字段、获取快照、构建并部署。
5. 在 Pages 设置或工作流结果中查看实际访问地址。

构建输出为 `dist/`，支持个人站点和 `/仓库名/` 项目子路径。不要直接双击 `index.html`；浏览器无法通过 `file://` 正常读取配置。

首次启用任务 Phase、Status 自动初始化，需要先推送对应工作流并配置具有 Project 写权限的 `GH_PROJECTS_TOKEN`。通过 GitHub 原生任务模板创建的 Issue 没有初始化请求，需要手动在 Project 中设置字段。

## 本地同步

安装并登录 GitHub CLI，然后按需授权：

```sh
gh auth refresh --hostname github.com --scopes project
npm run snapshot
```

如果 `gh` 不在 PATH，设置 `GH_EXECUTABLE` 为完整路径；需要代理时，在当前终端设置 `HTTPS_PROXY`。不需要将令牌写入仓库。

初始化任务字段时，先预览再执行：

```sh
npm run project:sync
npm run project:sync -- --apply
npm run snapshot
```

`project:sync` 默认只预览；`--apply` 才会写入 Project。`snapshot` 更新本地展示数据，不部署网站。
