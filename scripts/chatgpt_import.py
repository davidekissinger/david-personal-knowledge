#!/usr/bin/env python3
"""Offline ChatGPT export preparation. No network, model, or GitHub calls.

All generated files are private. SQL is an operator artifact, never a migration.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
from pathlib import Path, PurePosixPath
import re
import shutil
import stat
import sys
import tempfile
from datetime import datetime, timezone
from uuid import UUID, uuid5, NAMESPACE_URL
import zipfile

VERSION = "chatgpt-export-v1"
REPO = Path(__file__).resolve().parents[1]
MAX_MEMBERS = 100_000
MAX_TOTAL = 25 * 1024**3
MAX_JSON = 512 * 1024**2
MAX_SQL = 4 * 1024**2
CHUNK = 2400


class ImportErrorSafe(Exception):
    """Messages must contain no imported text or filenames."""


def canonical(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"), allow_nan=False)


def sha(value):
    return hashlib.sha256(value).hexdigest()


def file_sha(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for block in iter(lambda: f.read(1024**2), b""):
            h.update(block)
    return h.hexdigest()


def outside_repository(path):
    p = Path(path).expanduser().resolve()
    if p == REPO or REPO in p.parents or p in REPO.parents:
        raise ImportErrorSafe("Private input and output must be outside the application repository.")
    if any((a / ".git").exists() for a in [p, *p.parents]):
        raise ImportErrorSafe("Private input and output must be outside every Git worktree.")
    return p


def private_dir(path):
    original = Path(path).expanduser()
    if original.is_symlink():
        raise ImportErrorSafe("A private archive directory cannot be a symbolic link.")
    p = outside_repository(original)
    p.mkdir(parents=True, mode=0o700, exist_ok=True)
    if p.stat().st_mode & 0o077:
        raise ImportErrorSafe("Archive directory permissions must be owner-only (0700).")
    return p


def write_json(path, value):
    with open(path, "x", encoding="utf-8") as f:
        f.write(canonical(value) + "\n")


def timestamp(value):
    if value is None:
        return None
    if isinstance(value, bool) or not isinstance(value, (float, int)) or not math.isfinite(value):
        raise ImportErrorSafe("Invalid conversation timestamp; item requires review.")
    try:
        return datetime.fromtimestamp(value, timezone.utc).isoformat()
    except (ValueError, OverflowError, OSError):
        raise ImportErrorSafe("Conversation timestamp is out of range; item requires review.") from None


def pointer(value):
    return str(value).replace("~", "~0").replace("/", "~1")


def normalize_conversation(conv, member, index, export_hash):
    if not isinstance(conv, dict):
        raise ImportErrorSafe("Conversation must be an object.")
    cid = conv.get("conversation_id") or conv.get("id")
    mapping = conv.get("mapping")
    current = conv.get("current_node")
    if not isinstance(cid, str) or not cid or len(cid) > 200 or "\x00" in cid:
        raise ImportErrorSafe("Conversation has no usable stable identifier.")
    if not isinstance(mapping, dict) or not isinstance(current, str) or current not in mapping:
        raise ImportErrorSafe("Conversation has no verifiable selected branch.")
    visited, branch = set(), []
    while current is not None:
        if not isinstance(current, str) or "\x00" in current or current in visited or current not in mapping:
            raise ImportErrorSafe("Conversation branch is cyclic or incomplete.")
        visited.add(current)
        node = mapping[current]
        if not isinstance(node, dict) or "parent" not in node:
            raise ImportErrorSafe("Conversation node is malformed.")
        branch.append((current, node))
        current = node["parent"]
    branch.reverse()
    title = conv.get("title")
    if title is not None and (not isinstance(title, str) or "\x00" in title):
        raise ImportErrorSafe("Conversation title is malformed.")
    title = title or "Untitled ChatGPT conversation"
    updated = timestamp(conv.get("update_time"))
    created = timestamp(conv.get("create_time"))
    messages, passages, omitted = [], [], {"nontext_parts": 0, "nonindexed_messages": 0,
                                          "alternate_nodes": len(mapping) - len(branch)}
    for node_id, node in branch:
        msg = node.get("message")
        if msg is None:
            continue
        if not isinstance(msg, dict) or not isinstance(msg.get("author"), dict):
            raise ImportErrorSafe("Conversation message is malformed.")
        role = msg["author"].get("role")
        if role not in ("user", "assistant"):
            omitted["nonindexed_messages"] += 1
            continue
        content = msg.get("content")
        if not isinstance(content, dict):
            raise ImportErrorSafe("Conversation message content is malformed.")
        parts = content.get("parts")
        # Only explicitly recognized textual content is indexed. Media stays in the ZIP.
        if content.get("content_type") not in ("text", "multimodal_text"):
            omitted["nontext_parts"] += 1
            continue
        if not isinstance(parts, list):
            raise ImportErrorSafe("Conversation text parts are malformed.")
        msg_time = timestamp(msg.get("create_time"))
        texts = []
        for part_index, part in enumerate(parts):
            if not isinstance(part, str):
                omitted["nontext_parts"] += 1
                continue
            if "\x00" in part:
                raise ImportErrorSafe("Text contains a database-incompatible null character.")
            texts.append({"part": part_index, "text": part})
            if not part.strip():
                continue
            base_pointer = f"/{index}/mapping/{pointer(node_id)}/message/content/parts/{part_index}"
            for start in range(0, len(part), CHUNK):
                stop = min(start + CHUNK, len(part))
                locator = f"zip-sha256:{export_hash}/{member}#{base_pointer};chars={start}:{stop}"
                passages.append({"ordinal": len(passages), "content": f"[{role}; {msg_time or 'time unknown'}]\n" + part[start:stop],
                                 "citation_locator": locator})
        messages.append({"node_id": node_id, "message_id": msg.get("id"), "role": role,
                         "occurred_at": msg_time, "parts": texts})
    snapshot = {"conversation_id": cid, "title": title, "created_at": created,
                "updated_at": updated, "messages": messages, "omitted": omitted}
    content_hash = sha(canonical(snapshot).encode())
    raw_hash = sha(canonical(conv).encode())
    observation = {"export_sha256": export_hash, "member": member, "json_pointer": f"/{index}",
                   "raw_conversation_sha256": raw_hash}
    return {"external_id": f"{cid}:sha256:{content_hash}", "conversation_id": cid,
            "title": title, "occurred_at": created, "updated_at": updated,
            "content_hash": content_hash, "observation": observation, "omitted": omitted,
            "passages": passages, "message_count": len(messages)}


def scan_zip(path):
    with zipfile.ZipFile(path) as z:
        members = z.infolist()
        if len(members) > MAX_MEMBERS or sum(i.file_size for i in members) > MAX_TOTAL:
            raise ImportErrorSafe("Export exceeds configured archive limits.")
        names, inventory, conversations = set(), [], []
        for info in members:
            name = info.filename
            parts = PurePosixPath(name).parts
            if (not name or "\\" in name or name.startswith("/") or ":" in name
                    or ".." in parts or "\x00" in name or name.rstrip("/") in names
                    or str(PurePosixPath(name)) != name.rstrip("/")):
                raise ImportErrorSafe("Unsafe or duplicate archive member path.")
            names.add(name.rstrip("/"))
            if info.flag_bits & 1 or stat.S_ISLNK(info.external_attr >> 16):
                raise ImportErrorSafe("Encrypted members and symbolic links are unsupported.")
            if info.file_size > max(info.compress_size, 1) * 1000:
                raise ImportErrorSafe("Archive compression ratio exceeds configured limit.")
            h, read_bytes = hashlib.sha256(), 0
            if not info.is_dir():
                with z.open(info) as f:
                    while data := f.read(1024**2):
                        read_bytes += len(data)
                        if read_bytes > info.file_size:
                            raise ImportErrorSafe("Archive member exceeded its declared size.")
                        h.update(data)
                if read_bytes != info.file_size:
                    raise ImportErrorSafe("Archive member size mismatch.")
            item = {"path": name, "bytes": info.file_size, "compressed_bytes": info.compress_size,
                    "sha256": None if info.is_dir() else h.hexdigest(), "directory": info.is_dir(),
                    "handling": "archived_only"}
            if not info.is_dir() and re.fullmatch(r"conversations(?:[-_]\d+)?\.json", parts[-1]):
                if info.file_size > MAX_JSON:
                    raise ImportErrorSafe("Conversation JSON exceeds the safe in-memory limit.")
                conversations.append(name)
                item["handling"] = "selected_branch_text"
            inventory.append(item)
        return inventory, sorted(conversations)


def prepare(zip_path, archive_dir, received_at=None):
    os.umask(0o077)
    src = outside_repository(zip_path)
    if not src.is_file():
        raise ImportErrorSafe("Export ZIP is not accessible.")
    root = private_dir(archive_dir)
    # Freeze the exact bytes before hashing/parsing; no extraction and no opened HTML.
    stage = Path(tempfile.mkdtemp(prefix=".preparing-", dir=root))
    try:
        shutil.copyfile(src, stage / "export.zip")
        export_hash = file_sha(stage / "export.zip")
        inventory, members = scan_zip(stage / "export.zip")
        rejected, count, duplicates, seen, passage_count = [], 0, 0, {}, 0
        duplicate_locations = []
        omitted = {"nontext_parts": 0, "nonindexed_messages": 0, "alternate_nodes": 0}
        with zipfile.ZipFile(stage / "export.zip") as z, open(stage / "records.jsonl", "x", encoding="utf-8") as out:
            for member in members:
                with z.open(member) as f:
                    data = json.load(f, parse_constant=lambda _: (_ for _ in ()).throw(ValueError()))
                if not isinstance(data, list):
                    raise ImportErrorSafe("Conversation JSON is not a supported array; no import was prepared.")
                for index, conv in enumerate(data):
                    try:
                        record = normalize_conversation(conv, member, index, export_hash)
                    except ImportErrorSafe as error:
                        rejected.append({"member": member, "json_pointer": f"/{index}", "reason": str(error)})
                        continue
                    cid = record["conversation_id"]
                    if cid in seen:
                        if seen[cid] != record["observation"]["raw_conversation_sha256"]:
                            raise ImportErrorSafe("Conflicting conversation identifiers across export members.")
                        duplicates += 1
                        duplicate_locations.append(record["observation"])
                        continue
                    seen[cid] = record["observation"]["raw_conversation_sha256"]
                    count += 1
                    passage_count += len(record["passages"])
                    for key in omitted:
                        omitted[key] += record["omitted"][key]
                    out.write(canonical(record) + "\n")
        write_json(stage / "inventory.json", {"export_sha256": export_hash, "members": inventory,
                                              "duplicate_conversation_locations": duplicate_locations})
        write_json(stage / "rejected.json", rejected)
        manifest = {"format": VERSION, "export_sha256": export_hash,
                    "prepared_at": datetime.now(timezone.utc).isoformat(), "received_at": received_at,
                    "archive_uri": f"private-archive:chatgpt/sha256/{export_hash}/export.zip",
                    "member_count": len(inventory), "conversation_members": members, "importable": bool(members),
                    "records": count, "passages": passage_count, "rejected": len(rejected),
                    "duplicate_conversations": duplicates, "omitted": omitted,
                    "files": {n: file_sha(stage / n) for n in ("export.zip", "inventory.json", "records.jsonl", "rejected.json")}}
        write_json(stage / "manifest.json", manifest)
        destination = root / export_hash
        if destination.exists():
            validate_bundle(destination)
            if file_sha(destination / "export.zip") != export_hash:
                raise ImportErrorSafe("Existing archive does not match the export.")
            shutil.rmtree(stage)
            return destination
        stage.rename(destination)
        return destination
    except Exception:
        # This is our staging copy only; the supplied ZIP is never deleted.
        shutil.rmtree(stage, ignore_errors=True)
        raise


def validate_bundle(directory):
    directory = private_dir(directory)
    manifest_path = directory / "manifest.json"
    if manifest_path.is_symlink():
        raise ImportErrorSafe("Archive manifest cannot be a symbolic link.")
    manifest = json.loads(manifest_path.read_text())
    if manifest.get("format") != VERSION or not re.fullmatch(r"[a-f0-9]{64}", manifest.get("export_sha256", "")):
        raise ImportErrorSafe("Unsupported archive manifest.")
    if set(manifest.get("files", {})) != {"export.zip", "inventory.json", "records.jsonl", "rejected.json"}:
        raise ImportErrorSafe("Archive manifest file set is invalid.")
    for name, digest in manifest["files"].items():
        p = directory / name
        if p.is_symlink() or not p.is_file() or p.stat().st_mode & 0o077 or file_sha(p) != digest:
            raise ImportErrorSafe("Archive integrity or private permissions check failed.")
    if manifest["files"]["export.zip"] != manifest["export_sha256"]:
        raise ImportErrorSafe("Export hash mismatch.")
    return manifest


def render_sql(owner, manifest, records, batch, batch_count, final=False):
    owner = str(UUID(owner))
    payload = {"format": VERSION, "owner": owner, "manifest": manifest, "records": records,
               "batch": batch, "batch_count": batch_count, "final": final,
               "run_id": str(uuid5(NAMESPACE_URL, f"{VERSION}:{owner}:{manifest['export_sha256']}:{batch}")),
               "expected_runs": [str(uuid5(NAMESPACE_URL, f"{VERSION}:{owner}:{manifest['export_sha256']}:{i}"))
                                 for i in range(batch_count)] if final else []}
    # Data is UTF-8 -> hex -> JSONB, so neither SQL quotes nor dollar tags in records execute.
    encoded = canonical(payload).encode().hex()
    template = (Path(__file__).with_name("chatgpt_import.sql")).read_text()
    return template.replace("/*PAYLOAD_HEX*/", encoded)


def make_sql(directory, owner):
    os.umask(0o077)
    directory = private_dir(directory)
    manifest = validate_bundle(directory)
    if not manifest.get("importable"):
        raise ImportErrorSafe("Archive inventoried, but no supported conversation JSON exists; format review required.")
    def batches():
        batch, batch_bytes = [], 0
        with open(directory / "records.jsonl", encoding="utf-8") as f:
            for line in f:
                size = len(line.encode()) * 2
                if size > MAX_SQL - 32768:
                    raise ImportErrorSafe("A conversation is too large for a transaction; operator review required.")
                if batch and (len(batch) >= 20 or batch_bytes + size > MAX_SQL - 32768):
                    yield batch
                    batch, batch_bytes = [], 0
                batch.append(json.loads(line))
                batch_bytes += size
        if batch:
            yield batch
    records = batch_count = 0
    for batch in batches():
        records += len(batch)
        batch_count += 1
    batch_count = max(1, batch_count)
    if records != manifest["records"]:
        raise ImportErrorSafe("Manifest record count does not match prepared data.")
    target = directory / ("sql-" + str(UUID(owner)))
    if target.exists():
        raise ImportErrorSafe("SQL output already exists. Retain it for an idempotent retry.")
    stage = Path(tempfile.mkdtemp(prefix=".sql-", dir=directory))
    try:
        for i, items in enumerate(batches() if records else [[]]):
            (stage / f"{i:06d}.sql").write_text(render_sql(owner, manifest, items, i, batch_count), encoding="utf-8")
        (stage / f"{batch_count:06d}-finalize.sql").write_text(
            render_sql(owner, manifest, [], batch_count, batch_count, final=True), encoding="utf-8")
        stage.rename(target)
    except Exception:
        shutil.rmtree(stage, ignore_errors=True)
        raise
    return target


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="action", required=True)
    p = sub.add_parser("prepare", help="Inventory and prepare a private ZIP; no remote writes")
    p.add_argument("zip", type=Path)
    p.add_argument("--archive-dir", required=True, type=Path)
    p.add_argument("--received-at", help="Optional ISO-8601 export receipt time; never the signed download URL")
    p = sub.add_parser("sql", help="Create private owner-checked SQL transactions for an operator")
    p.add_argument("archive", type=Path)
    p.add_argument("--owner", required=True, help="Verified existing app owner UUID")
    args = parser.parse_args()
    try:
        if args.action == "prepare":
            if args.received_at:
                dt = datetime.fromisoformat(args.received_at)
                if dt.tzinfo is None:
                    raise ImportErrorSafe("Receipt timestamp must include a timezone.")
            directory = prepare(args.zip, args.archive_dir, args.received_at)
            m = validate_bundle(directory)
            print(canonical({"prepared": True, "export_sha256": m["export_sha256"],
                             "members": m["member_count"], "records": m["records"],
                             "passages": m["passages"], "rejected": m["rejected"], "importable": m["importable"]}))
        else:
            make_sql(args.archive, args.owner)
            print('{"sql_prepared":true,"database_changed":false}')
    except ImportErrorSafe as e:
        print(str(e), file=sys.stderr)
        return 1
    except (OSError, ValueError, zipfile.BadZipFile, RuntimeError, UnicodeError):
        print("Import stopped: invalid, inaccessible, or unsupported private input. No content was logged.", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
