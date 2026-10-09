#!/usr/bin/env python3
"""Extract the appedia infrastructure model from Terraform (.tf) files.

    python3 extract.py --root <dir with .tf files> --out /tmp/infra-model.json

Standard library only; HCL is scanned, not evaluated (nothing is planned or applied).

Mapping to the appedia model (references/model-schema.md):
  package  = a cloud service area (Cloud Storage, Pub/Sub, IAM…), from the resource type;
             resource-level IAM (google_pubsub_topic_iam_binding…) joins its service;
             variables, locals, outputs, providers and backend go to "configuration"
  type     = one block: resource, data source, module, variable, output, locals
             (kind = the resource type, shown as the UML stereotype)
  fields   = the block's top-level attributes and nested blocks (value = first line)
  relations= "uses" (an expression references another block), "depends_on"
  src      = the block's HCL, with the comment lines right above it
"""
import argparse
import json
import os
import re
import sys

BLOCK_KINDS = ("resource", "data", "module", "variable", "output", "locals", "provider", "terraform")

# service areas: (id, label, nickname, type prefixes). First match wins; order matters.
SERVICES = [
    ("cloud_run", "Cloud Run", "containers", ["google_cloud_run_"]),
    ("functions", "Cloud Functions", "functions", ["google_cloudfunctions_", "google_cloudfunctions2_"]),
    ("pubsub", "Pub/Sub", "topics & subscriptions", ["google_pubsub_"]),
    ("storage", "Cloud Storage", "buckets & objects", ["google_storage_"]),
    ("scheduler", "Cloud Scheduler", "cron jobs", ["google_cloud_scheduler_"]),
    ("firestore", "Firestore", "database", ["google_firestore_", "google_firebase_"]),
    ("bigquery", "BigQuery", "datasets & tables", ["google_bigquery_"]),
    ("logging", "Cloud Logging", "metrics & sinks", ["google_logging_"]),
    ("monitoring", "Cloud Monitoring", "alerts & dashboards", ["google_monitoring_"]),
    ("artifacts", "Artifact Registry", "images", ["google_artifact_registry_"]),
    ("iam", "IAM", "accounts & roles", ["google_service_account", "google_project_iam_", "google_organization_iam_"]),
    ("project", "Project", "APIs & settings", ["google_project"]),
]
CONFIG = ("configuration", "Configuration", "variables & outputs")

# Data flow: what moves where at run time, for the resource types whose fields say it.
# type -> [(field, direction, label)]: "in" = the field's references send to this resource,
# "out" = this resource sends to them. A pair (field_from, field_to) links two references.
DATAFLOW = {
    "google_storage_notification": [(("bucket", "topic"), "pair", "notification")],
    "google_cloudfunctions_function": [("event_trigger", "in", "triggers")],
    "google_cloudfunctions2_function": [("event_trigger", "in", "triggers")],
    "google_pubsub_subscription": [("topic", "in", "delivers"), ("push_config", "out", "push")],
    "google_cloud_scheduler_job": [("pubsub_target", "out", "publishes"), ("http_target", "out", "calls")],
    "google_logging_project_sink": [("destination", "out", "routes logs")],
    "google_monitoring_alert_policy": [("conditions", "in", "alerts on")],
    "google_monitoring_dashboard": [("dashboard_json", "in", "charts")],
    "google_eventarc_trigger": [("transport", "in", "delivers"), ("destination", "out", "triggers")],
}
UTILITY = ("utility", "Utility resources", "archives, waits…")


def service_of(kind, rtype, module_source=""):
    if kind in ("variable", "output", "locals", "provider", "terraform"):
        return CONFIG
    if kind == "module":
        base = re.sub(r"(\.git)?([?/].*)?$", "", module_source.rsplit("/", 1)[-1]) if module_source else ""
        for sid, label, sub, _ in SERVICES:
            if base and (base == sid or base.replace("-", "_") == sid):
                return sid, label, sub
        return "modules", "Modules", "reused building blocks"
    for sid, label, sub, prefixes in SERVICES:
        if any(rtype.startswith(p) for p in prefixes):
            return sid, label, sub
    return UTILITY if not rtype.startswith(("google_", "aws_", "azurerm_")) else (rtype.split("_")[1], rtype.split("_")[1].title(), "")


def scan_blocks(text):
    """Yield (kind, labels, start_offset, end_offset) for each top-level block."""
    i, n, depth = 0, len(text), 0
    head = re.compile(r'(?m)^(%s)((?:\s+"[^"]*"|\s+[A-Za-z_][\w-]*)*)\s*\{' % "|".join(BLOCK_KINDS))
    while i < n:
        m = head.search(text, i)
        if not m:
            return
        start, j, depth = m.start(), m.end(), 1
        while j < n and depth:
            c = text[j]
            if c == "#" or text.startswith("//", j):
                j = text.find("\n", j)
                j = n if j < 0 else j
                continue
            if text.startswith("/*", j):
                j = text.find("*/", j) + 2 or n
                continue
            if c == '"':
                j += 1
                while j < n and text[j] != '"':
                    j += 2 if text[j] == "\\" else 1
                j += 1
                continue
            hd = re.match(r"<<-?([A-Z_]+)\n", text[j:j + 40])
            if hd:
                end = re.compile(r"(?m)^\s*%s\s*$" % hd.group(1)).search(text, j + hd.end())
                j = end.end() if end else n
                continue
            depth += {"{": 1, "}": -1}.get(c, 0)
            j += 1
        labels = re.findall(r'"([^"]*)"|([A-Za-z_][\w-]*)', m.group(2))
        yield m.group(1), [a or b for a, b in labels], start, j
        i = j


def top_level_fields(body):
    """Attributes and nested blocks at depth 1 of a block body: (name, display value, full text).

    The full text spans the whole attribute or nested block, so references inside
    a multi-line map or a nested block belong to that field."""
    out, depth, cur = [], 0, None
    for line in body.split("\n"):
        s = line.strip()
        if depth == 0 and s and not s.startswith(("#", "//")):
            a = re.match(r"([A-Za-z_][\w-]*)\s*=\s*(.*)$", s)
            b = re.match(r'([A-Za-z_][\w-]*)(\s+"[^"]*")*\s*\{', s)
            if a or b:
                name = (a or b).group(1)
                val = a.group(2) if a else "{ … }"
                if val in ("{", "["):
                    val = val + " … " + {"{": "}", "[": "]"}[val]
                cur = [name, val if len(val) <= 60 else val[:57] + "…", ""]
                out.append(cur)
        if cur is not None:
            cur[2] += line + "\n"
        clean = re.sub(r'"(?:\\.|[^"\\])*"', '""', line)
        clean = re.sub(r"#.*$|//.*$", "", clean)
        depth = max(depth + clean.count("{") + clean.count("[") + clean.count("(") - clean.count("}") - clean.count("]") - clean.count(")"), 0)
    return [tuple(x) for x in out]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", required=True, help="directory holding the .tf files (one Terraform root module)")
    ap.add_argument("--out", default="infra-model.json")
    args = ap.parse_args()
    root = os.path.abspath(args.root)
    files = sorted(f for f in os.listdir(root) if f.endswith(".tf"))
    if not files:
        sys.exit("extract.py: no .tf files in " + root)

    blocks = []
    for f in files:
        text = open(os.path.join(root, f), encoding="utf-8").read()
        for kind, labels, a, b in scan_blocks(text):
            # include the comment block right above
            pre = text[:a].split("\n")[:-1]
            start_line = text.count("\n", 0, a) + 1
            while pre and pre[-1].strip().startswith(("#", "//")):
                pre.pop()
                start_line -= 1
            src_start = sum(len(x) + 1 for x in text.split("\n")[: start_line - 1])
            src = text[src_start:b]
            body = text[text.index("{", a) + 1: b - 1]
            rtype = labels[0] if kind in ("resource", "data") and labels else ""
            name = labels[1] if kind in ("resource", "data") and len(labels) > 1 else (labels[0] if labels else kind)
            msrc = ""
            if kind == "module":
                sm = re.search(r'(?m)^\s*source\s*=\s*"([^"]+)"', body)
                msrc = sm.group(1) if sm else ""
            blocks.append(dict(kind=kind, rtype=rtype, name=name, file=f, src=src, body=body,
                               line=text.count("\n", 0, a) + 1, endLine=text.count("\n", 0, b) + 1, msrc=msrc))

    # address -> block, the way Terraform expressions name them
    def address(bl):
        return {"resource": f'{bl["rtype"]}.{bl["name"]}', "data": f'data.{bl["rtype"]}.{bl["name"]}',
                "module": f'module.{bl["name"]}', "variable": f'var.{bl["name"]}', "output": f'output.{bl["name"]}',
                "locals": f'locals@{bl["file"]}:{bl["line"]}', "provider": f'provider.{bl["name"]}',
                "terraform": f'terraform@{bl["file"]}'}[bl["kind"]]
    local_owner = {}
    for bl in blocks:
        bl["addr"] = address(bl)
        if bl["kind"] == "locals":
            for nm, _, _ in top_level_fields(bl["body"]):
                local_owner[f"local.{nm}"] = bl["addr"]
    by_addr = {bl["addr"]: bl for bl in blocks}

    model = {"language": "hcl", "module": os.path.basename(root), "packages": {}, "relations": [], "usedBy": {}}
    for bl in blocks:
        sid, label, sub = service_of(bl["kind"], bl["rtype"], bl["msrc"])
        bl["pkg"] = sid
        pkg = model["packages"].setdefault(sid, {"id": sid, "path": label, "importPath": sid, "name": sid, "doc": sub,
                                                 "files": [], "imports": [], "vars": [], "types": {}, "funcs": {}, "methods": {}})
        tname = bl["name"] if bl["kind"] != "locals" else f'locals_{bl["file"].replace(".tf", "")}'
        if tname in pkg["types"]:
            short = re.sub(r"^(google|aws|azurerm)_", "", bl["rtype"] or bl["kind"])
            tname = f"{tname}~{short}"
        k = 2
        while tname in pkg["types"]:
            tname = f'{bl["name"]}~{k}'
            k += 1
        bl["tname"] = tname
        stereo = {"resource": bl["rtype"], "data": f'data {bl["rtype"]}', "module": "module"}.get(bl["kind"], bl["kind"])
        pkg["types"][tname] = {"name": tname, "kind": stereo, "doc": bl["msrc"] and f'source: {bl["msrc"]}' or "",
                               "file": bl["file"], "line": bl["line"], "endLine": bl["endLine"], "src": bl["src"],
                               "exported": True, "fields": [], "embeds": [], "methods": [], "under": ""}
        if not any(x["name"] == bl["file"] for x in pkg["files"]):
            pkg["files"].append({"name": bl["file"], "lines": 0})

    ref_re = re.compile(r"\b(data\.[a-z][a-z0-9_]*\.[A-Za-z_][\w-]*|module\.[A-Za-z_][\w-]*|var\.[A-Za-z_][\w-]*|local\.[A-Za-z_][\w-]*|[a-z][a-z0-9]*_[a-z0-9_]+\.[A-Za-z_][\w-]*)")
    key = lambda bl: f'{bl["pkg"]}.{bl["tname"]}'
    for bl in blocks:
        t = model["packages"][bl["pkg"]]["types"][bl["tname"]]
        deps = set()
        dm = re.search(r"(?ms)^\s*depends_on\s*=\s*\[(.*?)\]", bl["body"])
        if dm:
            deps = {d for d in ref_re.findall(dm.group(1)) if d in by_addr}
        for fname, val, full in top_level_fields(bl["body"]):
            refs = []
            for r in ref_re.findall(re.sub(r"(?m)#.*$", "", full)):
                tgt = by_addr.get(r) or by_addr.get(local_owner.get(r, ""))
                if tgt and tgt is not bl:
                    refs.append(key(tgt))
            t["fields"].append({"name": fname, "type": val, "doc": "", "refs": sorted(set(refs))})
        uses = set()
        for r in ref_re.findall(re.sub(r"(?m)#.*$", "", bl["body"])):
            tgt = by_addr.get(r) or by_addr.get(local_owner.get(r, ""))
            if tgt and tgt is not bl:
                uses.add(key(tgt))
        for u in sorted(uses):
            tb = by_addr[[a for a, x in by_addr.items() if key(x) == u][0]]
            kind = "depends_on" if tb["addr"] in deps and not any(u in f["refs"] for f in t["fields"] if f["name"] != "depends_on") else "uses"
            # variables and locals are listed as usages, not drawn: every resource reads them.
            # depends_on is ordering plumbing (often one CI grant everything waits for): listed, not drawn.
            if tb["kind"] not in ("variable", "locals", "provider", "terraform") and kind == "uses":
                model["relations"].append({"from": key(bl), "to": u, "kind": kind})
                if tb["pkg"] != bl["pkg"] and tb["pkg"] not in model["packages"][bl["pkg"]]["imports"]:
                    model["packages"][bl["pkg"]]["imports"].append(tb["pkg"])
            model["usedBy"].setdefault(u, []).append(key(bl))

    # data flow, from the fields DATAFLOW names; only between resources, data sources and modules
    model["dataflow"] = []
    # identities and grants are who may act, not what moves: never a data-flow end
    flow_targets = {key(b) for b in blocks if b["kind"] in ("resource", "data", "module")
                    and not b["rtype"].startswith("google_service_account") and "_iam_" not in b["rtype"]}
    for bl in blocks:
        rules = DATAFLOW.get(bl["rtype"]) if bl["kind"] == "resource" else None
        if not rules:
            continue
        frefs = {f["name"]: [r for r in f["refs"] if r in flow_targets] for f in model["packages"][bl["pkg"]]["types"][bl["tname"]]["fields"]}
        me = key(bl)
        for field, direction, label in rules:
            if direction == "pair":
                for a in frefs.get(field[0], []):
                    for b in frefs.get(field[1], []):
                        model["dataflow"].append({"from": a, "to": b, "label": label})
            for r in (frefs.get(field, []) if direction != "pair" else []):
                model["dataflow"].append({"from": r, "to": me, "label": label} if direction == "in" else {"from": me, "to": r, "label": label})
    model["dataflow"] = sorted({(d["from"], d["to"], d["label"]): d for d in model["dataflow"]}.values(), key=lambda d: (d["from"], d["to"]))

    for pkg in model["packages"].values():
        pkg["imports"].sort()
        for f in pkg["files"]:
            f["lines"] = sum(x["endLine"] - x["line"] + 1 for x in pkg["types"].values() if x["file"] == f["name"])
    model["relations"].sort(key=lambda r: (r["from"], r["to"], r["kind"]))
    for k in model["usedBy"]:
        model["usedBy"][k] = sorted(set(model["usedBy"][k]))
    with open(args.out, "w", encoding="utf-8") as fh:
        json.dump(model, fh, indent=1)
    nt = sum(len(p["types"]) for p in model["packages"].values())
    print(f'{len(model["packages"])} service areas, {nt} blocks, {len(model["relations"])} relations, {len(model["dataflow"])} data-flow links -> {args.out}')


if __name__ == "__main__":
    main()
