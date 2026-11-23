export async function buildIssueSnapshot({ github, context, config, now = () => new Date().toISOString() }) {
  const snapshot = { repository: '', updatedAt: null, limited: false, issues: [] };
  const actual = `${context.repo.owner}/${context.repo.repo}`;
  const target = `${config.owner}/${config.repo}`;
  if (!config.owner || !config.repo || target.toLowerCase() !== actual.toLowerCase()) return snapshot;
  const { data: repository } = await github.rest.repos.get(context.repo);
  if (repository.private !== false) throw new Error('This public snapshot workflow requires a public repository.');
  for (let page = 1; page <= 3; page++) {
    const { data: batch } = await github.rest.issues.listForRepo({ ...context.repo, state: 'all', sort: 'updated', direction: 'desc', per_page: 100, page });
    snapshot.issues.push(...batch.filter(i => !i.pull_request).map(i => ({
      number: i.number, title: i.title, body: i.body, state: i.state,
      html_url: i.html_url, updated_at: i.updated_at, comments: i.comments,
      user: { login: i.user?.login },
      assignees: (i.assignees || []).map(a => ({ login: a.login })),
      labels: (i.labels || []).map(l => typeof l === 'string' ? l : l.name)
    })));
    if (batch.length < 100) break;
    if (page === 3) snapshot.limited = true;
  }
  snapshot.repository = actual;
  snapshot.updatedAt = now();
  return snapshot;
}
