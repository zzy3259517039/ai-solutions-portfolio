"""Persistent discovery, retry and notification deduplication."""

import argparse
import json
import logging
from logging.handlers import RotatingFileHandler
import msvcrt
import sqlite3
import time
from contextlib import contextmanager
from datetime import datetime
from pathlib import Path

from bilibili import BilibiliError, fetch_videos, parse_uid
from notify import BASE, send_notification, send_windows_backup

DATABASE = BASE / "monitor.sqlite3"
LOG = logging.getLogger("bilibili-monitor")


def connect(path=DATABASE):
    db = sqlite3.connect(path, timeout=20)
    db.row_factory = sqlite3.Row
    db.executescript("""
        CREATE TABLE IF NOT EXISTS subscriptions (
            uid INTEGER PRIMARY KEY, name TEXT NOT NULL, watermark INTEGER NOT NULL,
            last_check REAL, last_error TEXT
        );
        CREATE TABLE IF NOT EXISTS videos (
            bvid TEXT PRIMARY KEY, uid INTEGER NOT NULL, title TEXT NOT NULL,
            published_at INTEGER NOT NULL, url TEXT NOT NULL,
            discovered_at REAL NOT NULL, status TEXT NOT NULL,
            attempts INTEGER NOT NULL DEFAULT 0, next_retry REAL NOT NULL DEFAULT 0,
            notified_at REAL, last_result TEXT
        );
    """)
    return db


@contextmanager
def single_run():
    with (BASE / "monitor.lock").open("a+b") as handle:
        handle.seek(0)
        if not handle.read(1):
            handle.write(b"0")
            handle.flush()
        handle.seek(0)
        try:
            msvcrt.locking(handle.fileno(), msvcrt.LK_NBLCK, 1)
        except OSError:
            raise RuntimeError("已有检测任务运行，本轮跳过。") from None
        try:
            yield
        finally:
            handle.seek(0)
            msvcrt.locking(handle.fileno(), msvcrt.LK_UNLCK, 1)


def store_video(db, video, status):
    db.execute("""INSERT OR IGNORE INTO videos
        (bvid,uid,title,published_at,url,discovered_at,status) VALUES (?,?,?,?,?,?,?)""",
        (video["bvid"], video["uid"], video["title"], video["published_at"], video["url"], time.time(), status))


def add_subscription(db, uid):
    existing = db.execute("SELECT * FROM subscriptions WHERE uid=?", (uid,)).fetchone()
    if existing and existing["watermark"] > 0:
        return {"uid": uid, "result": "已在监控中，未重置基准。"}
    # Keep requested subscriptions even when the first live read is blocked.
    if not existing:
        with db:
            db.execute("INSERT INTO subscriptions VALUES (?,?,?,?,?)", (uid, str(uid), 0, None, "等待首次读取并建立基准。"))
    try:
        videos = fetch_videos(uid)
    except (BilibiliError, ValueError, TypeError, KeyError) as exc:
        with db:
            db.execute("UPDATE subscriptions SET last_check=?,last_error=? WHERE uid=?", (time.time(), str(exc), uid))
        raise
    watermark = max(video["published_at"] for video in videos)
    with db:
        db.execute("UPDATE subscriptions SET name=?,watermark=?,last_check=?,last_error=NULL WHERE uid=?", (videos[0]["up_name"], watermark, time.time(), uid))
        for video in videos:
            store_video(db, video, "baseline")
    return {"uid": uid, "name": videos[0]["up_name"], "baseline_videos": len(videos),
            "latest": videos[0], "result": "已记录基准；历史视频不会推送。"}


def discover(db, uid, videos):
    sub = db.execute("SELECT * FROM subscriptions WHERE uid=?", (uid,)).fetchone()
    if not sub:
        raise ValueError("该 UP 主尚未初始化。")
    count = 0
    with db:
        for video in videos:
            # Time watermark protects against late reappearance of old/pinned items.
            status = "pending" if video["published_at"] >= sub["watermark"] else "baseline"
            before = db.total_changes
            store_video(db, video, status)
            if status == "pending" and db.total_changes > before:
                count += 1
        watermark = max([sub["watermark"]] + [video["published_at"] for video in videos])
        db.execute("UPDATE subscriptions SET watermark=?,last_check=?,last_error=NULL WHERE uid=?", (watermark, time.time(), uid))
    return count


def send_pending(db, sender=send_notification, simulation=False):
    results = []
    # Crash during send leaves an uncertain record, avoiding blind duplicates.
    with db:
        db.execute("UPDATE videos SET status='uncertain',last_result='上次发送中断，需人工核实收信后处理。' WHERE status='sending'")
    rows = db.execute("""SELECT v.*, s.name FROM videos v JOIN subscriptions s ON s.uid=v.uid
        WHERE status='pending' AND next_retry<=? ORDER BY published_at LIMIT 10""", (time.time(),)).fetchall()
    for row in rows:
        with db:
            db.execute("UPDATE videos SET status='sending',attempts=attempts+1 WHERE bvid=?", (row["bvid"],))
        title = "【B站模拟更新验收】" if simulation else "【B站更新提醒】"
        published = datetime.fromtimestamp(row["published_at"]).strftime("%Y-%m-%d %H:%M")
        content = f"UP主：{row['name']}\n\n新视频：\n《{row['title']}》\n\n发布时间：{published}\nBV号：{row['bvid']}"
        if simulation:
            content = "这是模拟发现新视频的验收消息，链接指向真实视频；并非刚刚发布。\n\n" + content
        try:
            result = sender(title, content, row["url"])
        except Exception:
            result = {"accepted": False, "uncertain": True, "result": "推送模块中断，需核实收信。"}
        status = "notified" if result.get("accepted") else "uncertain" if result.get("uncertain") else "pending"
        retry = time.time() + min(3600, 60 * 2 ** min(row["attempts"], 6))
        with db:
            db.execute("""UPDATE videos SET status=?,next_retry=?,notified_at=?,last_result=? WHERE bvid=?""",
                (status, retry, time.time() if status == "notified" else None, result["result"], row["bvid"]))
        results.append({"bvid": row["bvid"], "status": status, "result": result["result"]})
        if status != "notified" and row["attempts"] == 0:
            send_windows_backup("B站更新：微信推送需检查", f"{row['name']}：{row['title']}\n{row['url']}")
        LOG.info("通知 %s %s", row["bvid"], status)
        time.sleep(0.6)
    return results


def check(db):
    report = {"discovered": 0, "initialized": [], "errors": [], "notifications": []}
    for sub in db.execute("SELECT * FROM subscriptions").fetchall():
        try:
            if sub["watermark"] == 0:
                report["initialized"].append(add_subscription(db, sub["uid"]))
                time.sleep(1)
                continue
            videos = fetch_videos(sub["uid"], cutoff=sub["watermark"])
            report["discovered"] += discover(db, sub["uid"], videos)
        except (BilibiliError, ValueError, TypeError, KeyError) as exc:
            error = f"UID {sub['uid']}：{exc}"
            LOG.warning(error)
            report["errors"].append(error)
            with db:
                db.execute("UPDATE subscriptions SET last_check=?,last_error=? WHERE uid=?", (time.time(), error, sub["uid"]))
        time.sleep(1)
    # Notification failures are retried even when Bilibili itself is unavailable.
    report["notifications"] = send_pending(db)
    LOG.info("检测完成 新视频=%d 接口错误=%d", report["discovered"], len(report["errors"]))
    return report


def status(db):
    return {
        "subscriptions": [dict(row) for row in db.execute("SELECT * FROM subscriptions")],
        "awaiting_baseline": [row[0] for row in db.execute("SELECT uid FROM subscriptions WHERE watermark=0")],
        "bilibili_session_configured": (BASE / "bilibili_session.json").exists(),
        "video_states": {row[0]: row[1] for row in db.execute("SELECT status,count(*) FROM videos GROUP BY status")},
        "attention": [dict(row) for row in db.execute("SELECT bvid,status,last_result FROM videos WHERE status IN ('pending','uncertain','sending')")],
        "latest_notifications": [dict(row) for row in db.execute("SELECT bvid,notified_at,last_result FROM videos WHERE status='notified' ORDER BY notified_at DESC LIMIT 5")],
        "note": "notified 表示推送 API 已受理；手机接收与链接打开需实际确认。",
    }


def simulate(uid, videos=None):
    videos = fetch_videos(uid) if videos is None else videos
    latest = videos[0]
    db = connect(BASE / "acceptance.sqlite3")
    try:
        if not db.execute("SELECT 1 FROM subscriptions WHERE uid=?", (uid,)).fetchone():
            with db:
                db.execute("INSERT INTO subscriptions VALUES (?,?,?,?,?)", (uid, latest["up_name"], latest["published_at"] - 1, time.time(), None))
                for video in videos[1:]:
                    store_video(db, video, "baseline")
        discovered = discover(db, uid, videos)
        first = send_pending(db, simulation=True)
        again_discovered = discover(db, uid, videos)
        second = send_pending(db, simulation=True)
        return {"simulation": True, "latest": latest, "discovered": discovered,
                "first_send": first, "repeat_discovered": again_discovered, "repeat_send": second,
                "result": "检查手机收信并点击视频链接；验收数据库与正式监控分开。"}
    finally:
        db.close()


def main():
    handler = RotatingFileHandler(BASE / "monitor.log", maxBytes=1_000_000, backupCount=3, encoding="utf-8")
    handler.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(message)s"))
    LOG.addHandler(handler)
    LOG.setLevel(logging.INFO)
    parser = argparse.ArgumentParser(description="B站UP主微信更新提醒")
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--add", metavar="UID_OR_URL")
    group.add_argument("--check", action="store_true")
    group.add_argument("--status", action="store_true")
    group.add_argument("--simulate-new", metavar="UID_OR_URL")
    group.add_argument("--mark-received", metavar="BV_NUMBER")
    group.add_argument("--retry", metavar="BV_NUMBER", help="确认未收到后，允许重新发送一条不确定的通知")
    args = parser.parse_args()
    try:
        with single_run():
            if args.simulate_new:
                report = simulate(parse_uid(args.simulate_new))
            else:
                db = connect()
                try:
                    if args.mark_received or args.retry:
                        bvid = args.mark_received or args.retry
                        with db:
                            cursor = db.execute("UPDATE videos SET status=?,notified_at=?,next_retry=0,last_result=? WHERE bvid=? AND status='uncertain'",
                                ("notified" if args.mark_received else "pending", time.time() if args.mark_received else None,
                                 "用户确认已收到。" if args.mark_received else "用户确认未收到，允许重试。", bvid))
                        report = {"bvid": bvid, "updated": cursor.rowcount}
                    else:
                        report = add_subscription(db, parse_uid(args.add)) if args.add else check(db) if args.check else status(db)
                finally:
                    db.close()
        if __import__('sys').stdout is not None:
            print(json.dumps(report, ensure_ascii=False, indent=2))
        return 1 if report.get("errors") else 0
    except Exception as exc:
        LOG.error("任务失败：%s", exc)
        if __import__('sys').stdout is not None:
            print(f"任务失败：{exc}")
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
