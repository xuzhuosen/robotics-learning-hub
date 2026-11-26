import { STATUSES, DOMAIN_LABELS, KINDS, escapeHtml as e, normalizeConfig, repoUrl, safeUrl, issueUrl, isTaskIssue, mergeTasks, filterTasks, parseTaskQuery, setTaskQueryFilter, recordBody, shortDate, repositoryKey, projectUrl, discussionUrl, snapshotMatches } from './lib/core.mjs';
import { readLiveIssues } from './lib/live.mjs';
import { taskIntakeMarker } from './lib/task-intake.mjs';

const icons = {
  home: '<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1Z"/>',
  roadmap: '<circle cx="5" cy="5" r="2"/><circle cx="19" cy="19" r="2"/><path d="M7 5h7a4 4 0 0 1 0 8h-4a3 3 0 0 0 0 6h7"/>',
  board: '<rect x="3" y="4" width="18" height="16" rx="3"/><path d="M9 4v16m6-16v16M5.5 8h1M11.5 8h1m5 0h1"/>',
  logs: '<path d="M5 3h12a2 2 0 0 1 2 2v16H7a3 3 0 0 1-3-3V4a1 1 0 0 1 1-1Z"/><path d="M4 17h15M8 7h7m-7 4h5"/>',
  activity: '<path d="M5 3h12a2 2 0 0 1 2 2v16H7a3 3 0 0 1-3-3V4a1 1 0 0 1 1-1Z"/><path d="M4 17h15M8 7h7m-7 4h5"/>',
  ideas: '<path d="M9 18h6m-5 3h4M8 13a6 6 0 1 1 8 0c-1 1-1 2-1 3H9c0-1 0-2-1-3Z"/>',
  library: '<path d="M12 6c-3-2-6-2-10-1v14c4-1 7-1 10 1 3-2 6-2 10-1V5c-4-1-7-1-10 1Zm0 0v14"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  arrow: '<path d="M5 12h14m-6-6 6 6-6 6"/>',
  external: '<path d="M14 3h7v7m0-7L11 13M10 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-5"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
  settings: '<path d="m9 3-1 3-3 1-2 4 2 3v4l4 2 3-1 3 1 4-2v-4l2-3-2-4-3-1-1-3Z"/><circle cx="12" cy="12" r="3"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  heart: '<path d="M20 5a5 5 0 0 0-8 1 5 5 0 0 0-8-1c-4 4 0 8 8 14 8-6 12-10 8-14Z"/>',
  chat: '<path d="M21 11a8 8 0 0 1-8 8H7l-5 3 2-6a8 8 0 1 1 17-5Z"/><path d="M8 10h8m-8 4h5"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 2"/>',
  github: '<path d="M9 20c-5 1-5-2-7-3m14 5v-4a4 4 0 0 0-1-3c3 0 6-2 6-6a5 5 0 0 0-1-3c0-1 0-3-1-3-2 0-3 1-4 1a14 14 0 0 0-6 0C8 4 7 3 5 3 4 3 4 5 4 6a5 5 0 0 0-1 3c0 4 3 6 6 6a4 4 0 0 0-1 3v4"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  download: '<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>',
  refresh: '<path d="M20 7v5h-5M4 17v-5h5m-4-5a8 8 0 0 1 14-2l1 2M4 17l1 2a8 8 0 0 0 14-2"/>'
};
const icon = (name, cls = '') => `<svg class="icon ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] || icons.board}</svg>`;
const nav = [['home', '首页'], ['board', '任务'], ['activity', '记录与讨论'], ['roadmap', '学习路径']];
const $ = selector => document.querySelector(selector);
const emptyTaskFilters = () => ({ query: '', status: 'all', phase: 'all', repository: 'all', label: 'all', author: 'all', assignee: 'all' });
const state = { route: 'home', query: '', taskFilters: emptyTaskFilters(), ideaKind: 'all', issues: [], discussions: [], repositories: [], discussionCategories: [], warnings: [], sync: 'idle', syncError: '', limited: false, selectedPhase: 'start', request: 0 };
let config, data, records = [];
let snapshot = null;
let toastTimer;
let draftBeforeSettings = null;
const storageKey = 'duck-lab-config-v1:' + location.pathname;

function toast(message) {
  $('#toast').textContent = message;
  $('#toast').classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $('#toast').classList.remove('visible'), 3500);
}
function download(name, content, type = 'text/markdown;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a'); a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
const button = (action, text, symbol = '', cls = 'button') => `<button class="${cls}" data-action="${action}">${symbol ? icon(symbol) : ''}${text}</button>`;
const external = (url, label, cls = '') => `<a href="${e(safeUrl(url))}" target="_blank" rel="noopener noreferrer" class="${cls}">${e(label)}${icon('external')}</a>`;
const memberName = owner => owner === null || owner === undefined ? '待认领' : config.members[owner]?.name || '待认领';
const avatar = (owner, small = false) => `<span class="avatar ${owner === 1 ? 'lavender' : 'sage'} ${small ? 'small' : ''}" title="${e(memberName(owner))}">${e(memberName(owner).slice(0, 1))}</span>`;
const tasks = () => mergeTasks([], state.issues);
const logs = () => records;
const activity = () => [...state.discussions, ...state.issues.filter(i => !isTaskIssue(i) && !i.pull_request)].sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)));
const statusName = id => STATUSES.find(s => s.id === id)?.name || 'Backlog';

function syncNote() {
  if (!repoUrl(config)) return `<div class="source-note">${icon('github')}<span>尚未连接项目仓库。</span><button data-action="settings">连接 GitHub ${icon('arrow')}</button></div>`;
  const cached = snapshotMatches(snapshot, config);
  const count = `${config.repositories.length} 个仓库 · ${state.issues.length} 条 Issues · ${state.discussions.length} 条 Discussions`;
  const message = state.sync === 'loading' ? '正在读取各仓库的公开 Issues…' : state.sync === 'error' ? `${state.syncError} ${cached ? '保留部署时的数据。' : '当前没有可用快照。'}` : state.sync === 'snapshot' ? `数据截至 ${shortDate(snapshot.updatedAt)} · ${count}` : `Issues 已刷新 · ${count}`;
  const extra = config.project || config.discussions.enabled ? 'Project 字段与 Discussions 随网站构建更新；“刷新 Issues”只更新任务正文、标签和关闭状态。' : 'Phase 与 Status 在 GitHub Project 中设置。';
  return `<div class="source-note ${state.sync === 'error' ? 'warning' : ''}">${icon(state.sync === 'loading' ? 'refresh' : 'github', state.sync === 'loading' ? 'spin' : '')}<span>${e(message)}${state.limited ? '（部分来源已达读取上限）' : ''}<br>${e(extra)}${state.warnings.length ? `<br>${state.warnings.map(e).join('<br>')}` : ''}</span><button data-action="refresh">${icon('refresh')}刷新 Issues</button></div>`;
}

function duckArtwork() {
  return `<svg class="duck-art" viewBox="0 0 420 300" role="img" aria-label="自然站立的 MicroDuck 双足机器人插画"><defs><linearGradient id="shellPaint" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#d8edc4"/><stop offset="1" stop-color="#9bc297"/></linearGradient><linearGradient id="metalPaint" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#55766c"/><stop offset="1" stop-color="#29483f"/></linearGradient></defs><g fill="none" stroke="#75967c" stroke-opacity=".24"><path d="M91 248h250M118 266h198"/><path d="M118 239v18m199-18v18"/></g><ellipse cx="224" cy="257" rx="111" ry="14" fill="#203e32" opacity=".12"/><g stroke="#284a41" stroke-linecap="round" stroke-linejoin="round"><path d="M195 193 177 228" stroke-width="16"/><path d="M177 228 145 247h62" fill="none" stroke-width="17"/><path d="M246 195 258 232" stroke-width="16"/><path d="M258 232 307 246h-61" fill="none" stroke-width="17"/><circle cx="188" cy="209" r="14" fill="#c7dfb7" stroke-width="5"/><circle cx="253" cy="211" r="14" fill="#c7dfb7" stroke-width="5"/><circle cx="188" cy="209" r="4" fill="#6f9577" stroke="none"/><circle cx="253" cy="211" r="4" fill="#6f9577" stroke="none"/><g transform="rotate(2 223 164)"><path d="M174 134 201 116h47l27 18-7 58-25 17h-46l-25-17Z" fill="url(#metalPaint)" stroke-width="4"/><path d="m180 138 27-13h35l25 13-7 45-20 14h-39l-20-14Z" fill="url(#shellPaint)" stroke-width="3"/><path d="M204 126v70m37-69v69" fill="none" stroke="#789c7f" stroke-width="2"/><rect x="207" y="143" width="31" height="29" rx="7" fill="#294b42" stroke-width="3"/><circle cx="222.5" cy="157.5" r="7" fill="#bdddac" stroke="none"/><circle cx="181" cy="162" r="14" fill="#45685e" stroke-width="4"/><circle cx="181" cy="162" r="5" fill="#bdddac" stroke="none"/><circle cx="265" cy="162" r="14" fill="#45685e" stroke-width="4"/><circle cx="265" cy="162" r="5" fill="#bdddac" stroke="none"/><path d="M209 118V94h27v24" fill="#294b42" stroke-width="4"/><circle cx="222.5" cy="99" r="8" fill="#bdddac" stroke-width="4"/></g><g transform="rotate(-5 222 80)"><path d="m175 58 51-14 41 15v36l-40 17-51-17Z" fill="url(#shellPaint)" stroke-width="4"/><path d="m226 44 1 68m0-17 40-15" fill="none" stroke="#789c7f" stroke-width="2"/><path d="m267 69 43 10-2 17-41-1Z" fill="#e7ad61" stroke-width="4"/><circle cx="247" cy="65" r="7" fill="#27473e" stroke="none"/><circle cx="249" cy="63" r="2" fill="#f4f7ee" stroke="none"/><path d="m187 66 21-6m-21 15 21-6" fill="none" stroke="#64876d" stroke-width="4"/></g><path d="M198 181h49" fill="none" stroke="#64876d" stroke-width="4"/></g></svg>`;
}

function renderShell() {
  const allTasks = tasks();
  const done = allTasks.filter(t => t.status === 'done').length;
  const progress = allTasks.length ? done / allTasks.length * 100 : 0;
  $('#app').innerHTML = `<aside class="sidebar"><a class="brand" href="#home"><img src="./assets/duck.svg" width="42" height="42" alt=""><span>${e(config.siteName)}<small>ROBOT LEARNING LOG</small></span></a><nav aria-label="主导航">${nav.map(([id, label]) => `<a href="#${id}" class="nav-link ${state.route === id ? 'active' : ''}" ${state.route === id ? 'aria-current="page"' : ''}>${icon(id)}<span>${label}</span></a>`).join('')}</nav><div class="sidebar-project"><span class="eyebrow">CURRENT PROJECT</span><a href="#board"><span class="project-dot"></span>MicroDuck 复刻 ${icon('arrow')}</a><div class="mini-progress"><i style="width:${progress}%"></i></div><span class="tiny">${allTasks.length ? `${done} / ${allTasks.length} 项任务完成` : '尚无任务'}</span></div><div class="sidebar-bottom"><div class="sidebar-quote">每一小步，都算进步。</div><button class="settings-link" data-action="settings">${icon('settings')} 工作台设置 <span>${icon('arrow')}</span></button><div class="sidebar-foot"><span class="status-dot ${repoUrl(config) ? 'connected' : ''}"></span>${repoUrl(config) ? '已连接 GitHub 仓库' : '起步版 · 等待连接仓库'}</div></div></aside><div class="workspace"><header class="topbar"><div class="breadcrumb"><span>Duck Lab</span><span>/</span><strong>${e(nav.find(n => n[0] === state.route)?.[1] || '首页')}</strong></div><label class="search-box">${icon('search')}<input id="global-search" type="search" placeholder="搜索任务、记录、课程…" aria-label="搜索工作台内容" autocomplete="off"></label><div class="topbar-actions"><button class="icon-button" data-action="settings" aria-label="GitHub 连接设置">${icon('github')}</button></div></header><main id="main" tabindex="-1"></main><footer class="page-footer">学习靠行动，结论靠证据。</footer></div>`;
  renderContent();
}

function pageHeading(kicker, title, description, action = '') {
  return `<div class="page-heading"><div><div class="eyebrow">${kicker}</div><h1>${title}</h1><p>${description}</p></div>${action}</div>`;
}
function sectionHeading(title, sub = '', link = '', href = '') {
  return `<div class="section-heading"><div><h2>${title}</h2>${sub ? `<p>${sub}</p>` : ''}</div>${link ? `<a href="#${href}" class="text-link">${link} ${icon('arrow')}</a>` : ''}</div>`;
}
function emptyState(symbol, title, description, action = '') {
  return `<div class="empty-state"><span class="empty-icon">${icon(symbol)}</span><h3>${title}</h3><p>${description}</p>${action}</div>`;
}
function taskCard(task, compact = false) {
  const publisher = task.issue?.user?.login;
  const phase = data.phases.find(item => item.id === task.phase);
  return `<button class="task-card ${compact ? 'compact' : ''}" data-task="${e(task.id)}"><div class="task-card-heading"><h3>${e(task.title)}</h3><span class="mono tiny">#${e(task.issue?.number || task.id)}</span></div>${task.tag ? `<div class="task-card-tags"><span class="tag green">${e(task.tag)}</span></div>` : ""}<span class="tiny muted">${phase ? `${e(phase.number)} · ${e(phase.name)}` : '阶段未设置'}</span>${publisher ? `<span class="task-publisher">${icon('github')} @${e(publisher)} 发布</span>` : ''}${compact ? '' : `<p>${e(task.next)}</p>`}<div class="task-card-bottom"><span class="task-person">${avatar(task.owner, true)}${e(memberName(task.owner))}</span><span class="task-state"><i class="dot ${task.status}"></i>${statusName(task.status)}</span></div></button>`;
}
const recordUrl = record => `${repoUrl(config)}/blob/main/${String(record.path).split('/').map(encodeURIComponent).join('/')}`;
function recordCard(record) {
  const phase = data.phases.find(item => item.id === (record.phase === 'create' ? 'improve' : record.phase));
  return `<article class="record-card"><div class="record-card-meta"><span>${phase ? `${e(phase.number)} · ${e(phase.name)}` : '学习记录'}</span><time datetime="${e(record.date)}">${e(record.date)}</time></div><h3>${e(record.title)}</h3><p>${e(record.excerpt || '打开文章查看完整记录。')}</p>${record.tags?.length ? `<div class="record-tags">${record.tags.map(tag => `<span>${e(tag)}</span>`).join('')}</div>` : ''}<div class="record-card-bottom"><span>${e(record.author || '仓库成员')}</span>${external(recordUrl(record), '查看文章', 'text-link')}</div></article>`;
}
function homePage() {
  const all = tasks(); const completed = all.filter(t => t.status === 'done').length;
  const ready = all.filter(t => ['ready', 'doing'].includes(t.status)).slice(0, 3);
  const recent = [
    ...logs().map(record => ({ type: 'record', date: record.date, value: record })),
    ...activity().map(issue => ({ type: 'discussion', date: issue.updated_at, value: issue }))
  ].sort((a, b) => String(b.date).localeCompare(String(a.date))).slice(0, 3);
  const date = new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', month: 'long', day: 'numeric', weekday: 'long' }).format(new Date());
  const openDiscussions = activity().filter(issue => issue.state === 'open').length;
  const taskSection = all.length ? `<section>${sectionHeading('现在做什么', '只保留已经准备好或正在推进的任务。', '打开任务看板', 'board')}<div class="focus-note"><span class="tiny-label">本阶段焦点</span>${e(data.project.weeklyFocus)}</div><div class="focus-tasks">${ready.length ? ready.map(t => taskCard(t, true)).join('') : '<p class="muted">暂时没有正在推进的任务。</p>'}</div><div class="milestone-strip"><span class="milestone-icon">${icon('check')}</span><div><strong>阶段完成标准</strong><p>${e(data.project.goal)}</p></div></div></section>` : '';
  const recentPanel = `<aside class="companion-panel"><div class="section-heading"><h2>最近记录与讨论</h2><a class="text-link" href="#activity">查看全部 ${icon('arrow')}</a></div>${recent.length ? `<div class="members">${recent.map(item => { const value = item.value; const url = item.type === 'record' ? recordUrl(value) : safeUrl(value.html_url); const title = item.type === 'record' ? value.title : String(value.title).replace(/^\[(想法|求助|讨论|记录|进展|实验)\]\s*/, ''); return `<a class="member-row" href="${e(url)}" target="_blank" rel="noopener noreferrer"><span class="stat-icon ${item.type === 'record' ? 'violet' : 'orange'}">${icon(item.type === 'record' ? 'logs' : 'chat')}</span><div><strong>${e(title)}</strong><p>${item.type === 'record' ? '记录' : '讨论'} · ${item.type === 'record' ? e(value.date.slice(5).replace('-', '/')) : shortDate(value.updated_at)}</p></div></a>`; }).join('')}</div>` : `<div class="ritual-card"><span class="eyebrow">ACTIVITY</span><h3>从第一篇记录开始。</h3><p>把过程整理成仓库里的 Markdown 文章，之后随时可以查阅。</p>${button('new-record', '写一篇记录', 'plus', 'button')}</div>`}</aside>`;
  return `${pageHeading('CURRENT PROJECT / MICRODUCK', '把 MicroDuck 跑起来，也把过程学明白。', `${e(date)} · 当前阶段：${e(data.project.stage)}`, button('new-record', '新增记录', 'plus', 'button primary'))}<section class="hero"><div class="hero-copy"><div class="hero-label"><span></span> PROJECT / 001</div><h2>MicroDuck<br>复刻计划</h2><p>${e(data.project.description)}</p><a class="button dark" href="#board">查看当前任务 ${icon('arrow')}</a></div>${duckArtwork()}</section><div class="stats-grid"><a href="#board" class="stat-card"><span class="stat-icon mint">${icon('board')}</span><div><span>任务进度</span><strong>${completed}<small> / ${all.length}</small></strong></div><span class="stat-caption">完成以验收为准</span></a><a href="#activity" class="stat-card"><span class="stat-icon violet">${icon('logs')}</span><div><span>学习记录</span><strong>${logs().length}<small> 篇</small></strong></div><span class="stat-caption">Markdown 文章</span></a><a href="#activity" class="stat-card"><span class="stat-icon orange">${icon('ideas')}</span><div><span>开放讨论</span><strong>${openDiscussions}<small> 个</small></strong></div><span class="stat-caption">${config.discussions.enabled ? "Discussions 与历史 Issue" : "GitHub Issues"}</span></a></div><div class="dashboard-grid ${all.length ? '' : 'single'}">${taskSection}${recentPanel}</div><section class="bottom-section">${sectionHeading('MicroDuck 四阶段', '复现、理解、扩展与优化；阶段可以根据实际问题交叉推进。', '查看学习路径', 'roadmap')}<div class="journey-strip">${data.phases.map((p, i) => `<a href="#roadmap" class="journey-step ${i === 0 ? 'current' : ''}" data-phase-link="${p.id}"><span>${p.number}</span><div><strong>${e(p.name)}</strong><small>${e(p.state)}</small></div>${i < 3 ? icon('arrow') : ''}</a>`).join('')}</div></section>${syncNote()}`;
}

function roadmapPage() {
  const selected = data.phases.find(p => p.id === state.selectedPhase) || data.phases[0];
  const projectResources = data.resources.filter(r => r.name.includes('MicroDuck'));
  const referenceResources = data.resources.filter(r => !r.name.includes('MicroDuck') && r.type !== '课程');
  const courses = data.courses.filter(c => c.phase === selected.id);
  return `${pageHeading('LEARN FOR THE PROJECT', '围绕 MicroDuck，完成从复现到优化的学习。', '按问题选择阶段与课程，用可复现的成果验收；不要求严格串行推进。')}<div class="roadmap-tabs" role="tablist" aria-label="学习阶段">${data.phases.map(p => `<button role="tab" id="phase-${p.id}" aria-selected="${p.id === selected.id}" aria-controls="phase-courses" data-phase="${p.id}" class="phase-tab ${p.id === selected.id ? 'active' : ''}"><span class="phase-number">${p.number}</span><strong>${e(p.name)}</strong><small>${e(p.state)}</small></button>`).join('')}</div><section id="phase-courses" role="tabpanel" aria-labelledby="phase-${selected.id}"><div class="phase-summary"><h2>${e(selected.subtitle)}</h2><p>${e(selected.goal)}</p><p>阶段成果：${selected.outputs.map(e).join(" · ")}</p><p>验收条件：${e(selected.gate)}</p></div>${sectionHeading(selected.id === 'start' || selected.id === 'train' ? '当前阶段课程' : '按方向选学', '只有课程能支撑任务或阶段成果时，才进入计划。')}<div class="course-grid">${courses.map(c => `<article class="course-card"><div><span class="tag purple">${e(c.chapter)}</span><span class="tiny muted">${e(c.level)}</span></div><h3>${e(c.name)}</h3><p>${e(c.practice)}</p>${external(c.url, '打开课程', 'text-link')}</article>`).join('') || emptyState('ideas', '先定义项目问题', '这个阶段暂时不预设课程。确定要解决的问题后，再把资料加入计划。', '<a href="#activity" class="button">记录候选方向</a>')}</div></section>${selected.id === 'start' ? `<section class="bottom-section">${sectionHeading('MicroDuck 原始资料', '项目仓库、训练仓库和复刻说明是当前阶段的事实来源。')}<div class="resource-grid">${projectResources.map(resourceCard).join('')}</div></section>` : ''}<section class="bottom-section">${sectionHeading('机器人基础参考', '这些不是必修清单。遇到对应问题时再查阅，避免脱离项目囤课程。')}<div class="resource-grid">${referenceResources.map(resourceCard).join('')}</div></section>${syncNote()}`;
}

function taskFilterBar(all, count) {
  const unique = values => [...new Set(values.filter(Boolean).map(String))].toSorted((a, b) => a.localeCompare(b, 'zh-CN'));
  const labels = DOMAIN_LABELS.map(label => label.name);
  const repositories = config.repositories.map(item => `${item.owner}/${item.repo}`);
  const authors = unique(all.map(task => task.issue?.user?.login));
  const assignees = unique(all.flatMap(task => [task.assigneeLogin, ...(task.issue?.assignees || []).map(person => person?.login)]));
  const assigneeLabel = value => value.startsWith('member:') ? memberName(Number(value.slice(7))) : `@${value}`;
  const { qualifiers } = parseTaskQuery(state.taskFilters.query);
  const groups = [
    ['repository', 'Repository', repositories.map(value => [value, value])],
    ['status', 'Status', STATUSES.map(status => [status.name, status.name])],
    ['phase', 'Phase', [['unassigned', 'No phase'], ...data.phases.map(phase => [phase.id, `${phase.number} · ${phase.name}`])]],
    ['label', 'Labels', labels.map(value => [value, value])],
    ['author', 'Author', authors.map(value => [value, `@${value}`])],
    ['assignee', 'Assignee', [['none', 'Unassigned'], ...assignees.map(value => [value, assigneeLabel(value)])]]
  ];
  const menus = groups.map(([key, title, values]) => {
    const selected = qualifiers[key] || 'all';
    const options = [['all', 'All'], ...values];
    return `<details class="task-filter-menu" data-filter-menu="${key}"><summary id="filter-trigger-${key}">${e(title)}${selected !== 'all' ? '<i class="filter-active-dot"></i>' : ''}<span class="filter-chevron" aria-hidden="true">▾</span></summary><div class="task-filter-popover"><div class="filter-menu-heading">Filter by ${e(title)}</div><label class="filter-menu-search">${icon('search')}<input type="search" data-filter-search="${key}" placeholder="Search ${e(title.toLowerCase())}…" aria-label="Search ${e(title.toLowerCase())}" autocomplete="off"></label><div class="filter-menu-options" role="listbox" aria-label="${e(title)}">${options.map(([value, label]) => `<button type="button" role="option" aria-selected="${value.toLowerCase() === selected.toLowerCase()}" data-task-filter="${key}" data-filter-value="${e(value)}" data-filter-text="${e(label.toLowerCase())}"><span class="filter-check">${value.toLowerCase() === selected.toLowerCase() ? icon('check') : ''}</span><span>${e(label)}</span></button>`).join('')}</div><p class="filter-menu-empty" hidden>No matches</p></div></details>`;
  }).join('');
  const chips = Object.entries(qualifiers).map(([key, value]) => {
    const group = groups.find(item => item[0] === key);
    const label = group?.[2].find(([option]) => option.toLowerCase() === value.toLowerCase())?.[1] || value;
    return `<button type="button" class="task-filter-chip" data-task-filter="${e(key)}" data-filter-value="all" aria-label="Remove ${e(group?.[1] || key)} filter"><span>${e(group?.[1] || key)}: ${e(label)}</span>${icon('close')}</button>`;
  }).join('');
  return `<form class="issue-filter-bar github-filters" id="task-filters" role="search"><div class="filter-head"><label class="task-filter-search">${icon('search')}<input id="task-filter-query" type="text" value="${e(state.taskFilters.query)}" placeholder='Search tasks or type label:rl status:"In progress"' aria-label="Search tasks and filters" aria-describedby="task-query-help" autocomplete="off"></label><span class="filter-count" role="status" aria-live="polite">${count} / ${all.length} tasks</span></div><div class="task-filter-toolbar"><div class="task-filter-menus">${menus}</div>${state.taskFilters.query ? '<button type="button" class="filter-clear" data-action="clear-task-filters">Clear filters</button>' : ''}</div>${chips ? `<div class="task-filter-chips">${chips}</div>` : ''}<p id="task-query-help" class="filter-query-help">Filters: repo: · status: · phase: · label: · author: · assignee:</p></form>`;
}
function boardPage() {
  const all = tasks().map(task => ({ ...task, assigneeLogin: task.issue?.assignees?.[0]?.login || config.members[task.owner]?.github || (task.owner !== null && task.owner !== undefined ? `member:${task.owner}` : '') }));
  const filtered = filterTasks(all, state.taskFilters);
  const filters = taskFilterBar(all, filtered.length);
  const board = `<div class="kanban" aria-label="项目任务看板">${STATUSES.map(s => { const items = filtered.filter(t => t.status === s.id); return `<section class="kanban-column"><h2><i class="dot ${s.id}"></i>${s.name}<span>${items.length}</span></h2><div class="kanban-cards">${items.map(t => taskCard(t)).join('') || '<div class="column-empty">没有符合条件的任务。</div>'}</div></section>`; }).join('')}</div>`;
  const content = all.length
    ? `${filters}${board}`
    : emptyState('board', '还没有真实任务', '通过“添加任务”创建第一个 GitHub Issue。提交后回到这里刷新，任务才会进入看板。', button('new-task', '创建第一个任务', 'plus', 'button primary'));
  return `${pageHeading('SMALL STEPS, REAL PROGRESS', 'MicroDuck 项目看板', '跨仓库推进任务，按学习阶段查看，完成时留下验收证据。', button('new-task', '添加任务', 'plus', 'button primary'))}${config.project ? `<div class="project-link">${external(projectUrl(config), '打开 GitHub Project', 'text-link')}</div>` : ''}${syncNote()}${content}`;
}

function issueCard(issue) {
  const url = safeUrl(issue.html_url);
  return `<article class="issue-card"><div class="issue-top"><span class="tag peach">${issue.source === 'discussion' ? e(issue.category?.name || 'Discussion') : '历史 Issue'}</span><span class="tiny muted">#${issue.number} · ${shortDate(issue.updated_at)}</span></div><span class="task-repository">${e(repositoryKey(issue))}</span><h3>${e(String(issue.title).replace(/^\[(任务|想法|求助|讨论|记录|进展|实验)\]\s*/, ''))}</h3><p class="issue-preview">${e(String(issue.body || '打开 GitHub 查看讨论。').replace(/<!--.*?-->/gs, '').trim().slice(0, 200))}</p><div class="issue-bottom"><span class="tiny muted">${e(issue.user?.login || '成员')} · ${issue.answered ? '已有答案' : issue.state === 'closed' ? '已结束' : '开放讨论'}</span>${external(url, `${issue.comments || 0} 条回应`, 'text-link')}</div></article>`;
}
function resourceCard(resource) {
  return `<article class="resource-card"><div class="resource-logo ${resource.type === '基础' ? 'violet' : 'mint'}">${icon(resource.type === '项目' || resource.type === '源码' ? 'github' : 'library')}</div><div><span class="tiny muted">${e(resource.type)}</span><h3>${e(resource.name)}</h3><p>${e(resource.description)}</p>${external(resource.url, '访问资料', 'text-link')}</div></article>`;
}

function activityPage() {
  const filter = (id, label) => `<button data-kind-filter="${id}" class="${state.ideaKind === id ? 'active' : ''}" aria-pressed="${state.ideaKind === id}">${label}</button>`;
  const showRecords = state.ideaKind === 'all' || state.ideaKind === 'records';
  const showDiscussions = state.ideaKind === 'all' || state.ideaKind === 'discussions';
  const recordSection = showRecords ? `<section class="activity-section">${sectionHeading('记录', '仓库中的 Markdown 文章，适合沉淀过程、实验和结论。')}${logs().length ? `<div class="record-grid">${logs().map(recordCard).join('')}</div>` : emptyState('logs', '还没有文章记录', '在仓库中新增一篇 Markdown 文章，提交后网站会自动建立索引。', button('new-record', '新增记录', 'plus', 'button primary'))}<div class="template-grid compact"><article class="template-card"><span class="template-icon mint">${icon('logs')}</span><h3>学习记录</h3><p>整理过程、关键步骤、卡点和下一步。</p><button class="text-link" data-record-template="record">在 GitHub 中编写 ${icon('arrow')}</button></article><article class="template-card"><span class="template-icon violet">${icon('board')}</span><h3>实验报告</h3><p>保留假设、变量、配置、结果与适用范围。</p><button class="text-link" data-record-template="experiment">使用实验模板 ${icon('arrow')}</button></article></div></section>` : '';
  const discussionSection = showDiscussions ? `<section class="activity-section">${sectionHeading('讨论', '集中讨论问题与方案，同时保留历史讨论 Issue。')}${activity().length ? `<div class="issue-grid">${activity().map(issueCard).join('')}</div>` : emptyState('chat', '还没有讨论', repoUrl(config) ? '提出一个具体问题，或把候选想法带进讨论。' : '连接仓库后，这里会显示项目讨论。', button('help', '发起讨论', 'chat', 'button primary'))}${state.ideaKind === 'all' || state.ideaKind === 'discussions' ? `<section class="bottom-section">${sectionHeading('待讨论的候选想法', '这些是起步建议，不计入已开展工作。确认价值后再转成任务。')}<div class="seed-grid">${data.ideas.map(i => `<article class="seed-card"><span class="tag peach">${e(i.tag)}</span><h3>${e(i.title)}</h3><p>${e(i.description)}</p><div><span class="tiny muted">${e(i.source)}</span><button class="icon-button" data-seed="${i.id}" aria-label="讨论：${e(i.title)}">${icon('arrow')}</button></div></article>`).join('')}</div></section>` : ''}</section>` : '';
  return `${pageHeading('CAPTURE THE PROCESS', '记录用于沉淀，讨论用于交流。', '记录沉淀过程与结论；讨论交流问题与方案，确定行动后再创建任务。', button('new-record', '新增记录', 'plus', 'button primary'))}${syncNote()}<div class="board-toolbar activity-toolbar"><div class="segmented">${filter('all', '全部')}${filter('records', '记录')}${filter('discussions', '讨论')}</div>${button('help', '发起讨论', 'chat', 'button')}</div>${recordSection}${discussionSection}<div class="encouragement"><span>${icon('heart')}</span><div><strong>具体的反馈比打卡更有用。</strong><p>在讨论中指出哪篇记录帮助了你、哪一步还需要补充，让个人积累自然成为共同资产。</p></div></div>`;
}
function searchPage() {
  const q = state.query.toLowerCase();
  const taskResults = tasks().filter(t => JSON.stringify(t).toLowerCase().includes(q));
  const recordResults = logs().filter(record => JSON.stringify(record).toLowerCase().includes(q));
  const resources = [...data.resources, ...data.courses].filter(r => JSON.stringify(r).toLowerCase().includes(q));
  const ideas = data.ideas.filter(i => JSON.stringify(i).toLowerCase().includes(q));
  const issues = activity().filter(i => `${i.title} ${i.body || ''}`.toLowerCase().includes(q));
  const count = taskResults.length + recordResults.length + resources.length + ideas.length + issues.length;
  return `${pageHeading('FIND THE NEXT CONNECTION', '搜索工作台', `“${e(state.query)}” · 找到 ${count} 条结果`)}${!count ? emptyState('search', '暂时没有匹配的内容', '试试“标定”“PPO”“实验”或“版本”。') : ''}${taskResults.length ? sectionHeading('任务') + `<div class="search-task-grid">${taskResults.map(t => taskCard(t)).join('')}</div>` : ''}${recordResults.length ? sectionHeading('记录文章') + `<div class="record-grid">${recordResults.map(recordCard).join('')}</div>` : ''}${resources.length ? sectionHeading('课程与资料') + `<div class="search-links">${resources.map(r => `<div>${external(r.url, r.name, 'text-link')}<p>${e(r.description || r.practice)}</p></div>`).join('')}</div>` : ''}${ideas.length ? sectionHeading('起步想法') + ideas.map(i => `<button class="search-idea" data-seed="${i.id}">${e(i.title)} ${icon('arrow')}</button>`).join('') : ''}${issues.length ? sectionHeading('GitHub 讨论') + `<div class="issue-grid">${issues.map(issueCard).join('')}</div>` : ''}`;
}

function renderContent() {
  const pages = { home: homePage, roadmap: roadmapPage, board: boardPage, activity: activityPage };
  $('#main').innerHTML = state.query ? searchPage() : (pages[state.route] || homePage)();
}
function route() {
  const aliases = { logs: 'activity', ideas: 'activity', library: 'roadmap' };
  const id = aliases[location.hash.slice(1)] || location.hash.slice(1);
  state.route = nav.some(n => n[0] === id) ? id : 'home';
  state.query = ''; renderShell();
  document.title = `${nav.find(n => n[0] === state.route)[1]} · ${config.siteName}`;
  $('#main').focus({ preventScroll: true });
  window.scrollTo({ top: 0 });
}
function openModal(content, wide = false) {
  const modal = $('#modal'); modal.className = wide ? 'wide-dialog' : '';
  modal.innerHTML = `<button class="modal-close icon-button" data-action="close-modal" aria-label="关闭对话框">${icon('close')}</button><div class="modal-content">${content}</div>`;
  if (!modal.open) modal.showModal();
}
function settings() {
  openModal(`<div class="eyebrow">MAKE IT YOURS</div><h2 id="modal-title">连接项目仓库</h2><p class="modal-description">学习网站仓库保存记录与集中讨论；任务可以来自下面的多个公开仓库。</p><form id="settings-form">
    <label>工作台名称<input name="siteName" value="${e(config.siteName)}" maxlength="60" required></label>
    <div class="form-row"><label>网站所属用户 / 组织<input name="owner" value="${e(config.owner)}" autocomplete="off"></label><label>网站仓库名<input name="repo" value="${e(config.repo)}" autocomplete="off"></label></div>
    <label>任务仓库（每行 owner/repo，网站仓库自动包含）<textarea class="repository-input" name="repositories" rows="4">${e(config.repositories.map(item => `${item.owner}/${item.repo}`).join('\n'))}</textarea></label>
    <fieldset><legend>GitHub Project（选填）</legend><div class="form-row"><label>所属账号<input name="projectOwner" value="${e(config.project?.owner || config.owner)}"></label><label>Project 编号<input name="projectNumber" type="number" min="1" value="${config.project?.number || ''}"></label></div><label>账号类型<select name="projectOwnerType"><option value="user">个人</option><option value="organization" ${config.project?.ownerType === 'organization' ? 'selected' : ''}>组织</option></select></label><p class="tiny muted">使用 Phase、Status 单选字段。配置提交并构建后生效。</p></fieldset>
    <label>讨论来源<select name="discussionsEnabled"><option value="true">GitHub Discussions（保留历史讨论 Issue）</option><option value="false" ${!config.discussions.enabled ? 'selected' : ''}>GitHub Issues</option></select></label>
    <div class="form-row">${config.members.map((m, i) => `<fieldset><legend>成员 ${i + 1}</legend><label>称呼<input name="member${i}" value="${e(m.name)}" maxlength="30" required></label><label>GitHub 用户名（选填）<input name="github${i}" value="${e(m.github)}" maxlength="39"></label></fieldset>`).join('')}</div>
    <p class="form-error" id="settings-error" role="alert"></p><div class="modal-note">保存仅对当前浏览器有效。下载 config.json 并提交到仓库后共享。网页不接收密码或令牌；Project 和 Discussions 由构建流程读取。</div><div class="modal-actions"><button type="button" data-action="download-config" class="button">${icon('download')}下载当前配置</button><button class="button primary" type="submit">保存本机设置 ${icon('check')}</button></div><button type="button" class="reset-link" data-action="reset-settings">恢复仓库文件中的配置</button></form>`);
}
function discussion(input = {}) {
  const body = input.body || recordBody('help', input);
  const discussionOptions = [
    { slug: 'q-a', name: 'Q&A', description: '技术问题与故障排查' },
    { slug: 'general', name: 'General', description: '日常交流与阶段复盘' },
    { slug: 'ideas', name: 'Ideas', description: '实验想法与优化方案' }
  ].filter(option => !state.discussionCategories.length || state.discussionCategories.some(item => item.slug === option.slug));
  const defaultCategory = discussionOptions.find(option => option.slug === 'general')?.slug || discussionOptions[0]?.slug;
  const categories = config.discussions.enabled && discussionOptions.length ? `<label>讨论类别<select name="category">${discussionOptions.map(item => `<option value="${e(item.slug)}" ${item.slug === defaultCategory ? 'selected' : ''}>${e(item.name)} · ${e(item.description)}</option>`).join('')}</select></label>` : '';
  openModal(`<div class="eyebrow">GITHUB DISCUSSION</div><h2 id="modal-title">发起一次讨论</h2><p class="modal-description">先整理问题，再到 GitHub ${config.discussions.enabled ? 'Discussions' : 'Issues'} 中提交和交流。有明确行动后，创建任务 Issue 并互相链接。</p><form id="record-form"><input type="hidden" name="kind" value="help">${categories}<label>标题<input name="title" value="${e(input.title || '')}" placeholder="例如：IMU 姿态为什么与预期相反？" maxlength="150" required></label><label>讨论背景<textarea name="body" rows="10" required>${e(body)}</textarea></label><p class="form-error" id="record-error" role="alert"></p><div class="modal-actions"><button type="button" class="button" data-action="download-record">${icon('download')}下载草稿</button><button class="button primary" type="submit">${icon('github')}${repoUrl(config) ? '到 GitHub 发起讨论' : '连接仓库并继续'}</button></div></form>`);
}
function newRecord(template = 'record', input = {}) {
  if (!repoUrl(config)) { draftBeforeSettings = { type: 'article', template, input }; settings(); return; }
  const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const phase = input.phase || state.selectedPhase || data.phases[0].id;
  const common = `---\ntitle: 在这里填写标题\ndate: ${date}\nphase: ${phase}\ntags: []\nauthor: ${config.owner || ''}\nexcerpt: 用一句话概括这篇记录。\n---\n\n# 在这里填写标题\n\n`;
  const sections = template === 'experiment'
    ? `## 假设\n\n## 环境与配置\n\n## 变量与评价指标\n\n## 过程与原始证据\n\n## 结果与适用范围\n\n## 下一项验证\n`
    : `## 背景\n\n## 过程\n\n## 关键发现\n\n## 卡点与下一步\n`;
  const task = input.task ? `\n关联任务：${input.task}\n` : '';
  const query = new URLSearchParams({ filename: `records/${date}-${template === 'experiment' ? 'experiment' : 'record'}.md`, value: common + task + sections });
  window.open(`${repoUrl(config)}/new/main?${query}`, '_blank', 'noopener,noreferrer');
  toast('请在 GitHub 中完成文章并提交；部署完成后会出现在“记录”中。');
}
function newTask(repository = '') {
  if (!repoUrl(config)) { draftBeforeSettings = { type: 'task' }; settings(); return; }
  repository ||= `${config.owner}/${config.repo}`;
  const labels = DOMAIN_LABELS.map(label => label.name);
  const labelOptions = labels.length
    ? `<fieldset class="task-label-fieldset"><legend>标签（可多选）</legend><div class="task-label-options">${labels.map(label => `<label><input type="checkbox" name="labels" value="${e(label)}"><span>${e(label)}</span></label>`).join('')}</div></fieldset>`
    : '<p class="modal-note">当前仓库没有其他可选标签；进入 GitHub 后仍可添加。</p>';
  const fields = config.project ? `<div class="form-row"><label>Phase<select name="phase" required>${data.phases.map(phase => `<option value="${e(phase.id)}" ${phase.id === state.selectedPhase ? 'selected' : ''}>${e(phase.number)} · ${e(phase.name)}</option>`).join('')}</select></label><label>Status<select name="status" required>${STATUSES.map(status => `<option value="${e(status.name)}">${e(status.name)}</option>`).join('')}</select></label></div>` : '';
  openModal(`<div class="eyebrow">NEW GITHUB ISSUE</div><h2 id="modal-title">添加一项任务</h2><p class="modal-description">填写标题，选择仓库、阶段、状态与领域，随后在 GitHub 补充目标和验收标准。</p><form id="task-form"><label>标题<input name="title" placeholder="例如：完成 IMU 标定并验证姿态方向" maxlength="150" required></label><label>所属仓库<select name="repository" required>${config.repositories.map(item => { const key = `${item.owner}/${item.repo}`; return `<option value="${e(key)}" ${key === repository ? 'selected' : ''}>${e(key)}</option>`; }).join('')}</select></label>${fields}${labelOptions}<p class="form-error" id="task-form-error" role="alert"></p><div class="modal-actions"><button class="button primary" type="submit">${icon('github')}到 GitHub 填写任务</button></div></form>`);
}
function taskDetail(id) {
  const task = tasks().find(t => t.id === id); if (!task) return;
  const publisher = task.issue?.user?.login;
  openModal(`<div class="eyebrow">MICRODUCK / ${e(task.id)}</div><h2 id="modal-title">${e(task.title)}</h2><div class="detail-meta">${task.tag ? `<span class="tag green">${e(task.tag)}</span>` : ""}<span class="pill">${statusName(task.status)}</span><span class="task-person">${avatar(task.owner, true)}${e(memberName(task.owner))}</span>${publisher ? `<span class="github-publisher">${icon('github')} @${e(publisher)} 发布</span>` : ''}</div><p class="detail-description">${e(task.description)}</p><div class="detail-block"><h3>下一步</h3><p>${e(task.next)}</p></div><div class="detail-block"><h3>怎样算完成</h3><p>${e(task.acceptance)}</p></div><p class="modal-note">${task.issue ? (task.issue.project ? '阶段与状态来自 GitHub Project 的 Phase、Status 字段；完成后关闭 Issue。' : '此任务尚未加入 Project。加入后设置 Phase 与 Status，完成后关闭 Issue。') : '这是起步计划。创建带有任务编号的 Issue 后，网站会读取发布者和状态。建议分工可在 data/space.json 修改。'}</p><div class="modal-actions">${task.issue ? external(task.issue.html_url, '打开任务与讨论', 'button primary') : `<button class="button primary" data-create-task="${e(task.id)}">${icon('github')}创建关联 Issue</button>`}<button class="button" data-task-record="${e(task.id)}">${icon('logs')}为此任务写记录</button></div>`);
}
function ritual() {
  openModal(`<div class="eyebrow">OUR WORKING AGREEMENT</div><h2 id="modal-title">异地，也能一起推进。</h2><div class="handbook"><h3>一人主责，一人复现</h3><p>每人同时主责一项任务。里程碑结束时，伙伴按记录复现，再补齐遗漏步骤。</p><h3>每次收工，留两分钟</h3><p>写下本次完成、证据、卡点、下一步和需要怎样帮助。忙的一周不补打卡，从下一步接着做。</p><h3>每周短同步，每两周一起动手</h3><p>建议每周约 25 分钟看成果、解阻塞、选下一步；每两周约一次较长联调。时间由你们共同约定。</p><h3>远程结对实验</h3><p>现场操作员负责实物动作和停止运动，远程观察员看日志、核对步骤、记录结果。没有硬件的一方可独立推进仿真和分析。</p><h3>遇到问题，分清证据与猜测</h3><p>带上版本、复现步骤、预期、实际结果和已尝试的方法。来回两三轮仍不清楚，就约一次语音。</p><h3>说出具体的感谢</h3><p>回顾时各说一项“对方做的事情怎样帮到了我”。奖励共同成果，不比较学习时长。</p></div><div class="modal-actions">${button('close-modal', '记住了', 'check', 'button primary')}</div>`);
}
function reproduce() {
  openModal(`<div class="eyebrow">A REPRODUCIBLE RESULT</div><h2 id="modal-title">给未来的自己，留一条回来的路。</h2><div class="handbook"><h3>1. 固定实验条件</h3><p>记录主板、舵机、镜像、代码提交、模型、配置、测试地面与电量等相关条件。</p><h3>2. 写下执行步骤</h3><p>从什么状态开始，运行什么命令，期望看到什么；不要依赖记忆里的临时修改。</p><h3>3. 保留原始证据</h3><p>视频、日志、曲线和配置使用同一实验编号。说明假设、改变的变量和评价指标。</p><h3>4. 留下停止与恢复方式</h3><p>怎样停止当前运行，怎样回到已验证的配置；每个成功里程碑都留一个恢复点。</p><h3>5. 让伙伴试一次</h3><p>先区分“观察到的现象”和“推测的原因”，保留失败结果与适用范围。</p></div><div class="modal-actions">${button('experiment', '用模板记录实验', 'plus', 'button primary')}</div>`);
}

async function syncIssues(live = false) {
  const request = ++state.request;
  state.issues = []; state.discussions = []; state.repositories = []; state.discussionCategories = []; state.warnings = []; state.syncError = ''; state.limited = false;
  if (!repoUrl(config)) { state.sync = 'idle'; renderShell(); return; }
  const matchingSnapshot = snapshotMatches(snapshot, config);
  const mapOwners = issues => issues.map(issue => {
    const found = config.members.findIndex(m => m.github && (issue.assignees || []).some(a => a.login?.toLowerCase() === m.github.toLowerCase()));
    return { ...issue, matchedOwner: found < 0 ? null : found };
  });
  if (matchingSnapshot) {
    state.issues = mapOwners(snapshot.issues);
    state.repositories = snapshot.repositories || [{ repository: snapshot.repository, labels: snapshot.labels || [] }];
    state.discussions = snapshot.discussions || [];
    state.discussionCategories = snapshot.discussionCategories || [];
    state.warnings = snapshot.warnings || [];
    state.limited = snapshot.limited;
    if (!live) { state.sync = 'snapshot'; renderShell(); return; }
  }
  state.sync = 'loading'; renderShell();
  const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), 20000);
  try {
    const result = await readLiveIssues(config, { signal: controller.signal, snapshot: matchingSnapshot ? snapshot : null });
    if (request !== state.request) return;
    state.issues = mapOwners(result.issues);
    state.repositories = result.repositories;
    state.limited = result.limited || (matchingSnapshot && snapshot.limited);
    if (!matchingSnapshot && (config.project || config.discussions.enabled)) state.warnings.push('当前设置尚无构建快照。请提交 config.json 并构建网站，或直接在 GitHub 查看 Project 与 Discussions。');
    state.sync = 'success';
  } catch (error) {
    if (request !== state.request) return;
    state.sync = 'error'; state.syncError = error.name === 'AbortError' ? '读取超时，请检查网络后重试。' : error.message;
  } finally { clearTimeout(timeout); if (request === state.request) renderShell(); }
}

document.addEventListener('click', event => {
  for (const menu of document.querySelectorAll('.task-filter-menu[open]')) if (!menu.contains(event.target)) menu.open = false;
  const target = event.target.closest('button, a'); if (!target) return;
  if (target.dataset.taskFilter) {
    state.taskFilters.query = setTaskQueryFilter(state.taskFilters.query, target.dataset.taskFilter, target.dataset.filterValue);
    renderContent(); $(`#filter-trigger-${target.dataset.taskFilter}`)?.focus(); return;
  }
  if (target.classList.contains('skip-link')) { event.preventDefault(); $('#main')?.focus(); return; }
  if (target.dataset.phaseLink) state.selectedPhase = target.dataset.phaseLink;
  if (target.tagName === 'A' && nav.some(n => target.getAttribute('href') === `#${n[0]}`) && target.getAttribute('href') === `#${state.route}`) { event.preventDefault(); route(); return; }
  if (target.dataset.task) return taskDetail(target.dataset.task);
  if (target.dataset.phase) { state.selectedPhase = target.dataset.phase; renderContent(); $(`#phase-${state.selectedPhase}`)?.focus(); return; }
  if (target.dataset.kindFilter) { state.ideaKind = target.dataset.kindFilter; renderContent(); return; }
  if (target.dataset.recordTemplate) return newRecord(target.dataset.recordTemplate);
  if (target.dataset.recordKind) return newRecord(target.dataset.recordKind === 'experiment' ? 'experiment' : 'record');
  if (target.dataset.seed) { const idea = data.ideas.find(i => i.id === target.dataset.seed); return discussion({ title: idea.title, body: recordBody('help') + `\n### 起步建议\n${idea.description}\n` }); }
  if (target.dataset.createTask) {
    return newTask();
  }
  if (target.dataset.taskRecord) return newRecord('record', { task: target.dataset.taskRecord });
  const action = target.dataset.action;
  if (action === 'close-modal') { $('#modal').close(); draftBeforeSettings = null; }
  if (action === 'settings') { draftBeforeSettings = null; settings(); }
  if (action === 'record' || action === 'new-record') newRecord();
  if (action === 'idea' || action === 'help') discussion();
  if (action === 'experiment') newRecord('experiment');
  if (action === 'new-task') newTask();
  if (action === 'ritual') ritual();
  if (action === 'reproduce') reproduce();
  if (action === 'refresh') syncIssues(true);
  if (action === 'clear-task-filters') { state.taskFilters = emptyTaskFilters(); renderContent(); }
  if (action === 'download-config') { download('config.json', JSON.stringify(config, null, 2) + '\n', 'application/json'); toast('已下载当前已保存配置；提交到仓库后两人共享。'); }
  if (action === 'download-record') {
    const form = $('#record-form'); const values = new FormData(form);
    download(`${String(values.get('title') || '探索记录').replace(/[<>:"/\\|?*]/g, '-').slice(0, 80)}.md`, `# [${KINDS[values.get('kind')]}] ${values.get('title') || '未命名记录'}\n\n${values.get('body')}`);
    toast('已下载 Markdown；文件尚未同步到共同仓库。');
  }
  if (action === 'reset-settings') {
    try { localStorage.removeItem(storageKey); } catch {}
    normalizeConfigFromFile().then(() => { $('#modal').close(); syncIssues(); toast('已恢复仓库文件中的配置。'); }).catch(error => { $('#settings-error').textContent = error.message; });
  }
});
document.addEventListener('input', event => {
  if (event.target.id === 'global-search') { state.query = event.target.value.trim(); renderContent(); }
  if (event.target.id === 'task-filter-query') {
    if (event.isComposing) return;
    const { selectionStart, selectionEnd } = event.target;
    state.taskFilters.query = event.target.value;
    renderContent(); const input = $('#task-filter-query'); input?.focus(); input?.setSelectionRange(selectionStart, selectionEnd);
  }
  if (event.target.dataset.filterSearch) {
    const menu = event.target.closest('.task-filter-menu');
    const query = event.target.value.toLowerCase();
    let found = false;
    for (const option of menu.querySelectorAll('[data-filter-value]')) { option.hidden = !option.dataset.filterText.includes(query); found ||= !option.hidden; }
    menu.querySelector('.filter-menu-empty').hidden = found;
  }
});
document.addEventListener('toggle', event => {
  if (!event.target.matches('.task-filter-menu') || !event.target.open) return;
  for (const menu of document.querySelectorAll('.task-filter-menu[open]')) if (menu !== event.target) menu.open = false;
  event.target.querySelector('input')?.focus();
}, true);
document.addEventListener('submit', event => {
  if (event.target.id === 'task-filters') { event.preventDefault(); return; }
  if (event.target.id === 'settings-form') {
    event.preventDefault(); const values = new FormData(event.target);
    try {
      const next = normalizeConfig({ ...config, siteName: values.get('siteName'), owner: values.get('owner'), repo: values.get('repo'), repositories: String(values.get('repositories')).split(/\r?\n/).map(value => value.trim()).filter(Boolean), project: values.get('projectNumber') ? { ...config.project, owner: values.get('projectOwner'), number: Number(values.get('projectNumber')), ownerType: values.get('projectOwnerType') } : null, discussions: { enabled: values.get('discussionsEnabled') === 'true' }, members: config.members.map((member, i) => ({ ...member, name: values.get(`member${i}`), github: values.get(`github${i}`) })) });
      try { localStorage.setItem(storageKey, JSON.stringify(next)); } catch { throw new Error('当前浏览器不允许保存本机设置。请修改仓库中的 config.json。'); }
      config = next; const pending = draftBeforeSettings; draftBeforeSettings = null;
      $('#modal').close(); syncIssues(); toast('已保存本机设置。共享给伙伴请下载配置并提交到仓库。');
      if (pending?.type === 'article') newRecord(pending.template, pending.input);
      if (pending?.type === 'task') newTask();
      if (pending?.type === 'discussion') discussion(pending.input);
    } catch (error) { $('#settings-error').textContent = error.message; }
  }
  if (event.target.id === 'task-form') {
    event.preventDefault();
    const values = new FormData(event.target);
    const title = String(values.get('title') || '').trim();
    if (!title) { $('#task-form-error').textContent = '请填写任务标题。'; return; }
    const repository = String(values.get('repository'));
    const labels = values.getAll('labels').map(String).filter(name => DOMAIN_LABELS.some(label => label.name === name));
    let intake = '';
    if (config.project) {
      try { intake = taskIntakeMarker(String(values.get('phase')), String(values.get('status'))); }
      catch (error) { $('#task-form-error').textContent = error.message; return; }
    }
    const body = `${intake ? `${intake}\n\n` : ''}${recordBody('task')}`;
    const url = issueUrl(config, 'task', title, body, { labels, repository });
    if (!url) { $('#task-form-error').textContent = '请选择已配置的项目仓库。'; return; }
    window.open(url, '_blank', 'noopener,noreferrer');
    toast('请在 GitHub 中补充任务内容，确认后提交。');
  }
  if (event.target.id === 'record-form') {
    event.preventDefault(); const values = new FormData(event.target);
    const draft = { kind: values.get('kind'), title: String(values.get('title')).trim(), body: String(values.get('body')).trim() };
    if (!draft.title || !draft.body) { $('#record-error').textContent = '请填写标题和内容。'; return; }
    if (!repoUrl(config)) { draftBeforeSettings = { type: 'discussion', input: draft }; settings(); return; }
    const url = config.discussions.enabled ? discussionUrl(config, draft.title, draft.body, String(values.get('category') || '')) : issueUrl(config, draft.kind, draft.title, draft.body);
    if (url.length > 7500) { $('#record-error').textContent = '内容较长，请下载 Markdown，再到 GitHub 上传或粘贴，避免链接长度限制。'; return; }
    window.open(url, '_blank', 'noopener,noreferrer');
    toast('请在打开的 GitHub 页面检查并提交；提交后回来刷新。');
  }
});
$('#modal').addEventListener('click', event => {
  if (event.target === $('#modal')) {
    const rect = $('#modal').getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) { $('#modal').close(); draftBeforeSettings = null; }
  }
});
document.addEventListener('keydown', event => {
  const menu = event.target.closest('.task-filter-menu');
  if (menu?.open) {
    if (event.key === 'Escape') { event.preventDefault(); menu.open = false; menu.querySelector('summary').focus(); return; }
    if (['ArrowDown', 'ArrowUp'].includes(event.key)) {
      event.preventDefault();
      const options = [...menu.querySelectorAll('[role="option"]')].filter(option => !option.hidden);
      const current = options.indexOf(event.target);
      const next = current < 0 ? (event.key === 'ArrowDown' ? 0 : options.length - 1) : (current + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length;
      options[next]?.focus(); return;
    }
  }
  if (event.target.matches('[role="tab"]') && ['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
    event.preventDefault();
    const index = data.phases.findIndex(p => p.id === state.selectedPhase);
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? data.phases.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + data.phases.length) % data.phases.length;
    state.selectedPhase = data.phases[next].id; renderContent(); $(`#phase-${state.selectedPhase}`).focus();
  }
});
window.addEventListener('hashchange', route);
async function normalizeConfigFromFile() {
  const response = await fetch('./config.json', { cache: 'no-store' });
  if (!response.ok) throw new Error('无法读取 config.json');
  config = normalizeConfig(await response.json());
}
async function boot() {
  try {
    await normalizeConfigFromFile();
    let saved; try { saved = localStorage.getItem(storageKey); } catch {}
      if (saved) {
        try {
          const overrides = JSON.parse(saved);
          const sameHub = `${overrides.owner}/${overrides.repo}`.toLowerCase() === `${config.owner}/${config.repo}`.toLowerCase();
          config = normalizeConfig(!overrides.repositories && sameHub ? { ...config, ...overrides } : overrides);
        } catch { toast('本机配置已失效，已使用仓库配置。'); }
      }
    const [response, recordsResponse] = await Promise.all([fetch('./data/space.json'), fetch('./data/records.json', { cache: 'no-store' })]);
    if (!response.ok) throw new Error('无法读取学习计划。');
    data = await response.json();
    records = recordsResponse.ok ? await recordsResponse.json() : [];
    try { const savedSnapshot = await fetch('./data/issue-snapshot.json', { cache: 'no-store' }); if (savedSnapshot.ok) snapshot = await savedSnapshot.json(); } catch {}
    route(); if (repoUrl(config)) syncIssues();
  } catch (error) {
    $('#app').innerHTML = `<div class="fatal-error"><img src="./assets/duck.svg" width="64" height="64" alt=""><h1>学习空间暂时没有打开</h1><p>${e(error.message)}</p><p>请通过本地服务或 GitHub Pages 访问；直接双击 HTML 无法读取数据文件。</p><button class="button primary" id="retry-boot">重新加载</button></div>`;
    $('#retry-boot').addEventListener('click', () => location.reload());
  }
}
boot();
