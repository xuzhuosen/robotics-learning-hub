import { STATUSES, KINDS, escapeHtml as e, normalizeConfig, repoUrl, safeUrl, issueUrl, classifyIssue, mergeTasks, filterTasks, recordBody, shortDate } from './lib/core.mjs';

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
const emptyTaskFilters = () => ({ query: '', status: 'all', phase: 'all', label: 'all', author: 'all', assignee: 'all' });
const state = { route: 'home', query: '', taskFilters: emptyTaskFilters(), ideaKind: 'all', issues: [], sync: 'idle', syncError: '', limited: false, selectedPhase: 'start', request: 0 };
let config, data;
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
const tasks = () => mergeTasks(data.tasks, state.issues);
const logs = () => state.issues.filter(i => ['progress', 'experiment'].includes(classifyIssue(i)));
const activity = () => state.issues.filter(i => ['progress', 'experiment', 'idea', 'help'].includes(classifyIssue(i)));
const statusName = id => STATUSES.find(s => s.id === id)?.name || '待选';

function syncNote() {
  if (!repoUrl(config)) return `<div class="source-note">${icon('github')}<span>当前是起步计划，尚未连接共同仓库。进度以实际记录为准。</span><button data-action="settings">连接 GitHub ${icon('arrow')}</button></div>`;
  if (state.sync === 'loading') return `<div class="source-note">${icon('refresh', 'spin')}<span>正在读取 ${e(config.owner)}/${e(config.repo)} 的公开 Issues…</span></div>`;
  if (state.sync === 'error') return `<div class="source-note warning">${icon('chat')}<span>${e(state.syncError)} ${snapshot?.updatedAt && snapshot.repository?.toLowerCase() === `${config.owner}/${config.repo}`.toLowerCase() ? '现使用发布时的数据快照。' : '现展示仓库文件中的起步计划。'}</span><button data-action="refresh">重试</button></div>`;
  if (state.sync === 'snapshot') return `<div class="source-note">${icon('github')}<span>发布快照 · ${shortDate(snapshot.updatedAt)} · ${state.issues.length} 条 Issues${state.limited ? '（已达读取上限）' : ''}。新讨论发布后更新，也可手动读取最新数据。</span><button data-action="refresh">${icon('refresh')}刷新最新</button></div>`;
  return `<div class="source-note">${icon('github')}<span>已读取 ${state.issues.length} 条公开 Issues${state.limited ? '（只展示最近更新的 300 条）' : ''}。任务状态来自 Issue；刚提交后可刷新。</span><button data-action="refresh">${icon('refresh')} 刷新</button></div>`;
}

function duckArtwork() {
  return `<svg class="duck-art" viewBox="0 0 420 300" role="img" aria-label="薄荷绿色的 MicroDuck 风格机器人插画"><defs><linearGradient id="bodyPaint" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#d6edbc"/><stop offset="1" stop-color="#8dbb91"/></linearGradient><linearGradient id="darkPaint"><stop stop-color="#54736b"/><stop offset="1" stop-color="#304f48"/></linearGradient><pattern id="floor" width="30" height="20" patternUnits="userSpaceOnUse"><path d="M30 0H0v20" fill="none" stroke="#87aa96" stroke-opacity=".18"/></pattern></defs><ellipse cx="231" cy="263" rx="121" ry="20" fill="#203e32" opacity=".13"/><path d="m60 235 160-70 180 70-160 65Z" fill="url(#floor)"/><g transform="rotate(-5 232 164)"><path d="m186 190-6 38 27 8 13-39m31-5 9 40 25-8-7-40" fill="url(#darkPaint)" stroke="#203e37" stroke-width="3"/><circle cx="193" cy="220" r="12" fill="#a9c1a9" stroke="#304f48" stroke-width="5"/><circle cx="270" cy="217" r="12" fill="#a9c1a9" stroke="#304f48" stroke-width="5"/><path d="m179 228-31 17v13h67v-17Zm82-2-12 18v12h65v-13l-30-17" fill="#b9d8aa" stroke="#304f48" stroke-width="3"/><path d="M179 131q42-24 93 0l14 43-13 29-74 3-29-31Z" fill="url(#bodyPaint)" stroke="#304f48" stroke-width="3"/><path d="m181 134 19 43 73-3 10-4" fill="none" stroke="#799f83" stroke-width="2"/><path d="m198 184 57-1" stroke="#496f5a" stroke-width="4" stroke-linecap="round"/><circle cx="182" cy="167" r="17" fill="#52766a" stroke="#304f48" stroke-width="3"/><circle cx="182" cy="167" r="7" fill="#bdd6ad"/><path d="m224 130 6-43 26-2 3 45" fill="url(#darkPaint)" stroke="#304f48" stroke-width="3"/><circle cx="243" cy="111" r="12" fill="#c7dabb" stroke="#304f48" stroke-width="4"/><path d="m209 54 56-13 27 18-3 35-66 7-19-19Z" fill="url(#bodyPaint)" stroke="#304f48" stroke-width="3"/><path d="m265 41-5 40-37 20m37-20 29-2" fill="none" stroke="#7a9f83" stroke-width="2"/><path d="m286 72 34 9-2 12-30 2" fill="#e8b46b" stroke="#304f48" stroke-width="3"/><circle cx="273" cy="64" r="6" fill="#253f36"/><circle cx="274" cy="62" r="1.5" fill="white"/><path d="m218 65 22-5m-21 12 19-5" stroke="#567961" stroke-width="3" stroke-linecap="round"/><circle cx="202" cy="141" r="3" fill="#486b54"/><circle cx="265" cy="143" r="3" fill="#486b54"/><circle cx="208" cy="192" r="3" fill="#486b54"/></g><g fill="none" stroke="#688f73" stroke-width="1"><path d="M155 111h-35v24"/><circle cx="155" cy="111" r="3" fill="#bddbaf"/><path d="m311 159 30-20h32"/><circle cx="311" cy="159" r="3" fill="#bddbaf"/></g><text x="86" y="101" fill="#5d7c65" font-size="10" font-family="monospace">HELLO, WORLD.</text><text x="318" y="132" fill="#5d7c65" font-size="10" font-family="monospace">BUILD TOGETHER</text></svg>`;
}

function renderShell() {
  const done = tasks().filter(t => t.status === 'done').length;
  $('#app').innerHTML = `<aside class="sidebar"><a class="brand" href="#home"><img src="./assets/duck.svg" width="42" height="42" alt=""><span>${e(config.siteName)}<small>ROBOT LEARNING LOG</small></span></a><div class="workspace-label">学习工作台 <span>01</span></div><nav aria-label="主导航">${nav.map(([id, label]) => `<a href="#${id}" class="nav-link ${state.route === id ? 'active' : ''}" ${state.route === id ? 'aria-current="page"' : ''}>${icon(id)}<span>${label}</span>${id === 'activity' ? '<span class="nav-count">' + (data.ideas.length + activity().length) + '</span>' : ''}</a>`).join('')}</nav><div class="sidebar-project"><span class="eyebrow">CURRENT PROJECT</span><a href="#board"><span class="project-dot"></span>MicroDuck 复刻 ${icon('arrow')}</a><div class="mini-progress"><i style="width:${done / tasks().length * 100}%"></i></div><span class="tiny">${done} / ${tasks().length} 项任务完成</span></div><div class="sidebar-bottom"><div class="sidebar-quote">以项目带动学习，<br>让过程留下证据。</div><button class="settings-link" data-action="settings">${icon('settings')} 工作台设置 <span>${icon('arrow')}</span></button><div class="sidebar-foot"><span class="status-dot ${repoUrl(config) ? 'connected' : ''}"></span>${repoUrl(config) ? '已连接 GitHub 仓库' : '起步版 · 等待连接仓库'}</div></div></aside><div class="workspace"><header class="topbar"><div class="breadcrumb"><span>Duck Lab</span><span>/</span><strong>${e(nav.find(n => n[0] === state.route)?.[1] || '首页')}</strong></div><label class="search-box">${icon('search')}<input id="global-search" type="search" placeholder="搜索任务、记录、课程…" aria-label="搜索工作台内容" autocomplete="off"></label><div class="topbar-actions"><button class="icon-button" data-action="settings" aria-label="GitHub 连接设置">${icon('github')}</button><div class="avatar-stack">${config.members.map((_, i) => avatar(i)).join('')}</div></div></header><main id="main" tabindex="-1"></main><footer class="page-footer"><span>学习靠行动，结论靠证据。</span><span>GitHub 驱动 · 无数据库 <span class="footer-spark">✳</span></span></footer></div>`;
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
  return `<button class="task-card ${compact ? 'compact' : ''}" data-task="${e(task.id)}"><div class="task-card-top"><span class="tag ${task.tag === '学习' ? 'purple' : task.tag === '协作' ? 'peach' : 'green'}">${e(task.tag)}</span><span class="mono tiny">${e(task.id)}</span></div><h3>${e(task.title)}</h3>${publisher ? `<span class="task-publisher">${icon('github')} @${e(publisher)} 发布</span>` : ''}${compact ? '' : `<p>${e(task.next)}</p>`}<div class="task-card-bottom"><span class="task-person">${avatar(task.owner, true)}${e(memberName(task.owner))}</span><span class="task-state"><i class="dot ${task.status}"></i>${statusName(task.status)}</span></div></button>`;
}
function homePage() {
  const all = tasks(); const completed = all.filter(t => t.status === 'done').length;
  const ready = all.filter(t => ['ready', 'doing', 'waiting'].includes(t.status)).slice(0, 3);
  const recent = activity().slice().sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at))).slice(0, 3);
  const date = new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', month: 'long', day: 'numeric', weekday: 'long' }).format(new Date());
  return `${pageHeading('CURRENT PROJECT / MICRODUCK', '把 MicroDuck 跑起来，也把过程学明白。', `${e(date)} · 当前阶段：${e(data.project.stage)}`, button('record', '记录一次进展', 'plus', 'button primary'))}<section class="hero"><div class="hero-copy"><div class="hero-label"><span></span> PROJECT / 001</div><h2>MicroDuck<br>复刻计划</h2><p>${e(data.project.description)}</p><a class="button dark" href="#board">查看当前任务 ${icon('arrow')}</a><div class="hero-note"><span class="status-dot"></span>本阶段：${e(data.project.weeklyFocus)}</div></div>${duckArtwork()}<span class="hero-stamp">MICRODUCK<br><b>BUILD · LEARN · RECORD</b></span></section><div class="stats-grid"><a href="#board" class="stat-card"><span class="stat-icon mint">${icon('board')}</span><div><span>任务进度</span><strong>${completed}<small> / ${all.length}</small></strong></div><span class="stat-caption">完成以验收为准</span></a><a href="#activity" class="stat-card"><span class="stat-icon violet">${icon('logs')}</span><div><span>过程记录</span><strong>${logs().length}<small> 篇</small></strong></div><span class="stat-caption">进展与实验</span></a><a href="#activity" class="stat-card"><span class="stat-icon orange">${icon('ideas')}</span><div><span>开放讨论</span><strong>${data.ideas.length + state.issues.filter(i => ['idea', 'help'].includes(classifyIssue(i)) && i.state === 'open').length}<small> 个</small></strong></div><span class="stat-caption">想法与求助</span></a></div><div class="dashboard-grid"><section>${sectionHeading('现在做什么', '只保留已经准备好或正在推进的任务。', '打开任务看板', 'board')}<div class="focus-note"><span class="tiny-label">本阶段焦点</span>${e(data.project.weeklyFocus)}</div><div class="focus-tasks">${ready.length ? ready.map(t => taskCard(t, true)).join('') : '<p class="muted">暂时没有准备好的任务，去看板选择下一步。</p>'}</div><div class="milestone-strip"><span class="milestone-icon">${icon('check')}</span><div><strong>阶段完成标准</strong><p>${e(data.project.goal)}</p></div></div></section><aside class="companion-panel"><div class="section-heading"><h2>最近记录与讨论</h2><a class="text-link" href="#activity">查看全部 ${icon('arrow')}</a></div>${recent.length ? `<div class="members">${recent.map(i => `<a class="member-row" href="${e(safeUrl(i.html_url))}" target="_blank" rel="noopener noreferrer"><span class="stat-icon ${classifyIssue(i) === 'help' ? 'orange' : 'violet'}">${icon(classifyIssue(i) === 'idea' ? 'ideas' : classifyIssue(i) === 'help' ? 'chat' : 'logs')}</span><div><strong>${e(String(i.title).replace(/^\[(想法|求助|进展|实验)\]\s*/, ''))}</strong><p>${e(KINDS[classifyIssue(i)])} · ${shortDate(i.updated_at)}</p></div></a>`).join('')}</div>` : `<div class="ritual-card"><span class="eyebrow">ACTIVITY</span><h3>从第一条真实记录开始。</h3><p>写下完成了什么、证据在哪里，以及下一步。</p>${button('record', '写一条记录', 'plus', 'button')}</div>`}<div class="ritual-card"><span class="eyebrow">COLLABORATION</span><h3>${config.members.length > 1 ? `${config.members.length} 位成员，共用一套项目记录。` : '需要时邀请其他成员参与。'}</h3><p>任务可认领，记录可评论，阶段成果由他人复现。</p><button class="text-link" data-action="ritual">查看协作约定 ${icon('arrow')}</button></div></aside></div><section class="bottom-section">${sectionHeading('MicroDuck 之后', '当前项目决定近期课程；长期路线只保留方向，不提前堆满任务。', '查看学习路径', 'roadmap')}<div class="journey-strip">${data.phases.map((p, i) => `<a href="#roadmap" class="journey-step ${i === 0 ? 'current' : ''}" data-phase-link="${p.id}"><span>${p.number}</span><div><strong>${e(p.name)}</strong><small>${e(p.state)}</small></div>${i < 3 ? icon('arrow') : ''}</a>`).join('')}</div></section>${syncNote()}`;
}

function roadmapPage() {
  const selected = data.phases.find(p => p.id === state.selectedPhase) || data.phases[0];
  const projectResources = data.resources.filter(r => r.name.includes('MicroDuck'));
  const referenceResources = data.resources.filter(r => !r.name.includes('MicroDuck') && r.type !== '课程');
  const courses = data.courses.filter(c => c.phase === selected.id);
  return `${pageHeading('LEARN FOR THE PROJECT', '当前项目决定学什么，长期路线决定往哪走。', 'MicroDuck 阶段只安排能解决当前问题的课程；机器人领域的其他方向保留为后续选择。')}<div class="roadmap-tabs" role="tablist" aria-label="学习阶段">${data.phases.map(p => `<button role="tab" id="phase-${p.id}" aria-selected="${p.id === selected.id}" aria-controls="phase-detail" data-phase="${p.id}" class="phase-tab ${p.id === selected.id ? 'active' : ''}"><span class="phase-number">${p.number}</span><strong>${e(p.name)}</strong><small>${e(p.state)}</small></button>`).join('')}</div><section id="phase-detail" class="phase-detail" role="tabpanel" aria-labelledby="phase-${selected.id}"><div class="phase-summary"><span class="eyebrow">PHASE ${selected.number} / ${e(selected.subtitle)}</span><h2>${e(selected.name)}</h2><p>${e(selected.goal)}</p><div class="skill-tags">${selected.skills.map(s => `<span>${e(s)}</span>`).join('')}</div></div><div class="phase-deliverables"><h3>留下这些成果</h3>${selected.outputs.map(o => `<div>${icon('check')} ${e(o)}</div>`).join('')}<p class="gate"><strong>阶段验收</strong>${e(selected.gate)}</p></div></section>${sectionHeading(selected.id === 'start' || selected.id === 'train' ? '当前阶段课程' : '按方向选学', '只有课程能支撑任务或阶段成果时，才进入计划。')}<div class="course-grid">${courses.map(c => `<article class="course-card"><div><span class="tag purple">${e(c.chapter)}</span><span class="tiny muted">${e(c.level)}</span></div><h3>${e(c.name)}</h3><p>${e(c.practice)}</p>${external(c.url, '打开课程', 'text-link')}</article>`).join('') || emptyState('ideas', '先定义项目问题', '这个阶段暂时不预设课程。确定要解决的问题后，再把资料加入计划。', '<a href="#activity" class="button">记录候选方向</a>')}</div><div class="learning-principle">${icon('library')}<div><strong>章节完成不等于能力验收</strong><p>能解释概念、运行示例，并把它用于当前项目问题，才算形成能力。</p></div></div>${selected.id === 'start' ? `<section class="bottom-section">${sectionHeading('MicroDuck 原始资料', '项目仓库、训练仓库和复刻说明是当前阶段的事实来源。')}<div class="resource-grid">${projectResources.map(resourceCard).join('')}</div></section>` : ''}<section class="bottom-section">${sectionHeading('机器人基础参考', '这些不是必修清单。遇到对应问题时再查阅，避免脱离项目囤课程。')}<div class="resource-grid">${referenceResources.map(resourceCard).join('')}</div></section>${syncNote()}`;
}

function boardPage() {
  const all = tasks().map(task => ({ ...task, assigneeLogin: task.issue?.assignees?.[0]?.login || config.members[task.owner]?.github || (task.owner !== null && task.owner !== undefined ? `member:${task.owner}` : '') }));
  const unique = values => [...new Set(values.filter(Boolean).map(String))].toSorted((a, b) => a.localeCompare(b, 'zh-CN'));
  const labels = unique(all.flatMap(task => [task.tag, ...(task.issue?.labels || []).map(label => typeof label === 'string' ? label : label?.name)]));
  const authors = unique(all.map(task => task.issue?.user?.login));
  const assignees = unique(all.flatMap(task => [task.assigneeLogin, ...(task.issue?.assignees || []).map(person => person?.login)]));
  const assigneeLabel = value => value.startsWith('member:') ? memberName(Number(value.slice(7))) : `@${value}`;
  const filtered = filterTasks(all, state.taskFilters);
  const option = (value, label, selected) => `<option value="${e(value)}" ${selected === value ? 'selected' : ''}>${e(label)}</option>`;
  const activeFilters = Object.entries(state.taskFilters).filter(([key, value]) => key === 'query' ? value : value !== 'all').length;
  return `${pageHeading('SMALL STEPS, REAL PROGRESS', 'MicroDuck 项目看板', '一个任务，一个明确的下一步。状态通过 GitHub Issue 管理，完成时留下验收证据。', button('new-task', '添加任务', 'plus', 'button primary'))}${syncNote()}<form class="issue-filter-bar" id="task-filters" role="search"><label class="task-filter-search">${icon('search')}<input id="task-filter-query" type="search" value="${e(state.taskFilters.query)}" placeholder="筛选任务" aria-label="按关键词筛选任务" autocomplete="off"></label><div class="issue-filter-selects"><label>状态<select data-task-filter="status">${option('all', '全部', state.taskFilters.status)}${STATUSES.map(s => option(s.id, s.name, state.taskFilters.status)).join('')}</select></label><label>阶段<select data-task-filter="phase">${option('all', '全部', state.taskFilters.phase)}${data.phases.map(p => option(p.id, `${p.number} · ${p.name}`, state.taskFilters.phase)).join('')}</select></label><label>标签<select data-task-filter="label">${option('all', '全部', state.taskFilters.label)}${labels.map(label => option(label, label, state.taskFilters.label)).join('')}</select></label><label>发布者<select data-task-filter="author">${option('all', '全部', state.taskFilters.author)}${authors.map(login => option(login, `@${login}`, state.taskFilters.author)).join('')}</select></label><label>指派给<select data-task-filter="assignee">${option('all', '全部', state.taskFilters.assignee)}${option('none', '未指派', state.taskFilters.assignee)}${assignees.map(value => option(value, assigneeLabel(value), state.taskFilters.assignee)).join('')}</select></label></div>${activeFilters ? `<button type="button" class="filter-clear" data-action="clear-task-filters">清除筛选</button>` : ''}<span class="filter-count">${filtered.length} / ${all.length} 项</span></form><div class="kanban" aria-label="项目任务看板">${STATUSES.map(s => { const items = filtered.filter(t => t.status === s.id); return `<section class="kanban-column"><h2><i class="dot ${s.id}"></i>${s.name}<span>${items.length}</span></h2><div class="kanban-cards">${items.map(t => taskCard(t)).join('') || '<div class="column-empty">没有符合条件的任务。</div>'}</div></section>`; }).join('')}</div><div class="board-hint">${icon('github')}发布者来自创建 Issue 时登录的 GitHub 账号；指派人与状态仍由 Issue 管理。</div>`;
}

function issueCard(issue) {
  const kind = classifyIssue(issue);
  const url = safeUrl(issue.html_url);
  return `<article class="issue-card"><div class="issue-top"><span class="tag ${kind === 'help' ? 'peach' : kind === 'experiment' ? 'purple' : 'green'}">${KINDS[kind]}</span><span class="tiny muted">#${issue.number} · ${shortDate(issue.updated_at)}</span></div><h3>${e(String(issue.title).replace(/^\[(任务|想法|求助|进展|实验)\]\s*/, ''))}</h3><p class="issue-preview">${e(String(issue.body || '打开 GitHub 查看记录。').slice(0, 200))}</p><div class="issue-bottom"><span class="tiny muted">${e(issue.user?.login || '成员')} · ${issue.state === 'closed' ? '已结束' : '开放讨论'}</span>${external(url, `${issue.comments || 0} 条回应`, 'text-link')}</div></article>`;
}
function resourceCard(resource) {
  return `<article class="resource-card"><div class="resource-logo ${resource.type === '基础' ? 'violet' : 'mint'}">${icon(resource.type === '项目' || resource.type === '源码' ? 'github' : 'library')}</div><div><span class="tiny muted">${e(resource.type)}</span><h3>${e(resource.name)}</h3><p>${e(resource.description)}</p>${external(resource.url, '访问资料', 'text-link')}</div></article>`;
}

function activityPage() {
  const kinds = ['progress', 'experiment', 'idea', 'help'];
  const actual = activity().filter(i => state.ideaKind === 'all' || classifyIssue(i) === state.ideaKind);
  const filter = (id, label) => `<button data-kind-filter="${id}" class="${state.ideaKind === id ? 'active' : ''}" aria-pressed="${state.ideaKind === id}">${label}</button>`;
  return `${pageHeading('CAPTURE THE PROCESS', '记录与讨论，放在同一条项目时间线上。', '进展、实验、想法和求助都围绕当前项目；回应与鼓励留在对应记录下面。', button('record', '新增记录', 'plus', 'button primary'))}${syncNote()}<div class="ideas-banner"><span class="banner-icon">${icon('chat')}</span><div><h2>记录事实，也记录还没想明白的问题。</h2><p>选择合适类型，带上版本、证据、复现步骤或下一步。</p></div>${button('help', '提出求助', 'arrow', 'button')}</div><div class="board-toolbar"><div class="segmented">${filter('all', '全部')}${filter('progress', '进展')}${filter('experiment', '实验')}${filter('idea', '想法')}${filter('help', '求助')}</div><span class="tiny muted">GitHub 评论与表情用于讨论和鼓励</span></div>${actual.length ? `<div class="issue-grid">${actual.map(issueCard).join('')}</div>` : emptyState('logs', state.ideaKind === 'all' ? '还没有真实记录' : `还没有${KINDS[state.ideaKind] || '相关'}记录`, repoUrl(config) ? '写下本次行动、证据或卡点，建立第一条项目记录。' : '连接仓库后，这里会显示真实记录与讨论。', button('record', '记下第一步', 'plus', 'button primary'))}<div class="template-grid"><article class="template-card"><span class="template-icon mint">${icon('logs')}</span><h3>两分钟进展记录</h3><p>完成了什么、证据在哪里、卡在哪里、下一步是什么。</p><button class="text-link" data-record-kind="progress">使用进展模板 ${icon('arrow')}</button></article><article class="template-card"><span class="template-icon violet">${icon('board')}</span><h3>可复现实验</h3><p>一个假设、一个变量，保留版本、条件、数据与恢复方式。</p><button class="text-link" data-record-kind="experiment">使用实验模板 ${icon('arrow')}</button></article></div>${state.ideaKind === 'all' || state.ideaKind === 'idea' ? `<section class="bottom-section">${sectionHeading('待讨论的候选想法', '这些是起步建议，不计入已开展工作。确认价值后再转成任务。')}<div class="seed-grid">${data.ideas.map(i => `<article class="seed-card"><span class="tag peach">${e(i.tag)}</span><h3>${e(i.title)}</h3><p>${e(i.description)}</p><div><span class="tiny muted">${e(i.source)}</span><button class="icon-button" data-seed="${i.id}" aria-label="讨论：${e(i.title)}">${icon('arrow')}</button></div></article>`).join('')}</div></section>` : ''}<div class="encouragement"><span>${icon('heart')}</span><div><strong>具体的反馈比打卡更有用。</strong><p>指出哪条记录帮助了你、哪一步还需要补充，让个人积累自然成为团队资产。</p></div></div>`;
}
function logsPage() {
  const entries = logs();
  return `${pageHeading('EVERY TRY COUNTS', '让每一次尝试，都有迹可循。', '原始记录可以很短。值得复用的发现，再整理成知识和作品。', button('record', '写一条记录', 'plus', 'button primary'))}${syncNote()}<div class="log-intro"><div><span class="eyebrow">THE LEARNING LOOP</span><h2>记录 → 验证 → 沉淀</h2><p>今天的一个卡点，也许就是明天给伙伴的答案。</p></div><div class="log-levels"><span>01 随手记录</span>${icon('arrow')}<span>02 已验证结论</span>${icon('arrow')}<span>03 可复用资产</span></div></div>${entries.length ? `<div class="issue-grid">${entries.map(issueCard).join('')}</div>` : emptyState('logs', '第一条真实记录，等你们来写。', '记录一次环境搭建、一个没解决的问题，或今天理解的一个概念。这里不会把示例算成进展。', button('record', '记下第一步', 'plus', 'button primary'))}<div class="template-grid"><article class="template-card"><span class="template-icon mint">${icon('logs')}</span><h3>两分钟收工记录</h3><p>完成了什么、卡在哪里、下一步是什么、希望对方怎么帮。</p><button class="text-link" data-record-kind="progress">使用进展模板 ${icon('arrow')}</button></article><article class="template-card"><span class="template-icon violet">${icon('board')}</span><h3>一次可复现的实验</h3><p>一个假设、一个变量，保留版本、条件、数据与恢复方式。</p><button class="text-link" data-record-kind="experiment">使用实验模板 ${icon('arrow')}</button></article></div>`;
}

function ideasPage() {
  const actual = state.issues.filter(i => ['idea', 'help'].includes(classifyIssue(i)) && (state.ideaKind === 'all' || classifyIssue(i) === state.ideaKind));
  return `${pageHeading('GOOD QUESTIONS GROW HERE', '想法有地方落脚，问题有人接住。', '先把念头放进来。是否现在做，留到共同讨论时决定。', button('idea', '提出一个想法', 'plus', 'button primary'))}${syncNote()}<div class="ideas-banner"><span class="banner-icon">${icon('chat')}</span><div><h2>卡住了？把问题讲清楚，就已经前进了一步。</h2><p>带上版本、复现步骤、预期和实际结果，让伙伴更容易帮你。</p></div>${button('help', '向伙伴求助', 'arrow', 'button')}</div><div class="board-toolbar"><div class="segmented"><button data-kind-filter="all" class="${state.ideaKind === 'all' ? 'active' : ''}" aria-pressed="${state.ideaKind === 'all'}">全部</button><button data-kind-filter="idea" class="${state.ideaKind === 'idea' ? 'active' : ''}" aria-pressed="${state.ideaKind === 'idea'}">想法</button><button data-kind-filter="help" class="${state.ideaKind === 'help' ? 'active' : ''}" aria-pressed="${state.ideaKind === 'help'}">求助</button></div><span class="tiny muted">回应和鼓励保存在 GitHub 评论 / 表情中</span></div>${actual.length ? `<div class="issue-grid">${actual.map(issueCard).join('')}</div>` : emptyState('chat', '还没有来自 GitHub 的讨论', repoUrl(config) ? '提出第一个问题，邀请伙伴一起分析。' : '连接共同仓库后，可以在这里看到真实想法、求助与回应。', button('help', '整理一个问题', 'chat', 'button'))}${state.ideaKind !== 'help' ? `<section class="bottom-section">${sectionHeading('给想法池放几颗种子', '以下是起步建议，尚未认领，也不是已开展的实验。')}<div class="seed-grid">${data.ideas.map(i => `<article class="seed-card"><span class="tag peach">${e(i.tag)}</span><h3>${e(i.title)}</h3><p>${e(i.description)}</p><div><span class="tiny muted">${e(i.source)}</span><button class="icon-button" data-seed="${i.id}" aria-label="讨论：${e(i.title)}">${icon('arrow')}</button></div></article>`).join('')}</div></section>` : ''}<div class="encouragement"><span>${icon('heart')}</span><div><strong>鼓励可以很具体。</strong><p>“你写的复现步骤，让我少试了两个小时。” 打开一条记录，把这句话留给伙伴。</p></div></div>`;
}

function libraryPage() {
  return `${pageHeading('KEEP WHAT HELPS', '把走过的路，变成可以复用的地图。', '保留资料的用途和适用版本。链接只是入口，自己的验证才是积累。')}<div class="knowledge-grid"><button class="knowledge-card" data-action="ritual"><span class="tag green">协作手册 · 起步约定</span><h2>两个人怎样一起推进？</h2><p>异步记录、每周碰头、远程结对和共同验收。</p><span class="text-link">打开约定 ${icon('arrow')}</span></button><button class="knowledge-card soft-purple" data-action="reproduce"><span class="tag purple">实验手册 · 模板</span><h2>怎样留下一个可复现的结果？</h2><p>版本、配置、命令、证据，以及下次怎样恢复。</p><span class="text-link">查看清单 ${icon('arrow')}</span></button></div>${sectionHeading('资料导航', '先看项目与硬件原始资料，再按当前问题补课程。')}<div class="resource-grid">${data.resources.map(r => `<article class="resource-card"><div class="resource-logo ${r.type === '课程' || r.type === '基础' ? 'violet' : 'mint'}">${icon(r.type === '课程' || r.type === '基础' ? 'library' : 'github')}</div><div><span class="tiny muted">${e(r.type)}</span><h3>${e(r.name)}</h3><p>${e(r.description)}</p>${external(r.url, '访问资料', 'text-link')}</div></article>`).join('')}</div><div class="learning-principle">${icon('ideas')}<div><strong>每两周，各带来一条新发现。</strong><p>它解决什么问题？和我们有什么关系？最小验证需要多少投入？带着这三个问题扩展眼界。</p></div></div>`;
}

function searchPage() {
  const q = state.query.toLowerCase();
  const taskResults = tasks().filter(t => JSON.stringify(t).toLowerCase().includes(q));
  const resources = [...data.resources, ...data.courses].filter(r => JSON.stringify(r).toLowerCase().includes(q));
  const ideas = data.ideas.filter(i => JSON.stringify(i).toLowerCase().includes(q));
  const issues = state.issues.filter(i => classifyIssue(i) !== 'task' && `${i.title} ${i.body || ''}`.toLowerCase().includes(q));
  const count = taskResults.length + resources.length + ideas.length + issues.length;
  return `${pageHeading('FIND THE NEXT CONNECTION', '搜索工作台', `“${e(state.query)}” · 找到 ${count} 条结果`)}${!count ? emptyState('search', '暂时没有匹配的内容', '试试“标定”“PPO”“实验”或“版本”。') : ''}${taskResults.length ? sectionHeading('任务') + `<div class="search-task-grid">${taskResults.map(t => taskCard(t)).join('')}</div>` : ''}${resources.length ? sectionHeading('课程与资料') + `<div class="search-links">${resources.map(r => `<div>${external(r.url, r.name, 'text-link')}<p>${e(r.description || r.practice)}</p></div>`).join('')}</div>` : ''}${ideas.length ? sectionHeading('起步想法') + ideas.map(i => `<button class="search-idea" data-seed="${i.id}">${e(i.title)} ${icon('arrow')}</button>`).join('') : ''}${issues.length ? sectionHeading('GitHub 记录与讨论') + `<div class="issue-grid">${issues.map(issueCard).join('')}</div>` : ''}`;
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
  modal.innerHTML = `<button class="modal-close icon-button" data-action="close-modal" aria-label="关闭对话框">${icon('close')}</button>${content}`;
  if (!modal.open) modal.showModal();
}
function settings() {
  openModal(`<div class="eyebrow">MAKE IT YOURS</div><h2 id="modal-title">连接项目仓库</h2><p class="modal-description">无需在这里输入密码或令牌。网页读取公开 Issues；提交与回应在 GitHub 完成。</p><form id="settings-form"><label>工作台名称<input name="siteName" value="${e(config.siteName)}" maxlength="60" required></label><div class="form-row"><label>GitHub 用户 / 组织<input name="owner" value="${e(config.owner)}" placeholder="例如 your-name" autocomplete="off"></label><label>仓库名<input name="repo" value="${e(config.repo)}" placeholder="例如 duck-lab" autocomplete="off"></label></div><div class="form-row">${config.members.map((m, i) => `<fieldset><legend>成员 ${i + 1}</legend><label>称呼<input name="member${i}" value="${e(m.name)}" maxlength="30" required></label><label>GitHub 用户名（选填）<input name="github${i}" value="${e(m.github)}" maxlength="39" placeholder="用于匹配任务负责人"></label></fieldset>`).join('')}</div><p class="form-error" id="settings-error" role="alert"></p><div class="modal-note">此处保存仅对当前浏览器有效。保存后下载 config.json 并提交到仓库，其他成员打开网站时就能使用同一份配置。需要增加成员时，可直接扩展 config.json 中的 members 数组（最多 8 位）。</div><div class="modal-actions"><button type="button" data-action="download-config" class="button">${icon('download')}下载当前配置</button><button class="button primary" type="submit">保存本机设置 ${icon('check')}</button></div><button type="button" class="reset-link" data-action="reset-settings">恢复仓库文件中的配置</button></form>`);
}
function record(kind = 'progress', input = {}) {
  const body = input.body || recordBody(kind, input);
  openModal(`<div class="eyebrow">CAPTURE A SMALL STEP</div><h2 id="modal-title">${kind === 'help' ? '让伙伴更容易帮到你' : kind === 'idea' ? '让一个想法先落地' : '记下这次探索'}</h2><p class="modal-description">先整理，再提交。内容保存在 GitHub Issue 中，对方可以评论和回应。</p><form id="record-form"><label>记录类型<select name="kind">${Object.entries(KINDS).map(([k, v]) => `<option value="${k}" ${k === kind ? 'selected' : ''}>${v}</option>`).join('')}</select></label><label>标题<input name="title" value="${e(input.title || '')}" placeholder="例如：第一次读到了正确的 IMU 姿态" maxlength="150" required></label><label>内容<textarea name="body" rows="12" required>${e(body)}</textarea></label><p class="form-error" id="record-error" role="alert"></p><div class="modal-note">${repoUrl(config) ? '下一步会打开 GitHub 的提交页。GitHub 会自动把当前登录账号记录为发布者；提交后回到网站刷新。' : '尚未连接仓库。可以先下载 Markdown；连接仓库前，本表单不会提交到任何地方。'}</div><div class="modal-actions"><button type="button" class="button" data-action="download-record">${icon('download')}下载 Markdown</button><button class="button primary" type="submit">${icon('github')}${repoUrl(config) ? '到 GitHub 提交' : '连接仓库并继续'}</button></div></form>`, true);
}
function taskDetail(id) {
  const task = tasks().find(t => t.id === id); if (!task) return;
  const publisher = task.issue?.user?.login;
  openModal(`<div class="eyebrow">MICRODUCK / ${e(task.id)}</div><h2 id="modal-title">${e(task.title)}</h2><div class="detail-meta"><span class="tag green">${e(task.tag)}</span><span class="pill">${statusName(task.status)}</span><span class="task-person">${avatar(task.owner, true)}${e(memberName(task.owner))}</span>${publisher ? `<span class="github-publisher">${icon('github')} @${e(publisher)} 发布</span>` : ''}</div><p class="detail-description">${e(task.description)}</p><div class="detail-block"><h3>下一步</h3><p>${e(task.next)}</p></div><div class="detail-block"><h3>怎样算完成</h3><p>${e(task.acceptance)}</p></div><p class="modal-note">${task.issue ? '发布者、状态和指派信息来自关联 Issue。用 ready、doing、waiting、backlog 标签更新；验收后关闭 Issue。' : '这是起步计划。创建带有任务编号的 Issue 后，网站会读取发布者和状态。建议分工可在 data/space.json 修改。'}</p><div class="modal-actions">${task.issue ? external(task.issue.html_url, '打开任务与讨论', 'button primary') : `<button class="button primary" data-create-task="${e(task.id)}">${icon('github')}创建关联 Issue</button>`}<button class="button" data-task-record="${e(task.id)}">${icon('logs')}为此任务写记录</button></div>`);
}
function ritual() {
  openModal(`<div class="eyebrow">OUR WORKING AGREEMENT</div><h2 id="modal-title">异地，也能一起推进。</h2><div class="handbook"><h3>一人主责，一人复现</h3><p>每人同时主责一项任务。里程碑结束时，伙伴按记录复现，再补齐遗漏步骤。</p><h3>每次收工，留两分钟</h3><p>写下本次完成、证据、卡点、下一步和需要怎样帮助。忙的一周不补打卡，从下一步接着做。</p><h3>每周短同步，每两周一起动手</h3><p>建议每周约 25 分钟看成果、解阻塞、选下一步；每两周约一次较长联调。时间由你们共同约定。</p><h3>远程结对实验</h3><p>现场操作员负责实物动作和停止运动，远程观察员看日志、核对步骤、记录结果。没有硬件的一方可独立推进仿真和分析。</p><h3>遇到问题，分清证据与猜测</h3><p>带上版本、复现步骤、预期、实际结果和已尝试的方法。来回两三轮仍不清楚，就约一次语音。</p><h3>说出具体的感谢</h3><p>回顾时各说一项“对方做的事情怎样帮到了我”。奖励共同成果，不比较学习时长。</p></div><div class="modal-actions">${button('close-modal', '记住了', 'check', 'button primary')}</div>`);
}
function reproduce() {
  openModal(`<div class="eyebrow">A REPRODUCIBLE RESULT</div><h2 id="modal-title">给未来的自己，留一条回来的路。</h2><div class="handbook"><h3>1. 固定实验条件</h3><p>记录主板、舵机、镜像、代码提交、模型、配置、测试地面与电量等相关条件。</p><h3>2. 写下执行步骤</h3><p>从什么状态开始，运行什么命令，期望看到什么；不要依赖记忆里的临时修改。</p><h3>3. 保留原始证据</h3><p>视频、日志、曲线和配置使用同一实验编号。说明假设、改变的变量和评价指标。</p><h3>4. 留下停止与恢复方式</h3><p>怎样停止当前运行，怎样回到已验证的配置；每个成功里程碑都留一个恢复点。</p><h3>5. 让伙伴试一次</h3><p>先区分“观察到的现象”和“推测的原因”，保留失败结果与适用范围。</p></div><div class="modal-actions">${button('experiment', '用模板记录实验', 'plus', 'button primary')}</div>`);
}

async function syncIssues(live = false) {
  const request = ++state.request;
  state.issues = []; state.syncError = ''; state.limited = false;
  if (!repoUrl(config)) { state.sync = 'idle'; renderShell(); return; }
  const matchingSnapshot = snapshot?.updatedAt && snapshot.repository?.toLowerCase() === `${config.owner}/${config.repo}`.toLowerCase() && Array.isArray(snapshot.issues);
  const mapOwners = issues => issues.map(issue => {
    const found = config.members.findIndex(m => m.github && (issue.assignees || []).some(a => a.login?.toLowerCase() === m.github.toLowerCase()));
    return { ...issue, matchedOwner: found < 0 ? null : found };
  });
  if (matchingSnapshot) {
    state.issues = mapOwners(snapshot.issues);
    state.limited = snapshot.limited;
    if (!live) { state.sync = 'snapshot'; renderShell(); return; }
  }
  state.sync = 'loading'; renderShell();
  const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), 20000);
  try {
    const all = [];
    for (let page = 1; page <= 3; page++) {
      const response = await fetch(`https://api.github.com/repos/${encodeURIComponent(config.owner)}/${encodeURIComponent(config.repo)}/issues?state=all&sort=updated&direction=desc&per_page=100&page=${page}`, { headers: { Accept: 'application/vnd.github+json' }, signal: controller.signal, credentials: 'omit' });
      if (response.status === 404) throw new Error('仓库未找到，或它不是公开仓库。此版只读取公开 Issues。');
      if (response.status === 403 || response.status === 429) {
        const detail = await response.json().catch(() => ({}));
        const limited = response.status === 429 || response.headers.get('x-ratelimit-remaining') === '0' || /rate limit/i.test(detail.message || '');
        throw new Error(limited ? 'GitHub 暂时限制了公开 API 请求，请稍后手动刷新。' : 'GitHub 暂时拒绝公开读取，请确认仓库与 Issues 可公开访问。');
      }
      if (!response.ok) throw new Error(`GitHub 返回 ${response.status}，暂时无法读取。`);
      const batch = await response.json(); if (!Array.isArray(batch)) throw new Error('GitHub 返回的数据格式不正确。');
      all.push(...batch.filter(i => !i.pull_request));
      if (batch.length < 100) break;
      if (page === 3) state.limited = true;
    }
    if (request !== state.request) return;
    state.issues = mapOwners(all);
    state.sync = 'success';
  } catch (error) {
    if (request !== state.request) return;
    state.sync = 'error'; state.syncError = error.name === 'AbortError' ? '读取超时，请检查网络后重试。' : error.message;
  } finally { clearTimeout(timeout); if (request === state.request) renderShell(); }
}

document.addEventListener('click', event => {
  const target = event.target.closest('button, a'); if (!target) return;
  if (target.classList.contains('skip-link')) { event.preventDefault(); $('#main')?.focus(); return; }
  if (target.dataset.phaseLink) state.selectedPhase = target.dataset.phaseLink;
  if (target.tagName === 'A' && nav.some(n => target.getAttribute('href') === `#${n[0]}`) && target.getAttribute('href') === `#${state.route}`) { event.preventDefault(); route(); return; }
  if (target.dataset.task) return taskDetail(target.dataset.task);
  if (target.dataset.phase) { state.selectedPhase = target.dataset.phase; renderContent(); $(`#phase-${state.selectedPhase}`)?.focus(); return; }
  if (target.dataset.kindFilter) { state.ideaKind = target.dataset.kindFilter; renderContent(); return; }
  if (target.dataset.recordKind) return record(target.dataset.recordKind);
  if (target.dataset.seed) { const idea = data.ideas.find(i => i.id === target.dataset.seed); return record('idea', { title: idea.title, body: recordBody('idea') + `\n### 起步建议\n${idea.description}\n` }); }
  if (target.dataset.createTask) {
    const task = tasks().find(t => t.id === target.dataset.createTask);
    return record('task', { title: `${task.id} ${task.title}`, body: `关联项目：MicroDuck 复刻\n关联任务：${task.id}\n\n### 目标\n${task.description}\n\n### 主责人\n${memberName(task.owner)}\n\n### 下一步\n${task.next}\n\n### 验收标准\n${task.acceptance}\n\n### 阻塞与依赖\n待补充\n\n### 证据链接\n待补充\n` });
  }
  if (target.dataset.taskRecord) return record('progress', { task: target.dataset.taskRecord });
  const action = target.dataset.action;
  if (action === 'close-modal') { $('#modal').close(); draftBeforeSettings = null; }
  if (action === 'settings') { draftBeforeSettings = null; settings(); }
  if (action === 'record') record();
  if (action === 'idea') record('idea');
  if (action === 'help') record('help');
  if (action === 'experiment') record('experiment');
  if (action === 'new-task') record('task');
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
  if (event.target.id === 'task-filter-query') { state.taskFilters.query = event.target.value.trim(); renderContent(); $('#task-filter-query')?.focus(); }
});
document.addEventListener('change', event => {
  if (event.target.dataset.taskFilter) { state.taskFilters[event.target.dataset.taskFilter] = event.target.value; renderContent(); }
  if (event.target.matches('#record-form select[name="kind"]')) {
    const form = $('#record-form'); const previous = form.querySelector('textarea').value;
    if (Object.keys(KINDS).some(k => previous === recordBody(k))) form.querySelector('textarea').value = recordBody(event.target.value);
  }
});
document.addEventListener('submit', event => {
  if (event.target.id === 'task-filters') { event.preventDefault(); return; }
  if (event.target.id === 'settings-form') {
    event.preventDefault(); const values = new FormData(event.target);
    try {
      const next = normalizeConfig({ siteName: values.get('siteName'), owner: values.get('owner'), repo: values.get('repo'), members: config.members.map((member, i) => ({ ...member, name: values.get(`member${i}`), github: values.get(`github${i}`) })) });
      try { localStorage.setItem(storageKey, JSON.stringify(next)); } catch { throw new Error('当前浏览器不允许保存本机设置。请修改仓库中的 config.json。'); }
      config = next; const pending = draftBeforeSettings; draftBeforeSettings = null;
      $('#modal').close(); syncIssues(); toast('已保存本机设置。共享给伙伴请下载配置并提交到仓库。');
      if (pending) record(pending.kind, pending);
    } catch (error) { $('#settings-error').textContent = error.message; }
  }
  if (event.target.id === 'record-form') {
    event.preventDefault(); const values = new FormData(event.target);
    const draft = { kind: values.get('kind'), title: String(values.get('title')).trim(), body: String(values.get('body')).trim() };
    if (!draft.title || !draft.body) { $('#record-error').textContent = '请填写标题和内容。'; return; }
    if (!repoUrl(config)) { draftBeforeSettings = draft; settings(); return; }
    const url = issueUrl(config, draft.kind, draft.title, draft.body);
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
    if (saved) { try { config = normalizeConfig(JSON.parse(saved)); } catch { toast('本机配置已失效，已使用仓库配置。'); } }
    const response = await fetch('./data/space.json'); if (!response.ok) throw new Error('无法读取学习计划。');
    data = await response.json();
    try { const savedSnapshot = await fetch('./data/issue-snapshot.json', { cache: 'no-store' }); if (savedSnapshot.ok) snapshot = await savedSnapshot.json(); } catch {}
    route(); if (repoUrl(config)) syncIssues();
  } catch (error) {
    $('#app').innerHTML = `<div class="fatal-error"><img src="./assets/duck.svg" width="64" height="64" alt=""><h1>学习空间暂时没有打开</h1><p>${e(error.message)}</p><p>请通过本地服务或 GitHub Pages 访问；直接双击 HTML 无法读取数据文件。</p><button class="button primary" id="retry-boot">重新加载</button></div>`;
    $('#retry-boot').addEventListener('click', () => location.reload());
  }
}
boot();
