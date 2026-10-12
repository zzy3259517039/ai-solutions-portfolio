# JSON 输出约定

脚本输入是 UTF-8 JSON，无 Markdown 代码围栏。所有键必需；没有某类内容时使用空数组。summary 为简短字符串，不能添加原文不存在的结论。标题和会议日期由用户输入。

```json
{
  "title": "会议标题",
  "meeting_date": "2026-09-10",
  "summary": "讨论了什么，确认了什么，还有什么没定。",
  "decisions": [{"text": "已确认事项", "evidence": "原文中的连续原句"}],
  "proposals": [{"text": "尚未确认的建议", "evidence": "原文中的连续原句"}],
  "tasks": [{
    "task": "已确认要完成的工作",
    "owner": "明确负责人或待确认",
    "due": "2026-09-11",
    "evidence": "原文中的连续原句",
    "pending": "无，或需要确认的问题"
  }],
  "issues": [{"text": "未解决问题", "evidence": "原文中的连续原句"}]
}
```

due 没有明确日期时写“待确认”。owner 或 due 是“待确认”时，pending 不能写“无”。若日期存在冲突，due 应为待确认，不同时给出一个被当成已确认的日期。evidence 必须能在输入原文中逐字找到，且要覆盖对应结论；脚本只能检查摘录存在，无法自动证明推理正确。

CSV 固定五列：任务、负责人、截止日期、原文依据、待确认项。全部加双引号；内部引号双写；UTF-8 BOM；Windows 换行。以公式触发字符开头的内容会加单引号，避免被 Excel 当公式执行。原始 JSON 保留未转义文本。

输出在唯一子目录中，包含 minutes.md、tasks.csv、pending.md、structured.json 和运行清单 run.json。脚本不会修改原文，也不会覆盖旧输出。运行清单记录文件哈希，不包含密钥。
