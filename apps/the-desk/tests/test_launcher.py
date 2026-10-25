import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

spec=importlib.util.spec_from_file_location('desk_launch',Path(__file__).resolve().parents[1]/'launch.py')
launch=importlib.util.module_from_spec(spec);spec.loader.exec_module(launch)

class LauncherTests(unittest.TestCase):
    def test_occupied_qa_journal_is_never_reused(self):
        with tempfile.TemporaryDirectory() as tmp,patch.object(launch,'ROOT',Path(tmp)),patch.object(launch.sys,'argv',['launch.py','--qa','--journal-port','3102']),patch.object(launch,'reachable',side_effect=lambda url:not (url.endswith('/api/health') or url.endswith('/api/data/status'))):
            with self.assertRaisesRegex(RuntimeError,'occupied'):launch.main()
    def test_owned_next_title_change_stops_process_group(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);(root/'qa-data').mkdir();(root/'qa-data/processes.json').write_text(json.dumps({'owned':[123],'starts':{'123':'same-start'}}))
            with patch.object(launch,'ROOT',root),patch.object(launch.sys,'argv',['launch.py','--qa','--stop']),patch.object(launch.subprocess,'check_output',return_value='next-server (v15)\n'),patch.object(launch,'process_start',return_value='same-start'),patch.object(launch.os,'killpg') as kill:
                launch.main();kill.assert_called_once_with(123,launch.signal.SIGTERM)
    def test_reused_pid_is_never_killed(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);(root/'qa-data').mkdir();(root/'qa-data/processes.json').write_text(json.dumps({'owned':[123],'starts':{'123':'old-start'}}))
            with patch.object(launch,'ROOT',root),patch.object(launch.sys,'argv',['launch.py','--qa','--stop']),patch.object(launch.subprocess,'check_output',return_value=str(root/'server.py')),patch.object(launch,'process_start',return_value='new-start'),patch.object(launch.os,'killpg') as group,patch.object(launch.os,'kill') as kill:
                launch.main();group.assert_not_called();kill.assert_not_called()

if __name__=='__main__':unittest.main()
