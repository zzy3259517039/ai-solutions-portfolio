# B 站更新提醒与可靠通知

用于关注指定 UP 主的公开视频更新。首次成功读取建立历史基准，之后发现的新视频存入 SQLite，经去重后调用 WxPusher；记录失败、重试与发送结果不确定状态。

该项目适合讲解自动化运行中的状态设计、接口失败和幂等处理。它本身是规则与接口自动化，没有集成 LLM。

## 运行环境与隔离测试

**Windows + Python 3.11+**。使用 `msvcrt` 做本机互斥，并包含 Windows 备用通知；当前不宣称支持 Linux/macOS。

在本项目目录执行：

```powershell
py -3 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe -m unittest -v test_monitor.py
```

测试使用临时数据库和模拟通知，不推送真实消息、不读取本人的订阅库。

## 自行配置并运行

1. 将 `config.example.json` 复制为 `config.json`，只在本机填写 WxPusher SPT；或使用环境变量 `WXPUSHER_SPT`。不要提交此配置。
2. 用 `check_updates.py --add <公开视频账号URL或UID>` 添加订阅。首次读取失败会保留“等待基准”，首次成功只建立基准，不发送旧视频。
3. 执行 `check_updates.py --check` 检查更新，`--status` 查看状态。若接口要求本人登录，可运行 `login_bilibili.py` 完成本机二维码流程；会话文件保持本机私有。
4. 需要定期运行时，先阅读 `install_task.ps1` 再由本人执行；它在当前 Windows 用户下注册登录触发和每 10 分钟任务。电脑须开机、用户登录和联网。本次作品集整理未安装或修改计划任务。

## 状态与故障处理

| 状态 | 含义 | 后续动作 |
| --- | --- | --- |
| baseline | 首次读到的历史视频 | 不推送 |
| pending | 新发现或明确发送失败 | 按退避等待重试 |
| sending | 正在发送 | 进程异常退出后转入不确定处理 |
| notified | 推送接口已受理 | 与手机送达确认分开 |
| uncertain | 超时、异常响应或进程退出，可能已经发送 | 不盲目重发；人工核实后决定 |

API 已受理不等于微信收到。确认实际收到可用 `--mark-received BV号码`；确认未收到后可用 `--retry BV号码` 重新排队，但仍有重复风险。

## 限制与数据边界

公开视频接口可能受限或变化，HTTP 412、-352 等错误不能被当作没有更新；保留已有基准和错误记录。最多读取 5 页，超过上限报错。没有持续可用性 SLA。

WxPusher 渠道的激活、限额和费用以当前账户与官方说明为准。原项目记录过微信渠道需要周期性激活的限制，本次没有重新验证该服务规则，不能保证永久无需操作。

仅打包源码、依赖声明、隔离测试和示例配置。未包含真实订阅、Token、二维码、Cookie、SQLite 库和运行日志。外部服务及其数据权限需由运行者自行确认。
