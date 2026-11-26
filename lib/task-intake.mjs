export const TASK_PHASES = ['start', 'train', 'expand', 'improve'];
export const TASK_STATUSES = ['Backlog', 'Ready', 'In progress', 'Done'];
export function taskIntakeMarker(phase, status) {
  if (!TASK_PHASES.includes(phase) || !TASK_STATUSES.includes(status)) throw new Error('请选择有效的 Phase 和 Status。');
  return `<!-- duck-lab-task:${JSON.stringify({ version: 1, phase, status })} -->`;
}
export function parseTaskIntake(body = '') {
  const matches = [...String(body).matchAll(/<!--\s*duck-lab-task:([^\n]*?)\s*-->/g)];
  if (matches.length !== 1) return null;
  try {
    const value = JSON.parse(matches[0][1]);
    return value.version === 1 && TASK_PHASES.includes(value.phase) && TASK_STATUSES.includes(value.status) ? { phase: value.phase, status: value.status } : null;
  } catch { return null; }
}
