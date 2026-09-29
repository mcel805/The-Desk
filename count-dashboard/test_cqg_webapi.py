"""Focused protocol and access-gate checks for the CQG read-only connector."""

import os
import time
import unittest
from unittest.mock import patch

import cqg_webapi as cqg


class FakeSocket:
    def __init__(self, responses):
        self.responses = list(responses)
        self.sent = []

    def send(self, payload):
        self.sent.append(payload)

    def recv(self, timeout):
        return self.responses.pop(0)


class CQGWebAPITest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.pb = cqg._protocol()

    def test_logon_never_drops_existing_session(self):
        answer = self.pb.ServerMsg()
        answer.logon_result.result_code = 0
        answer.logon_result.base_time = "2026-09-28T00:00:00Z"
        answer.logon_result.protocol_version_major = 2
        answer.logon_result.protocol_version_minor = 230
        answer.logon_result.server_time = 0
        socket = FakeSocket([answer.SerializeToString()])
        with patch.dict(os.environ, {
            "BATTY_CQG_CLIENT_APP_ID": "assigned-test-id",
            "BATTY_CQG_USERNAME": "test-user",
            "BATTY_CQG_PASSWORD": "test-secret",
        }):
            base = cqg._logon(socket, self.pb, time.monotonic() + 2)
        request = self.pb.ClientMsg()
        request.ParseFromString(socket.sent[0])
        self.assertFalse(request.logon.drop_concurrent_session)
        self.assertEqual(base, 1790553600000)
        self.assertEqual(request.logon.protocol_version_minor, 230)

    def test_scaled_bar_conversion_and_volume(self):
        bar = self.pb.ServerMsg().time_bar_reports.add().time_bars.add()
        bar.bar_utc_time = 60000
        bar.scaled_open_price = 500010
        bar.scaled_high_price = 500050
        bar.scaled_low_price = 499990
        bar.scaled_close_price = 500030
        bar.volume.significand = 125
        bar.volume.exponent = -1
        converted = cqg._convert_bar(bar, 1790553600000, 0.1)
        self.assertEqual(converted["time"], 1790553660)
        self.assertEqual(converted["volume"], 12.5)
        self.assertAlmostEqual(converted["close"], 50003)

    def test_exact_symbol_resolution_uses_report_metadata(self):
        answer = self.pb.ServerMsg()
        report = answer.information_reports.add()
        report.id = 1
        report.status_code = 0
        meta = report.symbol_resolution_report.contract_metadata
        meta.contract_id = 42
        meta.contract_symbol = "F.US.MYMU26"
        meta.correct_price_scale = 0.1
        socket = FakeSocket([answer.SerializePartialToString()])
        resolved = cqg._resolve(socket, self.pb, 1790553600000, "F.US.MYMU26", time.monotonic() + 2)
        self.assertEqual(resolved.contract_id, 42)
        request = self.pb.ClientMsg()
        request.ParseFromString(socket.sent[0])
        self.assertEqual(request.information_requests[0].symbol_resolution_request.symbol, "F.US.MYMU26")

    def test_demo_cannot_sync_to_chart(self):
        with patch.dict(os.environ, {"BATTY_CQG_WEBSOCKET_URL": cqg.DEMO_URL}):
            with self.assertRaisesRegex(cqg.CQGAccessError, "demo data is isolated"):
                cqg.fetch_bars("CBOT_MINI:MYM1!", "1m")

    def test_missing_access_cannot_sync_to_chart(self):
        with patch.dict(os.environ, {
            "BATTY_CQG_WEBSOCKET_URL": "wss://production.example.org",
            "BATTY_CQG_WEBAPI_ACCESS_APPROVED": "0",
            "BATTY_CQG_STORAGE_AND_COUNT_RIGHTS_CONFIRMED": "0",
        }):
            with self.assertRaisesRegex(cqg.CQGAccessError, "rights must be confirmed"):
                cqg.fetch_bars("CBOT_MINI:MYM1!", "1m")


if __name__ == "__main__":
    unittest.main()
