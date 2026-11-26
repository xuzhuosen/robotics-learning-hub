import { normalizeConfig, isTaskIssue } from '../lib/core.mjs';
import { parseTaskIntake } from '../lib/task-intake.mjs';

// The marker is only an intake request. Once initialized, Project fields are the
// source of truth. A populated Phase prevents retries from undoing later edits.
export async function initializeProjectTasks({ github, config: rawConfig, dryRun = false }) {
  const config = normalizeConfig(rawConfig);
  if (!config.project) return { initialized: [], skipped: [], limited: false };
  const settings = config.project;
  const query = `query($owner:String!,$number:Int!,$after:String) {
    ${settings.ownerType}(login:$owner) { projectV2(number:$number) { id public
      fields(first:100) { nodes { ... on ProjectV2SingleSelectField { id name options { id name } } } }
      items(first:100,after:$after) { pageInfo { hasNextPage endCursor } nodes { id isArchived
        content { ... on Issue { number repository { nameWithOwner isPrivate } } }
        fieldValues(first:100) { nodes { ... on ProjectV2ItemFieldSingleSelectValue { name field { ... on ProjectV2SingleSelectField { name } } } } }
      } }
    } }
  }`;
  const items = new Map();
  let after = null, project;
  do {
    const result = await github.graphql(query, { owner: settings.owner, number: settings.number, after });
    project = result[settings.ownerType]?.projectV2;
    if (!project?.public) throw new Error('Task initialization requires a public Project.');
    for (const item of project.items.nodes) {
      const issue = item.content;
      if (!issue?.repository || issue.repository.isPrivate) continue;
      const phase = item.fieldValues.nodes.find(value => value.field?.name === settings.phaseField)?.name;
      items.set(`${issue.repository.nameWithOwner.toLowerCase()}#${issue.number}`, { id: item.id, archived: item.isArchived, phase });
    }
    after = project.items.pageInfo.hasNextPage ? project.items.pageInfo.endCursor : null;
  } while (after);
  const phaseField = project.fields.nodes.find(field => field.name === settings.phaseField);
  const statusField = project.fields.nodes.find(field => field.name === settings.statusField);
  if (!phaseField?.options || !statusField?.options) throw new Error('Project Phase and Status must be single-select fields.');
  const phasePrefixes = { start: '01', train: '02', expand: '03', improve: '04' };
  const initialized = [], skipped = [];
  let limited = false;
  for (const target of config.repositories) {
    const name = `${target.owner}/${target.repo}`;
    const { data: repository } = await github.rest.repos.get(target);
    if (repository.private !== false) throw new Error(`${name}: only public repositories are allowed.`);
    for (let page = 1; page <= 3; page++) {
      const { data: batch } = await github.rest.issues.listForRepo({ ...target, state: 'all', sort: 'updated', direction: 'desc', per_page: 100, page });
      for (const issue of batch) {
        const request = parseTaskIntake(issue.body);
        if (!request || !isTaskIssue(issue)) continue;
        const key = `${name.toLowerCase()}#${issue.number}`;
        const existing = items.get(key);
        if (existing?.phase || existing?.archived) continue;
        const phase = phaseField.options.find(option => option.name === request.phase || option.name.startsWith(`${phasePrefixes[request.phase]} `));
        const statusName = issue.state === 'closed' ? 'Done' : request.status;
        const status = statusField.options.find(option => option.name === statusName);
        if (!phase || !status || !issue.node_id) { skipped.push({ issue: key, reason: 'Missing field option or Issue node ID.' }); continue; }
        if (!dryRun) {
          let itemId = existing?.id;
          if (!itemId) {
            const result = await github.graphql(`mutation($project:ID!,$issue:ID!) {
              addProjectV2ItemById(input:{projectId:$project,contentId:$issue}) { item { id } }
            }`, { project: project.id, issue: issue.node_id });
            itemId = result.addProjectV2ItemById.item.id;
          }
          const mutation = `mutation($project:ID!,$item:ID!,$field:ID!,$option:String!) {
            updateProjectV2ItemFieldValue(input:{projectId:$project,itemId:$item,fieldId:$field,value:{singleSelectOptionId:$option}}) { projectV2Item { id } }
          }`;
          // Write Phase last: if Status fails, a later run can safely retry.
          await github.graphql(mutation, { project: project.id, item: itemId, field: statusField.id, option: status.id });
          await github.graphql(mutation, { project: project.id, item: itemId, field: phaseField.id, option: phase.id });
          items.set(key, { id: itemId, phase: phase.name });
        }
        initialized.push({ issue: key, phase: phase.name, status: statusName });
      }
      if (batch.length < 100) break;
      if (page === 3) limited = true;
    }
  }
  return { initialized, skipped, limited };
}
