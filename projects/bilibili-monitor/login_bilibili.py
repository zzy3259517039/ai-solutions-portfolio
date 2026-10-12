"""Human QR sign-in. Store only required session cookies on this computer."""

import json
import threading
import time
import tkinter as tk
from pathlib import Path
from urllib.parse import urlsplit

import qrcode
from PIL import ImageTk
from curl_cffi import requests

BASE = Path(__file__).resolve().parent
SESSION_FILE = BASE / "bilibili_session.json"


def save_json(path, data):
    temporary = path.with_suffix(".tmp")
    temporary.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    temporary.replace(path)


def generate():
    client = requests.Session(impersonate="chrome", trust_env=False)
    response = client.get("https://passport.bilibili.com/x/passport-login/web/qrcode/generate", timeout=20)
    response.raise_for_status()
    body = response.json()
    if body.get("code") != 0:
        raise RuntimeError("B站二维码生成失败。")
    data = body["data"]
    destination = urlsplit(data["url"])
    if destination.scheme != "https" or destination.hostname not in ("passport.bilibili.com", "account.bilibili.com"):
        raise RuntimeError("登录二维码地址异常。")
    image = qrcode.make(data["url"]).convert("RGB").resize((360, 360))
    image.save(BASE / "login_qr.png")
    return client, data["qrcode_key"], image


def poll(client, key):
    response = client.get("https://passport.bilibili.com/x/passport-login/web/qrcode/poll", params={"qrcode_key": key}, timeout=15)
    response.raise_for_status()
    body = response.json()
    if body.get("code") != 0:
        raise RuntimeError("B站扫码状态读取失败。")
    data = body["data"]
    if data["code"] == 0:
        # Do not save CSRF token or refresh token: monitoring only reads videos.
        cookies = {cookie.name: cookie.value for cookie in client.cookies.jar
                   if cookie.name in ("SESSDATA", "buvid3", "b_nut")
                   and cookie.domain.lstrip(".") in ("bilibili.com", "passport.bilibili.com")}
        if not cookies.get("SESSDATA"):
            raise RuntimeError("登录成功但未获取会话，未保存配置。")
        save_json(SESSION_FILE, {"cookies": cookies, "saved_at": time.time()})
    return data["code"]


def main():
    root = tk.Tk()
    root.title("B站更新提醒 — 用 B站 App 扫码登录")
    root.geometry("530x570")
    root.resizable(False, False)
    text = tk.StringVar(value="正在获取 B站登录二维码……")
    tk.Label(root, text="用 B站 App 扫码，并在手机上确认登录", font=("Microsoft YaHei", 13)).pack(pady=12)
    label = tk.Label(root)
    label.pack()
    tk.Label(root, textvariable=text, wraplength=485, justify="left").pack(pady=12)
    tk.Label(root, text="会话仅保存在本机，用于读取 UP 主视频。\n不需要发送密码或 Cookie 到聊天中。", wraplength=480).pack()
    stopped = threading.Event()
    busy = False

    def set_status(value):
        if not stopped.is_set():
            root.after(0, text.set, value)

    def render(image):
        label.image = ImageTk.PhotoImage(image)
        label.configure(image=label.image)

    def finish_login():
        set_status("已登录，正在初始化 4 位 UP 主的视频基准……")
        try:
            from check_updates import single_run, connect, check
            import bilibili
            bilibili._CLIENT = None
            with single_run():
                db = connect()
                try:
                    report = check(db)
                    awaiting = db.execute("SELECT count(*) FROM subscriptions WHERE watermark=0").fetchone()[0]
                finally:
                    db.close()
            save_json(BASE / "login_status.json", {"logged_in": True, "awaiting_baseline": awaiting,
                      "errors": report["errors"], "time": time.time()})
            set_status("登录成功，4 位 UP 主基准已建立；请告诉 Codex“已扫码”。" if awaiting == 0 and not report["errors"]
                       else "登录成功，但部分读取仍失败。程序已记录结果，请告诉 Codex“已扫码”。")
        except Exception:
            save_json(BASE / "login_status.json", {"logged_in": True, "initialization": "尚未完成", "time": time.time()})
            set_status("登录已保存，初始化未完成；请告诉 Codex“已扫码”，由 Codex继续检查。")

    def worker():
        nonlocal busy
        try:
            client, key, image = generate()
            root.after(0, render, image)
            set_status("二维码有效约 3 分钟。请用 B站 App 扫码，并确认登录。")
            deadline = time.monotonic() + 175
            while not stopped.wait(3) and time.monotonic() < deadline:
                code = poll(client, key)
                if code == 0:
                    finish_login()
                    return
                if code == 86038:
                    break
                if code == 86090:
                    set_status("已扫描，请在手机 B站 App 上确认登录。")
                elif code != 86101:
                    raise RuntimeError("扫码状态异常。")
            set_status("二维码已过期。准备好手机后，点击“刷新二维码”。")
        except Exception:
            set_status("获取或检查二维码失败；可点击“刷新二维码”重试。")
        finally:
            busy = False
            if not stopped.is_set():
                root.after(0, button.config, {"state": "normal"})

    def start():
        nonlocal busy
        if busy:
            return
        busy = True
        button.config(state="disabled")
        threading.Thread(target=worker, daemon=True).start()

    button = tk.Button(root, text="刷新二维码", command=start, width=20)
    button.pack(pady=12)
    def close():
        stopped.set()
        root.destroy()
    root.protocol("WM_DELETE_WINDOW", close)
    start()
    root.mainloop()


if __name__ == "__main__":
    main()
