import json
import os
from pathlib import Path
import tempfile
import unittest
from concurrent.futures import ThreadPoolExecutor
from threading import Barrier
from unittest.mock import patch

import storage
import storage_budget as budget


class StorageBudgetTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.policy = {'control': str(self.root / 'control'),
                       'external_root': str(self.root), 'volume': str(self.root),
                       'limit_bytes': 256 * 1024 * 1024}
        budget.initialize(self.policy, 0)

    def tearDown(self):
        self.temp.cleanup()

    def test_writer_context_releases_reservation_on_commit_and_rollback(self):
        policy_file = self.root / 'policy.json'
        policy_file.write_text(json.dumps(self.policy))
        with patch.dict(os.environ, DESK_STORAGE_POLICY=str(policy_file), DESK_STORAGE_MODE='EXTERNAL'), patch('storage_host.drive_ready', return_value=True):
            with storage.connect(self.root / 'records.sqlite3') as db:
                db.execute('CREATE TABLE records(value TEXT)')
                db.execute("INSERT INTO records VALUES('committed')")
                self.assertGreater(budget.snapshot(self.policy)[1], 0)
            self.assertEqual(budget.snapshot(self.policy)[1], 0)
            with self.assertRaisesRegex(ValueError, 'rollback'):
                with storage.connect(self.root / 'records.sqlite3') as db:
                    db.execute("INSERT INTO records VALUES('discarded')")
                    raise ValueError('rollback')
            self.assertEqual(budget.snapshot(self.policy)[1], 0)
            with storage.connect_readonly(self.root / 'records.sqlite3') as db:
                self.assertEqual([row[0] for row in db.execute('SELECT value FROM records')], ['committed'])

    def test_dead_process_reservations_are_reclaimed(self):
        lease = budget.reserve(self.policy, 1024)
        with patch.object(budget.os, 'kill', side_effect=ProcessLookupError):
            self.assertEqual(budget.snapshot(self.policy)[1], 0)
        lease.finish()

    def test_live_reservations_share_the_budget_and_release_idempotently(self):
        self.policy['limit_bytes'] = 100
        budget.initialize(self.policy, 0)
        first = budget.reserve(self.policy, 60)
        with self.assertRaisesRegex(RuntimeError, 'budget'):
            budget.reserve(self.policy, 60)
        first.finish(20)
        first.finish(20)
        self.assertEqual(budget.snapshot(self.policy), (20, 0))
        second = budget.reserve(self.policy, 80)
        second.finish()

    def test_simultaneous_writers_cannot_oversubscribe_the_budget(self):
        self.policy['limit_bytes'] = 100
        budget.initialize(self.policy, 0)
        ready = Barrier(8)
        def writer(_):
            ready.wait()
            try:return budget.reserve(self.policy, 60)
            except RuntimeError:return None
        with ThreadPoolExecutor(max_workers=8) as pool:
            leases = [lease for lease in pool.map(writer, range(8)) if lease]
        try:
            self.assertEqual(len(leases), 1)
            self.assertEqual(budget.snapshot(self.policy)[1], 60)
        finally:
            for lease in leases:lease.finish()
