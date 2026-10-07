#!/usr/bin/env python3
"""Check the Git index, not untracked private files, before publishing code."""
import re
import subprocess
import sys
from pathlib import PurePosixPath

paths = subprocess.check_output(["git", "ls-files", "-z"]).decode().split("\0")
blocked = 0
for path in filter(None, paths):
    p = PurePosixPath(path)
    name = p.name.lower()
    forbidden = (name.endswith((".zip", ".jsonl", ".pem", ".key", ".log"))
                 or name in {"chat.html", "inventory.json", "manifest.json", "rejected.json",
                             "export_manifest.json", "provenance.json", "source-receipt.json",
                             "drive-inventory.json", "verification-report.json"}
                 or (name.startswith("chatgpt-ingestion-") and name.endswith(".json"))
                 or re.fullmatch(r"conversations(?:[-_]\d+)?\.json", name)
                 or any(part in {"private-data", "private-archive", "exports", "imports"} for part in p.parts))
    content = subprocess.check_output(["git", "show", ":" + path])
    forbidden = forbidden or re.search(rb"convert_from\(decode\('[a-f0-9]{64,}'", content)
    forbidden = forbidden or re.search(rb"https://chatgpt\.com/backend-api/estuary/content\?[^\s]+", content)
    if forbidden:
        blocked += 1
if blocked:
    print("Publication blocked: private archive artifacts or signed links are staged. Remove them from the Git index.", file=sys.stderr)
    sys.exit(1)
print("Git index contains no recognized private export artifacts or populated import SQL.")
