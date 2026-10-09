#!/usr/bin/env python3
"""Extract the appedia model from a Python project (see references/model-schema.md).

    python3 extract.py --root /path/to/project [--src src] --out /tmp/model.json

Standard library only (ast, Python 3.9+); nothing is imported or executed.
Run it with a Python at least as new as the project's syntax: ast only parses
what the running interpreter knows (class Box[T] needs 3.12). Files it cannot
parse are skipped and counted in the last line of output.

Imports are resolved inside the project. A bare name that several folders define
(one deployable per folder, each its own import root) resolves to the importer's
own folder first.

Mapping to the model:
  package  = a directory holding .py files (its modules are merged)
  type     = a class (kind "class"; "interface" for Protocol/ABC bases,
             "enum" for Enum bases)
  fields   = class-level annotated or assigned names, and self.x assignments
             made in __init__ (type from the annotation, or the called class)
  methods  = functions defined in the class body ("Class.name")
  funcs    = module-level functions
  relations: extends (base classes), has (fields whose type names a project
             class), implements (base is a Protocol/ABC defined in the project)
"""
import argparse
import ast
import json
import os
import re
import sys
from collections import defaultdict
from typing import TypeGuard

SKIP_DIRS = {".git", ".hg", ".venv", "venv", "env", ".env", "__pycache__", "node_modules", "build", "dist",
             ".tox", ".nox", ".mypy_cache", ".pytest_cache", "site-packages", "migrations", "docs", "tests", "test"}
INTERFACE_BASES = {"Protocol", "ABC", "ABCMeta"}
ENUM_BASES = {"Enum", "IntEnum", "StrEnum", "Flag", "IntFlag"}


def is_test_file(name):
    return name.startswith("test_") or name.endswith("_test.py") or name == "conftest.py"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", required=True)
    ap.add_argument("--src", default="", help="subdirectory holding the code (e.g. src); default: the root")
    ap.add_argument("--out", default="model.json")
    ap.add_argument("--exclude", default="", help="comma-separated directory names to skip")
    ap.add_argument("--include-tests", action="store_true")
    args = ap.parse_args()
    root = os.path.abspath(args.root)
    base = os.path.join(root, args.src) if args.src else root
    skip = set(SKIP_DIRS) | {x.strip() for x in args.exclude.split(",") if x.strip()}
    if args.include_tests:
        skip -= {"tests", "test"}

    # ---- collect files per directory ----
    pkgfiles = {}
    for d, dirs, files in os.walk(base):
        dirs[:] = sorted(x for x in dirs if not x.startswith(".") and x not in skip and not x.endswith(".egg-info"))
        py = sorted(f for f in files if f.endswith(".py") and (args.include_tests or not is_test_file(f)))
        if py:
            pkgfiles[d] = py
    if not pkgfiles:
        sys.exit("extract.py: no .py files found under " + base)

    rel = lambda d: os.path.relpath(d, base).replace(os.sep, "/")
    ids = assign_ids([rel(d) for d in pkgfiles], os.path.basename(base))
    dotted = {}  # dotted module name -> package dir
    for d, files in pkgfiles.items():
        r = rel(d)
        prefix = "" if r == "." else r.replace("/", ".")
        for f in files:
            mod = f[:-3]
            name = prefix if mod == "__init__" else (prefix + "." + mod if prefix else mod)
            dotted[name] = d

    model = {"language": "python", "module": os.path.basename(root), "packages": {}, "relations": [], "usedBy": {}}
    parsed = {}
    skipped = []
    for d, files in pkgfiles.items():
        pid = ids[rel(d)]
        pkg = {"id": pid, "path": rel(d), "importPath": rel(d).replace("/", "."), "name": os.path.basename(d) if rel(d) != "." else model["module"],
               "doc": "", "files": [], "types": {}, "funcs": {}, "methods": {}, "imports": [], "vars": []}
        model["packages"][pid] = pkg
        for f in files:
            path = os.path.join(d, f)
            try:
                src = open(path, encoding="utf-8").read()
                tree = ast.parse(src, filename=path)
            except (SyntaxError, UnicodeDecodeError) as e:
                print(f"skip {path}: {e}", file=sys.stderr)
                skipped.append(path)
                continue
            pkg["files"].append({"name": f, "lines": src.count("\n") + 1})
            if f == "__init__.py" and ast.get_docstring(tree):
                pkg["doc"] = ast.get_docstring(tree)
            parsed[path] = (pid, d, f, src, tree)

    # ---- pass 1: declarations ----
    for path, (pid, d, f, src, tree) in parsed.items():
        pkg = model["packages"][pid]
        lines = src.split("\n")
        for node in tree.body:
            if isinstance(node, ast.ClassDef):
                if node.name in pkg["types"]:
                    print(f"note: {pid}.{node.name} defined twice; keeping the first", file=sys.stderr)
                    continue
                pkg["types"][node.name] = class_info(node, f, lines)
                for item in node.body:
                    if isinstance(item, (ast.FunctionDef, ast.AsyncFunctionDef)):
                        fn = func_info(item, f, lines, recv=node.name)
                        pkg["methods"][node.name + "." + item.name] = fn
                        pkg["types"][node.name]["methods"].append(item.name)
            elif isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
                if node.name not in pkg["funcs"]:
                    pkg["funcs"][node.name] = func_info(node, f, lines)
            elif isinstance(node, (ast.Assign, ast.AnnAssign)):
                targets = node.targets if isinstance(node, ast.Assign) else [node.target]
                for t in targets:
                    if isinstance(t, ast.Name) and not t.id.startswith("__"):
                        pkg["vars"].append(t.id)

    # ---- pass 2: resolve names and relations ----
    type_index = defaultdict(list)  # class name -> [pkg ids]
    for pid, pkg in model["packages"].items():
        for n in pkg["types"]:
            type_index[n].append(pid)

    for path, (pid, d, f, src, tree) in parsed.items():
        pkg = model["packages"][pid]
        names = import_names(tree, d, rel(d), dotted, ids, rel)  # local name -> (pkg id, name or None for a module)
        for target_pid, _ in names.values():
            if target_pid and target_pid != pid and target_pid not in pkg["imports"]:
                pkg["imports"].append(target_pid)

        def resolve(name_parts):
            """['config', 'IDCard'] or ['IDCard'] -> 'pkg.IDCard' if a project class."""
            if not name_parts:
                return None
            head = name_parts[0]
            if len(name_parts) == 1:
                if head in pkg["types"]:
                    return pid + "." + head
                if head in names and names[head][1] and names[head][1] in model["packages"][names[head][0]]["types"]:
                    return names[head][0] + "." + names[head][1]
                return None
            if head in names and names[head][1] is None:
                tp = names[head][0]
                if name_parts[-1] in model["packages"][tp]["types"]:
                    return tp + "." + name_parts[-1]
            return None

        for node in tree.body:
            if isinstance(node, ast.ClassDef):
                t = pkg["types"].get(node.name)
                if not t or t.get("_done"):
                    continue
                t["_done"] = True
                key = pid + "." + node.name
                for b in node.bases:
                    r = resolve(dotted_name(b))
                    if r and r != key:
                        other = model["packages"][r.split(".")[0]]["types"][r.split(".")[1]]
                        kind = "implements" if other["kind"] == "interface" else "extends"
                        model["relations"].append({"from": key, "to": r, "kind": kind})
                        t["embeds"].append(r.split(".")[1])
                for fld in t["fields"]:
                    refs = [r for r in (resolve(p) for p in fld.pop("_names", [])) if r and r != key]
                    fld["refs"] = sorted(set(refs))
                    for r in fld["refs"]:
                        model["relations"].append({"from": key, "to": r, "kind": "has", "via": fld["name"]})
        # used-by: names referenced inside function bodies
        for node in ast.walk(tree):
            if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
                owner, fn = owner_of(node, tree, pkg, pid)
                if not fn:
                    continue
                uses = set()
                for sub in ast.walk(node):
                    parts = dotted_name(sub) if isinstance(sub, (ast.Name, ast.Attribute)) else None
                    if parts:
                        for k in range(1, len(parts) + 1):
                            r = resolve(parts[:k])
                            if r:
                                uses.add(r)
                                break
                fn["uses"] = sorted(uses)
                for u in uses:
                    model["usedBy"].setdefault(u, []).append(owner)

    for pkg in model["packages"].values():
        for t in pkg["types"].values():
            t.pop("_done", None)
            t["methods"].sort()
            for fld in t["fields"]:
                fld.pop("_names", None)
        pkg["imports"].sort()
    model["relations"].sort(key=lambda r: (r["from"], r["to"], r["kind"]))
    for k in model["usedBy"]:
        model["usedBy"][k] = sorted(set(model["usedBy"][k]))

    with open(args.out, "w", encoding="utf-8") as fh:
        json.dump(model, fh, indent=1)
    nt = sum(len(p["types"]) for p in model["packages"].values())
    nf = sum(len(p["funcs"]) + len(p["methods"]) for p in model["packages"].values())
    if skipped:
        py = f"{sys.version_info.major}.{sys.version_info.minor}"
        print(f"WARNING: {len(skipped)} file(s) could not be parsed by Python {py} and are missing from the model "
              f"(see 'skip' lines above). If the project targets a newer Python, rerun with it, e.g. "
              f"uv run --python 3.13 --no-project python {os.path.relpath(__file__)} ...", file=sys.stderr)
    note = f" ({len(skipped)} files skipped: see the warning above)" if skipped else ""
    print(f'{len(model["packages"])} packages, {nt} types, {nf} funcs/methods, {len(model["relations"])} relations{note} -> {args.out}')


def assign_ids(paths, root_name="root"):
    """Shortest unique trailing path for each directory, '/' replaced by '~'.
    The base directory itself is named after its own directory."""
    out = {}
    depth = 1
    pending = list(paths)
    while pending and depth < 12:
        trail = {p: (root_name if p == "." else "/".join(p.split("/")[-depth:])) for p in pending}
        count = defaultdict(int)
        for v in trail.values():
            count[v] += 1
        nxt = []
        for p in pending:
            if count[trail[p]] == 1:
                out[p] = re.sub(r"[^A-Za-z0-9_~-]", "_", trail[p].replace("/", "~"))
            else:
                nxt.append(p)
        pending = nxt
        depth += 1
    for p in pending:
        out[p] = re.sub(r"[^A-Za-z0-9_~-]", "_", (root_name if p == "." else p).replace("/", "~"))
    return out


def segment(lines, node):
    start = node.lineno
    if getattr(node, "decorator_list", None):
        start = min([start] + [d.lineno for d in node.decorator_list])
    # include the comment block right above
    while start > 1 and lines[start - 2].strip().startswith("#"):
        start -= 1
    return "\n".join(lines[start - 1:node.end_lineno]), start


def class_info(node, fname, lines):
    src, _ = segment(lines, node)
    bases = [".".join(dotted_name(b) or ["?"]) for b in node.bases]
    kind = "class"
    if any(b.split(".")[-1] in INTERFACE_BASES for b in bases):
        kind = "interface"
    elif any(b.split(".")[-1] in ENUM_BASES for b in bases):
        kind = "enum"
    elif any(isinstance(d, (ast.Name, ast.Attribute, ast.Call)) and "dataclass" in ast.unparse(d) for d in node.decorator_list):
        kind = "dataclass"
    fields = []
    seen = set()

    def add(name, typ, names, doc=""):
        if name in seen or name.startswith("__"):
            return
        seen.add(name)
        fields.append({"name": name, "type": typ, "doc": doc, "_names": names})

    for item in node.body:
        if isinstance(item, ast.AnnAssign) and isinstance(item.target, ast.Name):
            add(item.target.id, ast.unparse(item.annotation), type_names(item.annotation))
        elif isinstance(item, ast.Assign):
            for t in item.targets:
                if isinstance(t, ast.Name):
                    add(t.id, value_type(item.value), call_names(item.value))
    for item in node.body:
        if isinstance(item, (ast.FunctionDef, ast.AsyncFunctionDef)) and item.name == "__init__":
            ann = {a.arg: a.annotation for a in item.args.args + item.args.kwonlyargs if a.annotation is not None}
            for sub in ast.walk(item):
                if isinstance(sub, ast.AnnAssign) and is_self_attr(sub.target):
                    add(sub.target.attr, ast.unparse(sub.annotation), type_names(sub.annotation))
                elif isinstance(sub, ast.Assign):
                    for t in sub.targets:
                        if is_self_attr(t):
                            if isinstance(sub.value, ast.Name) and sub.value.id in ann:
                                add(t.attr, ast.unparse(ann[sub.value.id]), type_names(ann[sub.value.id]))
                            else:
                                add(t.attr, value_type(sub.value), call_names(sub.value))
    return {"name": node.name, "kind": kind, "doc": ast.get_docstring(node) or "", "file": fname, "line": node.lineno,
            "endLine": node.end_lineno, "src": src, "exported": not node.name.startswith("_"), "fields": fields,
            "embeds": [], "methods": [], "under": ", ".join(bases) if bases else ""}


def func_info(node, fname, lines, recv=None):
    src, _ = segment(lines, node)
    prefix = "async def " if isinstance(node, ast.AsyncFunctionDef) else "def "
    sig = prefix + node.name + "(" + ast.unparse(node.args) + ")"
    if node.returns is not None:
        sig += " -> " + ast.unparse(node.returns)
    fn = {"name": node.name, "sig": sig, "doc": ast.get_docstring(node) or "", "file": fname, "line": node.lineno,
          "endLine": node.end_lineno, "src": src, "exported": not node.name.startswith("_") or (node.name.startswith("__") and node.name.endswith("__"))}
    if recv:
        fn["recv"] = recv
    return fn


def is_self_attr(t) -> TypeGuard[ast.Attribute]:
    return isinstance(t, ast.Attribute) and isinstance(t.value, ast.Name) and t.value.id == "self"


def dotted_name(n):
    if isinstance(n, ast.Name):
        return [n.id]
    if isinstance(n, ast.Attribute):
        inner = dotted_name(n.value)
        return inner + [n.attr] if inner else None
    if isinstance(n, ast.Subscript):
        return dotted_name(n.value)
    if isinstance(n, ast.Call):
        return dotted_name(n.func)
    return None


def type_names(annotation):
    """Every dotted name inside an annotation: Optional[list[Foo]] -> [['Optional'], ['list'], ['Foo']]."""
    out = []
    if isinstance(annotation, ast.Constant) and isinstance(annotation.value, str):  # "Foo" forward refs
        try:
            annotation = ast.parse(annotation.value, mode="eval").body
        except SyntaxError:
            return out
    for sub in ast.walk(annotation):
        if isinstance(sub, (ast.Name, ast.Attribute)):
            p = dotted_name(sub)
            if p:
                out.append(p)
    return out


def call_names(value):
    p = dotted_name(value.func) if isinstance(value, ast.Call) else None
    return [p] if p else []


def value_type(value):
    if isinstance(value, ast.Call):
        p = dotted_name(value.func)
        return ".".join(p) if p else ""
    if isinstance(value, ast.Constant):
        return type(value.value).__name__
    if isinstance(value, (ast.List, ast.ListComp)):
        return "list"
    if isinstance(value, (ast.Dict, ast.DictComp)):
        return "dict"
    return ""


def import_names(tree, _d, reldir, dotted, ids, rel):
    """Map local names to (package id, class name) or (package id, None) for a module."""
    out = {}
    pkg_dotted = "" if reldir == "." else reldir.replace("/", ".")
    for node in ast.walk(tree):
        if isinstance(node, ast.ImportFrom):
            base = node.module or ""
            if node.level:
                parts = pkg_dotted.split(".") if pkg_dotted else []
                parts = parts[:len(parts) - (node.level - 1)] if node.level > 1 else parts
                base = ".".join([p for p in parts if p] + ([node.module] if node.module else []))
            for a in node.names:
                local = a.asname or a.name
                full = base + "." + a.name if base else a.name
                if full in dotted:  # imported a module
                    out[local] = (ids[rel(dotted[full])], None)
                else:
                    mod = longest_module(base, dotted, pkg_dotted)
                    if mod is not None:
                        out[local] = (ids[rel(dotted[mod])], a.name)
        elif isinstance(node, ast.Import):
            for a in node.names:
                mod = longest_module(a.name, dotted, pkg_dotted)
                if mod is not None:
                    out[a.asname or a.name.split(".")[0]] = (ids[rel(dotted[mod])], None)
    return out


def longest_module(name, dotted, importer=""):
    """The project module an import names, or None.

    Projects often import without their top package name (src layout), or deploy
    each folder on its own with that folder as the import root (one serverless
    function per folder). Then the same bare name can match modules in several
    folders: prefer the one whose root is the importer's own folder or its
    nearest ancestor, as Python would when that folder is on sys.path."""
    parts = name.split(".")
    imp = importer.split(".") if importer else []
    for k in range(len(parts), 0, -1):
        cand = ".".join(parts[:k])
        if cand in dotted:
            return cand
        matches = [known for known in dotted if known.endswith("." + cand)]
        if matches:
            def closeness(known):
                root = known[: -len(cand) - 1].split(".")
                return len(root) if imp[: len(root)] == root else -1
            return max(matches, key=lambda kn: (closeness(kn), -len(kn), kn))
    return None


def owner_of(node, tree, pkg, pid):
    for top in tree.body:
        if top is node and node.name in pkg["funcs"]:
            return pid + "." + node.name, pkg["funcs"][node.name]
        if isinstance(top, ast.ClassDef) and node in top.body:
            key = top.name + "." + node.name
            if key in pkg["methods"]:
                return pid + "." + key, pkg["methods"][key]
    return None, None


if __name__ == "__main__":
    main()
