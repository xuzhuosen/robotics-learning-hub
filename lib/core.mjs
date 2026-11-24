export const STATUSES = [
  { id: 'backlog', name: '待选', color: 'gray' },
  { id: 'ready', name: '准备好', color: 'blue' },
  { id: 'doing', name: '进行中', color: 'mint' },
  { id: 'waiting', name: '等待', color: 'amber' },
  { id: 'done', name: '完成', color: 'green' }
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
  const sourceMembers = Array.isArray(raw.members) && raw.members.length ? raw.members.slice(0, 8) : [{ name: '你', focus: '电控 · 硬件 · 调试' }, { name: '伙伴', focus: '仿真 · 软件 · 训练' }];
  const members = sourceMembers.map((member, i) => ({ name: String(member?.name || `成员 ${i + 1}`).slice(0, 30), github: String(member?.github || '').trim().slice(0, 39), focus: String(member?.focus || '待确定').slice(0, 80) }));
  return { siteName: String(raw.siteName || 'Duck Lab').slice(0, 60), owner, repo, members };
}
export function repoUrl(config) { return config.owner && config.repo ? `https://github.com/${config.owner}/${config.repo}` : ''; }
export function safeUrl(value) {
  try { const u = new URL(value); return u.protocol === 'https:' ? u.href : ''; } catch { return ''; }
}
export function issueUrl(config, kind, title = '', body = '', options = {}) {
  const base = repoUrl(config);
  if (!base || !KINDS[kind]) return '';
  const query = new URLSearchParams({ title: `[${KINDS[kind]}] ${title}` });
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
export function issueStatus(issue) {
  if (issue.state === 'closed') return 'done';
  const labels = (issue.labels || []).map(l => typeof l === 'string' ? l : l.name);
  return ['doing', 'waiting', 'ready', 'backlog'].find(s => labels.includes(s)) || 'backlog';
}
export function mergeTasks(planned, issues) {
  const tasks = planned.map(t => ({ ...t, source: 'plan' }));
  const map = new Map(tasks.map(t => [t.id, t]));
  const linked = new Set();
  const ordered = issues.filter(i => !i.pull_request && classifyIssue(i) === 'task')
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
      const phase = labels.map(label => String(label).match(/^phase:(.+)$/i)?.[1]).find(Boolean)
        || String(issue.body || '').match(/<!--\s*phase:([\w-]+)\s*-->/i)?.[1]
        || 'start';
      const tag = labels.find(label => !['task', 'backlog', 'ready', 'doing', 'waiting'].includes(String(label).toLowerCase()) && !/^phase:/i.test(label)) || 'GitHub';
      tasks.push({ id: `#${issue.number}`, title: String(issue.title).replace(/^\[任务\]\s*/, ''), owner: null, phase, tag, description: String(issue.body || '').replace(/<!--.*?-->/gs, '').trim().slice(0, 1500), acceptance: '见关联 Issue。', next: '打开 Issue 查看最新讨论。', ...update });
    }
  }
  return tasks;
}
export function filterTasks(tasks, filters = {}) {
  const query = String(filters.query || '').trim().toLowerCase();
  const wanted = key => String(filters[key] || 'all').toLowerCase();
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
      && (wanted('status') === 'all' || String(task.status).toLowerCase() === wanted('status'))
      && (wanted('phase') === 'all' || String(task.phase).toLowerCase() === wanted('phase'))
      && (wanted('label') === 'all' || labels.includes(wanted('label')))
      && (wanted('author') === 'all' || author === wanted('author'))
      && (wanted('assignee') === 'all' || (wanted('assignee') === 'none' ? assignees.length === 0 : assignees.includes(wanted('assignee'))));
  });
}
export function shortDate(value) {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '' : new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', month: '2-digit', day: '2-digit' }).format(d);
}
