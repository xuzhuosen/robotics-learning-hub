export const STATUSES = [
  { id: 'backlog', name: 'Backlog', color: 'gray' },
  { id: 'ready', name: 'Ready', color: 'blue' },
  { id: 'doing', name: 'In progress', color: 'mint' },
  { id: 'done', name: 'Done', color: 'green' }
];
export const DOMAIN_LABELS = [
  { name: 'software', color: '8BAE6E', description: '运行控制、接口与软件开发' },
  { name: 'hardware', color: 'A3B8CC', description: '机械、电子、装配与标定' },
  { name: 'rl', color: 'CDBDE2', description: '强化学习、策略训练与评估' },
  { name: 'simulation', color: 'B7D6A0', description: '仿真环境、模型与验证' },
  { name: 'platform', color: 'E7C99E', description: '系统环境、工具链与学习网站' }
];
export const KINDS = { task: '任务', progress: '记录', idea: '想法', help: '讨论', experiment: '实验' };
export function escapeHtml(value = '') {
  return String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
export function normalizeConfig(value = {}) {
  const raw = value && typeof value === 'object' ? value : {};
  const owner = String(raw.owner || '').trim();
  const repo = String(raw.repo || '').trim();
  if (owner && !/^[a-z\d](?:[a-z\d-]{0,37}[a-z\d])?$/i.test(owner)) throw new Error('GitHub 用户或组织名格式不正确。');
  if (repo && (!/^[a-z\d_.-]{1,100}$/i.test(repo) || /^\.{1,2}$/.test(repo))) throw new Error('仓库名格式不正确。');
  if (Boolean(owner) !== Boolean(repo)) throw new Error('请同时填写 GitHub 用户名和仓库名，或同时留空。');
  const repositories = [];
  for (const entry of [{ owner, repo }, ...(Array.isArray(raw.repositories) ? raw.repositories : [])]) {
    const identity = typeof entry === 'string' ? entry.trim().split('/') : [entry?.owner, entry?.repo];
    const [repositoryOwner, repositoryName] = identity.map(part => String(part || '').trim());
    if (!repositoryOwner && !repositoryName) continue;
    if (identity.length !== 2 || !/^[a-z\d](?:[a-z\d-]{0,37}[a-z\d])?$/i.test(repositoryOwner) || !/^[a-z\d_.-]{1,100}$/i.test(repositoryName) || /^\.{1,2}$/.test(repositoryName)) throw new Error('仓库列表请使用 owner/repo 格式。');
    if (!repositories.some(item => `${item.owner}/${item.repo}`.toLowerCase() === `${repositoryOwner}/${repositoryName}`.toLowerCase())) repositories.push({ owner: repositoryOwner, repo: repositoryName });
  }
  if (repositories.length > 12) throw new Error('一个项目最多配置 12 个仓库。');
  let project = null;
  if (raw.project?.number) {
    const projectOwner = String(raw.project.owner || owner).trim();
    if (!/^[a-z\d](?:[a-z\d-]{0,37}[a-z\d])?$/i.test(projectOwner) || !Number.isSafeInteger(Number(raw.project.number)) || Number(raw.project.number) < 1) throw new Error('Project 所属账号或编号不正确。');
    project = { owner: projectOwner, number: Number(raw.project.number), ownerType: raw.project.ownerType === 'organization' ? 'organization' : 'user', phaseField: String(raw.project.phaseField || 'Phase'), statusField: String(raw.project.statusField || 'Status') };
  }
  const sourceMembers = Array.isArray(raw.members) && raw.members.length ? raw.members.slice(0, 8) : [{ name: '你', focus: '电控 · 硬件 · 调试' }, { name: '伙伴', focus: '仿真 · 软件 · 训练' }];
  const members = sourceMembers.map((member, i) => ({ name: String(member?.name || `成员 ${i + 1}`).slice(0, 30), github: String(member?.github || '').trim().slice(0, 39), focus: String(member?.focus || '待确定').slice(0, 80) }));
  return { siteName: String(raw.siteName || 'Duck Lab').slice(0, 60), owner, repo, repositories, project, discussions: { enabled: raw.discussions?.enabled === true }, members };
}
export const repositoryKey = value => typeof value?.repository === 'string' ? value.repository : String(value?.html_url || '').match(/^https:\/\/github\.com\/([^/]+\/[^/]+)\//i)?.[1] || '';
export const issueKey = issue => `${repositoryKey(issue)}#${issue.number}`;
export const projectUrl = config => config.project ? `https://github.com/${config.project.ownerType === 'organization' ? 'orgs' : 'users'}/${config.project.owner}/projects/${config.project.number}` : '';
export const discussionUrl = (config, title = '', body = '', category = '') => {
  if (!repoUrl(config)) return '';
  const query = new URLSearchParams({ title, body });
  if (category) query.set('category', category);
  return `${repoUrl(config)}/discussions/new?${query}`;
};
export function snapshotMatches(snapshot, config) {
  if (!snapshot?.updatedAt || !Array.isArray(snapshot.issues)) return false;
  const actual = (snapshot.repositories || (snapshot.repository ? [{ repository: snapshot.repository }] : [])).map(item => item.repository.toLowerCase()).sort();
  const expected = config.repositories.map(item => `${item.owner}/${item.repo}`.toLowerCase()).sort();
  return JSON.stringify(actual) === JSON.stringify(expected) && JSON.stringify(snapshot.project?.config || null) === JSON.stringify(config.project) && Boolean(snapshot.discussionsEnabled) === config.discussions.enabled;
}
export function repoUrl(config) { return config.owner && config.repo ? `https://github.com/${config.owner}/${config.repo}` : ''; }
export function safeUrl(value) {
  try { const u = new URL(value); return u.protocol === 'https:' ? u.href : ''; } catch { return ''; }
}
export function issueUrl(config, kind, title = '', body = '', options = {}) {
  const target = options.repository ? config.repositories?.find(item => `${item.owner}/${item.repo}`.toLowerCase() === String(options.repository).toLowerCase()) : config;
  const base = target ? repoUrl(target) : '';
  if (!base || !KINDS[kind]) return '';
  const query = new URLSearchParams({ title: kind === 'task' ? title : `[${KINDS[kind]}] ${title}` });
  if (kind === 'task' && config.project) query.set('projects', `${config.project.owner}/${config.project.number}`);
  if (body) query.set('body', body);
  const labels = Array.isArray(options.labels) ? options.labels.map(String).map(label => label.trim()).filter(Boolean) : [];
  if (labels.length) query.set('labels', [...new Set(labels)].join(','));
  return `${base}/issues/new?${query}`;
}
export function recordBody(kind, input = {}) {
  const intro = `关联项目：MicroDuck 复刻\n关联任务：${input.task || '待补充'}\n\n`;
  const fields = {
    progress: ['本次完成', '证据链接（代码 / 视频 / 日志）', '当前卡点', '下一步', '需要对方怎样帮助'],
    idea: ['想法是什么', '解决什么问题', '与当前项目的关系', '最小验证方式与成本', '现在做 / 以后做 / 待讨论'],
    help: ['要讨论的问题', '相关背景与版本', '观察到的现象', '已经尝试或思考过什么', '当前判断', '希望得到什么反馈'],
    experiment: ['假设', '硬件 / 软件 / 配置版本', '基线与改变的变量', '评价指标与测试条件', '停止条件与恢复方式', '数据 / 视频 / 配置链接', '结果与适用范围', '下一项验证'],
    task: ['目标', '下一步', '验收标准', '阻塞与依赖']
  };
  return intro + (fields[kind] || fields.progress).map(f => `### ${f}\n${f === '下一步' && input.next ? input.next : '待填写'}\n`).join('\n');
}
export function classifyIssue(issue) {
  const title = String(issue.title || '');
  const labels = (issue.labels || []).map(l => typeof l === 'string' ? l : l.name);
  for (const [kind, name] of Object.entries(KINDS)) {
    if (title.startsWith(`[${name}]`) || (kind === 'progress' && title.startsWith('[进展]')) || (kind === 'help' && title.startsWith('[求助]')) || labels.includes(kind)) return kind;
  }
  return 'help';
}
export function isTaskIssue(issue) {
  if (issue.pull_request) return false;
  if (classifyIssue(issue) === 'task') return true;
  const labels = (issue.labels || []).map(label => typeof label === 'string' ? label : label.name);
  const legacyDiscussion = /^\[(记录|进展|实验|想法|求助|讨论)\]/.test(String(issue.title || '')) || labels.some(label => ['progress', 'experiment', 'idea', 'help'].includes(label));
  return !legacyDiscussion;
}
export function issueStatus(issue) {
  if (issue.state === 'closed') return 'done';
  if (issue.project) return STATUSES.some(status => status.id === issue.project.status) ? issue.project.status : 'backlog';
  return 'backlog';
}
export function mergeTasks(planned, issues) {
  const tasks = planned.map(t => ({ ...t, source: 'plan' }));
  const map = new Map(tasks.map(t => [t.id, t]));
  const linked = new Set();
  const ordered = issues.filter(isTaskIssue)
    .toSorted((a, b) => (Date.parse(b.updated_at) || 0) - (Date.parse(a.updated_at) || 0) || b.number - a.number);
  for (const issue of ordered) {
    const match = String(issue.title).match(/\bT\d{2}\b/i)?.[0].toUpperCase();
    if (match && map.has(match) && linked.has(match)) continue;
    const original = map.get(match);
    const update = { status: issueStatus(issue), issue, source: 'github' };
    if (issue.matchedOwner !== null && issue.matchedOwner !== undefined) update.owner = issue.matchedOwner;
    if (original) { Object.assign(original, update); linked.add(match); }
    else {
      const labels = (issue.labels || []).map(label => typeof label === 'string' ? label : label?.name).filter(Boolean);
      const phase = issue.project?.phase || 'unassigned';
      const tag = labels.find(label => DOMAIN_LABELS.some(domain => domain.name === label)) || '';
      tasks.push({ id: issueKey(issue), repository: repositoryKey(issue), title: String(issue.title).replace(/^\[任务\]\s*/, ''), owner: null, phase, tag, description: String(issue.body || '').replace(/<!--.*?-->/gs, '').trim().slice(0, 1500), acceptance: '见关联 Issue。', next: '打开 Issue 查看最新讨论。', ...update });
    }
  }
  return tasks;
}
const queryAliases = { repo: 'repository', status: 'status', phase: 'phase', label: 'label', author: 'author', assignee: 'assignee', is: 'state' };
const queryPattern = () => /\b(repo|status|phase|label|author|assignee|is):(?:"([^"]*)"|(\S+))/gi;
export function parseTaskQuery(value = '') {
  const qualifiers = {};
  const query = String(value).replace(queryPattern(), (match, key, quoted, plain) => {
    qualifiers[queryAliases[key.toLowerCase()]] = quoted ?? plain;
    return ' ';
  }).trim().replace(/\s+/g, ' ');
  return { query, qualifiers };
}
export function setTaskQueryFilter(query, key, value) {
  const name = Object.keys(queryAliases).find(alias => queryAliases[alias] === key);
  if (!name) return query;
  const remaining = String(query).replace(queryPattern(), (match, alias) => alias.toLowerCase() === name ? '' : match).trim().replace(/\s+/g, ' ');
  if (!value || value === 'all') return remaining;
  const text = String(value).replaceAll('"', '');
  return `${remaining}${remaining ? ' ' : ''}${name}:${/\s/.test(text) ? `"${text}"` : text}`;
}
export function filterTasks(tasks, filters = {}) {
  const parsed = parseTaskQuery(filters.query);
  const query = parsed.query.toLowerCase();
  const wanted = key => String(parsed.qualifiers[key] || filters[key] || 'all').toLowerCase().replace(/^@/, '');
  const status = STATUSES.find(item => item.name.toLowerCase() === wanted('status'))?.id || wanted('status');
  return tasks.filter(task => {
    const issue = task.issue || {};
    const labels = [task.tag, ...(issue.labels || []).map(label => typeof label === 'string' ? label : label?.name)]
      .filter(Boolean).map(label => String(label).toLowerCase());
    const author = String(issue.user?.login || '').toLowerCase();
    const assignees = [task.assigneeLogin, ...(issue.assignees || []).map(person => person?.login)]
      .filter(Boolean).map(login => String(login).toLowerCase());
    const haystack = [task.id, task.title, task.description, task.next, issue.number, issue.body, author, ...labels, ...assignees]
      .filter(Boolean).join(' ').toLowerCase();
    return (!query || haystack.includes(query))
      && (status === 'all' || String(task.status).toLowerCase() === status)
      && (wanted('state') === 'all' || (wanted('state') === 'open' ? issue.state !== 'closed' : wanted('state') === 'closed' && issue.state === 'closed'))
      && (wanted('phase') === 'all' || String(task.phase).toLowerCase() === wanted('phase'))
      && (wanted('repository') === 'all' || String(task.repository || repositoryKey(issue)).toLowerCase() === wanted('repository'))
      && (wanted('label') === 'all' || labels.includes(wanted('label')))
      && (wanted('author') === 'all' || author === wanted('author'))
      && (wanted('assignee') === 'all' || (wanted('assignee') === 'none' ? assignees.length === 0 : assignees.includes(wanted('assignee'))));
  });
}
export function shortDate(value) {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '' : new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', month: '2-digit', day: '2-digit' }).format(d);
}
