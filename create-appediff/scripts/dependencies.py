#!/usr/bin/env python3
"""Collect direct dependencies. Registry information comes only from package managers."""
import argparse
import ast
from concurrent.futures import ThreadPoolExecutor
import json
import os
from pathlib import Path
import re
import subprocess
from datetime import datetime, timezone

try:
    import tomllib
except ImportError:
    tomllib = None


def command(argv, root):
    try:
        result = subprocess.run(argv, cwd=root, capture_output=True, text=True,
                                timeout=12, env={**os.environ, "GOTOOLCHAIN": "local", "GOWORK": "off",
                                                 "GOFLAGS": "-mod=readonly", "PIP_DISABLE_PIP_VERSION_CHECK": "1"})
        return result.stdout if result.returncode == 0 else None
    except (OSError, subprocess.TimeoutExpired):
        return None


def load_json(path):
    try:
        return json.loads(path.read_text())
    except (OSError, ValueError):
        return {}


def load_toml(path):
    if not tomllib:
        return {}
    try:
        return tomllib.loads(path.read_text())
    except (OSError, ValueError):
        return {}


def normalize(name):
    return re.sub(r"[-_.]+", "-", name).lower()


def entry(name, declared, manifest, kind="runtime", used="?", imports=None):
    return dict(name=name, declared=str(declared), used=used, latest="?", status="unknown",
                manifest=manifest, kind=kind, imports=imports or [normalize(name).replace("-", "_")], paths=[])


def direct_dependencies(root, language):
    rows, notes = [], []
    if language == "go":
        path = root / "go.mod"
        if not path.exists():
            return [], ["No go.mod found at the application root."]
        block = False
        for line in path.read_text().splitlines():
            if "// indirect" in line:
                continue
            line = line.split("//")[0].strip()
            if line == "require (":
                block = True
                continue
            if line == ")":
                block = False
                continue
            match = re.match(r"(?:require\s+)?([^\s]+)\s+(v\S+)$", line) if block or line.startswith("require ") else None
            if match:
                name, version = match.groups()
                rows.append(entry(name, version, "go.mod", used=version, imports=[name]))
    elif language == "ts":
        manifest = load_json(root / "package.json")
        lock = load_json(root / "package-lock.json")
        for group, kind in [("dependencies", "runtime"), ("devDependencies", "development"),
                            ("optionalDependencies", "optional"), ("peerDependencies", "peer")]:
            for name, declared in manifest.get(group, {}).items():
                # Optional declarations override runtime ones, as npm does.
                rows = [row for row in rows if row["name"] != name]
                locked = lock.get("packages", {}).get("node_modules/" + name, lock.get("dependencies", {}).get(name, {}))
                used = locked.get("version", "?")
                if used == "?" and re.fullmatch(r"\d+\.\d+\.\d+(?:[-+].+)?", declared):
                    used = declared
                rows.append(entry(name, declared, "package.json", kind, used, [name]))
        if not manifest:
            notes.append("No readable package.json found at the application root.")
        if not lock and rows:
            notes.append("No npm lockfile; ranges remain declarations, not resolved versions. Supply lockfile evidence for other managers.")
    else:
        project = load_toml(root / "pyproject.toml")
        locked = {}
        for filename in ["poetry.lock", "uv.lock"]:
            for package in load_toml(root / filename).get("package", []):
                locked[normalize(package["name"])] = package.get("version", "?")
        def requirement(text, manifest, kind="runtime"):
            match = re.match(r"\s*([A-Za-z0-9][A-Za-z0-9_.-]*)(?:\[[^]]*\])?\s*(.*)", text)
            if not match:
                return
            name, declared = match.groups()
            pin = re.fullmatch(r"==\s*([\w.+-]+)(?:\s*;.*)?", declared)
            used = locked.get(normalize(name), pin[1] if pin else "?")
            rows.append(entry(name, declared or "*", manifest, kind, used))
        for text in project.get("project", {}).get("dependencies", []):
            requirement(text, "pyproject.toml")
        for group in project.get("project", {}).get("optional-dependencies", {}).values():
            for text in group:
                requirement(text, "pyproject.toml", "optional")
        for group in project.get("dependency-groups", {}).values():
            for text in group:
                if isinstance(text, str):
                    requirement(text, "pyproject.toml", "development")
        poetry = project.get("tool", {}).get("poetry", {})
        groups = [(poetry.get("dependencies", {}), "runtime")]
        groups += [(group.get("dependencies", {}), "development") for group in poetry.get("group", {}).values()]
        for deps, kind in groups:
            for name, declaration in deps.items():
                if name == "python":
                    continue
                version = declaration.get("version", "*") if isinstance(declaration, dict) else declaration
                rows.append(entry(name, version, "pyproject.toml", kind, locked.get(normalize(name), "?")))
        if not rows:
            visited = set()
            def requirements(path):
                if path in visited or not path.is_relative_to(root) or not path.is_file():
                    return
                visited.add(path)
                for line in path.read_text().splitlines():
                    line = line.split(" #")[0].strip()
                    if line.startswith(("-r ", "--requirement ")):
                        requirements((path.parent / line.split(maxsplit=1)[1]).resolve())
                    elif line and not line.startswith(("#", "-")):
                        requirement(line, str(path.relative_to(root)))
            requirements(root / "requirements.txt")
        if not rows:
            notes.append("No supported direct dependency declarations found (pyproject.toml needs Python 3.11+).")
    # Preserve distinct kinds/declarations but avoid duplicate PEP 621 / Poetry entries.
    return list({(r["name"], r["kind"]): r for r in rows}.values()), notes


def source_imports(path, language):
    try:
        text = path.read_text()
        if language == "python":
            tree = ast.parse(text)
            return [alias.name for node in ast.walk(tree) if isinstance(node, ast.Import) for alias in node.names] + [
                node.module for node in ast.walk(tree) if isinstance(node, ast.ImportFrom) and node.level == 0 and node.module]
        text = re.sub(r'''("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`)|//[^\n]*|/\*[\s\S]*?\*/''',
                      lambda match: match[1] if match[1] is not None else " ", text)
        if language == "go":
            blocks = re.findall(r'(?m)^\s*import\s*\((.*?)\)', text, re.S)
            singles = re.findall(r'(?m)^\s*import\s+(?:[\w.]+\s+)?"([^"\n]+)"', text)
            return singles + [s for block in blocks for s in re.findall(r'"([^"\n]+)"', block)]
        # Static imports/re-exports, require() and literal dynamic import().
        return re.findall(r"""(?:\bfrom\s*|\bimport\s*|\b(?:require|import)\s*\(\s*)["']([^"']+)["']""", text)
    except (OSError, UnicodeError, SyntaxError):
        return []


def usage(root, language, rows, files=None, exclude=()):
    extensions = {"go": {".go"}, "ts": {".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"}, "python": {".py"}}[language]
    directories = None if files is None else {str(Path(f["path"]).parent) for f in files}
    ignored = {".git", "node_modules", "vendor", ".venv", "venv", "__pycache__", "appedia", "appediff", *exclude}
    for directory, dirs, names in os.walk(root):
        dirs[:] = sorted(d for d in dirs if d not in ignored and not (Path(directory) / d).is_symlink())
        folder = Path(directory)
        if folder != root and (folder / ("go.mod" if language == "go" else "package.json")).exists():
            dirs[:] = []  # one application per manifest
            continue
        if directories is not None and str(folder.relative_to(root)) not in directories:
            continue
        for name in sorted(names):
            path = folder / name
            if path.suffix not in extensions or path.is_symlink():
                continue
            imports = source_imports(path, language)
            for row in rows:
                if any(imp == prefix or imp.startswith(prefix + ("." if language == "python" else "/"))
                       for imp in imports for prefix in row["imports"]):
                    row["paths"].append(path.relative_to(root).as_posix())


def version_status(used, latest):
    # Compare only unambiguous releases. Ranges, pseudo versions and local sources stay unknown.
    def parts(value):
        return tuple(map(int, value.lstrip("v").split("."))) if re.fullmatch(r"v?\d+(?:\.\d+)*", value) else None
    a, b = parts(used), parts(latest)
    if a is None or b is None:
        return "unknown"
    size = max(len(a), len(b))
    return "outdated" if a + (0,) * (size-len(a)) < b + (0,) * (size-len(b)) else "current"


def lookup(root, language, row):
    try:
        if language == "go":
            raw = command(["go", "list", "-m", "-u", "-json", row["name"]], root)
            data = json.loads(raw or "{}")
            if data.get("Replace"):
                row["used"] = data["Replace"].get("Version", data["Replace"].get("Path", "?"))
                return
            if data.get("Version") and not data.get("Error") and not data.get("Update", {}).get("Error"):
                row["used"] = data["Version"]
                row["latest"] = data.get("Update", {}).get("Version", data["Version"])
                row["status"] = "outdated" if data.get("Update", {}).get("Version") else "current"
                return
        elif language == "ts":
            # npm is a language package manager; no shell, installs, lifecycle scripts or browser.
            if not re.fullmatch(r"(?:@[\w.-]+/)?[\w.-]+", row["name"]):
                return
            if row["declared"].startswith(("file:", "link:", "workspace:", "git", "http", "npm:")):
                return
            raw = command(["npm", "view", row["name"], "version", "--json", "--ignore-scripts"], root)
            data = json.loads(raw or "null")
            if isinstance(data, str):
                row["latest"] = data
        else:
            if "@" in row["declared"]:
                return
            raw = command(["python3", "-m", "pip", "index", "versions", row["name"], "--no-color"], root)
            match = re.search(r"^" + re.escape(row["name"]) + r"\s+\(([^)]+)\)", raw or "", re.I | re.M)
            if match:
                row["latest"] = match[1]
    except (ValueError, KeyError, TypeError):
        pass
    row["status"] = version_status(row["used"], row["latest"])


def collect(root, language, files=None, exclude=(), offline=False):
    root = Path(root).resolve()
    rows, notes = direct_dependencies(root, language)
    usage(root, language, rows, files, exclude)
    if not offline:
        with ThreadPoolExecutor(max_workers=4) as pool:
            list(pool.map(lambda row: lookup(root, language, row), rows))
    return dict(checkedAt=datetime.now(timezone.utc).isoformat(), scope="changed" if files is not None else "project",
                notes=notes, dependencies=sorted(rows, key=lambda row: (row["name"], row["kind"])))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", required=True)
    parser.add_argument("--lang", required=True, choices=["go", "python", "ts"])
    parser.add_argument("--out", required=True)
    parser.add_argument("--files", help="appediff files.json; scope usage to surviving changed package directories")
    parser.add_argument("--exclude", default="")
    parser.add_argument("--offline", action="store_true", help="skip package manager queries; latest stays ?")
    args = parser.parse_args()
    files = load_json(Path(args.files))["files"] if args.files else None
    result = collect(args.root, args.lang, files, args.exclude.split(","), args.offline)
    Path(args.out).write_text(json.dumps(result, indent=2) + "\n")
    print(f"{len(result['dependencies'])} direct dependencies -> {args.out}")
