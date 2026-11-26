import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const exec = promisify(execFile);

export function githubCliClient(executable = process.env.GH_EXECUTABLE || 'gh') {
  async function api(endpoint, fields = {}) {
    const args = ['api', endpoint];
    if (endpoint === 'graphql') for (const [key, value] of Object.entries(fields)) {
      if (value !== null) args.push(typeof value === 'number' ? '-F' : '-f', `${key}=${value}`);
    }
    const { stdout } = await exec(executable, args, { maxBuffer: 16 * 1024 * 1024 });
    return JSON.parse(stdout);
  }
  const rest = async (endpoint, input) => {
    const { owner, repo, ...params } = input;
    return { data: await api(`repos/${owner}/${repo}${endpoint}?${new URLSearchParams(params)}`) };
  };
  return {
    rest: { repos: { get: input => rest('', input) }, issues: { listLabelsForRepo: input => rest('/labels', input), listForRepo: input => rest('/issues', input) } },
    graphql: async (query, variables) => {
      const result = await api('graphql', { query, ...variables });
      if (result.errors?.length) throw new Error(result.errors.map(error => error.message).join('; '));
      return result.data;
    }
  };
}
