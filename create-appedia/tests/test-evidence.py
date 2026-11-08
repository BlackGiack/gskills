import importlib.util
import json
from pathlib import Path
import subprocess
import tempfile
import unittest

script = Path(__file__).resolve().parents[1] / 'scripts/test-evidence.py'
spec = importlib.util.spec_from_file_location('collector', script)
collector = importlib.util.module_from_spec(spec)
spec.loader.exec_module(collector)

class EvidenceTests(unittest.TestCase):
    def test_collection_never_executes_and_ignores_outputs(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            (root / 'test_orders.py').write_text('raise RuntimeError("must not execute")\n')
            (root / 'orders.go').write_text('package orders\nfunc Place() {}\n')
            (root / 'node_modules').mkdir()
            (root / 'node_modules/hidden_test.go').write_text('not source')
            first = collector.collect(root, 'WORKTREE', [], set())
            self.assertEqual(list(first['files']), ['test_orders.py'])
            (root / 'appedia').mkdir()
            (root / 'appedia/test_generated.py').write_text('generated')
            self.assertEqual(first['fingerprint'], collector.collect(root, 'WORKTREE', [], set())['fingerprint'])
            (root / 'orders.go').write_text('package orders\nfunc Place() { panic("x") }\n')
            self.assertNotEqual(first['fingerprint'], collector.collect(root, 'WORKTREE', [], set())['fingerprint'])
    def test_profile_counts_statements_not_lines_or_hits(self):
        with tempfile.TemporaryDirectory() as temp:
            profile = Path(temp) / 'coverage.out'
            profile.write_text('mode: atomic\nexample.test/orders/order.go:1.1,2.2 4 10\nexample.test/orders/order.go:3.1,4.2 6 0\nexample.test/store/store.go:1.1,2.2 2 0\n')
            mode, rows = collector.coverage_rows(profile)
            self.assertEqual(mode, 'atomic')
            self.assertEqual(rows, [{'path':'example.test/orders','statements':10,'covered':4},{'path':'example.test/store','statements':2,'covered':0}])
            profile.write_text('mode: atomic\nexample.test/a.go:1.1,2.2 1 -1\n')
            with self.assertRaises(ValueError):collector.coverage_rows(profile)
    def test_path_and_import_provenance(self):
        for path in ['../x', '/x', 'a/../b', 'C:/x', 'a\\b']:
            self.assertFalse(collector.safe(path))
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            (root/'order_test.go').write_text('package orders\n')
            profile=root/'cover.out';profile.write_text('mode: atomic\nexample.test/orders/orders.go:1.1,2.2 1 0\n')
            result=subprocess.run(['python3',str(script),'--root',str(root),'--out',str(root/'result.json'),'--coverage',str(profile)],capture_output=True,text=True)
            self.assertNotEqual(result.returncode,0)
            self.assertIn('requires both',result.stderr)
    def test_worktree_deletion_is_not_a_missing_file_error(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            subprocess.run(['git', 'init', '-q', str(root)], check=True)
            path = root / 'order_test.go'
            path.write_text('package orders\n')
            subprocess.run(['git', '-C', str(root), 'add', 'order_test.go'], check=True)
            before = collector.collect(root, 'WORKTREE', [], set())
            path.unlink()
            after = collector.collect(root, 'WORKTREE', [], set())
            self.assertEqual(after['files'], {})
            self.assertNotEqual(before['fingerprint'], after['fingerprint'])

    def test_explicit_go_execution_and_recorded_zero(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp)
            (root/'go.mod').write_text('module example.test/orders\n\ngo 1.22\n')
            (root/'order.go').write_text('package orders\nfunc Place() int { return 1 }\n')
            (root/'order_test.go').write_text('package orders\nimport ("testing"; "os")\nfunc TestPlaceholder(t *testing.T) { if err := os.WriteFile("form.png", []byte{137,80,78,71,13,10,26,10}, 0600); err != nil { t.Fatal(err) } }\n')
            output=root/'evidence.json'
            result=subprocess.run(['python3',str(script),'--root',str(root),'--out',str(output),'--run-go-coverage','--file','form.png'],capture_output=True,text=True)
            self.assertEqual(result.returncode,0,result.stderr+result.stdout)
            data=json.loads(output.read_text())
            self.assertEqual(data['coverage']['head']['result'],'passed')
            self.assertIn('image', data['head']['files']['form.png'])
            self.assertEqual(data['coverage']['head']['packages'][0]['covered'],0)
            self.assertEqual(data['coverage']['head']['fingerprint'],data['head']['fingerprint'])

if __name__=='__main__':unittest.main()
