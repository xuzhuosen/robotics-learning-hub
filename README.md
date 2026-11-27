# Duck Lab

以项目为主线的机器人学习与实验记录网站，当前聚焦 MicroDuck 复刻学习。支持个人使用和多人协作。

## 功能

- **项目概览**：查看当前学习方向、任务进度和近期记录。
- **任务看板**：汇总多个仓库的 GitHub Issues，按仓库、阶段、状态、领域和成员筛选。
- **记录与讨论**：用 Markdown 沉淀学习过程，用 GitHub Discussions 交流问题与想法。
- **学习路径**：围绕复现、训练、新能力、优化提升四个阶段，按实际问题选择课程与资料。

## 使用

### 创建和推进任务

点击“添加任务”，填写标题并选择仓库、Phase、Status 和领域标签，再到 GitHub 补充任务正文并提交。

任务模板包含“目标、操作清单、完成标准、参考资料与前置任务、结果与证据”。同一成果下的连续步骤放进操作清单；可以独立交付或需要单独排查的问题另建 Issue。前置任务使用 `#编号`，跨仓库使用 `owner/repo#编号` 引用。

在 Issue 评论中记录进展和排查过程，使用 Assignees 指定负责人。Phase 和 Status 在 GitHub Project 中维护；任务创建时的选择由同步流程初始化，可能稍后显示。状态使用 Backlog、Ready、In progress、Done，领域标签使用 software、hardware、rl、simulation、platform。完成后补充结果与证据，再关闭 Issue。

### 讨论和记录

点击“发起讨论”，按内容选择 Q&A、General 或 Ideas，在 GitHub 提交。讨论形成明确行动后创建任务并相互链接。

点击“新增记录”或“使用实验模板”，编写并提交 Markdown 文章。完整过程和稳定结论放在文章中，任务里保留链接。[记录格式说明](records/README.md)包含元数据示例。

网站数据随构建更新；“刷新 Issues”仅更新任务内容、标签和关闭状态。工作台设置保存在当前浏览器，需要共享时下载配置并提交到仓库。

## 本地运行

需要 Node.js 20 或更新版本，无需安装依赖。

```sh
npm run dev
```

打开 http://127.0.0.1:4173 。

```sh
npm test
npm run build
```

## 配置与开发

- [配置与部署](docs/setup.md)：仓库接入、GitHub Project、令牌权限、Pages 部署和本地同步。
- [实现说明](docs/architecture.md)：数据来源、任务初始化、同步机制、代码结构与功能边界。
