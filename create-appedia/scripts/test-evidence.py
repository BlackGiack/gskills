#!/usr/bin/env python3
"""Read test files and optional paired revisions; tests run only with --run-go-coverage.

Normal collection never imports or executes project code. Coverage can instead be
imported with --coverage PROFILE --coverage-meta META (explicit provenance).
"""
import argparse
import base64
import datetime
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import tempfile

SKIP = {'.git', '.hg', '.svn', '.maintenance', 'node_modules', 'vendor', '__pycache__', '.venv', 'venv', 'appedia', 'appediff', '.next'}
CODE = {'.go', '.py', '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.mts', '.cts', '.tf'}
MANIFESTS = {'go.mod', 'go.sum', 'package.json', 'package-lock.json', 'pnpm-lock.yaml', 'yarn.lock', 'pyproject.toml', 'uv.lock', 'requirements.txt'}
MAX_IMAGE = 5 * 1024 * 1024

def digest(raw):
    return hashlib.sha256(raw).hexdigest()

def now():
    return datetime.datetime.now(datetime.timezone.utc).isoformat()

def safe(path):
    return isinstance(path, str) and bool(path) and not path.startswith('/') and not any(x in path for x in ['\\', ':', '\x00']) and all(x not in ('.', '..') for x in path.split('/'))

def test_file(path):
    p = Path(path)
    return (p.name.endswith('_test.go') or p.name.startswith('test_') and p.suffix == '.py' or p.name.endswith('_test.py') or bool(re.search(r'[._](test|spec)\.[cm]?[jt]sx?$', p.name)) or any(x in {'test', 'tests', '__tests__'} for x in p.parts[:-1]) and p.suffix in CODE)

def coverage_rows(path):
    lines = Path(path).read_text().splitlines()
    if not lines or lines[0] not in ('mode: set', 'mode: count', 'mode: atomic'):
        raise ValueError('invalid Go coverage profile header')
    counts = {}
    seen = set()
    for line in lines[1:]:
        location, statements, hits = line.rsplit(' ', 2)
        if location in seen:
            raise ValueError('duplicate coverage block; merge profiles with the Go tools first')
        seen.add(location)
        match = re.match(r'^(.+):\d+\.\d+,\d+\.\d+$', location)
        if not match:
            raise ValueError('invalid Go coverage block location')
        package = match[1].rsplit('/', 1)[0]
        number, count = int(statements), int(hits)
        if number < 0 or count < 0:
            raise ValueError('negative coverage counts')
        total, covered = counts.get(package, (0, 0))
        counts[package] = total + number, covered + (number if count else 0)
    return lines[0][6:], [dict(path=p, statements=t, covered=c) for p, (t, c) in sorted(counts.items())]

def collect(root, revision, extra, exclude, base_ref=None, allow_new_artifacts=False):
    def allowed(path):
        return safe(path) and not any(x in SKIP | exclude for x in Path(path).parts[:-1])
    if base_ref:
        names = subprocess.check_output(['git', 'ls-tree', '-r', '--name-only', '-z', base_ref], cwd=root).decode().split('\x00')
        read = lambda path: subprocess.check_output(['git', 'show', f'{base_ref}:{path}'], cwd=root)
    elif (root / '.git').exists():
        names = subprocess.check_output(['git', 'ls-files', '-co', '--exclude-standard', '-z'], cwd=root).decode().split('\x00')
        read = lambda path: (root / path).read_bytes()
    else:
        names = []
        for directory, dirs, files in os.walk(root, followlinks=False):
            dirs[:] = sorted(d for d in dirs if d not in SKIP | exclude and not (Path(directory) / d).is_symlink())
            for file in sorted(files):
                path = Path(directory) / file
                if not path.is_symlink():
                    names.append(path.relative_to(root).as_posix())
        read = lambda path: (root / path).read_bytes()
    files, sources = {}, {}
    for path in sorted(set(names) | set(extra)):
        if not path:
            continue
        if not base_ref and path not in extra and (not (root / path).is_file() or (root / path).is_symlink() or not (root / path).resolve().is_relative_to(root)):
            continue
        if path in extra:
            if not safe(path):
                raise ValueError(f'invalid repository-relative extra file: {path}')
            if not base_ref and (not (root / path).resolve().is_relative_to(root) or (root / path).is_symlink()):
                raise ValueError(f'extra file escapes root or is a symlink: {path}')
        elif not allowed(path):
            continue
        is_source = allowed(path) and (Path(path).suffix in CODE or Path(path).name in MANIFESTS)
        if not (is_source or path in extra):
            continue
        try:
            raw = read(path)
        except (FileNotFoundError, subprocess.CalledProcessError):
            if base_ref or allow_new_artifacts and path in extra:  # Project tests may produce a new artifact.
                continue
            raise
        if is_source:
            sources[path] = digest(raw)
        if path not in extra and not test_file(path):
            continue
        entry = {'sha256': digest(raw)}
        suffix = Path(path).suffix.lower()
        if suffix in {'.png', '.jpg', '.jpeg', '.webp', '.gif'}:
            if len(raw) > MAX_IMAGE:
                raise ValueError(f'image exceeds 5 MiB: {path}')
            mime = {'.png': 'png', '.jpg': 'jpeg', '.jpeg': 'jpeg', '.webp': 'webp', '.gif': 'gif'}[suffix]
            entry['image'] = f'data:image/{mime};base64,' + base64.b64encode(raw).decode()
        else:
            entry['source'] = raw.decode('utf-8')
        files[path] = entry
    fingerprint = digest(json.dumps({'sources': sources, 'exclude': sorted(exclude)}, sort_keys=True, separators=(',', ':')).encode())
    return {'revision': revision, 'fingerprint': fingerprint, 'files': files}

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', required=True, type=Path)
    parser.add_argument('--out', required=True, type=Path)
    parser.add_argument('--revision', default='WORKTREE')
    parser.add_argument('--base-ref')
    parser.add_argument('--base-root', type=Path)
    parser.add_argument('--base-revision', default='BASE')
    parser.add_argument('--exclude', default='')
    parser.add_argument('--file', action='append', default=[], help='Extra repository-relative evidence file or screenshot to embed')
    parser.add_argument('--coverage', type=Path)
    parser.add_argument('--coverage-meta', type=Path)
    parser.add_argument('--run-go-coverage', action='store_true', help='Explicitly execute Go tests and collect their profile')
    parser.add_argument('--go-tags', default='')
    parser.add_argument('--go-package', action='append', default=[])
    args = parser.parse_args()
    root = args.root.resolve()
    exclude = set(filter(None, args.exclude.split(',')))
    if args.base_ref and args.base_root:
        parser.error('choose --base-ref or --base-root')
    if args.run_go_coverage and args.coverage:
        parser.error('choose coverage execution or profile import')
    if bool(args.coverage) != bool(args.coverage_meta):
        parser.error('profile import requires both --coverage and --coverage-meta')
    data = {'version': 1, 'collectedAt': now(), 'head': collect(root, args.revision, args.file, exclude, allow_new_artifacts=args.run_go_coverage), 'coverage': {}}
    if args.base_ref:
        rev = subprocess.check_output(['git', 'rev-parse', args.base_ref], cwd=root, text=True).strip()
        data['base'] = collect(root, rev, args.file, exclude, rev)
    elif args.base_root:
        data['base'] = collect(args.base_root.resolve(), args.base_revision, [file for file in args.file if (args.base_root / file).is_file()], exclude)
    exit_code = 0
    if args.coverage:
        mode, rows = coverage_rows(args.coverage)
        meta = json.loads(args.coverage_meta.read_text())
        data['coverage']['head'] = {**meta, 'profile': args.coverage.read_text(), 'mode': mode, 'metric': 'statements', 'packages': rows}
    if args.run_go_coverage:
        packages = args.go_package or ['./...']
        with tempfile.TemporaryDirectory(prefix='test-evidence-') as temp:
            profile = Path(temp) / 'coverage.out'
            command = ['go', 'test', '-json', '-count=1', '-timeout=3m', '-covermode=atomic', f'-coverprofile={profile}']
            if args.go_tags:
                command += ['-tags', args.go_tags]
            command += packages
            args.out.parent.mkdir(parents=True, exist_ok=True)
            log_path = args.out.with_suffix('.go-test.jsonl')
            with log_path.open('w') as log:
                completed = subprocess.run(command, cwd=root, stdout=log, stderr=subprocess.STDOUT)
            exit_code = completed.returncode
            after = collect(root, args.revision, args.file, exclude)
            if after['fingerprint'] != data['head']['fingerprint']:
                raise ValueError('source changed during coverage execution; collect again before attributing the result')
            data['head'] = after
            if profile.exists():
                mode, rows = coverage_rows(profile)
                data['coverage']['head'] = dict(metric='statements', mode=mode, argv=command, profile=profile.read_text(), packages=rows, fingerprint=data['head']['fingerprint'], revision=args.revision, command='go test -json -count=1 -timeout=3m -covermode=atomic -coverprofile=<profile>' + (' -tags ' + args.go_tags if args.go_tags else '') + ' ' + ' '.join(packages), scope=json.dumps({'packages': packages, 'tags': args.go_tags, 'coverpkg': 'package-local'}, sort_keys=True), collectedAt=now(), result='passed' if exit_code == 0 else 'failed', toolchain=subprocess.check_output(['go', 'version'], cwd=root, text=True).strip(), environment=json.loads(subprocess.check_output(['go', 'env', '-json', 'GOOS', 'GOARCH', 'CGO_ENABLED', 'GOFLAGS'], cwd=root, text=True)))
                args.out.with_suffix('.coverage.out').write_bytes(profile.read_bytes())
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(data, indent=2) + '\n')
    print(f"test evidence: {len(data['head']['files'])} head files; {'paired base' if 'base' in data else 'no base'}; {'coverage recorded' if data['coverage'] else 'coverage not collected'}")
    return exit_code

if __name__ == '__main__':
    raise SystemExit(main())
