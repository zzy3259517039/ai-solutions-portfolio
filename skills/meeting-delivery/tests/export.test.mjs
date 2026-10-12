import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { exportMeeting, validate, csvCell } from '../scripts/export-meeting.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const jsonFile = path.join(root, 'examples/codex-extraction.json');
const transcriptFile = path.join(root, 'samples/02-缺少分工与期限.txt');
const transcript = await fs.readFile(transcriptFile, 'utf8');
const fixture = JSON.parse(await fs.readFile(jsonFile, 'utf8'));
const clone = () => structuredClone(fixture);

test('拒绝空原文与不存在的证据，防止无来源输出', () => {
  assert.throws(() => validate(clone(), ''), /原文为空/);
  const data = clone();
  data.tasks[0].evidence = '原文没有这句话';
  assert.throws(() => validate(data, transcript), /未在会议原文中找到/);
});

test('拒绝不真实日期与隐藏的缺失字段', () => {
  const data = clone();
  data.meeting_date = '2026-02-30';
  assert.throws(() => validate(data, transcript), /真实日期/);
  const missing = clone();
  missing.tasks[0].pending = '无';
  assert.throws(() => validate(missing, transcript), /pending 必须说明/);
});

test('CSV 公式起始字符、引号和换行保留为安全文本', () => {
  for (const formula of ['=1+1', '+SUM(A1)', '-1+2', '@SUM(A1)', '  =1+1', '\t=1+1']) {
    assert.ok(csvCell(formula).startsWith('"\''));
  }
  assert.equal(csvCell('负责人'), '"负责人"');
  assert.equal(csvCell('a"b\nc'), '"a""b\nc"');
});

test('导出保留待确认、提议和完整可追溯清单，重复运行不覆盖', async () => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'meeting-portfolio-'));
  try {
    const first = await exportMeeting(jsonFile, transcriptFile, temp);
    const second = await exportMeeting(jsonFile, transcriptFile, temp);
    assert.notEqual(first.directory, second.directory);
    assert.equal(first.task_count, 2);
    const structured = JSON.parse(await fs.readFile(path.join(first.directory, 'structured.json'), 'utf8'));
    assert.equal(structured.tasks[0].owner, '待确认');
    assert.equal(structured.tasks[0].due, '待确认');
    assert.equal(structured.tasks[1].owner, '林悦');
    assert.equal(structured.proposals.length, 1);
    assert.ok(structured.tasks.every(t => !t.task.includes('老人')));
    const csv = await fs.readFile(path.join(first.directory, 'tasks.csv'));
    assert.deepEqual([...csv.subarray(0, 3)], [0xef, 0xbb, 0xbf]);
    const manifest = JSON.parse(await fs.readFile(path.join(first.directory, 'run.json'), 'utf8'));
    for (const [name, hash] of Object.entries(manifest.files)) {
      const bytes = await fs.readFile(path.join(first.directory, name));
      assert.equal(createHash('sha256').update(bytes).digest('hex'), hash);
    }
    assert.equal(manifest.transcript_sha256, createHash('sha256').update(await fs.readFile(transcriptFile)).digest('hex'));
    assert.equal((await fs.readdir(temp)).length, 2);
  } finally {
    await fs.rm(temp, { recursive: true, force: true });
  }
});

test('无效输入不会留下伪成功结果目录', async () => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'meeting-invalid-'));
  try {
    const invalidJson = path.join(temp, 'invalid.json');
    const data = clone();
    data.tasks[0].evidence = '不存在的任务证据';
    await fs.writeFile(invalidJson, JSON.stringify(data));
    const out = path.join(temp, 'outputs');
    await assert.rejects(exportMeeting(invalidJson, transcriptFile, out), /未在会议原文中找到/);
    await assert.rejects(fs.stat(out), { code: 'ENOENT' });
  } finally {
    await fs.rm(temp, { recursive: true, force: true });
  }
});
