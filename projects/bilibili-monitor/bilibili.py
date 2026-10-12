"""Read public UP video dynamics. No login or private account access."""

import json
import re
import time
from pathlib import Path

BASE = Path(__file__).resolve().parent
SESSION_FILE = BASE / "bilibili_session.json"
_CLIENT = None


def get_client():
    global _CLIENT
    if _CLIENT is not None:
        return _CLIENT
    try:
        from curl_cffi import requests
    except ImportError:
        raise BilibiliError("请用项目 .venv\\Scripts\\python.exe 运行；缺少网络依赖。") from None
    client = requests.Session(impersonate="chrome", trust_env=False)
    response = client.get("https://www.bilibili.com/", timeout=20)
    if response.status_code != 200:
        raise BilibiliError(f"初始化匿名网页会话失败：HTTP {response.status_code}。")
    if SESSION_FILE.exists():
        try:
            saved = json.loads(SESSION_FILE.read_text(encoding="utf-8"))
            for name, value in saved.get("cookies", {}).items():
                if name in ("SESSDATA", "buvid3", "b_nut") and isinstance(value, str):
                    client.cookies.set(name, value, domain=".bilibili.com", path="/")
        except (OSError, ValueError, AttributeError):
            raise BilibiliError("本地登录会话无法读取，请重新扫码登录。") from None
    _CLIENT = client
    return client


class BilibiliError(Exception):
    pass


def parse_uid(value):
    match = re.fullmatch(r"(?:https?://space\.bilibili\.com/)?(\d+)(?:/[^?]*)?(?:\?.*)?", value.strip())
    if not match or int(match[1]) <= 0:
        raise ValueError("请输入 UP 主 UID 或 https://space.bilibili.com/数字 主页链接。")
    return int(match[1])


def request_json(path, params, uid):
    try:
        response = get_client().get(
            "https://api.bilibili.com" + path, params=params,
            headers={"Referer": f"https://space.bilibili.com/{uid}", "Accept": "application/json, text/plain, */*"},
            timeout=20,
        )
        if response.status_code != 200:
            raise BilibiliError(f"B站 HTTP {response.status_code}；未修改基准。")
        body = response.json()
    except BilibiliError:
        raise
    except Exception as exc:
        raise BilibiliError(f"B站读取失败（{type(exc).__name__}），稍后重试。") from None
    if not isinstance(body, dict) or body.get("code") != 0:
        code = body.get("code") if isinstance(body, dict) else "无效响应"
        if code in (-101, -352, -403):
            raise BilibiliError(f"B站接口校验失败：{code}；需要有效登录会话，基准未修改。")
        raise BilibiliError(f"B站接口错误：{code}；未修改视频基准。")
    if not isinstance(body.get("data"), dict):
        raise BilibiliError("B站数据格式异常；未修改视频基准。")
    return body["data"]


def fetch_videos(uid, cutoff=None, max_pages=5):
    """Stop after reaching the previous high-water timestamp; filter forwards."""
    videos = {}
    offset = ""
    for page in range(max_pages):
        params = {"host_mid": uid, "platform": "web", "timezone_offset": -480,
                  "features": "itemOpusStyle,listOnlyfans,opusBigCover,onlyfansVote,forwardListHidden,decorationCard,commentsNewVersion,onlyfansAssetsV2,ugcDelete,onlyfansQaCard"}
        if offset:
            params["offset"] = offset
        data = request_json("/x/polymer/web-dynamic/v1/feed/space", params, uid)
        items = data.get("items")
        if not isinstance(items, list) or not items:
            if page == 0:
                raise BilibiliError("未读到公开动态，无法确认最新视频；未修改基准。")
            break
        oldest = None
        for item in items:
            modules = item.get("modules") or {}
            author = modules.get("module_author") or {}
            timestamp = int(author.get("pub_ts") or 0)
            # Pinned dynamics must not terminate pagination early.
            if not (modules.get("module_tag") or {}).get("text") == "置顶" and timestamp:
                oldest = timestamp if oldest is None else min(timestamp, oldest)
            archive = (modules.get("module_dynamic", {}).get("major") or {}).get("archive")
            if item.get("type") != "DYNAMIC_TYPE_AV" or not archive or int(author.get("mid") or 0) != uid:
                continue
            bvid = archive.get("bvid", "")
            if not re.fullmatch(r"BV[0-9A-Za-z]{10}", bvid) or timestamp <= 0:
                raise BilibiliError("视频字段异常；未修改视频基准。")
            videos[bvid] = {
                "uid": uid, "up_name": author.get("name") or str(uid),
                "bvid": bvid, "title": archive.get("title") or bvid,
                "published_at": timestamp, "url": f"https://www.bilibili.com/video/{bvid}",
            }
        if cutoff is None or (oldest is not None and oldest <= cutoff) or not data.get("has_more"):
            break
        next_offset = str(data.get("offset") or "")
        if not next_offset or next_offset == offset:
            raise BilibiliError("B站分页异常，无法确认本轮更新。")
        offset = next_offset
        if page == max_pages - 1:
            raise BilibiliError("新动态超过本轮分页上限，暂不推进基准；需检查遗漏。")
        time.sleep(1)
    if not videos:
        raise BilibiliError("本轮未读到该 UP 主的公开视频，暂不推进基准。")
    return sorted(videos.values(), key=lambda video: video["published_at"], reverse=True)
