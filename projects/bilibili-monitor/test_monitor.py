import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch

import bilibili
import check_updates as monitor
import notify


def video(bvid="BV1234567890", published=100):
    return {"uid": 1, "up_name": "Test", "title": "Video", "bvid": bvid,
            "published_at": published, "url": "https://www.bilibili.com/video/" + bvid}


class MonitorTests(unittest.TestCase):
    def setUp(self):
        self.folder = tempfile.TemporaryDirectory()
        self.db = monitor.connect(Path(self.folder.name) / "test.sqlite3")
        self.db.execute("INSERT INTO subscriptions VALUES (1,'Test',100,NULL,NULL)")
        monitor.store_video(self.db, video(), "baseline")
        self.db.commit()
        self.sleep = patch.object(monitor.time, "sleep")
        self.sleep.start()
        self.backup = patch.object(monitor, "send_windows_backup")
        self.backup.start()

    def tearDown(self):
        self.sleep.stop()
        self.backup.stop()
        self.db.close()
        self.folder.cleanup()

    def test_baseline_and_old_pinned_do_not_notify(self):
        self.assertEqual(monitor.discover(self.db, 1, [video(), video("BV0000000000", 90)]), 0)
        sender = MagicMock()
        self.assertEqual(monitor.send_pending(self.db, sender), [])
        sender.assert_not_called()

    def test_success_is_deduplicated_across_restarts(self):
        new = video("BV0000000001", 101)
        self.assertEqual(monitor.discover(self.db, 1, [new]), 1)
        sender = MagicMock(return_value={"accepted": True, "result": "Accepted"})
        self.assertEqual(monitor.send_pending(self.db, sender)[0]["status"], "notified")
        self.db.close()
        self.db = monitor.connect(Path(self.folder.name) / "test.sqlite3")
        self.assertEqual(monitor.discover(self.db, 1, [new]), 0)
        self.assertEqual(monitor.send_pending(self.db, sender), [])
        sender.assert_called_once()

    def test_definite_failure_is_pending_and_retried(self):
        monitor.discover(self.db, 1, [video("BV0000000001", 101)])
        sender = MagicMock(side_effect=[{"accepted": False, "result": "Rejected"}, {"accepted": True, "result": "Accepted"}])
        self.assertEqual(monitor.send_pending(self.db, sender)[0]["status"], "pending")
        self.assertEqual(monitor.send_pending(self.db, sender), [])
        with self.db:
            self.db.execute("UPDATE videos SET next_retry=0 WHERE status='pending'")
        self.assertEqual(monitor.send_pending(self.db, sender)[0]["status"], "notified")
        self.assertEqual(sender.call_count, 2)

    def test_uncertain_send_is_not_blindly_repeated(self):
        monitor.discover(self.db, 1, [video("BV0000000001", 101)])
        sender = MagicMock(return_value={"accepted": False, "uncertain": True, "result": "Timed out"})
        self.assertEqual(monitor.send_pending(self.db, sender)[0]["status"], "uncertain")
        self.assertEqual(monitor.send_pending(self.db, sender), [])
        sender.assert_called_once()

    def test_crash_during_send_is_preserved(self):
        monitor.discover(self.db, 1, [video("BV0000000001", 101)])
        with self.db:
            self.db.execute("UPDATE videos SET status='sending' WHERE status='pending'")
        sender = MagicMock()
        monitor.send_pending(self.db, sender)
        sender.assert_not_called()
        self.assertEqual(self.db.execute("SELECT status FROM videos WHERE bvid='BV0000000001'").fetchone()[0], "uncertain")

    def test_bilibili_failure_keeps_watermark_and_retries_notifications(self):
        monitor.discover(self.db, 1, [video("BV0000000001", 101)])
        with patch.object(monitor, "fetch_videos", side_effect=bilibili.BilibiliError("blocked")), patch.object(monitor, "send_pending", return_value=[]) as retry:
            self.assertTrue(monitor.check(self.db)["errors"])
            retry.assert_called_once()
        self.assertEqual(self.db.execute("SELECT watermark FROM subscriptions").fetchone()[0], 101)

    def test_same_timestamp_new_video_is_detected(self):
        self.assertEqual(monitor.discover(self.db, 1, [video("BV0000000001", 100)]), 1)

    def test_failed_first_read_keeps_subscription_for_initialization(self):
        with patch.object(monitor, "fetch_videos", side_effect=bilibili.BilibiliError("HTTP 412")):
            with self.assertRaises(bilibili.BilibiliError):
                monitor.add_subscription(self.db, 2)
        self.assertEqual(self.db.execute("SELECT watermark FROM subscriptions WHERE uid=2").fetchone()[0], 0)
        initial = dict(video("BV0000000002", 101), uid=2, up_name="Second UP")
        def fetch(uid, **kwargs):
            return [initial] if uid == 2 else [video()]
        with patch.object(monitor, "fetch_videos", side_effect=fetch), patch.object(monitor, "send_pending", return_value=[]):
            report = monitor.check(self.db)
        self.assertEqual(report["discovered"], 0)
        self.assertEqual(len(report["initialized"]), 1)
        self.assertEqual(self.db.execute("SELECT status FROM videos WHERE bvid=?", (initial["bvid"],)).fetchone()[0], "baseline")


class NotifyTests(unittest.TestCase):
    def test_api_rejection_and_partial_failure(self):
        for body in [{"code": 1001}, {"code": 1000, "data": [{"code": 1002}]}]:
            handle = MagicMock()
            handle.__enter__.return_value.read.return_value = json.dumps(body).encode()
            with patch.object(notify, "load_token", return_value="SPT_private_test"), patch.object(notify, "urlopen", return_value=handle), patch.object(notify, "save_result"):
                result = notify.send_notification("test", "content")
                self.assertFalse(result["accepted"])
                self.assertNotIn("SPT_private_test", json.dumps(result))

    def test_timeout_is_uncertain(self):
        with patch.object(notify, "load_token", return_value="SPT_private_test"), patch.object(notify, "urlopen", side_effect=TimeoutError), patch.object(notify, "save_result"):
            result = notify.send_notification("test", "content")
            self.assertTrue(result["uncertain"])
            self.assertFalse(result["accepted"])


class BilibiliReadTests(unittest.TestCase):
    def test_verification_failure_does_not_become_empty_video_list(self):
        client = MagicMock()
        client.get.return_value.status_code = 200
        client.get.return_value.json.return_value = {"code": -352, "data": {"v_voucher": "private"}}
        with patch.object(bilibili, "get_client", return_value=client):
            with self.assertRaises(bilibili.BilibiliError):
                bilibili.fetch_videos(1)

    def test_http_failure_is_explicit(self):
        client = MagicMock()
        client.get.return_value.status_code = 412
        with patch.object(bilibili, "get_client", return_value=client):
            with self.assertRaisesRegex(bilibili.BilibiliError, "412"):
                bilibili.fetch_videos(1)


if __name__ == "__main__":
    unittest.main()
