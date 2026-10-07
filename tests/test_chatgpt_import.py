"""Only synthetic records. Private outputs are made in temporary directories."""
import copy
import importlib.util
import json
import os
from pathlib import Path
import stat
import tempfile
import unittest
import zipfile

spec = importlib.util.spec_from_file_location("ingest", Path(__file__).parents[1] / "scripts/chatgpt_import.py")
ingest = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ingest)
OWNER = "00000000-0000-0000-0000-000000000001"


def conversation(text="Synthetic personal note", updated=1700000001):
    def node(parent, role, value):
        return {"parent": parent, "message": {"id": role + "-id", "author": {"role": role},
            "create_time": 1700000000, "content": {"content_type": "text", "parts": [value]}}}
    return {"id": "synthetic-conversation", "title": "Synthetic test", "create_time": 1700000000,
            "update_time": updated, "current_node": "a", "mapping": {
                "root": {"parent": None, "message": None},
                "u": node("root", "user", text), "a": node("u", "assistant", "An unverified interpretation"),
                "alternate": node("u", "assistant", "Alternate branch must not be searched")}}


class ImportTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.archive = self.root / "archive"
        self.zip = self.root / "input.zip"

    def tearDown(self):
        self.tmp.cleanup()

    def export(self, convs=None, extras=None):
        with zipfile.ZipFile(self.zip, "w") as z:
            if convs is not None:
                z.writestr("conversations.json", json.dumps(convs))
            for name, value in (extras or {}).items():
                z.writestr(name, value)
        return ingest.prepare(self.zip, self.archive)

    def record(self, bundle):
        return json.loads((bundle / "records.jsonl").read_text().splitlines()[0])

    def test_private_archive_inventory_hashes_and_roles(self):
        bundle = self.export([conversation()], {"chat.html": "<script>never run</script>", "files/image.png": b"synthetic"})
        manifest = ingest.validate_bundle(bundle)
        self.assertEqual(manifest["member_count"], 3)
        self.assertEqual(manifest["records"], 1)
        self.assertEqual(manifest["passages"], 2)
        record = self.record(bundle)
        self.assertTrue(record["passages"][0]["content"].startswith("[user;"))
        self.assertTrue(record["passages"][1]["content"].startswith("[assistant;"))
        self.assertIn("/0/mapping/u/message/content/parts/0;chars=0:23", record["passages"][0]["citation_locator"])
        self.assertEqual(record["omitted"]["alternate_nodes"], 1)
        self.assertNotIn("Alternate branch must", json.dumps(record))
        self.assertEqual((bundle / "export.zip").read_bytes(), self.zip.read_bytes())
        self.assertEqual(stat.S_IMODE(bundle.stat().st_mode), 0o700)
        self.assertEqual(stat.S_IMODE((bundle / "records.jsonl").stat().st_mode), 0o600)

    def test_exact_export_retry_reuses_bundle(self):
        first = self.export([conversation()])
        second = ingest.prepare(self.zip, self.archive)
        self.assertEqual(first, second)
        self.assertEqual(len(list(self.archive.iterdir())), 1)

    def test_snapshot_hash_independent_of_zip_order_and_observation(self):
        c = conversation()
        a = ingest.normalize_conversation(c, "conversations.json", 0, "a" * 64)
        b = ingest.normalize_conversation(c, "nested/conversations-1.json", 10, "b" * 64)
        self.assertEqual(a["external_id"], b["external_id"])
        self.assertNotEqual(a["observation"], b["observation"])
        c["mapping"]["u"]["message"]["content"]["parts"][0] = "Edited content"
        self.assertNotEqual(a["content_hash"], ingest.normalize_conversation(c, "c", 0, "a" * 64)["content_hash"])

    def test_chunks_keep_unicode_and_exact_offsets(self):
        text = "😀" * 2500 + "\nend"
        b = self.export([conversation(text)])
        passages = self.record(b)["passages"][:-1]
        restored = "".join(p["content"].split("\n", 1)[1] for p in passages)
        self.assertEqual(restored, text)
        self.assertTrue(passages[1]["citation_locator"].endswith("chars=2400:2504"))

    def test_missing_branch_and_cycle_are_quarantined(self):
        bad = conversation()
        bad["current_node"] = "absent"
        cycle = conversation()
        cycle["id"] = "cycle"
        cycle["mapping"]["root"]["parent"] = "a"
        b = self.export([bad, cycle, conversation()])
        m = ingest.validate_bundle(b)
        self.assertEqual(m["rejected"], 2)
        self.assertEqual(m["records"], 1)

    def test_unknown_media_and_tool_messages_remain_unindexed(self):
        c = conversation()
        c["mapping"]["u"]["message"]["content"] = {"content_type": "multimodal_text", "parts": ["Text", {"asset_pointer": "image"}]}
        c["mapping"]["a"]["message"]["author"]["role"] = "tool"
        b = self.export([c])
        r = self.record(b)
        self.assertEqual(len(r["passages"]), 1)
        self.assertEqual(r["omitted"]["nontext_parts"], 1)
        self.assertEqual(r["omitted"]["nonindexed_messages"], 1)

    def test_zip_paths_fail_closed(self):
        for name in ("../escape", "/absolute", "C:/drive", "a\\escape"):
            with self.subTest(name=name):
                with self.assertRaises(ingest.ImportErrorSafe):
                    self.export([conversation()], {name: "no"})
                self.assertFalse((self.root / "escape").exists())

    def test_duplicate_members_rejected(self):
        with zipfile.ZipFile(self.zip, "w") as z:
            z.writestr("conversations.json", "[]")
            z.writestr("./conversations.json", "[]")
        # Canonically equivalent archive member paths must never have ambiguous provenance.
        with self.assertRaises(ingest.ImportErrorSafe):
            ingest.prepare(self.zip, self.archive)

    def test_symlink_member_rejected(self):
        with zipfile.ZipFile(self.zip, "w") as z:
            info = zipfile.ZipInfo("link")
            info.external_attr = (stat.S_IFLNK | 0o777) << 16
            z.writestr(info, "../../private")
        with self.assertRaises(ingest.ImportErrorSafe):
            ingest.prepare(self.zip, self.archive)

    def test_size_limit_prevents_parsing(self):
        original = ingest.MAX_TOTAL
        ingest.MAX_TOTAL = 10
        try:
            with self.assertRaises(ingest.ImportErrorSafe):
                self.export([conversation()])
        finally:
            ingest.MAX_TOTAL = original

    def test_other_export_structure_is_inventoried_but_not_importable(self):
        b = self.export(None, {"unknown.json": "{}", "chat.html": "no execution"})
        self.assertEqual(ingest.validate_bundle(b)["member_count"], 2)
        with self.assertRaises(ingest.ImportErrorSafe):
            ingest.make_sql(b, OWNER)

    def test_shards_and_duplicate_conversation_handling(self):
        c = conversation()
        b = self.export([c], {"nested/conversations-1.json": json.dumps([c])})
        m = ingest.validate_bundle(b)
        self.assertEqual(m["records"], 1)
        self.assertEqual(m["duplicate_conversations"], 1)

    def test_conflicting_duplicate_conversation_rejected(self):
        with self.assertRaises(ingest.ImportErrorSafe):
            self.export([conversation()], {"conversations-1.json": json.dumps([conversation("different")])})

    def test_repository_paths_rejected_even_through_symlink(self):
        with self.assertRaises(ingest.ImportErrorSafe):
            ingest.private_dir(ingest.REPO / "imports")
        self.root.joinpath("alias").symlink_to(ingest.REPO, target_is_directory=True)
        with self.assertRaises(ingest.ImportErrorSafe):
            ingest.outside_repository(self.root / "alias" / "export.zip")
        other = self.root / "other-repo"
        other.mkdir()
        (other / ".git").write_text("gitdir: elsewhere")
        with self.assertRaises(ingest.ImportErrorSafe):
            ingest.private_dir(other / "data")

    def test_tampering_stops_sql_generation(self):
        b = self.export([conversation()])
        with open(b / "records.jsonl", "a") as f:
            f.write("{}\n")
        with self.assertRaises(ingest.ImportErrorSafe):
            ingest.make_sql(b, OWNER)

    def test_generated_sql_never_interpolates_text_as_sql(self):
        attack = "'); DROP TABLE public.records; -- $pk_import$ \\ quote"
        b = self.export([conversation(attack)])
        output = ingest.make_sql(b, OWNER)
        files = sorted(output.glob("*.sql"))
        self.assertEqual(len(files), 2)
        sql = files[0].read_text()
        self.assertNotIn(attack, sql)
        self.assertIn("private.app_control", sql)
        self.assertIn("email_confirmed_at", sql)
        self.assertNotIn("/*PAYLOAD_HEX*/", sql)
        self.assertNotRegex(sql.lower(), r"(?m)^\s*grant\s")

    def test_batched_sql_and_finalize_and_empty_export(self):
        convs = []
        for i in range(21):
            c = conversation()
            c["id"] = f"synthetic-{i}"
            convs.append(c)
        b = self.export(convs)
        self.assertEqual(len(list(ingest.make_sql(b, OWNER).glob("*.sql"))), 3)
        b = self.export([])
        self.assertEqual(len(list(ingest.make_sql(b, OWNER).glob("*.sql"))), 2)

    def test_invalid_timestamp_and_null_text_quarantined(self):
        b = self.export([conversation("\x00"), conversation(updated=True)])
        self.assertEqual(ingest.validate_bundle(b)["rejected"], 2)


if __name__ == "__main__":
    unittest.main()
