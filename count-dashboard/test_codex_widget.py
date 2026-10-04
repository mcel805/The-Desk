"""Regression checks for the chart Codex widget's startup selection."""

import base64
import json
import tempfile
import time
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


class CodexWidgetTurnTests(unittest.TestCase):
    def make_widget(self, directory):
        root = Path(directory) / "count-dashboard"
        root.mkdir()
        widget = CodexWidget(root, 8770)
        widget._save_index([{"id": "test-thread", "title": "New Codex chat"}])
        widget._loaded.add("test-thread")
        widget._require_chatgpt = Mock()
        return widget

    def test_selected_cleo_skill_uses_native_skill_input_and_research_sandbox(self):
        with tempfile.TemporaryDirectory() as directory:
            widget = self.make_widget(directory)
            requests = []

            def request(method, params, timeout=20):
                requests.append((method, params))
                if method == "skills/list":
                    return {"data": [{"cwd": str(widget.workspace), "skills": [
                        {"name": "cleo", "path": str(widget.workspace / ".agents/skills/cleo/SKILL.md"),
                         "enabled": True}]}]}
                if method == "turn/start":
                    return {"turn": {"id": "turn-1"}}
                self.fail(method)

            widget._request = Mock(side_effect=request)
            widget.send("test-thread", "Read this chart", {"symbol": "MYM", "cutoff": None},
                        skill="cleo")
            turn = requests[-1][1]
            self.assertEqual(turn["sandboxPolicy"], {"type": "readOnly"})
            self.assertEqual(turn["approvalPolicy"], "never")
            self.assertEqual(turn["input"][1]["type"], "skill")
            self.assertEqual(turn["input"][1]["name"], "cleo")
            self.assertIn("$cleo", turn["input"][0]["text"])
            self.assertEqual(widget._load_history()["test-thread"][0]["metadata"]["skill"], "cleo")

    def test_multi_timeframe_chart_context_fits_the_bounded_turn_payload(self):
        with tempfile.TemporaryDirectory() as directory:
            widget = self.make_widget(directory)
            widget._request = Mock(return_value={"turn": {"id": "turn-large-chart"}})
            bars = [{"time": 1_700_000_000 + index * 60, "open": 65000.0, "high": 65020.5,
                     "low": 64990.25, "close": 65010.75, "volume": 12.34}
                    for index in range(4000)]
            chart = {"readMarket": {"schema": "cleo.market-read-context.v1",
                                     "frames": [{"timeframe": "1m", "status": "available", "bars": bars}]}}

            result = widget.send("test-thread", "Read the market", chart)

            self.assertEqual(result["turnId"], "turn-large-chart")
            turn = widget._request.call_args.args[1]
            self.assertIn('"readMarket"', turn["input"][0]["text"])
            self.assertIn('"timeframe":"1m"', turn["input"][0]["text"])

    def test_read_market_uses_its_four_section_contract_without_generic_chart_read_markup(self):
        with tempfile.TemporaryDirectory() as directory:
            widget = self.make_widget(directory)

            def request(method, params, timeout=20):
                if method == "skills/list":
                    return {"data": [{"cwd": str(widget.workspace), "skills": [
                        {"name": "cleo", "path": str(widget.workspace / ".agents/skills/cleo/SKILL.md"),
                         "enabled": True}]}]}
                if method == "turn/start":
                    return {"turn": {"id": "turn-market-read"}}
                self.fail(method)

            widget._request = Mock(side_effect=request)
            chart = {"symbol": "BTC", "timeframe": "1h", "cutoff": 1_700_000_000,
                     "readMarket": {"schema": "cleo.market-read-context.v1", "frames": []}}

            widget.send("test-thread", "Read the market", chart, skill="cleo")

            prompt = widget._request.call_args.args[1]["input"][0]["text"]
            self.assertIn("READ THE MARKET MODE", prompt)
            self.assertIn("Relative Volume & Divergence", prompt)
            self.assertIn("CLEO_MARKET_READ_START", prompt)
            self.assertIn("source {provider,symbol,timeframe,cutoff}", prompt)
            self.assertIn("Return at most five unique active-chart marks", prompt)
            self.assertIn("geometry must be level", prompt)
            self.assertIn("visible zone corners", prompt)
            self.assertNotIn("on-demand technician's market read", prompt)

    def test_chart_context_still_rejects_payloads_above_the_limit(self):
        with tempfile.TemporaryDirectory() as directory:
            widget = self.make_widget(directory)
            with self.assertRaisesRegex(ValueError, "Chart context is too large"):
                widget.send("test-thread", "Read the market", {"notes": "x" * 750_000})

    def test_build_turn_is_repo_scoped_and_agent_request_is_explicit(self):
        with tempfile.TemporaryDirectory() as directory:
            widget = self.make_widget(directory)
            agent_dir = widget.workspace / ".codex" / "agents"
            agent_dir.mkdir(parents=True)
            (agent_dir / "indicator_agent.toml").write_text(
                'name = "indicator_agent"\ndescription = "Build one indicator"\nsandbox_mode = "workspace-write"\n')
            requests = []

            def request(method, params, timeout=20):
                requests.append((method, params))
                if method == "skills/list":
                    return {"data": [{"cwd": str(widget.workspace), "skills": []}]}
                if method == "turn/start":
                    return {"turn": {"id": "turn-2"}}
                self.fail(method)

            widget._request = Mock(side_effect=request)
            widget.send("test-thread", "Build a candidate", mode="build", agent="indicator_agent")
            turn = requests[-1][1]
            self.assertEqual(turn["approvalPolicy"], "onRequest")
            self.assertEqual(turn["sandboxPolicy"], {"type": "workspaceWrite",
                "writableRoots": [str(widget.workspace)], "networkAccess": False})
            self.assertIn("indicator_agent", turn["input"][0]["text"])
            self.assertEqual(widget._turn_modes["test-thread"], "build")

    def test_approval_requires_matching_active_build_turn(self):
        with tempfile.TemporaryDirectory() as directory:
            widget = self.make_widget(directory)
            widget._send = Mock()
            widget._active_turns["test-thread"] = "turn-2"
            widget._turn_modes["test-thread"] = "build"
            widget._approvals["approval-1"] = {"id": "approval-1", "rpcId": 9,
                "threadId": "test-thread", "turnId": "turn-2", "createdAt": time.time()}
            with self.assertRaisesRegex(Exception, "no longer pending"):
                widget.decide("test-thread", "wrong-turn", "approval-1", "accept")
            self.assertEqual(widget.decide("test-thread", "turn-2", "approval-1", "accept"),
                             {"resolved": True, "decision": "accept"})
            widget._send.assert_called_once_with({"id": 9, "result": {"decision": "accept"}})
            with self.assertRaisesRegex(Exception, "no longer pending"):
                widget.decide("test-thread", "turn-2", "approval-1", "accept")

    def test_screenshot_is_local_input_and_rejected_when_invalid(self):
        with tempfile.TemporaryDirectory() as directory:
            widget = self.make_widget(directory)
            widget._request = Mock(return_value={"turn": {"id": "turn-image"}})
            png = base64.b64encode(base64.b64decode(
                "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9vTAAAAABJRU5ErkJggg=="
            )).decode()
            widget.send("test-thread", "Describe screenshot evidence", image=f"data:image/png;base64,{png}")
            turn = widget._request.call_args.args[1]
            image_item = turn["input"][1]
            self.assertEqual(image_item["type"], "localImage")
            self.assertTrue(Path(image_item["path"]).exists())
            with self.assertRaisesRegex(ValueError, "PNG, JPEG, or WebP"):
                widget._image_path("data:text/plain;base64,SGVsbG8=")

    def test_server_approval_request_is_exposed_only_for_active_build_turn(self):
        request = {"id": 77, "method": "item/commandExecution/requestApproval", "params": {
            "threadId": "test-thread", "turnId": "turn-2", "itemId": "command-1",
            "command": "python3 -m unittest", "cwd": "/repo"}}
        for mode in ("build", "research"):
            with self.subTest(mode=mode), tempfile.TemporaryDirectory() as directory:
                widget = self.make_widget(directory)
                widget._active_turns["test-thread"] = "turn-2"
                widget._turn_modes["test-thread"] = mode
                widget._process = Mock(stdout=[json.dumps(request)])
                widget._send = Mock()
                widget._read_loop()
                methods = [event["method"] for event in widget._events["test-thread"]]
                if mode == "build":
                    self.assertIn("widget/approvalRequested", methods)
                    widget._send.assert_not_called()
                else:
                    self.assertIn("widget/approvalDeclined", methods)
                    widget._send.assert_called_once_with({"id": 77, "result": {"decision": "decline"}})


if __name__ == "__main__":
    unittest.main()
