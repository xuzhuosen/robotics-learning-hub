import { issueKey } from './core.mjs';

// Browsers only call unauthenticated REST endpoints. Project fields and Discussions
// remain server-built snapshots; no access token is ever sent to the browser.
export async function readLiveIssues(config, { fetcher = fetch, signal, snapshot = null } = {}) {
  const request = async url => {
    const response = await fetcher(url, { headers: { Accept: 'application/vnd.github+json' }, signal, credentials: 'omit' });
    if (!response.ok) throw new Error(response.status === 403 || response.status === 429 ? 'GitHub 公开 API 暂时限流或拒绝读取，请稍后重试。' : `GitHub 返回 ${response.status}，请确认仓库公开且已启用 Issues。`);
    return response.json();
  };
  const repositories = await Promise.all(config.repositories.map(async target => {
    const repository = `${target.owner}/${target.repo}`;
    const base = `https://api.github.com/repos/${encodeURIComponent(target.owner)}/${encodeURIComponent(target.repo)}`;
    const issues = [];
    let limited = false, labels = [];
    try { labels = (await request(`${base}/labels?per_page=100`)).map(label => label.name); } catch {
      labels = snapshot?.repositories?.find(item => item.repository.toLowerCase() === repository.toLowerCase())?.labels || [];
    }
    for (let page = 1; page <= 3; page++) {
      const batch = await request(`${base}/issues?state=all&sort=updated&direction=desc&per_page=100&page=${page}`);
      if (!Array.isArray(batch)) throw new Error('GitHub 返回的数据格式不正确。');
      issues.push(...batch.filter(issue => !issue.pull_request).map(issue => ({ ...issue, repository })));
      if (batch.length < 100) break;
      if (page === 3) limited = true;
    }
    return { repository, labels, limited, issues };
  }));
  const fields = new Map((snapshot?.issues || []).filter(issue => issue.project).map(issue => [issueKey(issue).toLowerCase(), issue.project]));
  const issues = repositories.flatMap(source => source.issues).map(issue => fields.has(issueKey(issue).toLowerCase()) ? { ...issue, project: fields.get(issueKey(issue).toLowerCase()) } : issue).sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)));
  return { issues, repositories: repositories.map(({ issues, ...source }) => source), limited: repositories.some(source => source.limited) };
}
