"""Regression checks for the chart Codex widget's startup selection."""

import tempfile
import unittest
from pathlib import Path
from unittest.mock import Mock

from codex_widget import CodexWidget


class CodexWidgetStartupTests(unittest.TestCase):
    def test_account_omits_archived_chats_and_keeps_active_order(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            widget = CodexWidget(root, 8770)
            widget._save_index([
                {"id": "archived", "title": "Old chat"},
                {"id": "active", "title": "Current chat"},
            ])

            def rpc(method, params, timeout=20):
                if method == "account/read":
                    return {"account": {"type": "chatgpt"}}
                if method == "thread/list":
                    self.assertFalse(params["archived"])
                    self.assertEqual(params["cwd"], str(root.parent))
                    return {"data": [{"id": "active"}], "nextCursor": None}
                self.fail(f"Unexpected method: {method}")

            widget._request = Mock(side_effect=rpc)
            account = widget.account()
            self.assertTrue(account["authenticated"])
            self.assertEqual(account["threads"], [{"id": "active", "title": "Current chat"}])
            self.assertEqual(len(widget._load_index()), 2)

    def test_account_excludes_all_archived_chats(self):
        with tempfile.TemporaryDirectory() as directory:
            widget = CodexWidget(Path(directory), 8770)
            widget._save_index([{"id": "archived", "title": "Old chat"}])
            widget._request = Mock(side_effect=lambda method, params, timeout=20:
                                   {"account": {"type": "chatgpt"}} if method == "account/read"
                                   else {"data": [], "nextCursor": None})
            self.assertEqual(widget.account()["threads"], [])

    def test_new_empty_chat_stays_available_before_first_turn(self):
        with tempfile.TemporaryDirectory() as directory:
            widget = CodexWidget(Path(directory), 8770)
            widget._save_index([{"id": "new", "title": "New Codex chat"}])
            widget._loaded.add("new")
            widget._request = Mock(return_value={"account": {"type": "chatgpt"}})
            self.assertEqual(widget.account()["threads"], [{"id": "new", "title": "New Codex chat"}])
            widget._request.assert_called_once_with("account/read", {"refreshToken": False})


if __name__ == "__main__":
    unittest.main()
