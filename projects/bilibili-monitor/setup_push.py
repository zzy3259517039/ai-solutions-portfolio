"""Local secret entry and test tool; no credentials appear in chat or logs."""

import json
import threading
import tkinter as tk
from tkinter import messagebox

from notify import CONFIG, send_notification


def main():
    root = tk.Tk()
    root.title("B站微信提醒 — 填入 SPT 后一键测试")
    root.geometry("560x280")
    root.resizable(False, False)
    tk.Label(root, text="把你已获取的 SPT 粘贴到下面，然后点击“保存并测试”。",
             font=("Microsoft YaHei", 11)).pack(pady=(20, 10))
    token_var = tk.StringVar()
    entry = tk.Entry(root, textvariable=token_var, show="*", width=60)
    entry.pack(padx=20, pady=8)
    status_var = tk.StringVar(value="Token 只保存在本机配置中，不会显示到聊天里。")
    tk.Label(root, textvariable=status_var, wraplength=510, justify="left").pack(pady=12)

    def complete(result):
        button.config(state="normal")
        status_var.set(result["result"])
        if result["accepted"]:
            messagebox.showinfo("请看手机微信", "API 已受理测试消息。\n请检查微信是否收到【B站监控测试】。\n收到后，在 Codex 聊天里告诉我“微信已收到”。")

    def worker():
        result = send_notification("【B站监控测试】", "【测试成功】\nB站UP主监控系统已连接消息推送接口。\n如果这条消息出现在微信中，说明微信接收链路也已跑通。\nB站检测功能尚未接入。")
        root.after(0, complete, result)

    def save_and_test():
        token = token_var.get().strip()
        if not token.startswith("SPT_") or len(token) < 8:
            messagebox.showerror("请填入 SPT", "请粘贴以 SPT_ 开头的完整个人推送 Token。")
            return
        try:
            temporary = CONFIG.with_suffix(".tmp")
            config = json.loads(CONFIG.read_text(encoding="utf-8-sig")) if CONFIG.exists() else {}
            config["wxpusher_spt"] = token
            temporary.write_text(json.dumps(config, indent=2), encoding="utf-8")
            temporary.replace(CONFIG)
        except (OSError, ValueError):
            messagebox.showerror("保存失败", "无法写入本地配置文件，请检查文件权限。")
            return
        token_var.set("")
        button.config(state="disabled")
        status_var.set("已保存到本机，正在发送测试消息……")
        threading.Thread(target=worker, daemon=True).start()

    button = tk.Button(root, text="保存并测试", command=save_and_test, width=20)
    button.pack(pady=8)
    root.protocol("WM_DELETE_WINDOW", lambda: root.destroy() if str(button.cget("state")) != "disabled" else None)
    entry.focus_set()
    root.mainloop()


if __name__ == "__main__":
    main()
