import { normalizeConfig, issueKey, isTaskIssue } from '../lib/core.mjs';

const pageInfo = 'pageInfo { hasNextPage endCursor }';
const phaseOptions = { start: 'start', train: 'train', expand: 'expand', improve: 'improve', create: 'improve', '01': 'start', '02': 'train', '03': 'expand', '04': 'improve' };
const statusOptions = { backlog: 'backlog', todo: 'backlog', ready: 'ready', 'in progress': 'doing', done: 'done' };

export async function readProject({ github, config }) {
  const setting = config.project;
  const query = `query($owner:String!,$number:Int!,$after:String) {
    ${setting.ownerType}(login:$owner) { projectV2(number:$number) { title url public
      items(first:100,after:$after) { ${pageInfo} nodes { isArchived
        content { ... on Issue { number repository { nameWithOwner isPrivate } } }
        fieldValues(first:50) { nodes { ... on ProjectV2ItemFieldSingleSelectValue { name field { ... on ProjectV2SingleSelectField { name } } } } }
      } }
    } }
  }`;
  const items = new Map();
  let after = null, project;
  do {
    const result = await github.graphql(query, { owner: setting.owner, number: setting.number, after });
    const current = result[setting.ownerType]?.projectV2;
    if (!current || !current.public) throw new Error('只允许展示公开 GitHub Project。');
    project = { title: current.title, url: current.url, config: setting, updatedAt: null };
    for (const item of current.items.nodes) {
      const issue = item.content;
      if (!issue?.repository || issue.repository.isPrivate || item.isArchived) continue;
      const fields = Object.fromEntries(item.fieldValues.nodes.filter(value => value.field).map(value => [value.field.name, value.name]));
      const rawPhase = fields[setting.phaseField] || '';
      const rawStatus = fields[setting.statusField] || '';
      items.set(`${issue.repository.nameWithOwner.toLowerCase()}#${issue.number}`, { phase: phaseOptions[rawPhase.toLowerCase()] || phaseOptions[rawPhase.slice(0, 2)] || null, status: statusOptions[rawStatus.toLowerCase()] || null, rawPhase, rawStatus });
    }
    after = current.items.pageInfo.hasNextPage ? current.items.pageInfo.endCursor : null;
  } while (after);
  return { project, items };
}

export async function readDiscussions({ github, config }) {
  const discussions = [];
  let after = null, categories = [], limited = false;
  for (let page = 0; page < 3; page++) {
    const result = await github.graphql(`query($owner:String!,$repo:String!,$after:String) {
      repository(owner:$owner,name:$repo) { isPrivate hasDiscussionsEnabled
        discussionCategories(first:100) { nodes { name slug } }
        discussions(first:100,after:$after,orderBy:{field:UPDATED_AT,direction:DESC}) { ${pageInfo}
          nodes { number title body url updatedAt closed answer { id } author { login } category { name slug } comments { totalCount } }
        }
      }
    }`, { owner: config.owner, repo: config.repo, after });
    const repository = result.repository;
    if (!repository || repository.isPrivate) throw new Error('Discussions 必须来自公开仓库。');
    if (!repository.hasDiscussionsEnabled) throw new Error('请先在学习网站仓库启用 Discussions。');
    categories = repository.discussionCategories.nodes;
    discussions.push(...repository.discussions.nodes.map(item => ({ number: item.number, title: item.title, body: item.body, html_url: item.url, updated_at: item.updatedAt, state: item.closed ? 'closed' : 'open', answered: Boolean(item.answer), user: { login: item.author?.login }, category: item.category, comments: item.comments.totalCount, repository: `${config.owner}/${config.repo}`, source: 'discussion' })));
    if (!repository.discussions.pageInfo.hasNextPage) break;
    if (page === 2) limited = true;
    after = repository.discussions.pageInfo.endCursor;
  }
  return { discussions, categories, limited };
}

export async function buildIssueSnapshot({ github, config: rawConfig, previous = null, now = () => new Date().toISOString() }) {
  const config = normalizeConfig(rawConfig);
  const snapshot = { repository: `${config.owner}/${config.repo}`, repositories: [], updatedAt: null, limited: false, labels: [], issues: [], project: null, discussionsEnabled: config.discussions.enabled, discussions: [], discussionCategories: [], warnings: [] };
  if (!config.repositories.length) { snapshot.repository = ''; return snapshot; }
  const timestamp = now();
  for (const target of config.repositories) {
    const name = `${target.owner}/${target.repo}`;
    const { data: repository } = await github.rest.repos.get(target);
    if (repository.private !== false) throw new Error(`${name}: this public snapshot workflow requires a public repository.`);
    const { data: labels } = await github.rest.issues.listLabelsForRepo({ ...target, per_page: 100 });
    const source = { repository: name, updatedAt: timestamp, limited: false, labels: labels.map(label => label.name).filter(Boolean).toSorted((a, b) => a.localeCompare(b)) };
    for (let page = 1; page <= 3; page++) {
      const { data: batch } = await github.rest.issues.listForRepo({ ...target, state: 'all', sort: 'updated', direction: 'desc', per_page: 100, page });
      snapshot.issues.push(...batch.filter(item => !item.pull_request).map(item => ({
        repository: name, number: item.number, title: item.title, body: item.body, state: item.state,
        html_url: item.html_url, updated_at: item.updated_at, comments: item.comments,
        user: { login: item.user?.login }, assignees: (item.assignees || []).map(person => ({ login: person.login })),
        labels: (item.labels || []).map(label => typeof label === 'string' ? label : label.name)
      })));
      if (batch.length < 100) break;
      if (page === 3) source.limited = true;
    }
    snapshot.repositories.push(source);
    snapshot.limited ||= source.limited;
  }
  snapshot.labels = snapshot.repositories[0].labels;
  if (config.project) {
    try {
      const { project, items } = await readProject({ github, config });
      snapshot.project = { ...project, updatedAt: timestamp };
      for (const issue of snapshot.issues) {
        const fields = items.get(issueKey(issue).toLowerCase());
        if (fields) issue.project = fields;
      }
      const unset = snapshot.issues.filter(issue => isTaskIssue(issue) && issue.project && (!issue.project.phase || !issue.project.status)).length;
      if (unset) snapshot.warnings.push(`${unset} 项 Project 任务的 Phase 或 Status 未设置或无法识别；请在 Project 中补全。`);
    } catch (error) {
      if (JSON.stringify(previous?.project?.config) !== JSON.stringify(config.project)) throw new Error(`Project 读取失败：${error.message}`);
      snapshot.project = previous.project;
      const previousFields = new Map(previous.issues.map(issue => [issueKey(issue).toLowerCase(), issue.project]));
      for (const issue of snapshot.issues) if (previousFields.get(issueKey(issue).toLowerCase())) issue.project = previousFields.get(issueKey(issue).toLowerCase());
      snapshot.warnings.push(`Project 暂未更新，保留 ${previous.project.updatedAt} 的字段：${error.message}`);
    }
  }
  if (config.discussions.enabled) {
    try {
      const result = await readDiscussions({ github, config });
      snapshot.discussions = result.discussions;
      snapshot.discussionCategories = result.categories;
      snapshot.discussionsUpdatedAt = timestamp;
      snapshot.limited ||= result.limited;
    } catch (error) {
      if (previous?.repository?.toLowerCase() !== snapshot.repository.toLowerCase() || !previous.discussionsUpdatedAt) throw new Error(`Discussions 读取失败：${error.message}`);
      snapshot.discussions = previous.discussions || [];
      snapshot.discussionCategories = previous.discussionCategories || [];
      snapshot.discussionsUpdatedAt = previous.discussionsUpdatedAt;
      snapshot.warnings.push(`Discussions 暂未更新，保留 ${previous.discussionsUpdatedAt} 的讨论：${error.message}`);
    }
  }
  snapshot.issues.sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)));
  snapshot.updatedAt = timestamp;
  return snapshot;
}
