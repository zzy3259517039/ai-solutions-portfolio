"""WxPusher personal notifications. Secrets stay in config.json or environment."""

import argparse
import json
import os
import base64
import subprocess
from datetime import datetime
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

BASE = Path(__file__).resolve().parent
CONFIG = BASE / "config.json"
STATUS = BASE / "notification_status.json"
ENDPOINT = "https://wxpusher.zjiecode.com/api/send/message/simple-push"


def load_token():
    token = os.environ.get("WXPUSHER_SPT", "").strip()
    if not token:
        try:
            config = json.loads(CONFIG.read_text(encoding="utf-8-sig"))
            token = config.get("wxpusher_spt", "")
        except (OSError, ValueError, AttributeError):
            raise ValueError("无法读取 config.json，请检查文件和 JSON 格式。") from None
    if not isinstance(token, str) or not token.strip().startswith("SPT_"):
        raise ValueError("请在 config.json 的 wxpusher_spt 中填写 SPT Token。")
    return token.strip()


def save_result(result):
    temporary = STATUS.with_suffix(".tmp")
    temporary.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    temporary.replace(STATUS)


def send_notification(title, content, url=None):
    """Return API acceptance, not proof that the phone received the message."""
    result = {
        "time": datetime.now().astimezone().isoformat(timespec="seconds"),
        "accepted": False,
        "uncertain": False,
        "phone_received": "未确认",
        "result": "尚未发送",
    }
    try:
        token = load_token()
        text = f"{title}\n\n{content}"
        if url:
            text += f"\n\n点击观看：\n{url}"
        payload = {"spt": token, "summary": title[:100], "content": text, "contentType": 1}
        if url:
            payload["url"] = url
        request = Request(
            ENDPOINT,
            data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        result["uncertain"] = True
        with urlopen(request, timeout=20) as response:
            body = json.loads(response.read().decode("utf-8"))
        if not isinstance(body, dict):
            raise ValueError("API 返回格式异常。")
        code = body.get("code")
        result["uncertain"] = False
        result["api_code"] = code if isinstance(code, int) else None
        if code != 1000 or body.get("success") is False:
            result["result"] = "API 拒绝了推送，请检查 Token 和服务状态。"
        else:
            data = body.get("data")
            rows = data if isinstance(data, list) else [data] if isinstance(data, dict) else []
            if any(row.get("code", 1000) != 1000 for row in rows if isinstance(row, dict)):
                result["result"] = "接收目标推送失败。"
            else:
                result["accepted"] = True
                result["result"] = "API 已受理；请确认手机微信实际收到消息。"
    except HTTPError as exc:
        result["uncertain"] = exc.code >= 500
        result["result"] = f"HTTP 错误：{exc.code}。"
    except (URLError, TimeoutError, OSError):
        result["uncertain"] = True
        result["result"] = "网络请求失败；结果可能不确定，请先检查手机，避免立即重复发送。"
    except (ValueError, TypeError):
        result["result"] = "配置缺失或格式异常，或 API 返回了无效数据。"
    try:
        save_result(result)
    except OSError:
        result["status_write_error"] = "无法保存本地推送状态。"
    return result


def send_windows_backup(title, content):
    """Best-effort local fallback. Never counts as a successful WeChat send."""
    if os.name != "nt":
        return False
    def encode(value):
        return base64.b64encode(value.encode("utf-8")).decode("ascii")
    script = """Add-Type -AssemblyName System.Windows.Forms
$tray = New-Object System.Windows.Forms.NotifyIcon
$tray.Icon = [System.Drawing.SystemIcons]::Information
$tray.Visible = $true
$tray.BalloonTipTitle = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('%s'))
$tray.BalloonTipText = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('%s'))
$tray.ShowBalloonTip(5000)
Start-Sleep -Seconds 5
$tray.Dispose()
""" % (encode(title[:60]), encode(content[:240]))
    try:
        subprocess.Popen(
            ["powershell.exe", "-NoProfile", "-NonInteractive", "-EncodedCommand",
             base64.b64encode(script.encode("utf-16-le")).decode("ascii")],
            creationflags=subprocess.CREATE_NO_WINDOW,
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
        )
        return True
    except OSError:
        return False


def show_status():
    print(f"配置文件存在：{'是' if CONFIG.exists() else '否'}")
    try:
        token = load_token()
        masked = token[:8] + "****" + token[-4:] if len(token) > 16 else "SPT_****"
        print(f"SPT：{masked}")
    except ValueError as exc:
        print(str(exc))
    print("模式：个人 SPT 推送，无需 appToken / UID")
    try:
        state = json.loads(STATUS.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        print("最近推送：暂无记录")
    else:
        print(json.dumps(state, ensure_ascii=False, indent=2))


def main():
    parser = argparse.ArgumentParser(description="B站微信提醒测试与状态检查")
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--test", action="store_true")
    group.add_argument("--status", action="store_true")
    args = parser.parse_args()
    if args.status:
        show_status()
        return 0
    result = send_notification(
        "【B站监控测试】",
        "如果你看到这条微信消息，说明微信接收链路已经跑通。\n\n"
        "B站UP主监控系统微信推送连接测试；B站监控功能尚未接入。",
    )
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0 if result["accepted"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
