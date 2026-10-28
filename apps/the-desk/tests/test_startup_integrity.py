"""Exercise the app startup coordinator without providers or installed data."""
from contextlib import ExitStack
import tempfile
import sys
import unittest
from unittest.mock import MagicMock, patch
import server


class StartupIntegrityTests(unittest.TestCase):
    def run_startup(self, healthy):
        events=[]
        with tempfile.TemporaryDirectory() as data, ExitStack() as stack:
            stack.enter_context(patch('storage_host.route_if_configured',return_value=False))
            stack.enter_context(patch.object(server.signal,'signal'))
            stack.enter_context(patch.object(sys,'argv',['server.py','--data-dir',data,'--port','18909']))
            objects={}
            for name in ('DirectoryLock','DataVault','Engine','SettingsStore','Gateway',
                         'FundingRoutes','RobinhoodWorkspace','IBKRData','SwingResearch',
                         'SwingAdvisors','Workers','Agents','AgentSignals','Spider','ChartChat'):
                objects[name]=stack.enter_context(patch.object(server,name)).return_value
            vault=objects['DataVault'];vault.last_check={};vault.sources={}
            vault.catalog.return_value=[{'id':'verified-baseline'}]
            objects['Engine'].state.return_value={'accounts':[{'id':'paper'}]}
            def preflight():
                self.assertEqual(events,[])
                events.append('preflight')
                return healthy
            vault.preflight.side_effect=preflight
            for name in ('IBKRData','SwingResearch','AgentSignals','Agents','Workers'):
                objects[name].start.side_effect=lambda name=name:events.append(name)
            recovery=stack.enter_context(patch.object(server,'serve_recovery'))
            http=stack.enter_context(patch.object(server,'ThreadingHTTPServer'))
            http.side_effect=lambda *args:events.append('http') or MagicMock()
            server.main()
            return events,recovery.called,http.called,objects

    def test_background_work_begins_only_after_final_integrity_check(self):
        events,recovery,http,_=self.run_startup(True)
        self.assertEqual(events,['preflight','IBKRData','SwingResearch','AgentSignals','Agents','Workers','http'])
        self.assertFalse(recovery)
        self.assertTrue(http)

    def test_failed_final_check_serves_recovery_without_starting_collectors(self):
        events,recovery,http,objects=self.run_startup(False)
        self.assertEqual(events,['preflight'])
        self.assertTrue(recovery)
        self.assertFalse(http)
        objects['SwingResearch'].close.assert_called_once()
        objects['DataVault'].close.assert_called_once()


if __name__=='__main__':unittest.main()
