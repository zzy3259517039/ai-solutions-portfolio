import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const text = (v, name) => {
  if (typeof v !== 'string' || !v.trim()) throw new Error(`${name} 必须是非空文本`);
  return v;
};
const realDate = v => /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v;
const hash = v => createHash('sha256').update(v).digest('hex');
const md = v => String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\|/g, '&#124;').replace(/[\r\n]+/g, ' ');
export function csvCell(v) {
  let s = String(v);
  if (/^[\s\uFEFF]*[=+@-]/u.test(s) || /^[\t\r\n]/u.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}
export function validate(data, transcript) {
  if (!transcript.trim()) throw new Error('会议原文为空，请补充会议记录');
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('JSON 顶层必须是对象');
  ['title', 'meeting_date', 'summary'].forEach(k => text(data[k], k));
  if (!realDate(data.meeting_date)) throw new Error('meeting_date 必须是真实日期 YYYY-MM-DD');
  const evidence = (v, name) => {
    text(v, name);
    if (!transcript.includes(v)) throw new Error(`${name} 未在会议原文中找到，请引用连续原句`);
  };
  for (const group of ['decisions', 'proposals', 'issues']) {
    if (!Array.isArray(data[group])) throw new Error(`${group} 必须是数组`);
    data[group].forEach((item, i) => {
      if (!item || typeof item !== 'object') throw new Error(`${group}[${i}] 必须是对象`);
      text(item.text, `${group}[${i}].text`);
      evidence(item.evidence, `${group}[${i}].evidence`);
    });
  }
  if (!Array.isArray(data.tasks)) throw new Error('tasks 必须是数组');
  data.tasks.forEach((item, i) => {
    if (!item || typeof item !== 'object') throw new Error(`tasks[${i}] 必须是对象`);
    ['task', 'owner', 'due', 'pending'].forEach(k => text(item[k], `tasks[${i}].${k}`));
    evidence(item.evidence, `tasks[${i}].evidence`);
    if (item.due !== '待确认' && !realDate(item.due)) throw new Error(`tasks[${i}].due 必须是 YYYY-MM-DD 或待确认`);
    if ((item.owner === '待确认' || item.due === '待确认') && ['无', '无。', '无待确认项'].includes(item.pending.trim())) {
      throw new Error(`tasks[${i}] 缺少负责人或日期，pending 必须说明`);
    }
  });
  return data;
}
const list = items => items.length ? items.map(x => `- ${md(x.text)}\n  - 原文依据：${md(x.evidence)}`).join('\n') : '无。';
export async function exportMeeting(jsonFile, transcriptFile, outputRoot) {
  const jsonBytes = await fs.readFile(jsonFile);
  const rawBytes = await fs.readFile(transcriptFile);
  const transcript = rawBytes.toString('utf8').replace(/^\uFEFF/, '');
  const data = validate(JSON.parse(jsonBytes.toString('utf8').replace(/^\uFEFF/, '')), transcript);
  const templateFile = fileURLToPath(new URL('../templates/minutes.md', import.meta.url));
  const template = await fs.readFile(templateFile, 'utf8');
  const cols = ['任务', '负责人', '截止日期', '原文依据', '待确认项'];
  const rows = data.tasks.map(x => [x.task, x.owner, x.due, x.evidence, x.pending]);
  const table = [`| ${cols.join(' | ')} |`, '| --- | --- | --- | --- | --- |', ...rows.map(r => `| ${r.map(md).join(' | ')} |`)].join('\n');
  const pending = [
    ...data.issues,
    ...data.tasks.filter(x => x.pending !== '无').map(x => ({text: `${x.task}：${x.pending}`, evidence: x.evidence}))
  ];
  const values = {title: md(data.title), meeting_date: data.meeting_date, summary: md(data.summary), decisions: list(data.decisions), proposals: list(data.proposals), tasks: table, issues: list(pending)};
  const minutes = template.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    if (!(key in values)) throw new Error(`纪要模板存在不支持的字段：${key}`);
    return values[key];
  });
  const csv = '\uFEFF' + [cols, ...rows].map(r => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
  await fs.mkdir(outputRoot, {recursive: true});
  const dir = await fs.mkdtemp(path.join(path.resolve(outputRoot), `${data.meeting_date}-${Date.now()}-`));
  const files = {
    'minutes.md': minutes,
    'tasks.csv': csv,
    'pending.md': `# 待确认事项\n\n${list(pending)}\n`,
    'structured.json': JSON.stringify(data, null, 2) + '\n'
  };
  for (const [name, content] of Object.entries(files)) await fs.writeFile(path.join(dir, name), content, {encoding: 'utf8', flag: 'wx'});
  const manifest = {
    created_at: new Date().toISOString(),
    type: 'local_export_only',
    semantic_review: '待人工审核；导出校验不等于模型理解正确',
    transcript_sha256: hash(rawBytes),
    structured_sha256: hash(jsonBytes),
    task_count: data.tasks.length,
    files: Object.fromEntries(Object.entries(files).map(([name, content]) => [name, hash(content)]))
  };
  await fs.writeFile(path.join(dir, 'run.json'), JSON.stringify(manifest, null, 2) + '\n', {encoding: 'utf8', flag: 'wx'});
  return {directory: dir, task_count: data.tasks.length};
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.length !== 5) {
    console.error('用法：node export-meeting.mjs <JSON文件> <会议原文> <输出目录>');
    process.exitCode = 2;
  } else {
    try { console.log(JSON.stringify(await exportMeeting(...process.argv.slice(2)), null, 2)); }
    catch (e) { console.error(`未完成导出：${e.message}`); process.exitCode = 1; }
  }
}
