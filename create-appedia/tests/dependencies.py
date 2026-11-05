"""Dependency evidence and failure tests; no network or project installation."""
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("dependencies", Path(__file__).resolve().parents[1] / "scripts/dependencies.py")
deps = importlib.util.module_from_spec(spec)
spec.loader.exec_module(deps)


class DependenciesTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)

    def write(self, name, text):
        path = self.root / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text)

    def test_go_direct_only_and_changed_package_usage(self):
        self.write("go.mod", 'module example.com/demo\nrequire (\nexample.com/used v1.0.0\nexample.com/unused v1.0.0\nexample.com/transitive v1.0.0 // indirect\n)\nrequire example.com/single v2.0.0\n')
        self.write("service/changed.go", 'package service\nfunc Changed() {}')
        self.write("service/neighbour.go", 'package service\nimport "example.com/used/sub"')
        self.write("other/main.go", 'package other\nimport "example.com/unused"')
        self.write("service/nested/main.go", 'package nested\nimport "example.com/single"')
        self.write("removed/survivor.go", 'package removed\nimport "example.com/single"')
        with patch.object(deps, "command", return_value='{"Version":"v1.0.0","Update":{"Version":"v2.0.0"}}'):
            snapshot = deps.collect(self.root, "go", [{"path": "service/changed.go", "status": "M"}, {"path": "removed/main.go", "status": "D"}])
        rows = {d["name"]: d for d in snapshot["dependencies"]}
        self.assertEqual(set(rows), {"example.com/used", "example.com/unused", "example.com/single"})
        self.assertEqual(rows["example.com/used"]["paths"], ["service/neighbour.go"])
        self.assertEqual(rows["example.com/unused"]["paths"], [])
        self.assertEqual(rows["example.com/single"]["paths"], ["removed/survivor.go"])
        self.assertEqual(rows["example.com/used"]["status"], "outdated")

    def test_npm_lock_and_scoped_import_boundaries(self):
        self.write("package.json", json.dumps({"dependencies": {"@demo/lib": "^1.0.0", "extra": "^1.0.0"}, "devDependencies": {"tool": "2.0.0"}}))
        self.write("package-lock.json", json.dumps({"packages": {"node_modules/@demo/lib": {"version": "1.5.0"}}}))
        self.write("src/main.ts", 'import x from "@demo/lib/sub"; import "extra-long"; const tool = require("tool"); // import x from "extra"\n/* import "extra"; */')
        with patch.object(deps, "command", return_value='"2.0.0"'):
            snapshot = deps.collect(self.root, "ts")
        rows = {d["name"]: d for d in snapshot["dependencies"]}
        self.assertEqual(rows["@demo/lib"]["used"], "1.5.0")
        self.assertEqual(rows["@demo/lib"]["paths"], ["src/main.ts"])
        self.assertEqual(rows["extra"]["used"], "?")
        self.assertEqual(rows["extra"]["paths"], [])
        self.assertEqual(rows["tool"]["status"], "current")

    @unittest.skipIf(deps.tomllib is None, "TOML support requires Python 3.11+")
    def test_python_direct_lock_imports_and_latest(self):
        self.write("pyproject.toml", '[project]\ndependencies = ["example-lib>=1", "other==2.0.0"]\n[project.optional-dependencies]\ntest = ["test-lib==1.0.0"]\n')
        self.write("uv.lock", '[[package]]\nname = "example-lib"\nversion = "1.2.0"\n[[package]]\nname = "transitive"\nversion = "4.0.0"\n')
        self.write("src/main.py", 'from example_lib.client import Client\nfrom .other import helper\n')
        with patch.object(deps, "command", side_effect=lambda argv, root: f'{argv[5]} (3.0.0)\nAvailable versions: 3.0.0, 1.2.0'):
            snapshot = deps.collect(self.root, "python")
        rows = {d["name"]: d for d in snapshot["dependencies"]}
        self.assertEqual(set(rows), {"example-lib", "other", "test-lib"})
        self.assertEqual(rows["example-lib"]["status"], "outdated")
        self.assertEqual(rows["example-lib"]["paths"], ["src/main.py"])
        self.assertEqual(rows["other"]["paths"], [])

    def test_requirements_includes_and_unknown_lookup(self):
        self.write("requirements.txt", '-r requirements/base.txt\nexample-lib>=1\n')
        self.write("requirements/base.txt", 'pinned==1.0.0\n-r ../requirements.txt\n')
        with patch.object(deps, "command", return_value=None):
            snapshot = deps.collect(self.root, "python")
        self.assertEqual(len(snapshot["dependencies"]), 2)
        self.assertTrue(all(d["latest"] == "?" and d["status"] == "unknown" for d in snapshot["dependencies"]))
        self.assertEqual(snapshot["dependencies"][1]["used"], "1.0.0")

    def test_readonly_manager_commands(self):
        for language, name, output, expected in [
            ("go", "example.com/lib", '{"Version":"v1.0.0"}', ["go", "list", "-m", "-u", "-json", "example.com/lib"]),
            ("ts", "example-lib", '"2.0.0"', ["npm", "view", "example-lib", "version", "--json", "--ignore-scripts"]),
            ("python", "example-lib", 'example-lib (2.0.0)', ["python3", "-m", "pip", "index", "versions", "example-lib", "--no-color"]),
        ]:
            row = deps.entry(name, "1.0.0", "manifest", used="1.0.0")
            with patch.object(deps, "command", return_value=output) as command:
                deps.lookup(self.root, language, row)
            command.assert_called_once_with(expected, self.root)
            self.assertNotEqual(row["latest"], "?")

    def test_local_and_prerelease_are_not_update_suggestions(self):
        for used, latest in [("?", "2.0.0"), ("^1.0.0", "2.0.0"), ("1.0.0-beta.1", "1.0.0"), ("v0.0.0-20261010120000-abcdef", "v1.0.0")]:
            self.assertEqual(deps.version_status(used, latest), "unknown")
        row = deps.entry("example-lib", "workspace:*", "package.json")
        with patch.object(deps, "command") as command:
            deps.lookup(self.root, "ts", row)
        command.assert_not_called()
        row = deps.entry("example.com/local", "v1.0.0", "go.mod", used="v1.0.0")
        with patch.object(deps, "command", return_value='{"Version":"v1.0.0","Replace":{"Path":"../local"}}'):
            deps.lookup(self.root, "go", row)
        self.assertEqual(row["latest"], "?")
        self.assertEqual(row["status"], "unknown")

    def test_offline_does_not_query_managers(self):
        self.write("package.json", '{"dependencies":{"example-lib":"1.0.0"}}')
        with patch.object(deps, "command") as command:
            snapshot = deps.collect(self.root, "ts", offline=True)
        command.assert_not_called()
        self.assertEqual(snapshot["dependencies"][0]["latest"], "?")


if __name__ == "__main__":
    unittest.main()
