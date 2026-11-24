import { readdir, readFile } from 'node:fs/promises';
import { sep } from 'node:path';

const scalar = value => String(value || '').trim().replace(/^['"]|['"]$/g, '');
const list = value => {
  const source = scalar(value);
  if (!source) return [];
  if (source.startsWith('[') && source.endsWith(']')) return source.slice(1, -1).split(',').map(scalar).filter(Boolean);
  return source.split(',').map(scalar).filter(Boolean);
};

export function parseRecord(source, path) {
  const match = String(source).match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!match) throw new Error(`${path} 缺少 YAML front matter。`);
  const meta = Object.fromEntries(match[1].split(/\r?\n/).filter(Boolean).map(line => {
    const index = line.indexOf(':');
    if (index < 1) throw new Error(`${path} 的元数据格式不正确：${line}`);
    return [line.slice(0, index).trim(), line.slice(index + 1).trim()];
  }));
  const body = match[2].trim();
  const title = scalar(meta.title) || body.match(/^#\s+(.+)$/m)?.[1]?.trim();
  const date = scalar(meta.date);
  if (!title || !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error(`${path} 必须包含 title 和 YYYY-MM-DD 格式的 date。`);
  const excerpt = scalar(meta.excerpt) || body.replace(/^#+\s+/gm, '').replace(/\s+/g, ' ').slice(0, 180);
  return { title, date, phase: scalar(meta.phase) || 'start', tags: list(meta.tags), author: scalar(meta.author), excerpt, path: path.split(sep).join('/') };
}

export async function buildRecordsIndex(directory) {
  const files = (await readdir(directory, { withFileTypes: true }))
    .filter(entry => entry.isFile() && entry.name.toLowerCase().endsWith('.md') && entry.name.toLowerCase() !== 'readme.md')
    .map(entry => entry.name);
  const records = await Promise.all(files.map(async file => parseRecord(await readFile(new URL(file, directory), 'utf8'), `records/${file}`)));
  return records.toSorted((a, b) => b.date.localeCompare(a.date) || a.title.localeCompare(b.title, 'zh-CN'));
}
